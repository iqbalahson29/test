import type { SessionResult } from '@quiz-platform/shared';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import supertest from 'supertest';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../src/app.module';
import {
  configureHttp,
  PersistentRequestGuard,
} from '../src/auth/security/http-security';
import { PrismaService } from '../src/prisma/prisma.service';
import { AuthClock, serial } from '../src/auth/security/primitives';
import { SessionService } from '../src/auth/session.service';
import { PasswordService } from '../src/auth/password.service';
import {
  MAIL_DRIVER_TOKEN,
  RecordingMailDriver,
} from '../src/mailer/mail-driver';
import { OtpService } from '../src/auth/otp.service';
import { AuthCookies } from '../src/auth/security/cookies';
export class TestClock extends AuthClock {
  private instant = new Date();
  now() {
    return new Date(this.instant);
  }
  advance(ms: number) {
    this.instant = new Date(this.instant.getTime() + ms);
  }
}
export const testHeaders = {
  Origin: 'http://localhost:5173',
  'X-Quiz-Client': 'web',
  'Content-Type': 'application/json',
};

/**
 * Supertest types every response `body` as `any`. Because that `any` spreads through each
 * `res.body.field` read, it silently switched off the no-unsafe-* rules across every suite
 * -- the rules were configured but had nothing to check. The agent is therefore given an
 * explicit JSON-shaped surface here, at the single point where the untyped library is
 * adopted, rather than by casting at each of the call sites it feeds.
 *
 * Reading a field now yields `unknown`, so a test states what it expects from a response.
 */
export type JsonBody = Record<string, unknown>;
export interface JsonResponse extends Omit<supertest.Response, 'body'> {
  body: JsonBody;
}
export interface JsonTest extends PromiseLike<JsonResponse> {
  set(field: string, value: string): JsonTest;
  set(fields: Record<string, string>): JsonTest;
  send(data?: string | object): JsonTest;
  auth(user: string, pass: string): JsonTest;
  auth(token: string, options: { type: 'bearer' | 'basic' | 'auto' }): JsonTest;
  on(event: string, listener: (...args: never[]) => void): JsonTest;
  parse(
    fn: (
      res: unknown,
      callback: (err: Error | null, body: unknown) => void,
    ) => void,
  ): JsonTest;
  expect(status: number): JsonTest;
  expect(status: number, body: unknown): JsonTest;
  expect(body: object): JsonTest;
  expect(field: string, value: string | RegExp): JsonTest;
  expect(checker: (res: JsonResponse) => unknown): JsonTest;
  then<TResult1 = JsonResponse, TResult2 = never>(
    onfulfilled?:
      ((value: JsonResponse) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2>;
  catch<TResult = never>(
    onrejected?: ((reason: unknown) => TResult | PromiseLike<TResult>) | null,
  ): Promise<JsonResponse | TResult>;
}
/**
 * Narrowings for reading a response body. Each asserts the shape the endpoint is documented
 * to return, so a contract change fails the test with a clear message instead of surfacing
 * later as `undefined` in a URL. They replace the blanket `any` the suites relied on before.
 */
export function str(value: unknown): string {
  if (typeof value !== 'string') {
    throw new Error(
      `Expected a string in the response body, received ${typeof value}`,
    );
  }
  return value;
}
export function num(value: unknown): number {
  if (typeof value !== 'number') {
    throw new Error(
      `Expected a number in the response body, received ${typeof value}`,
    );
  }
  return value;
}
export function obj<T = JsonBody>(value: unknown): T {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(
      `Expected an object in the response body, received ${typeof value}`,
    );
  }
  return value as T;
}
/** Narrows an array response or field. The element type is what the endpoint documents. */
export function list<T = JsonBody>(value: unknown): T[] {
  if (!Array.isArray(value)) {
    throw new Error(
      `Expected an array in the response body, received ${typeof value}`,
    );
  }
  return value as T[];
}
/** Asserts a lookup found something, so a missing fixture fails here rather than as
 * `undefined` several lines later. */
export function must<T>(value: T | undefined | null, what = 'value'): T {
  if (value === undefined || value === null) {
    throw new Error(`Expected to find a ${what}, but it was absent`);
  }
  return value;
}

export interface JsonAgent {
  get(url: string): JsonTest;
  post(url: string): JsonTest;
  patch(url: string): JsonTest;
  put(url: string): JsonTest;
  delete(url: string): JsonTest;
}
export function request(server: Parameters<typeof supertest>[0]): JsonAgent {
  const agent = supertest(server);
  for (const method of ['get', 'post', 'patch', 'delete', 'put'] as const) {
    const original = agent[method].bind(agent) as (
      url: string,
    ) => supertest.Test;
    agent[method] = (url: string) => {
      const req = original(url).set(testHeaders);
      return method === 'get' ? req : req.send({});
    };
  }
  // The one place the library's `any` is adopted, so the suites above it stay type-checked.
  return agent as unknown as JsonAgent;
}
export async function resetDatabase(db: PrismaService) {
  const url = new URL(process.env.DATABASE_URL!);
  if (
    !['localhost', '127.0.0.1'].includes(url.hostname) ||
    !url.pathname.startsWith('/quiz_auth_test')
  )
    throw new Error('Unsafe test database');
  const tables = await db.$queryRaw<
    { tablename: string }[]
  >`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename<>'_prisma_migrations'`;
  if (tables.length)
    await db.$executeRawUnsafe(
      'TRUNCATE ' +
        tables
          .map((t) => '"' + t.tablename.replaceAll('"', '""') + '"')
          .join(',') +
        ' CASCADE',
    );
}
export async function makeApp(domainFixtures = false) {
  const mail = new RecordingMailDriver(),
    clock = new TestClock();
  let builder = Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(MAIL_DRIVER_TOKEN)
    .useValue(mail)
    .overrideProvider(AuthClock)
    .useValue(clock);
  // Domain suites use direct completed-session fixtures. Auth suites keep real limits.
  if (domainFixtures)
    builder = builder
      .overrideProvider(PersistentRequestGuard)
      .useValue({ canActivate: () => true });
  const module = await builder.compile(),
    app = module.createNestApplication({ bodyParser: false });
  configureHttp(app);
  await app.init();
  if (domainFixtures) {
    await resetDatabase(app.get(PrismaService));
    await fixtureLogin(app, 'admin@acme.test');
    await fixtureLogin(app, 'student@acme.test');
    await fixtureLogin(app, 'superadmin@quiz-platform.test');
  }
  return { app, mail, clock, db: app.get(PrismaService) };
}
export async function createUser(
  app: INestApplication,
  options: {
    email?: string;
    password?: string | null;
    superadmin?: boolean;
    verified?: boolean;
    tenant?: boolean;
  } = {},
) {
  const db = app.get(PrismaService),
    email = options.email ?? `${randomUUID()}@e2e.test`,
    password =
      options.password === undefined ? 'Password123' : options.password,
    hash = password ? await app.get(PasswordService).hash(password) : null;
  return serial(db, async (tx) => {
    const user = await tx.user.create({
      data: {
        email,
        emailNormalized: email,
        name: 'Test User',
        passwordHash: hash,
        isSuperAdmin: options.superadmin ?? false,
        emailVerifiedAt: options.verified ? app.get(AuthClock).now() : null,
      },
    });
    await tx.authIdentity.create({
      data: {
        userId: user.id,
        provider: hash ? 'PASSWORD' : 'GOOGLE',
        providerUserId: hash ? user.id : randomUUID(),
        email: hash ? null : email,
        emailVerified: !!options.verified,
      },
    });
    if (options.tenant) {
      const tenant = await tx.tenant.create({
        data: { name: 'Test workspace', slug: `test-${randomUUID()}` },
      });
      await tx.membership.create({
        data: { userId: user.id, tenantId: tenant.id, role: 'ADMIN' },
      });
    }
    return user;
  });
}
export async function fixtureLogin(
  app: INestApplication,
  email: string,
  password = 'Password123',
) {
  const db = app.get(PrismaService),
    clock = app.get(AuthClock),
    cookies = app.get(AuthCookies);
  let user = await db.user.findUnique({ where: { emailNormalized: email } });
  if (!user) {
    user = await createUser(app, {
      email,
      password,
      superadmin: email.startsWith('superadmin@'),
      verified: true,
    });
    if (email.endsWith('@acme.test')) {
      const tenant = await db.tenant.upsert({
        where: { slug: 'acme-school' },
        create: { name: 'Acme School', slug: 'acme-school' },
        update: {},
      });
      await db.membership.create({
        data: {
          tenantId: tenant.id,
          userId: user.id,
          role: email.startsWith('admin') ? 'ADMIN' : 'STUDENT',
        },
      });
    }
  }
  const output = await serial(db, (tx) =>
    app.get(SessionService).create(
      tx,
      user,
      {
        contextHash: cookies.hash('a'.repeat(43)),
        source: '127.0.0.1',
        userAgent: 'Fixture',
      },
      {
        firstFactor: 'PASSWORD',
        firstFactorAt: clock.now(),
        otpVerifiedAt: clock.now(),
      },
    ),
  );
  return {
    body: output.result as SessionResult & {
      accessToken: string;
      membership: { membershipId: string; tenantId: string; role: string };
      selectionToken: string;
      choices: { membershipId: string; tenantName: string }[];
    },
    headers: {
      'set-cookie': [
        `refresh_token=${output.refreshToken ?? ''}`,
        `auth_context=${output.contextToken}`,
      ],
    },
    status: 200,
  };
}
export async function fixtureTenantAdmin(app: INestApplication, label: string) {
  const user = await createUser(app, {
    email: `${label}-${randomUUID()}@e2e.test`,
    tenant: true,
    verified: true,
  });
  const login = await fixtureLogin(app, user.emailNormalized);
  return {
    token: 'accessToken' in login.body ? login.body.accessToken : '',
    email: user.emailNormalized,
  };
}
export function cookieHeader(response: { headers: Record<string, unknown> }) {
  return ((response.headers['set-cookie'] as string[]) ?? [])
    .map((c) => c.split(';')[0])
    .join('; ');
}
export async function browser(app: INestApplication) {
  const r = await request(app.getHttpServer())
    .post('/auth/context')
    .expect(200);
  return cookieHeader(r);
}
export async function latestCode(
  app: INestApplication,
  mail: RecordingMailDriver,
  challengeId: string,
) {
  await app.get(OtpService).drain();
  const challenge = await app
    .get(PrismaService)
    .authChallenge.findUniqueOrThrow({ where: { publicId: challengeId } });
  const message = mail.messages
    .filter(
      (m) => m.recipient === challenge.emailNormalized && m.category === 'OTP',
    )
    .at(-1);
  if (!message) throw new Error('No test OTP was recorded');
  const code = message.text.match(/code is ([0-9]{6})/);
  if (!code) throw new Error('No OTP in recorded message');
  return code[1];
}

export async function registerVerified(
  app: INestApplication,
  email: string,
  password = 'Password123',
) {
  const cookie = await browser(app),
    c = await request(app.getHttpServer())
      .post('/auth/register')
      .set('Cookie', cookie)
      .send({ email, name: 'Directory Student', password })
      .expect(202);
  const code = await latestCode(
    app,
    app.get<RecordingMailDriver>(MAIL_DRIVER_TOKEN),
    str(c.body.challengeId),
  );
  return request(app.getHttpServer())
    .post('/auth/otp/verify')
    .set('Cookie', cookie)
    .send({ challengeId: c.body.challengeId, code })
    .expect(200);
}
