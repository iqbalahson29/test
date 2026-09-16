#!/usr/bin/env node
/**
 * Starts the *final* runtime image against a real database and exercises an auth smoke flow.
 *
 * A successful `docker build` is not evidence that the image runs: the packaged Prisma client
 * was previously absent, so the image built and then failed at container start. This gate runs
 * before an artifact is published, as the image's own non-root user, with no build tooling.
 *
 * Usage: node scripts/verify-runtime-image.mjs <image-ref> [--database-url URL]
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';

const [imageRef, ...rest] = process.argv.slice(2);
if (!imageRef) {
  console.error('usage: verify-runtime-image.mjs <image-ref> [--database-url URL]');
  process.exit(2);
}
const databaseUrlIndex = rest.indexOf('--database-url');
const databaseUrl =
  databaseUrlIndex === -1
    ? process.env.DATABASE_URL
    : rest[databaseUrlIndex + 1];
if (!databaseUrl) {
  console.error('a --database-url or DATABASE_URL is required');
  process.exit(2);
}

const container = `quiz-api-verify-${randomBytes(4).toString('hex')}`;
// Host networking binds this port on every interface. Keep it below 32768: ports in the range
// Linux lends to outgoing connections can intermittently be in use when the container starts.
const apiPort = 13000;
const api = `http://127.0.0.1:${apiPort}`;
const docker = (args, options = {}) =>
  execFileSync('docker', args, { encoding: 'utf8', ...options });

const step = (name) => console.log(`[verify-runtime-image] ${name}`);
let failed = false;
const fail = (message) => {
  console.error(`[verify-runtime-image] FAILED: ${message}`);
  failed = true;
};

try {
  // 1. The generated client must initialize as the user that actually runs the app.
  step('constructing PrismaClient as the image user, without network');
  docker([
    'run', '--rm', '--network', 'none', '--read-only', '--tmpfs', '/tmp',
    imageRef, 'node', 'verify-prisma-runtime.mjs',
  ], { stdio: 'inherit' });

  // 2. Confirm no build tooling or source leaked into the runtime layer.
  step('checking the runtime tree is production-only');
  const stray = docker([
    'run', '--rm', imageRef, 'node', '-e',
    "const {existsSync}=require('fs');" +
      "const bad=['/app/src','/app/test','/app/node_modules/typescript','/app/node_modules/@nestjs/cli','/app/node_modules/prisma']" +
      ".filter(p=>existsSync(p));console.log(bad.join(','))",
  ]).trim();
  if (stray) fail(`build-only paths present in the runtime image: ${stray}`);

  step('checking the image runs as a non-root user');
  const uid = docker(['run', '--rm', imageRef, 'node', '-e', 'console.log(process.getuid())']).trim();
  if (uid === '0') fail('runtime image runs as root');

  // 3. A real start against a real database, then a real request.
  step('starting the image against the database');
  // Host networking: the test database is published on loopback only, which a bridged
  // container cannot reach through host-gateway.
  docker([
    'run', '-d', '--name', container, '--network', 'host',
    '-e', `PORT=${apiPort}`,
    '-e', `DATABASE_URL=${databaseUrl}`,
    '-e', 'NODE_ENV=production',
    '-e', 'AUTH_RELEASE_STAGE=local',
    '-e', 'AUTH_RELEASE_ID=0000000000000000000000000000000000000000',
    '-e', 'WEB_ORIGIN=http://localhost:5173',
    '-e', 'COOKIE_SECURE=false',
    '-e', 'TRUST_PROXY_HOPS=0',
    '-e', 'AUTH_OTP_MODE=off',
    '-e', 'AUTH_GOOGLE_ENABLED=false',
    // Production config permits only the real adapter, so the smoke run exercises that
    // path with a synthetic key. AUTH_OTP_MODE=off means nothing is actually dispatched.
    '-e', 'MAIL_DRIVER=brevo',
    '-e', `BREVO_API_KEY=xkeysib-verify-${randomBytes(24).toString('hex')}`,
    '-e', 'MAIL_FROM_EMAIL=verify@example.test',
    '-e', 'MAIL_FROM_NAME=Verify',
    '-e', 'OTP_PEPPER_VERSION=1',
    '-e', 'MAIL_PAYLOAD_KEY_VERSION=1',
    '-e', 'JWT_ACCESS_EXPIRES_IN=10m',
    '-e', 'JWT_REFRESH_EXPIRES_IN=7d',
    '-e', `JWT_ACCESS_SECRET=${randomBytes(32).toString('base64')}`,
    '-e', `JWT_REFRESH_SECRET=${randomBytes(32).toString('base64')}`,
    '-e', `OTP_PEPPER=${randomBytes(32).toString('base64')}`,
    '-e', `AUTH_HASH_KEY=${randomBytes(32).toString('base64')}`,
    '-e', `MAIL_PAYLOAD_KEY=${randomBytes(32).toString('base64')}`,
    '-e', `BREVO_WEBHOOK_SECRET=${randomBytes(32).toString('base64')}`,
    '-e', 'S3_ENDPOINT=http://127.0.0.1:59000',
    '-e', 'S3_BUCKET=quiz-platform',
    '-e', 'S3_REGION=us-east-1',
    '-e', 'S3_ACCESS_KEY_ID=auth_test_storage',
    '-e', 'S3_SECRET_ACCESS_KEY=isolated-auth-test-storage',
    imageRef,
  ], { stdio: 'inherit' });

  step('waiting for /health');
  let healthy = false;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const probe = spawnSync('curl', ['-fsS', `${api}/health`], { encoding: 'utf8' });
    if (probe.status === 0) {
      healthy = true;
      console.log(`[verify-runtime-image] /health -> ${probe.stdout.trim()}`);
      break;
    }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000);
  }
  if (!healthy) {
    console.error(docker(['logs', container]));
    fail('the container never became healthy');
  } else {
    // A real authenticated read: this only answers if the generated client can query.
    step('exercising login context initialization');
    const context = spawnSync('curl', [
      '-fsS', '-X', 'POST', `${api}/auth/context`,
      '-H', 'Content-Type: application/json',
      '-H', 'X-Quiz-Client: web',
      '-H', 'Origin: http://localhost:5173',
      '-d', '{}',
    ], { encoding: 'utf8' });
    if (context.status !== 0) {
      console.error(docker(['logs', container]));
      fail('/auth/context did not answer from the runtime image');
    }

    // The activation gate release.sh depends on: schema readiness plus release identity.
    step('exercising the release readiness gate');
    const release = spawnSync('curl', [
      '-fsS', `${api}/health/release`,
      '-H', 'X-Quiz-Client: web', '-H', 'Origin: http://localhost:5173',
    ], { encoding: 'utf8' });
    if (release.status !== 0) {
      console.error(docker(['logs', container]));
      fail('/health/release did not answer');
    } else if (!release.stdout.includes('"releaseId":"0000000000000000000000000000000000000000"')) {
      fail(`/health/release did not report the release identity: ${release.stdout}`);
    } else {
      console.log(`[verify-runtime-image] /health/release -> ${release.stdout.slice(0, 200)}`);
    }

    step('exercising an unauthenticated protected read (must be 401, not 503)');
    const protectedRead = spawnSync('curl', [
      '-s', '-o', '/dev/null', '-w', '%{http_code}',
      `${api}/auth/sessions`,
      '-H', 'X-Quiz-Client: web', '-H', 'Origin: http://localhost:5173',
    ], { encoding: 'utf8' });
    if (protectedRead.stdout.trim() !== '401') {
      console.error(docker(['logs', container]));
      fail(`protected route answered ${protectedRead.stdout.trim()}, expected 401`);
    }
  }
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
} finally {
  spawnSync('docker', ['rm', '-f', container], { stdio: 'ignore' });
}

if (failed) process.exit(1);
console.log('[verify-runtime-image] the published runtime artifact starts and serves auth requests');
