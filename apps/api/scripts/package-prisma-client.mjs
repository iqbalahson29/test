#!/usr/bin/env node
// Copies the generated Prisma client into the isolated tree produced by `pnpm deploy`.
//
// `prisma generate` writes the client next to the `@prisma/client` package that the build
// tree resolves, which under pnpm lives inside the virtual store. `pnpm deploy` builds a
// fresh dependency tree, so that generated output is not carried across. Both ends are
// resolved through Node here instead of assuming a layout, and every step is asserted:
// a silent failure here produces an image that builds but cannot start.
import { createRequire } from 'node:module';
import { cpSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const runtimeRoot = resolve(process.argv[2] ?? '/runtime');
const buildAppRoot = resolve(process.argv[3] ?? process.cwd());

const fail = (message) => {
  console.error(`[package-prisma-client] ${message}`);
  process.exit(1);
};

// The generated client is a sibling of the `@prisma/client` package directory, reached by
// Node's own resolution from that package. Mirror that lookup rather than guessing a path.
const generatedClientDirFor = (fromDir, label) => {
  const require = createRequire(join(fromDir, 'noop.js'));
  let packageEntry;
  try {
    packageEntry = require.resolve('@prisma/client');
  } catch {
    return fail(`cannot resolve @prisma/client from ${label} (${fromDir})`);
  }
  // .../node_modules/@prisma/client/default.js -> .../node_modules
  const packageDir = dirname(packageEntry);
  const nodeModulesDir = resolve(packageDir, '..', '..');
  return { nodeModulesDir, generatedDir: join(nodeModulesDir, '.prisma', 'client') };
};

const source = generatedClientDirFor(buildAppRoot, 'build tree');
const target = generatedClientDirFor(runtimeRoot, 'runtime tree');

if (!existsSync(source.generatedDir)) {
  fail(`no generated client at ${source.generatedDir}; run \`prisma generate\` before packaging`);
}

cpSync(source.generatedDir, target.generatedDir, { recursive: true, dereference: true });

// ---- Assertions against the runtime tree, not the build tree. ----
const entryPoint = join(target.generatedDir, 'index.js');
if (!existsSync(entryPoint)) {
  fail(`copy did not produce ${entryPoint}`);
}

const entries = readdirSync(target.generatedDir);
const nativeEngine = entries.find((name) => /^libquery_engine.*\.so\.node$/.test(name));
if (!nativeEngine) {
  fail(`no native query engine in ${target.generatedDir}; found: ${entries.join(', ')}`);
}

// A truncated or stale copy still has index.js, so confirm the schema this client was
// generated from carries the auth models the API depends on at runtime.
const generatedSchemaPath = join(target.generatedDir, 'schema.prisma');
if (!existsSync(generatedSchemaPath)) {
  fail(`no schema.prisma alongside the generated client at ${target.generatedDir}`);
}
const generatedSchema = readFileSync(generatedSchemaPath, 'utf8');
const requiredModels = [
  'User',
  'Session',
  'AuthIdentity',
  'AuthChallenge',
  'AuthGrant',
  'EmailOtp',
  'RefreshTokenUse',
  'TrustedDevice',
  'PendingRegistration',
  'AuthRateBucket',
  'MailDelivery',
  'MailOutbox',
];
const missingModels = requiredModels.filter(
  (model) => !new RegExp(`^model\\s+${model}\\s*\\{`, 'm').test(generatedSchema),
);
if (missingModels.length > 0) {
  fail(`generated client is missing required models: ${missingModels.join(', ')}`);
}

console.log(
  `[package-prisma-client] packaged ${entries.length} files (engine: ${nativeEngine}) into ${target.generatedDir}`,
);
