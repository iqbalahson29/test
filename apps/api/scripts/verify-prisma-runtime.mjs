#!/usr/bin/env node
// Runs inside the final runtime image, as its configured non-root user, with no network,
// credentials or writable filesystem. Constructing PrismaClient is what actually proves the
// generated client was packaged correctly -- a successful image build does not.
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

let PrismaClient;
try {
  ({ PrismaClient } = require('@prisma/client'));
} catch (error) {
  console.error(`[verify-prisma-runtime] cannot require @prisma/client: ${error.message}`);
  process.exit(1);
}

let client;
try {
  // Throws "did not initialize yet" when the generated client is absent from this tree.
  client = new PrismaClient();
} catch (error) {
  console.error(`[verify-prisma-runtime] PrismaClient did not initialize: ${error.message}`);
  process.exit(1);
}

// Model delegates are defined by the generated client, so their presence confirms this is
// the client for our schema and not a bare placeholder.
const requiredDelegates = [
  'user',
  'session',
  'authIdentity',
  'authChallenge',
  'authGrant',
  'emailOtp',
  'refreshTokenUse',
  'trustedDevice',
  'pendingRegistration',
  'authRateBucket',
  'mailDelivery',
  'mailOutbox',
];
const missing = requiredDelegates.filter((name) => typeof client[name]?.findFirst !== 'function');
if (missing.length > 0) {
  console.error(`[verify-prisma-runtime] generated client is missing delegates: ${missing.join(', ')}`);
  process.exit(1);
}

console.log('[verify-prisma-runtime] PrismaClient initialized with all required delegates');
