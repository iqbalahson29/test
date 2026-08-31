import { ThrottlerOptions } from '@nestjs/throttler';

// Jest sets NODE_ENV=test by default — a real production login endpoint
// needs a tight per-IP cap against brute force, but the e2e suite
// legitimately logs in far more than 10x/min from one IP (many simulated
// users, one test-runner). Only the limit is relaxed for tests; the ttl and
// the guard itself stay identical, so the throttling *codepath* is still
// exercised.
const isTest = process.env.NODE_ENV === 'test';

export const AUTH_THROTTLE: { default: ThrottlerOptions } = {
  default: { ttl: 60_000, limit: isTest ? 1000 : 10 },
};
