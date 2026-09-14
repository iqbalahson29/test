import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthClock, hmac, Tx } from './primitives';
/** Only explicitly allowed scalar metadata can reach the audit store. */
const FIELDS = new Set([
  'reason',
  'action',
  'targetUserId',
  'provider',
  'purpose',
  'count',
  'kind',
  'generation',
  'operator',
  'provenance',
  'previousState',
  'dispatchId',
  'invitationId',
  'tenantRequestId',
  'deviceId',
  'membershipId',
  'tenantId',
]);
@Injectable()
export class SecurityEventsService {
  constructor(
    private readonly clock: AuthClock,
    private readonly config: ConfigService,
  ) {}
  async record(
    tx: Tx,
    type: string,
    userId: string | null = null,
    sessionId: string | null = null,
    metadata: Record<string, unknown> = {},
    outcome = 'success',
  ) {
    const safe: Record<string, string | number | boolean> = {};
    for (const [key, value] of Object.entries(metadata)) {
      if (
        !FIELDS.has(key) ||
        !['string', 'number', 'boolean'].includes(typeof value)
      )
        throw new Error('Invalid security event metadata');
      safe[key] =
        typeof value === 'string'
          ? value.slice(0, key === 'reason' ? 500 : 150)
          : (value as number | boolean);
    }
    if (Buffer.byteLength(JSON.stringify(safe)) > 4096)
      throw new Error('Security event metadata exceeds limit');
    return tx.securityEvent.create({
      data: {
        type,
        userId,
        sessionId,
        actorKey: userId
          ? hmac(this.config.getOrThrow('AUTH_HASH_KEY'), `actor:v1|${userId}`)
          : null,
        outcome,
        metadata: safe,
        createdAt: this.clock.now(),
      },
    });
  }
}
