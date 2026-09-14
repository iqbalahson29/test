import { randomBytes } from 'node:crypto';
// The test target is intentionally distinct from every application database.
const database =
  process.env.AUTH_TEST_DATABASE_URL ??
  'postgresql://auth_test:isolated-auth-tests@127.0.0.1:55432/quiz_auth_test';
const target = new URL(database);
if (
  !['127.0.0.1', 'localhost'].includes(target.hostname) ||
  !target.pathname.startsWith('/quiz_auth_test')
)
  throw new Error('Tests require a local isolated quiz_auth_test database');
process.env.DATABASE_URL = database;
Object.assign(process.env, {
  NODE_ENV: 'test',
  AUTH_RELEASE_STAGE: 'local',
  WEB_ORIGIN: process.env.AUTH_BROWSER_TEST_ORIGIN ?? 'http://localhost:5173',
  COOKIE_SECURE: process.env.AUTH_BROWSER_TEST_ORIGIN ? 'true' : 'false',
  TRUST_PROXY_HOPS: '0',
  AUTH_OTP_MODE: 'all',
  AUTH_GOOGLE_ENABLED: 'false',
  VITE_AUTH_GOOGLE_ENABLED: 'false',
  JWT_ACCESS_EXPIRES_IN: '10m',
  JWT_REFRESH_EXPIRES_IN: '7d',
  MAIL_DRIVER: 'recording',
  MAIL_FROM_EMAIL: 'test@example.test',
  MAIL_FROM_NAME: 'Test Platform',
  OTP_PEPPER_VERSION: '1',
  MAIL_PAYLOAD_KEY_VERSION: '1',
  S3_ENDPOINT: 'http://127.0.0.1:59000',
  S3_BUCKET: 'quiz-platform',
  S3_REGION: 'us-east-1',
  S3_ACCESS_KEY_ID: 'auth_test_storage',
  S3_SECRET_ACCESS_KEY: 'isolated-auth-test-storage',
});
for (const key of [
  'JWT_ACCESS_SECRET',
  'JWT_REFRESH_SECRET',
  'OTP_PEPPER',
  'AUTH_HASH_KEY',
  'MAIL_PAYLOAD_KEY',
  'BREVO_WEBHOOK_SECRET',
])
  process.env[key] = randomBytes(32).toString('base64');
