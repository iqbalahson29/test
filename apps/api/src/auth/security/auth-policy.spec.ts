import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import { HttpException } from '@nestjs/common';
import { LoginTicket, OAuth2Client, TokenPayload } from 'google-auth-library';
import {
  normalizeIdentifier,
  isStrongPassword,
  validLoginPassword,
} from '@quiz-platform/shared';
import { validateAuthConfig } from './auth-config';
import { originAllowed } from './http-security';
import { AuthClock, AuthRandom } from './primitives';
import { PasswordService } from '../password.service';
import { GoogleService } from '../google.service';
import { AuthPolicyService } from '../auth-policy.service';
import { SessionService } from '../session.service';
import {
  brevoPayload,
  BrevoMailDriver,
  MailMessage,
} from '../../mailer/mail-driver';
const config = () => ({
  NODE_ENV: 'test',
  AUTH_RELEASE_STAGE: 'local',
  WEB_ORIGIN: 'http://localhost:5173',
  COOKIE_SECURE: 'false',
  MAIL_DRIVER: 'recording',
  AUTH_OTP_MODE: 'all',
  ...Object.fromEntries(
    [
      'JWT_ACCESS_SECRET',
      'JWT_REFRESH_SECRET',
      'OTP_PEPPER',
      'AUTH_HASH_KEY',
      'MAIL_PAYLOAD_KEY',
    ].map((k) => [k, randomBytes(32).toString('base64')]),
  ),
});
afterEach(() => jest.restoreAllMocks());
describe('Shared mailbox and password policy', () => {
  it.each([
    ' User+course@Example.COM ',
    'USER+another@example.com',
    'user@example.com',
  ])('canonicalizes %s', (value) =>
    expect(normalizeIdentifier(value).normalized).toBe('user@example.com'),
  );
  it('preserves dots and accepts disposable/DNS addresses', () => {
    expect(normalizeIdentifier('a.b@mailinator.com').normalized).toBe(
      'a.b@mailinator.com',
    );
    expect(normalizeIdentifier('ab@mailinator.com').normalized).not.toBe(
      'a.b@mailinator.com',
    );
  });
  it.each([
    'a..b@example.com',
    '+alias@example.com',
    'ü@example.com',
    'a@-bad.test',
    'a@localhost',
    'a b@example.com',
    'a@exa_mple.com',
    'a@@example.com',
    'a\0@example.com',
    'a@例子.test',
  ])('refuses invalid mailbox %s', (value) =>
    expect(() => normalizeIdentifier(value)).toThrow(),
  );
  it('counts Unicode characters and enforces exact UTF-8/NUL limits', () => {
    expect(isStrongPassword('Aa1' + 'é'.repeat(34) + 'a')).toBe(true);
    expect(isStrongPassword('Aa1' + 'é'.repeat(35))).toBe(false);
    expect(isStrongPassword('Aa1🙂🙂🙂🙂🙂🙂🙂')).toBe(true);
    expect(isStrongPassword('Aa1abcd\0efg')).toBe(false);
    expect(validLoginPassword('a'.repeat(72))).toBe(true);
    expect(validLoginPassword('a'.repeat(73))).toBe(false);
  });
  it('uses real dummy work for absent passwords and current plus five retired hashes', async () => {
    const passwords = new PasswordService();
    expect(await passwords.verify('Password123', null)).toBe(false);
    const hashes = await Promise.all(
      Array.from({ length: 7 }, (_, i) => passwords.hash(`Password123${i}`)),
    );
    const history = passwords.history(hashes[1], hashes.slice(2));
    expect(history).toHaveLength(5);
    for (let i = 0; i < 6; i++)
      await expect(
        passwords.ensureFresh(`Password123${i}`, hashes[0], history),
      ).rejects.toBeInstanceOf(HttpException);
    await expect(
      passwords.ensureFresh('Password1236', hashes[0], history),
    ).resolves.toBeUndefined();
    expect(passwords.history(null, [])).toEqual([]);
  });
});
describe('Deployment and CSRF validation', () => {
  it('accepts complete local configuration', () =>
    expect(validateAuthConfig(config()).AUTH_OTP_MODE).toBe('all'));
  it.each(['short', 'change-me', '%%%' + randomBytes(32).toString('base64')])(
    'rejects malformed keys without echoing them',
    (value) =>
      expect(() =>
        validateAuthConfig({ ...config(), OTP_PEPPER: value }),
      ).toThrow('OTP_PEPPER'),
  );
  it('rejects reused key material', () => {
    const c = config();
    expect(() =>
      validateAuthConfig({ ...c, OTP_PEPPER: c.JWT_ACCESS_SECRET }),
    ).toThrow('OTP_PEPPER');
  });
  it.each([
    { AUTH_RELEASE_STAGE: 'hosted-test' },
    { WEB_ORIGIN: 'https://example.com/path' },
    { JWT_ACCESS_EXPIRES_IN: '15m' },
    { OTP_MAX_ATTEMPTS: '6' },
    { TRUST_PROXY_HOPS: 'true' },
    { AUTH_GOOGLE_ENABLED: 'yes' },
    { VITE_AUTH_GOOGLE_ENABLED: 'invalid' },
  ])('fails closed for invalid configuration %j', (override) =>
    expect(() => validateAuthConfig({ ...config(), ...override })).toThrow(),
  );
  it.each([
    undefined,
    'null',
    'https://example.com.evil.test',
    'http://example.com',
    'https://example.com:444',
  ])('refuses mismatched origin %s', (origin) =>
    expect(
      originAllowed(
        { headers: { origin, 'x-quiz-client': 'web' } },
        'https://example.com',
      ),
    ).toBe(false),
  );
  it('requires custom header, exact referer fallback and same-site metadata', () => {
    expect(
      originAllowed(
        { headers: { origin: 'https://example.com' } },
        'https://example.com',
      ),
    ).toBe(false);
    expect(
      originAllowed(
        {
          headers: {
            referer: 'https://example.com/login?q=1',
            'x-quiz-client': 'web',
          },
        },
        'https://example.com',
      ),
    ).toBe(true);
    expect(
      originAllowed(
        {
          headers: {
            origin: 'https://example.com',
            'x-quiz-client': 'web',
            'sec-fetch-site': 'cross-site',
          },
        },
        'https://example.com',
      ),
    ).toBe(false);
  });
});
describe('Verified Google claims', () => {
  const clock = new AuthClock(),
    clientId = 'test.apps.googleusercontent.com';
  const payload = (): TokenPayload & { nonce: string } => ({
    iss: 'https://accounts.google.com',
    aud: clientId,
    sub: 'subject-1',
    email: 'user@gmail.com',
    email_verified: true,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
    nonce: 'a'.repeat(43),
  });
  function service() {
    return new GoogleService(
      new ConfigService({ GOOGLE_CLIENT_ID: clientId }),
      clock,
      new AuthRandom(),
      { googleEnabled: () => {} } as AuthPolicyService,
      {} as SessionService,
    );
  }
  it.each([
    { iss: 'attacker' },
    { aud: 'other' },
    { azp: 'other' },
    { email_verified: false },
    { exp: 0 },
    { iat: Math.floor(Date.now() / 1000) + 120 },
    { nonce: undefined },
    { sub: '' },
  ])('refuses invalid verified claims %j', async (overrides) => {
    jest
      .spyOn(OAuth2Client.prototype, 'verifyIdToken')
      .mockResolvedValue(new LoginTicket('', { ...payload(), ...overrides }));
    await expect(service().verify('test-credential')).rejects.toBeInstanceOf(
      HttpException,
    );
  });
  it('uses the verification library, rejecting bad signatures', async () => {
    jest
      .spyOn(OAuth2Client.prototype, 'verifyIdToken')
      .mockRejectedValue(new Error('invalid signature'));
    await expect(service().verify('forged')).rejects.toBeInstanceOf(
      HttpException,
    );
  });
  it.each([
    ['user@gmail.com', undefined, true],
    ['user+tag@gmail.com', undefined, false],
    ['user@external.test', undefined, false],
    ['user@workspace.test', 'workspace.test', true],
  ] as const)(
    'only trusts canonical authoritative mailbox %s',
    async (email, hd, authoritative) => {
      const spy = jest
        .spyOn(OAuth2Client.prototype, 'verifyIdToken')
        .mockResolvedValue(new LoginTicket('', { ...payload(), email, hd }));
      expect((await service().verify('credential')).authoritative).toBe(
        authoritative,
      );
      expect(spy).toHaveBeenCalledWith({
        idToken: 'credential',
        audience: clientId,
      });
    },
  );
});
describe('Brevo adapter contract', () => {
  const m: MailMessage = {
    recipient: 'recipient@example.test',
    category: 'OTP',
    subject: 'Verification',
    html: '<p>test</p>',
    text: 'test',
    dispatchId: '00000000-0000-4000-a000-000000000001',
    idempotencyKey: 'local-dedupe-key',
    sender: { email: 'sender@example.test', name: 'Platform' },
  };
  it('puts the stable UUID in JSON headers, never an HTTP Idempotency-Key', async () => {
    const fetcher = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ messageId: '<id@example.test>' }), {
        status: 201,
      }),
    );
    const driver = new BrevoMailDriver(
      new ConfigService({ BREVO_API_KEY: 'test-provider-key' }),
    );
    expect(await driver.send(m)).toEqual({
      providerMessageId: 'id@example.test',
    });
    const options = fetcher.mock.calls[0][1]!;
    expect(JSON.parse(options.body as string)).toEqual(brevoPayload(m));
    expect(brevoPayload(m).headers.idempotencyKey).toBe(m.dispatchId);
    expect(options.headers).not.toHaveProperty('Idempotency-Key');
  });
  it.each([
    [201, {}, 'ambiguous'],
    [400, { code: 'duplicate_parameter' }, 'duplicate'],
    [401, {}, 'configuration'],
    [429, {}, 'rate_limited'],
    [503, {}, 'provider_down'],
  ] as const)(
    'never invents successful submission for %s',
    async (status, body, kind) => {
      jest
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(new Response(JSON.stringify(body), { status }));
      await expect(
        new BrevoMailDriver(
          new ConfigService({ BREVO_API_KEY: 'test-key' }),
        ).send(m),
      ).rejects.toMatchObject({ kind });
    },
  );
});
