import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import supertest from 'supertest';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../src/prisma/prisma.service';
import { OtpService } from '../src/auth/otp.service';
import { MailerService } from '../src/mailer/mailer.service';
import { MailError, RecordingMailDriver } from '../src/mailer/mail-driver';
import { ConfigService } from '@nestjs/config';
import { serial } from '../src/auth/security/primitives';
import {
  TestClock,
  browser,
  cookieHeader,
  createUser,
  latestCode,
  makeApp,
  request,
  str,
  obj,
} from './auth-test-helpers';
import { GoogleService } from '../src/auth/google.service';
let app: INestApplication,
  db: PrismaService,
  clock: TestClock,
  mail: RecordingMailDriver;
const PASSWORD = 'Password123';
async function login(email: string, context?: string, remember = false) {
  const cookie = context ?? (await browser(app));
  const first = await request(app.getHttpServer())
    .post('/auth/login')
    .set('Cookie', cookie)
    .send({ identifier: email, password: PASSWORD })
    .expect(200);
  if (first.body.status !== 'otp-required')
    return {
      body: first.body,
      headers: first.headers,
      cookie: cookieHeader(first) || cookie,
    };
  const code = await latestCode(app, mail, str(first.body.challengeId));
  const res = await request(app.getHttpServer())
    .post('/auth/otp/verify')
    .set('Cookie', cookie)
    .send({
      challengeId: first.body.challengeId,
      code,
      rememberDevice: remember,
    })
    .expect(200);
  return { body: res.body, headers: res.headers, cookie: cookieHeader(res) };
}
async function stepUp(
  token: string,
  cookie: string,
  action: string,
  target: Record<string, string> = {},
) {
  const challenge = await request(app.getHttpServer())
    .post('/auth/step-up/request')
    .set('Cookie', cookie)
    .auth(token, { type: 'bearer' })
    .send({ action, target })
    .expect(200);
  const code = await latestCode(app, mail, str(challenge.body.challengeId));
  const grant = await request(app.getHttpServer())
    .post('/auth/step-up/verify')
    .set('Cookie', cookie)
    .auth(token, { type: 'bearer' })
    .send({ challengeId: challenge.body.challengeId, code })
    .expect(200);
  return grant.body.grantToken as string;
}
async function signup(email: string, cookie: string, password = PASSWORD) {
  return request(app.getHttpServer())
    .post('/auth/register')
    .set('Cookie', cookie)
    .send({ email, name: 'New learner', password })
    .expect(202);
}
beforeAll(async () => {
  ({ app, db, clock, mail } = await makeApp());
});
afterAll(async () => {
  await app?.get(OtpService).drain();
  await app?.close();
});
beforeEach(async () => {
  jest.restoreAllMocks();
  await app.get(OtpService).drain();
  mail.messages.length = 0;
  await db.$executeRawUnsafe(
    'TRUNCATE TABLE "Tenant", "User", "TenantRequest", "MemberInvitation", "AuthChallenge", "PendingRegistration", "AuthRateBucket", "LoginFailure", "MailAttempt", "MailSendBudget", "MailOutbox", "MailRecipient", "MailDelivery", "MailDeliveryEvent", "OtpSendReservation", "OperationalAlert", "SecurityEvent", "GoogleNonce", "CspReport" CASCADE',
  );
});
describe('Authentication contract and factor isolation', () => {
  it('keeps signup pending, canonicalizes delivery and commits one verified identity', async () => {
    const cookie = await browser(app),
      r = await signup(' Learner+tag@Example.test ', cookie);
    expect(r.body).toEqual(
      expect.objectContaining({
        status: 'otp-required',
        maskedEmail: 'l***@example.test',
        resendAfterSeconds: 60,
      }),
    );
    expect(await db.user.count()).toBe(0);
    const code = await latestCode(app, mail, str(r.body.challengeId));
    expect(mail.messages[0].recipient).toBe('learner@example.test');
    const verified = await request(app.getHttpServer())
      .post('/auth/otp/verify')
      .set('Cookie', cookie)
      .send({ challengeId: r.body.challengeId, code })
      .expect(200);
    expect(verified.body.status).toBe('no-workspace');
    const user = await db.user.findUniqueOrThrow({
      where: { emailNormalized: 'learner@example.test' },
    });
    expect(user.emailVerifiedAt).not.toBeNull();
    expect(
      await db.authIdentity.count({
        where: { userId: user.id, provider: 'PASSWORD' },
      }),
    ).toBe(1);
    expect(
      (await db.pendingRegistration.findFirstOrThrow()).passwordHash,
    ).toBeNull();
    expect(JSON.stringify(await db.emailOtp.findMany())).not.toContain(
      `"${code}"`,
    );
    await request(app.getHttpServer())
      .post('/auth/otp/verify')
      .set('Cookie', cookie)
      .send({ challengeId: r.body.challengeId, code })
      .expect(400);
  });
  it('does not let a pending public password attach to a concurrently created user', async () => {
    const cookie = await browser(app),
      r = await signup('race@example.test', cookie),
      code = await latestCode(app, mail, str(r.body.challengeId));
    const user = await createUser(app, {
      email: 'race@example.test',
      password: 'Different123',
      verified: true,
    });
    await request(app.getHttpServer())
      .post('/auth/otp/verify')
      .set('Cookie', cookie)
      .send({ challengeId: r.body.challengeId, code })
      .expect(400);
    expect(
      (await db.user.findUniqueOrThrow({ where: { id: user.id } }))
        .passwordHash,
    ).toBe(user.passwordHash);
  });
  it('rejects cross-browser codes without spending the real challenge attempt budget', async () => {
    const cookie = await browser(app),
      other = await browser(app),
      r = await signup('binding@example.test', cookie),
      code = await latestCode(app, mail, str(r.body.challengeId));
    await request(app.getHttpServer())
      .post('/auth/otp/verify')
      .set('Cookie', other)
      .send({ challengeId: r.body.challengeId, code })
      .expect(400);
    expect(
      (
        await db.authChallenge.findUniqueOrThrow({
          where: { publicId: str(r.body.challengeId) },
        })
      ).attempts,
    ).toBe(0);
  });
  it('locks on the fifth wrong code and resends preserve attempts and deadline', async () => {
    const cookie = await browser(app),
      r = await signup('attempts@example.test', cookie),
      originalCode = await latestCode(app, mail, str(r.body.challengeId)),
      wrong = originalCode === '000000' ? '000001' : '000000';
    for (let i = 0; i < 3; i++)
      await request(app.getHttpServer())
        .post('/auth/otp/verify')
        .set('Cookie', cookie)
        .send({ challengeId: r.body.challengeId, code: wrong })
        .expect(400);
    clock.advance(61000);
    await request(app.getHttpServer())
      .post('/auth/otp/resend')
      .set('Cookie', cookie)
      .send({ challengeId: r.body.challengeId })
      .expect(202);
    await app.get(OtpService).drain();
    let c = await db.authChallenge.findUniqueOrThrow({
      where: { publicId: str(r.body.challengeId) },
    });
    expect(c.attempts).toBe(3);
    expect(c.expiresAt.toISOString()).toBe(r.body.expiresAt);
    expect(c.currentGeneration).toBe(2);
    await request(app.getHttpServer())
      .post('/auth/otp/verify')
      .set('Cookie', cookie)
      .send({ challengeId: r.body.challengeId, code: originalCode })
      .expect(400);
    const newCode = await latestCode(app, mail, str(r.body.challengeId));
    await request(app.getHttpServer())
      .post('/auth/otp/verify')
      .set('Cookie', cookie)
      .send({
        challengeId: r.body.challengeId,
        code: newCode === '999999' ? '999998' : '999999',
      })
      .expect(400);
    c = await db.authChallenge.findUniqueOrThrow({
      where: { publicId: str(r.body.challengeId) },
    });
    expect(c.state).toBe('LOCKED');
    await request(app.getHttpServer())
      .post('/auth/otp/verify')
      .set('Cookie', cookie)
      .send({ challengeId: r.body.challengeId, code: newCode })
      .expect(400);
  });
  it('has one winner for concurrent correct verification', async () => {
    const cookie = await browser(app),
      r = await signup('once@example.test', cookie),
      code = await latestCode(app, mail, str(r.body.challengeId));
    const responses = await Promise.all(
      [1, 2].map(() =>
        request(app.getHttpServer())
          .post('/auth/otp/verify')
          .set('Cookie', cookie)
          .send({ challengeId: r.body.challengeId, code }),
      ),
    );
    expect(responses.map((r) => r.status).sort()).toEqual([200, 400]);
    expect(await db.user.count()).toBe(1);
    expect(await db.session.count()).toBe(1);
  });
  it('never confirms ambiguous delivery and requires the original first factor for login', async () => {
    const user = await createUser(app, { email: 'mailfail@example.test' }),
      cookie = await browser(app);
    jest.spyOn(mail, 'send').mockRejectedValue(new MailError('ambiguous'));
    const r = await request(app.getHttpServer())
      .post('/auth/login')
      .set('Cookie', cookie)
      .send({ identifier: user.email, password: PASSWORD })
      .expect(503);
    expect(r.body.code).toBe('OTP_DELIVERY_UNAVAILABLE');
    expect(obj(r.body.challenge).status).toBe('otp-required');
    expect(await db.mailAttempt.count()).toBe(2);
    const c = await db.authChallenge.findUniqueOrThrow({
      where: { publicId: str(obj(r.body.challenge).challengeId) },
    });
    expect(c.state).toBe('FAILED');
    expect(c.firstFactor).toBe('PASSWORD');
    expect(await db.session.count()).toBe(0);
    await request(app.getHttpServer())
      .post('/auth/otp/verify')
      .set('Cookie', cookie)
      .send({ challengeId: c.publicId, code: '000000' })
      .expect(400);
  });
  it('returns uniform public registration and recovery envelopes without dispatching decoys', async () => {
    await createUser(app, { email: 'existing@example.test', verified: true });
    const cookie = await browser(app);
    const a = await signup('existing@example.test', cookie),
      b = await signup('absent@example.test', cookie);
    expect(Object.keys(a.body).sort()).toEqual(Object.keys(b.body).sort());
    expect(a.body.expiresAt).toBe(b.body.expiresAt);
    await app.get(OtpService).drain();
    expect(
      mail.messages.filter((m) => m.category === 'OTP').map((m) => m.recipient),
    ).toEqual(['absent@example.test']);
    const g = await createUser(app, {
      email: 'googleonly@example.test',
      password: null,
      verified: true,
    });
    const reset = await request(app.getHttpServer())
      .post('/auth/password-reset/request')
      .set('Cookie', cookie)
      .send({ identifier: g.email })
      .expect(202);
    await app.get(OtpService).drain();
    expect(
      (
        await db.authChallenge.findUniqueOrThrow({
          where: { publicId: str(reset.body.challengeId) },
        })
      ).principalKind,
    ).toBe('DECOY');
  });
  it('expires exactly at the original server deadline', async () => {
    const cookie = await browser(app),
      r = await signup('expiry@example.test', cookie),
      code = await latestCode(app, mail, str(r.body.challengeId));
    clock.advance(600000);
    await request(app.getHttpServer())
      .post('/auth/otp/verify')
      .set('Cookie', cookie)
      .send({ challengeId: r.body.challengeId, code })
      .expect(400);
    expect(
      (
        await db.authChallenge.findUniqueOrThrow({
          where: { publicId: str(r.body.challengeId) },
        })
      ).state,
    ).toBe('EXPIRED');
  });
  it('enforces origin, custom header, JSON limits, legacy endpoint removal and access-type allowlist', async () => {
    await supertest(app.getHttpServer())
      .post('/auth/context')
      .send({})
      .expect(403);
    await request(app.getHttpServer())
      .post('/auth/context')
      .set('Origin', 'http://localhost:5173.evil.test')
      .expect(403);
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ identifier: 'x'.repeat(20000), password: PASSWORD })
      .expect(400);
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'legacy@example.test', password: PASSWORD })
      .expect(401);
    await request(app.getHttpServer())
      .post('/auth/forgot-password')
      .expect(404);
    await request(app.getHttpServer()).post('/auth/reset-password').expect(404);
    await request(app.getHttpServer())
      .get('/member-invitations/by-token/legacy')
      .expect(404);
    const token = app
      .get(JwtService)
      .sign(
        { sub: 'x', type: 'workspace-selection' },
        { secret: process.env.JWT_ACCESS_SECRET, algorithm: 'HS256' },
      );
    await request(app.getHttpServer())
      .get('/auth/profile')
      .auth(token, { type: 'bearer' })
      .expect(401);
  });
});
describe('Live sessions, rotation, device trust and credential revocation', () => {
  it('rotates refresh, tolerates a bounded race, then commits replay revocation', async () => {
    const user = await createUser(app, { email: 'refresh@example.test' }),
      session = await login(user.email);
    const old = session.cookie;
    const refreshed = await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', old)
      .expect(200);
    const race = await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', old)
      .expect(409);
    expect(race.body.code).toBe('REFRESH_RACE');
    expect(race.headers['set-cookie']).toBeUndefined();
    expect(race.headers['retry-after']).toBe('1');
    const oldClaims = obj<{ sessionId: string; refreshGeneration: number }>(
        app.get(JwtService).decode(str(session.body.accessToken)),
      ),
      newClaims = obj<{ sessionId: string; refreshGeneration: number }>(
        app.get(JwtService).decode(str(refreshed.body.accessToken)),
      );
    expect(newClaims.sessionId).toBe(oldClaims.sessionId);
    expect(newClaims.refreshGeneration).toBe(oldClaims.refreshGeneration + 1);
    clock.advance(10000);
    await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', old)
      .expect(401);
    expect(
      (
        await db.session.findUniqueOrThrow({
          where: { id: oldClaims.sessionId },
        })
      ).revokedAt,
    ).not.toBeNull();
    await request(app.getHttpServer())
      .get('/auth/profile')
      .auth(str(refreshed.body.accessToken), { type: 'bearer' })
      .expect(401);
  });
  it('keeps history of older consumed generations and cannot use refresh JWT as access', async () => {
    const user = await createUser(app, { email: 'history@example.test' }),
      session = await login(user.email);
    const r1 = await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', session.cookie)
      .expect(200);
    await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', cookieHeader(r1))
      .expect(200);
    expect(await db.refreshTokenUse.count()).toBe(3);
    clock.advance(10001);
    await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', session.cookie)
      .expect(401);
    const refreshRaw = session.cookie
      .split('; ')
      .find((s) => s.startsWith('refresh_token='))!
      .split('=')[1];
    await request(app.getHttpServer())
      .get('/auth/profile')
      .auth(refreshRaw, { type: 'bearer' })
      .expect(401);
  });
  it('requires OTP on new devices, grants opted-in trust and revokes it on logout-all', async () => {
    const user = await createUser(app, {
        email: 'trust@example.test',
        verified: true,
      }),
      s = await login(user.email, undefined, true);
    expect(await db.trustedDevice.count()).toBe(1);
    const trust = s.cookie
        .split('; ')
        .find((c) => c.startsWith('device_token='))!,
      ctx = await browser(app);
    const next = await request(app.getHttpServer())
      .post('/auth/login')
      .set('Cookie', `${ctx}; ${trust}`)
      .send({ identifier: user.email, password: PASSWORD })
      .expect(200);
    expect(next.body.status).toBe('no-workspace');
    await request(app.getHttpServer())
      .post('/auth/logout-all')
      .set('Cookie', cookieHeader(next))
      .auth(str(next.body.accessToken), { type: 'bearer' })
      .expect(200);
    expect(await db.trustedDevice.count({ where: { revokedAt: null } })).toBe(
      0,
    );
    expect(await db.session.count({ where: { revokedAt: null } })).toBe(0);
  });
  it('superadmins never mint trust and always require login OTP', async () => {
    const u = await createUser(app, {
      email: 'root@example.test',
      superadmin: true,
      verified: true,
    });
    const s = await login(u.email, undefined, true);
    expect(s.body.status).toBe('superadmin');
    expect(await db.trustedDevice.count()).toBe(0);
    clock.advance(61000);
    const r = await request(app.getHttpServer())
      .post('/auth/login')
      .set('Cookie', s.cookie)
      .send({ identifier: u.email, password: PASSWORD })
      .expect(200);
    expect(r.body.status).toBe('otp-required');
  });
  it('rejects sensitive generic profile fields and resets without auto-login', async () => {
    const u = await createUser(app, { email: 'reset@example.test' }),
      s = await login(u.email);
    await request(app.getHttpServer())
      .patch('/auth/profile')
      .auth(str(s.body.accessToken), { type: 'bearer' })
      .send({ email: 'changed@example.test' })
      .expect(400);
    clock.advance(61000);
    const ctx = await browser(app),
      reset = await request(app.getHttpServer())
        .post('/auth/password-reset/request')
        .set('Cookie', ctx)
        .send({ identifier: u.email })
        .expect(202),
      code = await latestCode(app, mail, str(reset.body.challengeId));
    await request(app.getHttpServer())
      .post('/auth/otp/verify')
      .set('Cookie', ctx)
      .send({ challengeId: reset.body.challengeId, code })
      .expect(400);
    const grant = await request(app.getHttpServer())
      .post('/auth/password-reset/verify')
      .set('Cookie', ctx)
      .send({ challengeId: reset.body.challengeId, code })
      .expect(200);
    const complete = await request(app.getHttpServer())
      .post('/auth/password-reset/complete')
      .set('Cookie', ctx)
      .send({
        grantToken: grant.body.grantToken,
        newPassword: 'NewPassword456',
      })
      .expect(200);
    expect(complete.body).toEqual({ status: 'ok' });
    await request(app.getHttpServer())
      .get('/auth/profile')
      .auth(str(s.body.accessToken), { type: 'bearer' })
      .expect(401);
    await request(app.getHttpServer())
      .post('/auth/password-reset/complete')
      .set('Cookie', ctx)
      .send({
        grantToken: grant.body.grantToken,
        newPassword: 'OtherPassword789',
      })
      .expect(400);
  });
  it('binds STEP_UP to action and rotates a password change on the same exam session ID', async () => {
    const u = await createUser(app, {
        email: 'change@example.test',
        verified: true,
      }),
      s = await login(u.email),
      original = obj<{ sessionId: string; refreshGeneration: number }>(
        app.get(JwtService).decode(str(s.body.accessToken)),
      );
    clock.advance(61000);
    const grant = await stepUp(
      str(s.body.accessToken),
      s.cookie,
      'PASSWORD_CHANGE',
    );
    await request(app.getHttpServer())
      .post('/auth/password/set')
      .set('Cookie', s.cookie)
      .auth(str(s.body.accessToken), { type: 'bearer' })
      .send({ grantToken: grant, newPassword: 'NewPassword456' })
      .expect(409);
    const changed = await request(app.getHttpServer())
      .post('/auth/password/change')
      .set('Cookie', s.cookie)
      .auth(str(s.body.accessToken), { type: 'bearer' })
      .send({
        grantToken: grant,
        currentPassword: PASSWORD,
        newPassword: 'NewPassword456',
      })
      .expect(200);
    expect(
      obj<{ sessionId: string; refreshGeneration: number }>(
        app.get(JwtService).decode(str(changed.body.accessToken)),
      ).sessionId,
    ).toBe(original.sessionId);
    await request(app.getHttpServer())
      .get('/auth/profile')
      .auth(str(s.body.accessToken), { type: 'bearer' })
      .expect(401);
  });
  it('changes email only after candidate OTP and invalidates old grants', async () => {
    const u = await createUser(app, {
        email: 'old@example.test',
        verified: true,
      }),
      s = await login(u.email);
    clock.advance(61000);
    const grant = await stepUp(
      str(s.body.accessToken),
      s.cookie,
      'EMAIL_CHANGE_START',
      { email: 'New+tag@example.test' },
    );
    const c = await request(app.getHttpServer())
      .post('/auth/email-change/request')
      .set('Cookie', s.cookie)
      .auth(str(s.body.accessToken), { type: 'bearer' })
      .send({
        email: 'New+tag@example.test',
        currentPassword: PASSWORD,
        grantToken: grant,
      })
      .expect(200);
    expect(
      (await db.user.findUniqueOrThrow({ where: { id: u.id } }))
        .emailNormalized,
    ).toBe('old@example.test');
    const code = await latestCode(app, mail, str(c.body.challengeId));
    await request(app.getHttpServer())
      .post('/auth/email-change/verify')
      .set('Cookie', s.cookie)
      .auth(str(s.body.accessToken), { type: 'bearer' })
      .send({ challengeId: c.body.challengeId, code })
      .expect(200);
    expect(
      (await db.user.findUniqueOrThrow({ where: { id: u.id } }))
        .emailNormalized,
    ).toBe('new@example.test');
  });
  it('revokes a membership session immediately on role change and protects foreign workspaces', async () => {
    const admin = await createUser(app, {
        email: 'tenantadmin@example.test',
        tenant: true,
        verified: true,
      }),
      member = await db.membership.findFirstOrThrow({
        where: { userId: admin.id },
      });
    const student = await createUser(app, {
      email: 'student@example.test',
      verified: true,
    });
    const m = await db.membership.create({
      data: { userId: student.id, tenantId: member.tenantId, role: 'STUDENT' },
    });
    const a = await login(admin.email),
      s = await login(student.email),
      other = await createUser(app, {
        email: 'otheradmin@example.test',
        tenant: true,
        verified: true,
      }),
      foreign = await db.membership.findFirstOrThrow({
        where: { userId: other.id },
      });
    await request(app.getHttpServer())
      .get(`/memberships/${foreign.id}`)
      .auth(str(a.body.accessToken), { type: 'bearer' })
      .expect(404);
    await request(app.getHttpServer())
      .patch(`/memberships/${m.id}`)
      .auth(str(a.body.accessToken), { type: 'bearer' })
      .send({ role: 'ADMIN' })
      .expect(200);
    await request(app.getHttpServer())
      .get('/auth/profile')
      .auth(str(s.body.accessToken), { type: 'bearer' })
      .expect(401);
  });
  it('uses single-use opaque pickers and rejects old workspace context tokens', async () => {
    const u = await createUser(app, {
        email: 'multi@example.test',
        tenant: true,
        verified: true,
      }),
      t = await db.tenant.create({
        data: { name: 'Second', slug: randomUUID() },
      }),
      m = await db.membership.create({
        data: { userId: u.id, tenantId: t.id, role: 'STUDENT' },
      });
    const s = await login(u.email);
    expect(s.body.status).toBe('choose-workspace');
    expect(s.body.selectionToken).toHaveLength(43);
    const selected = await request(app.getHttpServer())
      .post('/auth/select-workspace')
      .set('Cookie', s.cookie)
      .send({ selectionToken: s.body.selectionToken, membershipId: m.id })
      .expect(200);
    await request(app.getHttpServer())
      .post('/auth/select-workspace')
      .set('Cookie', s.cookie)
      .send({ selectionToken: s.body.selectionToken, membershipId: m.id })
      .expect(400);
    const other = await db.membership.findFirstOrThrow({
      where: { userId: u.id, id: { not: m.id } },
    });
    const switched = await request(app.getHttpServer())
      .post('/auth/switch-workspace')
      .set('Cookie', cookieHeader(selected))
      .auth(str(selected.body.accessToken), { type: 'bearer' })
      .send({ membershipId: other.id })
      .expect(200);
    expect(
      obj<{ sessionId: string; refreshGeneration: number }>(
        app.get(JwtService).decode(str(switched.body.accessToken)),
      ).sessionId,
    ).toBe(
      obj<{ sessionId: string; refreshGeneration: number }>(
        app.get(JwtService).decode(str(selected.body.accessToken)),
      ).sessionId,
    );
    await request(app.getHttpServer())
      .get('/auth/profile')
      .auth(str(selected.body.accessToken), { type: 'bearer' })
      .expect(401);
  });
});
describe('Google, delivery and operational controls', () => {
  it('binds verified Google facts to one nonce and requires signup OTP', async () => {
    const cookie = await browser(app),
      config = app.get(ConfigService);
    config.set('AUTH_GOOGLE_ENABLED', 'true');
    try {
      const nonce = await request(app.getHttpServer())
        .post('/auth/google/nonce')
        .set('Cookie', cookie)
        .send({ intent: 'login' })
        .expect(200);
      jest.spyOn(app.get(GoogleService), 'verify').mockResolvedValue({
        sub: 'google-sub-1',
        email: 'google@gmail.com',
        canonical: 'google@gmail.com',
        name: 'Google User',
        authoritative: true,
        nonce: str(nonce.body.nonce),
      });
      const r = await request(app.getHttpServer())
        .post('/auth/google')
        .set('Cookie', cookie)
        .send({ credential: 'verified-by-test-adapter' })
        .expect(200);
      expect(r.body.status).toBe('otp-required');
      expect(await db.user.count()).toBe(0);
      await request(app.getHttpServer())
        .post('/auth/google')
        .set('Cookie', cookie)
        .send({ credential: 'verified-by-test-adapter' })
        .expect(401);
      const code = await latestCode(app, mail, str(r.body.challengeId));
      await request(app.getHttpServer())
        .post('/auth/otp/verify')
        .set('Cookie', cookie)
        .send({ challengeId: r.body.challengeId, code })
        .expect(200);
      expect((await db.user.findFirstOrThrow()).passwordHash).toBeNull();
      expect((await db.authIdentity.findFirstOrThrow()).providerUserId).toBe(
        'google-sub-1',
      );
    } finally {
      config.set('AUTH_GOOGLE_ENABLED', 'false');
    }
  });
  it('enforces exact provider budgets under concurrent reservation', async () => {
    const mailer = app.get(MailerService),
      now = clock.now(),
      day = new Date(now.toISOString().slice(0, 10) + 'T00:00:00Z');
    await db.mailSendBudget.create({
      data: { day, totalAttempts: 199, otpAttempts: 150, nonOtpAttempts: 49 },
    });
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        serial(db, (tx) =>
          mailer.reserve(
            tx,
            {
              dispatchId: randomUUID(),
              category: 'OTP',
              recipient: 'budget@example.test',
            },
            1,
          ),
        ).catch(() => false),
      ),
    );
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(
      (await db.mailSendBudget.findUniqueOrThrow({ where: { day } }))
        .totalAttempts,
    ).toBe(200);
  });
  it('authenticates/deduplicates callbacks and suppresses only a mapped exact recipient', async () => {
    const id = 'test-message',
      dispatchId = randomUUID();
    await db.mailDelivery.create({
      data: {
        provider: 'BREVO',
        dispatchId,
        messageId: id,
        recipient: 'old@example.test',
        category: 'OTP',
        submissionState: 'CONFIRMED',
      },
    });
    const event = {
      'message-id': `<${id}>`,
      email: 'old@example.test',
      event: 'hard_bounce',
      ts_event: Math.floor(clock.now().getTime() / 1000),
    };
    await supertest(app.getHttpServer())
      .post('/webhooks/brevo')
      .send(event)
      .expect(401);
    for (let i = 0; i < 2; i++)
      await supertest(app.getHttpServer())
        .post('/webhooks/brevo')
        .set('Authorization', `Bearer ${process.env.BREVO_WEBHOOK_SECRET}`)
        .send(event)
        .expect(204);
    expect(await db.mailDeliveryEvent.count()).toBe(1);
    expect(
      (
        await db.mailRecipient.findUniqueOrThrow({
          where: { emailCanonical: 'old@example.test' },
        })
      ).state,
    ).toBe('SUPPRESSED');
    await supertest(app.getHttpServer())
      .post('/webhooks/brevo')
      .set('Authorization', `Bearer ${process.env.BREVO_WEBHOOK_SECRET}`)
      .send({ ...event, email: 'unknown@example.test' })
      .expect(204);
    expect(
      await db.mailRecipient.findUnique({
        where: { emailCanonical: 'unknown@example.test' },
      }),
    ).toBeNull();
  });
  it('maintenance refuses issuance while completed sessions can refresh', async () => {
    const user = await createUser(app, { email: 'maintenance@example.test' }),
      s = await login(user.email),
      config = app.get(ConfigService);
    config.set('AUTH_OTP_MODE', 'off');
    try {
      await request(app.getHttpServer())
        .post('/auth/login')
        .set('Cookie', s.cookie)
        .send({ identifier: user.email, password: PASSWORD })
        .expect(503);
      await request(app.getHttpServer())
        .post('/auth/refresh')
        .set('Cookie', s.cookie)
        .expect(200);
    } finally {
      config.set('AUTH_OTP_MODE', 'all');
    }
  });
});
