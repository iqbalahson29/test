import { INestApplication } from '@nestjs/common';
import {
  request,
  makeApp,
  fixtureLogin,
  fixtureTenantAdmin,
  registerVerified,
  browser,
  cookieHeader,
  str,
  list,
  obj,
} from './auth-test-helpers';
import { App } from 'supertest/types';
import { fillRemainingModules } from './module-test-helpers';

async function login(
  app: INestApplication<App>,
  email: string,
  _password = 'Password123',
) {
  return await fixtureLogin(app, email);
}

// Requests + approves a brand-new one-tenant workspace via the platform
// super admin — mirrors the helper in assignments.e2e-spec.ts.
async function createTenantAdmin(app: INestApplication<App>, label: string) {
  return fixtureTenantAdmin(app, label);
}

async function createPublishedQuiz(
  app: INestApplication<App>,
  token: string,
  title: string,
) {
  const createRes = await request(app.getHttpServer())
    .post('/quizzes')
    .set('Authorization', `Bearer ${token}`)
    .send({ title })
    .expect(201);
  const quizId = createRes.body.id as string;

  await request(app.getHttpServer())
    .post(`/quizzes/${quizId}/questions`)
    .set('Authorization', `Bearer ${token}`)
    .send({
      type: 'ESSAY',
      module: 'RW_MODULE_1',
      prompt: 'Reflect.',
      points: 1,
      config: {},
    })
    .expect(201);

  await fillRemainingModules(app, token, quizId, ['RW_MODULE_1']);

  await request(app.getHttpServer())
    .patch(`/quizzes/${quizId}/status`)
    .set('Authorization', `Bearer ${token}`)
    .send({ status: 'PUBLISHED' })
    .expect(200);

  return quizId;
}

describe('Auth: self-registration, assign-by-email, multi-tenant (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    ({ app } = await makeApp(true));
  });

  afterAll(async () => {
    await app.close();
  });

  it('verifies a memberless student and upgrades their account after assignment', async () => {
    const email = `newstudent-${Date.now()}@e2e.test`;
    const password = 'Password123';

    await registerVerified(app, email, password);

    // Duplicate public registration gets the same accepted envelope.
    await request(app.getHttpServer())
      .post('/auth/register')
      .set('Cookie', await browser(app))
      .send({ email, name: 'New Student', password })
      .expect(202);

    // Zero memberships -> login succeeds with a no-workspace session
    // (see workspace-join-requests.e2e-spec.ts for the full flow this
    // status enables), not a 403.
    const loginRes = await login(app, email, password);
    expect(loginRes.status).toBe(200);
    expect(loginRes.body.status).toBe('no-workspace');
    expect(loginRes.body.accessToken).toBeDefined();
    expect(loginRes.body.membership).toBeUndefined();

    const acmeAdmin = await login(app, 'admin@acme.test');
    const quizId = await createPublishedQuiz(
      app,
      acmeAdmin.body.accessToken,
      'Assign-by-email quiz',
    );

    // Assigning by email to a never-registered address fails clearly.
    await request(app.getHttpServer())
      .post('/assignments')
      .set('Authorization', `Bearer ${str(acmeAdmin.body.accessToken)}`)
      .send({ quizId, studentEmail: `nobody-${Date.now()}@e2e.test` })
      .expect(400);

    // Assigning by email to the registered-but-memberless student
    // auto-creates their STUDENT membership in this tenant.
    await request(app.getHttpServer())
      .post('/assignments')
      .set('Authorization', `Bearer ${str(acmeAdmin.body.accessToken)}`)
      .send({ quizId, studentEmail: email })
      .expect(201);

    // Now they have exactly one membership -> normal single-workspace login.
    const secondLogin = await login(app, email, password);
    expect(secondLogin.status).toBe(200);
    expect(secondLogin.body.status).toBe('ok');
    expect(secondLogin.body.membership.role).toBe('STUDENT');

    // And the assignment is visible to them.
    const mine = await request(app.getHttpServer())
      .get('/assignments/mine')
      .set('Authorization', `Bearer ${str(secondLogin.body.accessToken)}`)
      .expect(200);
    expect(
      list<{ quizId: string }>(mine.body).some((a) => a.quizId === quizId),
    ).toBe(true);
  });

  it('supports a student joining a second tenant, with choose-workspace + switch-workspace', async () => {
    const email = `multitenant-${Date.now()}@e2e.test`;
    const password = 'Password123';
    await registerVerified(app, email, password);

    const acmeAdmin = await login(app, 'admin@acme.test');
    const acmeQuiz = await createPublishedQuiz(
      app,
      acmeAdmin.body.accessToken,
      'Tenant A quiz',
    );
    await request(app.getHttpServer())
      .post('/assignments')
      .set('Authorization', `Bearer ${str(acmeAdmin.body.accessToken)}`)
      .send({ quizId: acmeQuiz, studentEmail: email })
      .expect(201);

    const betaAdmin = await createTenantAdmin(app, 'switchtest');
    const betaQuiz = await createPublishedQuiz(
      app,
      betaAdmin.token,
      'Tenant B quiz',
    );
    await request(app.getHttpServer())
      .post('/assignments')
      .set('Authorization', `Bearer ${betaAdmin.token}`)
      .send({ quizId: betaQuiz, studentEmail: email })
      .expect(201);

    // Two memberships now -> login returns choose-workspace, not tokens.
    const loginRes = await login(app, email, password);
    expect(loginRes.status).toBe(200);
    expect(loginRes.body.status).toBe('choose-workspace');
    expect(loginRes.body.accessToken).toBeUndefined();
    const choices = list<{
      membershipId: string;
      tenantName: string;
    }>(loginRes.body.choices);
    expect(choices).toHaveLength(2);

    const selectionToken = loginRes.body.selectionToken;
    const firstChoice = choices[0];

    // Selecting a workspace this user doesn't actually own is rejected...
    // (there's no easy way to get a foreign membershipId here without
    // another registered user; covered structurally by switch-workspace
    // below instead, which is the more realistic attack surface.)

    const selectRes = await request(app.getHttpServer())
      .post('/auth/select-workspace')
      .set('Cookie', cookieHeader(loginRes))
      .send({ selectionToken, membershipId: firstChoice.membershipId })
      .expect(200);
    expect(selectRes.body.status).toBe('ok');
    expect(obj(selectRes.body.membership).membershipId).toBe(
      firstChoice.membershipId,
    );

    const me = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${str(selectRes.body.accessToken)}`)
      .expect(200);
    expect(me.body.membershipId).toBe(firstChoice.membershipId);

    // Switch to the other membership without logging out.
    const otherChoice = choices.find(
      (c) => c.membershipId !== firstChoice.membershipId,
    )!;
    const switchRes = await request(app.getHttpServer())
      .post('/auth/switch-workspace')
      .set('Cookie', cookieHeader(selectRes))
      .set('Authorization', `Bearer ${str(selectRes.body.accessToken)}`)
      .send({ membershipId: otherChoice.membershipId })
      .expect(200);
    expect(obj(switchRes.body.membership).membershipId).toBe(
      otherChoice.membershipId,
    );

    // Switching to a membership that isn't this user's own is forbidden.
    const studentMembers = await request(app.getHttpServer())
      .get('/memberships')
      .set('Authorization', `Bearer ${str(acmeAdmin.body.accessToken)}`)
      .expect(200);
    const foreignMembershipId = list<{ id: string; user: { email: string } }>(
      studentMembers.body,
    ).find((m) => m.user.email === 'student@acme.test')!.id;

    await request(app.getHttpServer())
      .post('/auth/switch-workspace')
      .set('Cookie', cookieHeader(switchRes))
      .set('Authorization', `Bearer ${str(switchRes.body.accessToken)}`)
      .send({ membershipId: foreignMembershipId })
      .expect(403);

    // GET /auth/my-memberships lists both.
    const mine = await request(app.getHttpServer())
      .get('/auth/my-memberships')
      .set('Authorization', `Bearer ${str(switchRes.body.accessToken)}`)
      .expect(200);
    expect(mine.body).toHaveLength(2);
  });

  it('rejects an expired/garbage selection token', async () => {
    await request(app.getHttpServer())
      .post('/auth/select-workspace')
      .send({ selectionToken: 'not-a-real-token', membershipId: 'whatever' })
      .expect(400);
  });
});
