import { normalizeIdentifier } from '@quiz-platform/shared';
const policy = {
  SESSION_IDLE_TTL_DAYS: 7,
  SESSION_ABSOLUTE_TTL_DAYS: 30,
  REFRESH_RACE_GRACE_SECONDS: 10,
  OTP_TTL_MINUTES: 10,
  OTP_MAX_ATTEMPTS: 5,
  OTP_RESEND_COOLDOWN_SECONDS: 60,
  OTP_MAX_SENDS_PER_15_MINUTES: 3,
  OTP_MAX_SENDS_PER_IP_HOUR: 10,
  TRUSTED_DEVICE_TTL_DAYS: 30,
  TRUSTED_DEVICE_ABSOLUTE_MAX_DAYS: 90,
  SECURITY_EVENT_RETENTION_DAYS: 180,
  MAIL_DAILY_BUDGET: 200,
  MAIL_NON_OTP_DAILY_LIMIT: 50,
  MAIL_BUDGET_ALERT_PCT: 80,
  MAIL_RATE_ALERT_COUNT: 25,
  MAIL_RATE_ALERT_WINDOW_MINUTES: 15,
  MAIL_RATE_ALERT_COOLDOWN_MINUTES: 60,
  MAIL_REQUEST_TIMEOUT_MS: 5000,
};
export function validateAuthConfig(input: Record<string, unknown>) {
  const c = { ...input };
  const fail = (key: string): never => {
    throw new Error(`Invalid authentication configuration: ${key}`);
  };
  const scalar = (value: unknown, key: string) => {
    if (typeof value !== 'string' && typeof value !== 'number')
      return fail(key);
    return String(value);
  };
  const oneOf = (key: string, values: string[], fallback?: string) => {
    const value = c[key] ?? fallback;
    if (typeof value !== 'string' || !values.includes(value)) return fail(key);
    c[key] = value;
    return value;
  };
  const env = oneOf(
    'NODE_ENV',
    ['development', 'test', 'production'],
    'development',
  );
  const stage = oneOf(
    'AUTH_RELEASE_STAGE',
    ['local', 'hosted-test', 'public'],
    env === 'production' ? undefined : 'local',
  );
  const hosted = stage !== 'local';
  if (hosted && env !== 'production') fail('NODE_ENV');
  // Set by the release script so /health/release can attest which build is running.
  // Optional, but when present it must be the exact commit the release was cut from.
  if (
    c.AUTH_RELEASE_ID !== undefined &&
    !/^[a-f0-9]{40}$/.test(scalar(c.AUTH_RELEASE_ID, 'AUTH_RELEASE_ID'))
  )
    fail('AUTH_RELEASE_ID');
  const mode = oneOf('AUTH_OTP_MODE', ['off', 'superadmins', 'all'], 'off');
  const bool = (key: string, fallback: string) =>
    oneOf(key, ['true', 'false'], fallback) === 'true';
  const secure = bool('COOKIE_SECURE', 'true');
  const google = bool('AUTH_GOOGLE_ENABLED', 'false');
  const sender = bool('MAIL_SENDER_AUTHENTICATED', 'false');
  let origin: URL;
  try {
    origin = new URL(String(c.WEB_ORIGIN));
  } catch {
    return fail('WEB_ORIGIN');
  }
  if (
    origin.origin !== c.WEB_ORIGIN ||
    origin.username ||
    origin.password ||
    !['http:', 'https:'].includes(origin.protocol)
  )
    fail('WEB_ORIGIN');
  const localhost = ['localhost', '127.0.0.1', '[::1]'].includes(
    origin.hostname,
  );
  if (hosted && origin.protocol !== 'https:') fail('WEB_ORIGIN');
  if (!secure && (hosted || !localhost || origin.protocol !== 'http:'))
    fail('COOKIE_SECURE');
  const hops = scalar(
    c.TRUST_PROXY_HOPS ?? (hosted ? '1' : '0'),
    'TRUST_PROXY_HOPS',
  );
  if (hops !== (hosted ? '1' : '0')) fail('TRUST_PROXY_HOPS');
  c.TRUST_PROXY_HOPS = hops;
  const driver = oneOf(
    'MAIL_DRIVER',
    ['console', 'recording', 'noop', 'brevo'],
    env === 'test' ? 'recording' : 'console',
  );
  if (hosted && driver !== 'brevo') fail('MAIL_DRIVER');
  if (['recording', 'noop'].includes(driver) && env !== 'test')
    fail('MAIL_DRIVER');
  if (driver === 'console' && (hosted || env !== 'development'))
    fail('MAIL_DRIVER');
  const keys = [
    'JWT_ACCESS_SECRET',
    'JWT_REFRESH_SECRET',
    'OTP_PEPPER',
    'AUTH_HASH_KEY',
    'MAIL_PAYLOAD_KEY',
  ];
  if (hosted || driver === 'brevo') keys.push('BREVO_WEBHOOK_SECRET');
  const seen = new Set<string>();
  for (const key of keys) {
    const value = c[key];
    if (
      typeof value !== 'string' ||
      /change.?me|replace|example|placeholder|your[-_ ]|dev.?secret/i.test(
        value,
      )
    )
      fail(key);
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value as string)) fail(key);
    const decoded = Buffer.from(value as string, 'base64');
    if (
      decoded.toString('base64').replace(/=+$/, '') !==
      (value as string).replace(/=+$/, '')
    )
      fail(key);
    if (
      decoded.length < 32 ||
      (key === 'MAIL_PAYLOAD_KEY' && decoded.length !== 32) ||
      seen.has(decoded.toString('hex'))
    )
      fail(key);
    seen.add(decoded.toString('hex'));
  }
  for (const [key, value] of Object.entries(policy)) {
    if (c[key] !== undefined && scalar(c[key], key) !== String(value))
      fail(key);
    c[key] = String(value);
  }
  for (const key of ['OTP_PEPPER_VERSION', 'MAIL_PAYLOAD_KEY_VERSION']) {
    if (!/^[1-9][0-9]{0,5}$/.test(scalar(c[key] ?? 1, key))) fail(key);
    c[key] = scalar(c[key] ?? 1, key);
  }
  if (
    c.JWT_ACCESS_EXPIRES_IN !== undefined &&
    c.JWT_ACCESS_EXPIRES_IN !== '10m'
  )
    fail('JWT_ACCESS_EXPIRES_IN');
  c.JWT_ACCESS_EXPIRES_IN = '10m';
  if (
    c.JWT_REFRESH_EXPIRES_IN !== undefined &&
    c.JWT_REFRESH_EXPIRES_IN !== '7d'
  )
    fail('JWT_REFRESH_EXPIRES_IN');
  if (
    c.MAIL_OUTBOX_RETRY_DELAYS !== undefined &&
    c.MAIL_OUTBOX_RETRY_DELAYS !== '1m,5m,30m,2h,24h'
  )
    fail('MAIL_OUTBOX_RETRY_DELAYS');
  if (google) {
    if (
      typeof c.GOOGLE_CLIENT_ID !== 'string' ||
      !/^[a-zA-Z0-9-]+\.apps\.googleusercontent\.com$/.test(c.GOOGLE_CLIENT_ID)
    )
      fail('GOOGLE_CLIENT_ID');
    if (
      c.VITE_GOOGLE_CLIENT_ID !== c.GOOGLE_CLIENT_ID ||
      c.VITE_AUTH_GOOGLE_ENABLED !== 'true'
    )
      fail('VITE_GOOGLE_CLIENT_ID');
  } else if (
    c.VITE_AUTH_GOOGLE_ENABLED !== undefined &&
    c.VITE_AUTH_GOOGLE_ENABLED !== 'false'
  )
    fail('VITE_AUTH_GOOGLE_ENABLED');
  if (driver === 'brevo') {
    if (
      typeof c.BREVO_API_KEY !== 'string' ||
      c.BREVO_API_KEY.length < 20 ||
      /replace|example|placeholder/i.test(c.BREVO_API_KEY)
    )
      fail('BREVO_API_KEY');
    try {
      normalizeIdentifier(c.MAIL_FROM_EMAIL);
    } catch {
      fail('MAIL_FROM_EMAIL');
    }
  }
  if (c.MAIL_REPLY_TO) {
    try {
      normalizeIdentifier(c.MAIL_REPLY_TO);
    } catch {
      fail('MAIL_REPLY_TO');
    }
  }
  c.MAIL_FROM_NAME ??= 'Quiz Platform';
  if (
    typeof c.MAIL_FROM_NAME !== 'string' ||
    c.MAIL_FROM_NAME.length > 100 ||
    /[\r\n]/.test(c.MAIL_FROM_NAME)
  )
    fail('MAIL_FROM_NAME');
  const allowlist = scalar(
    c.AUTH_TEST_EMAIL_ALLOWLIST ?? '',
    'AUTH_TEST_EMAIL_ALLOWLIST',
  )
    .split(',')
    .filter(Boolean);
  for (const address of allowlist) {
    try {
      if (normalizeIdentifier(address).normalized !== address)
        fail('AUTH_TEST_EMAIL_ALLOWLIST');
    } catch {
      fail('AUTH_TEST_EMAIL_ALLOWLIST');
    }
  }
  if (stage === 'hosted-test' && !allowlist.length)
    fail('AUTH_TEST_EMAIL_ALLOWLIST');
  if (
    stage === 'public' &&
    (!sender || !['all', 'off'].includes(mode) || allowlist.length)
  )
    fail('AUTH_RELEASE_STAGE');
  if (c.S3_ENDPOINT) {
    try {
      const u = new URL(scalar(c.S3_ENDPOINT, 'S3_ENDPOINT'));
      if (
        !['http:', 'https:'].includes(u.protocol) ||
        u.username ||
        u.password ||
        u.search ||
        u.hash
      )
        fail('S3_ENDPOINT');
    } catch {
      fail('S3_ENDPOINT');
    }
  }
  if (c.BREVO_WEBHOOK_PREVIOUS_SECRET) {
    const until = Date.parse(String(c.BREVO_WEBHOOK_PREVIOUS_UNTIL));
    if (
      !Number.isFinite(until) ||
      until <= Date.now() ||
      until > Date.now() + 86400000
    )
      fail('BREVO_WEBHOOK_PREVIOUS_UNTIL');
  }
  return c;
}
