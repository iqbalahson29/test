#!/usr/bin/env node
/**
 * Creates apps/api/.env for local development from .env.example, generating a fresh random
 * value for every blank required secret.
 *
 * The example deliberately ships those keys blank so the API refuses to start until they are
 * configured; this fills them with values that exist only on this machine. Hosted secrets are
 * never copied in, and an existing .env is never overwritten.
 */
import { randomBytes } from 'node:crypto';
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const apiRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const target = join(apiRoot, '.env');
const example = join(apiRoot, '.env.example');

if (existsSync(target)) {
  const backup = `${target}.backup-${Date.now()}`;
  if (process.argv.includes('--force')) {
    copyFileSync(target, backup);
    console.log(`[init-local-env] existing .env saved to ${backup}`);
  } else {
    console.error(
      '[init-local-env] apps/api/.env already exists. Re-run with --force to replace it (the current file is backed up first).',
    );
    process.exit(1);
  }
}

// Every key the validator requires a real value for. S3 credentials match the local
// docker-compose defaults rather than being random, since MinIO must accept them.
const generated = new Set([
  'JWT_ACCESS_SECRET',
  'JWT_REFRESH_SECRET',
  'OTP_PEPPER',
  'AUTH_HASH_KEY',
  'MAIL_PAYLOAD_KEY',
]);
const localDefaults = {
  S3_ACCESS_KEY_ID: 'minioadmin',
  S3_SECRET_ACCESS_KEY: 'minioadmin',
};

const filled = readFileSync(example, 'utf8')
  .split('\n')
  .map((line) => {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line);
    if (!match) return line;
    const [, key, value] = match;
    if (value !== '') return line;
    if (generated.has(key)) return `${key}=${randomBytes(32).toString('base64')}`;
    if (key in localDefaults) return `${key}=${localDefaults[key]}`;
    return line;
  })
  .join('\n');

writeFileSync(target, filled, { mode: 0o600 });
console.log('[init-local-env] wrote apps/api/.env with locally generated secrets (mode 600).');
console.log('[init-local-env] MAIL_DRIVER=console prints OTP codes to the API log.');
console.log('[init-local-env] AUTH_OTP_MODE=off signs in with a password only; set it to "all" to exercise the OTP step.');
