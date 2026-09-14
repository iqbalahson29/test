import { Injectable, HttpException } from '@nestjs/common';
import {
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
export type Tx = Prisma.TransactionClient;
@Injectable()
export class AuthClock {
  now(): Date {
    return new Date();
  }
}
@Injectable()
export class AuthRandom {
  token(): string {
    return randomBytes(32).toString('base64url');
  }
  code(): string {
    return randomInt(0, 1_000_000).toString().padStart(6, '0');
  }
}
export const sha256 = (s: string) =>
  createHash('sha256').update(s).digest('hex');
export const hmac = (key: string, s: string) =>
  createHmac('sha256', key).update(s).digest('hex');
export function equalHash(a: string, b: string): boolean {
  return (
    /^[a-f0-9]{64}$/.test(a) &&
    /^[a-f0-9]{64}$/.test(b) &&
    timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'))
  );
}
export function authError(
  code: string,
  status = 400,
  retryAfterSeconds?: number,
  challenge?: unknown,
): HttpException {
  const messages: Record<string, string> = {
    INVALID_CREDENTIALS: 'Invalid credentials',
    CHALLENGE_INVALID:
      'This code or verification flow is invalid or expired. Please try again.',
    SESSION_INVALID: 'Please sign in again',
    GRANT_INVALID: 'Please verify this action again',
    RATE_LIMITED: 'Please wait before trying again',
    AUTH_UNAVAILABLE: 'Authentication is temporarily unavailable',
    OTP_DELIVERY_UNAVAILABLE: 'Email delivery is temporarily unavailable',
    REFRESH_RACE: 'Session refresh is already in progress',
    AUTH_CONTEXT_CHANGED: 'Your account or workspace changed. Please retry.',
    ACTIVE_TEST_SESSION:
      'Finish or close your active test before changing workspace',
  };
  return new HttpException(
    {
      code,
      message: messages[code] ?? code.replaceAll('_', ' ').toLowerCase(),
      ...(retryAfterSeconds !== undefined ? { retryAfterSeconds } : {}),
      ...(challenge ? { challenge } : {}),
    },
    status,
  );
}
/** True for failures that mean "try again later", not "your credentials are wrong".
 *
 * Infrastructure faults must keep this classification as they pass through the guards and
 * through OTP verification. Rewriting them as invalid authentication made clients clear a
 * valid session, spend a code attempt and retry a refresh over what was really an outage. */
export function isTransientAuthFailure(e: unknown): boolean {
  if (e instanceof HttpException) return e.getStatus() >= 500;
  return (
    e instanceof Prisma.PrismaClientKnownRequestError ||
    e instanceof Prisma.PrismaClientInitializationError ||
    e instanceof Prisma.PrismaClientRustPanicError ||
    e instanceof Prisma.PrismaClientUnknownRequestError
  );
}
export async function serial<T>(
  db: PrismaClient,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await db.$transaction(fn, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        timeout: 15000,
      });
    } catch (e) {
      if (
        !(e instanceof Prisma.PrismaClientKnownRequestError) ||
        e.code !== 'P2034'
      )
        throw e;
      if (attempt >= 3) throw authError('AUTH_RETRY_LATER', 503);
      await new Promise((r) =>
        setTimeout(r, [20, 50, 100][attempt] + randomInt(0, 15)),
      );
    }
  }
}
export async function mailboxLock(tx: Tx, mailbox: string) {
  await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${`mailbox:${mailbox}`}, 0))`;
}
export const actionHash = (
  action: string,
  actor: string,
  target = '',
  candidate = '',
  sub = '',
) => sha256(JSON.stringify([action, actor, target, candidate, sub]));
export const plusMs = (d: Date, ms: number) => new Date(d.getTime() + ms);
export const DAY = 86_400_000;
