import { ForbiddenException } from '@nestjs/common';
import { SESSION_LOCK_TIMEOUT_MS } from './session-lock.constants';

/**
 * The shape of a Prisma model delegate that can claim an attempt lock. Both the regular
 * and practice attempt tables carry the same three lock columns, so one primitive serves
 * both engines without either service growing its own variant of the rule.
 */
export interface AttemptLockDelegate {
  updateMany(args: {
    where: Record<string, unknown>;
    data: Record<string, unknown>;
  }): Promise<{ count: number }>;
}

export const ATTEMPT_LOCK_CONFLICT_MESSAGE =
  'This test is currently active in another session';

/**
 * The predicate for "this session may own the attempt": an unheld lock, an abandoned one
 * (no heartbeat within SESSION_LOCK_TIMEOUT_MS), or one this session already holds. It is
 * expressed as a WHERE fragment rather than a JavaScript check so the decision happens
 * inside the UPDATE statement instead of between a read and a later write.
 */
export function claimableBy(sessionId: string, now: Date) {
  return {
    OR: [
      { lockSessionId: null },
      { lockSessionId: sessionId },
      { lastHeartbeatAt: null },
      {
        lastHeartbeatAt: {
          lt: new Date(now.getTime() - SESSION_LOCK_TIMEOUT_MS),
        },
      },
    ],
  };
}

/**
 * Atomically claims or renews `attemptId`'s session lock for `sessionId`.
 *
 * The ownership test and the write are a single conditional UPDATE. Two sessions that
 * both read the same expired lock can no longer both proceed: PostgreSQL re-evaluates the
 * WHERE clause against the winner's committed row, so the loser matches zero rows. Callers
 * must run this inside the same transaction as the mutation it guards, which holds the row
 * lock for the whole operation and keeps a later writer from slipping in behind the check.
 *
 * Returns false rather than throwing so callers can distinguish "not claimable" from
 * "attempt is gone"; `requireAttemptLock` is the throwing form.
 */
export async function claimAttemptLock(
  delegate: AttemptLockDelegate,
  attemptId: string,
  sessionId: string,
  statusFilter: Record<string, unknown> = {},
): Promise<boolean> {
  const now = new Date();
  const { count } = await delegate.updateMany({
    where: { id: attemptId, ...statusFilter, ...claimableBy(sessionId, now) },
    data: { lockSessionId: sessionId, lockedAt: now, lastHeartbeatAt: now },
  });
  return count > 0;
}

/** `claimAttemptLock`, raising the standard conflict when another live session owns it. */
export async function requireAttemptLock(
  delegate: AttemptLockDelegate,
  attemptId: string,
  sessionId: string,
  statusFilter: Record<string, unknown> = {},
): Promise<void> {
  if (!(await claimAttemptLock(delegate, attemptId, sessionId, statusFilter))) {
    throw new ForbiddenException(ATTEMPT_LOCK_CONFLICT_MESSAGE);
  }
}
