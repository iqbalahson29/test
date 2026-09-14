import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
export const MAIL_DRIVER_TOKEN = Symbol('MAIL_DRIVER');
export interface MailMessage {
  recipient: string;
  category: 'OTP' | 'INVITE' | 'SECURITY';
  subject: string;
  html: string;
  text: string;
  dispatchId: string;
  idempotencyKey: string;
  sender: { email: string; name: string };
  replyTo?: string;
}
export type MailErrorKind =
  | 'invalid_recipient'
  | 'configuration'
  | 'quota_exceeded'
  | 'rate_limited'
  | 'provider_down'
  | 'ambiguous'
  | 'duplicate'
  | 'suppressed'
  | 'budget';
export class MailError extends Error {
  constructor(
    readonly kind: MailErrorKind,
    readonly retryAfter = 0,
    readonly providerCode?: string,
  ) {
    super(kind);
  }
  get transient() {
    return ['rate_limited', 'provider_down', 'ambiguous'].includes(this.kind);
  }
}
export interface MailDriver {
  readonly name: string;
  send(message: MailMessage): Promise<{ providerMessageId: string }>;
  unblock?(email: string): Promise<void>;
}
export const messageId = (id: string) => id.trim().replace(/^<|>$/g, '');
export function brevoPayload(m: MailMessage) {
  return {
    sender: m.sender,
    to: [{ email: m.recipient }],
    subject: m.subject,
    htmlContent: m.html,
    textContent: m.text,
    tags: [m.category.toLowerCase()],
    headers: { idempotencyKey: m.dispatchId, 'X-Mailin-custom': m.dispatchId },
    ...(m.replyTo ? { replyTo: { email: m.replyTo } } : {}),
  };
}
@Injectable()
export class BrevoMailDriver implements MailDriver {
  readonly name = 'BREVO';
  constructor(private readonly config: ConfigService) {}
  async send(m: MailMessage) {
    let res: Response;
    try {
      res = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'api-key': this.config.getOrThrow('BREVO_API_KEY'),
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(brevoPayload(m)),
        signal: AbortSignal.timeout(5000),
      });
    } catch {
      throw new MailError('ambiguous');
    }
    const body = (await res.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    if (
      res.status === 201 &&
      typeof body.messageId === 'string' &&
      body.messageId.trim()
    )
      return { providerMessageId: messageId(body.messageId) };
    const code =
      typeof body.code === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(body.code)
        ? body.code
        : undefined;
    const retry = Math.max(
      0,
      Math.ceil(
        Number(res.headers.get('Retry-After')) ||
          (Date.parse(res.headers.get('Retry-After') ?? '') - Date.now()) /
            1000 ||
          0,
      ),
    );
    if (code === 'duplicate_parameter')
      throw new MailError('duplicate', 0, code);
    if (res.status === 401 || res.status === 403)
      throw new MailError('configuration', 0, code);
    if (
      ['not_enough_credits', 'out_of_credits', 'quota_exceeded'].includes(
        code ?? '',
      )
    )
      throw new MailError('quota_exceeded', 0, code);
    if (res.status === 429) throw new MailError('rate_limited', retry, code);
    if (res.status >= 500) throw new MailError('provider_down', retry, code);
    if (['invalid_recipient', 'invalid_email'].includes(code ?? ''))
      throw new MailError('invalid_recipient', 0, code);
    throw new MailError(res.ok ? 'ambiguous' : 'configuration', 0, code);
  }
  async unblock(email: string) {
    let res: Response;
    try {
      res = await fetch(
        `https://api.brevo.com/v3/smtp/blockedContacts/${encodeURIComponent(email)}`,
        {
          method: 'DELETE',
          headers: {
            'api-key': this.config.getOrThrow('BREVO_API_KEY'),
            Accept: 'application/json',
          },
          signal: AbortSignal.timeout(5000),
        },
      );
    } catch {
      throw new MailError('ambiguous');
    }
    if (res.ok) return;
    const body = (await res.json().catch(() => ({}))) as { code?: string };
    if (res.status === 404 && body.code === 'document_not_found') return;
    throw new MailError('configuration');
  }
}
@Injectable()
export class ConsoleMailDriver implements MailDriver {
  readonly name = 'CONSOLE';
  private readonly logger = new Logger('LocalMail');
  constructor(config: ConfigService) {
    if (
      config.get('AUTH_RELEASE_STAGE') !== 'local' ||
      config.get('NODE_ENV') !== 'development'
    )
      throw new Error('Console mail requires local development');
  }
  send(m: MailMessage) {
    this.logger.log(m.text);
    return Promise.resolve({ providerMessageId: `console-${m.dispatchId}` });
  }
}
/** Test modules override the injection token with this recorder. Never an HTTP bypass. */
export class RecordingMailDriver implements MailDriver {
  readonly name = 'TEST';
  readonly messages: MailMessage[] = [];
  send(m: MailMessage) {
    this.messages.push(m);
    return Promise.resolve({ providerMessageId: `test-${m.dispatchId}` });
  }
  unblock() {
    return Promise.resolve();
  }
}
