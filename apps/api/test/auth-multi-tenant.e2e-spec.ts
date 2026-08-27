import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

async function login(app: INestApplication<App>, email: string, password = 'password123') {
  const res = await request(app.getHttpServer())
    .post('/auth/login')
    .send({ email, password });
  return res;
}

// Requests + approves a brand-new one-tenant workspace via the platform
// super admin — mirrors the helper in assignments.e2e-spec.ts.
async function createTenantAdmin(app: INestApplication<App>, label: string) {
  const superadmin = await login(app, 'superadmin@quiz-platform.test');
  const email = `${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@e2e.test`;
  const reqRes = await request(app.getHttpServer())
    .post('/tenant-requests')
    .send({
      workspaceName: `Multi ${label} ${Date.now()}`,
      requesterName: 'Workspace Admin',
      requesterEmail: email,
      password: 'password123',
    })
    .expect(201);
  await request(app.getHttpServer())
    .post(`/tenant-requests/${reqRes.body.id}/approve`)
    .set('Authorization', `Bearer ${superadmin.body.accessToken}`)
    .expect(201);
  const adminLogin = await login(app, email);
  return { token: adminLogin.body.accessToken as string, email };
}

async function createPublishedQuiz(app: INestApplication<App>, token: string, title: string) {
  const createRes = await request(app.getHttpServer())
    .post('/quizzes')
    .set('Authorization', `Bearer ${token}`)
    .send({ title })
    .expect(201);
  const quizId = createRes.body.id as string;

  await request(app.getHttpServer())
    .post(`/quizzes/${quizId}/questions`)
    .set('Authorization', `Bearer ${token}`)
    .send({ type: 'ESSAY', prompt: 'Reflect.', points: 1, config: {} })
    .expect(201);

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
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.use(cookieParser());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('registers a memberless student, who cannot log in until assigned', async () => {
    const email = `newstudent-${Date.now()}@e2e.test`;

    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, name: 'New Student', password: 'password123' })
      .expect(201);

    // Duplicate registration is rejected.
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, name: 'New Student', password: 'password123' })
      .expect(409);

    // Zero memberships -> login succeeds with a no-workspace session
    // (see workspace-join-requests.e2e-spec.ts for the full flow this
    // status enables), not a 403.
    const loginRes = await login(app, email);
    expect(loginRes.status).toBe(200);
    expect(loginRes.body.status).toBe('no-workspace');
    expect(loginRes.body.accessToken).toBeDefined();
    expect(loginRes.body.membership).toBeUndefined();

    const acmeAdmin = await login(app, 'admin@acme.test');
    const quizId = await createPublishedQuiz(app, acmeAdmin.body.accessToken, 'Assign-by-email quiz');

    // Assigning by email to a never-registered address fails clearly.
    await request(app.getHttpServer())
      .post('/assignments')
      .set('Authorization', `Bearer ${acmeAdmin.body.accessToken}`)
      .send({ quizId, studentEmail: `nobody-${Date.now()}@e2e.test` })
      .expect(400);

    // Assigning by email to the registered-but-memberless student
    // auto-creates their STUDENT membership in this tenant.
    await request(app.getHttpServer())
      .post('/assignments')
      .set('Authorization', `Bearer ${acmeAdmin.body.accessToken}`)
      .send({ quizId, studentEmail: email })
      .expect(201);

    // Now they have exactly one membership -> normal single-workspace login.
    const secondLogin = await login(app, email);
    expect(secondLogin.status).toBe(200);
    expect(secondLogin.body.status).toBe('ok');
    expect(secondLogin.body.membership.role).toBe('STUDENT');

    // And the assignment is visible to them.
    const mine = await request(app.getHttpServer())
      .get('/assignments/mine')
      .set('Authorization', `Bearer ${secondLogin.body.accessToken}`)
      .expect(200);
    expect((mine.body as { quizId: string }[]).some((a) => a.quizId === quizId)).toBe(true);
  });

  it('supports a student joining a second tenant, with choose-workspace + switch-workspace', async () => {
    const email = `multitenant-${Date.now()}@e2e.test`;
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, name: 'Multi Tenant Student', password: 'password123' })
      .expect(201);

    const acmeAdmin = await login(app, 'admin@acme.test');
    const acmeQuiz = await createPublishedQuiz(app, acmeAdmin.body.accessToken, 'Tenant A quiz');
    await request(app.getHttpServer())
      .post('/assignments')
      .set('Authorization', `Bearer ${acmeAdmin.body.accessToken}`)
      .send({ quizId: acmeQuiz, studentEmail: email })
      .expect(201);

    const betaAdmin = await createTenantAdmin(app, 'switchtest');
    const betaQuiz = await createPublishedQuiz(app, betaAdmin.token, 'Tenant B quiz');
    await request(app.getHttpServer())
      .post('/assignments')
      .set('Authorization', `Bearer ${betaAdmin.token}`)
      .send({ quizId: betaQuiz, studentEmail: email })
      .expect(201);

    // Two memberships now -> login returns choose-workspace, not tokens.
    const loginRes = await login(app, email);
    expect(loginRes.status).toBe(200);
    expect(loginRes.body.status).toBe('choose-workspace');
    expect(loginRes.body.accessToken).toBeUndefined();
    const choices = loginRes.body.choices as { membershipId: string; tenantName: string }[];
    expect(choices).toHaveLength(2);

    const selectionToken = loginRes.body.selectionToken as string;
    const firstChoice = choices[0];

    // Selecting a workspace this user doesn't actually own is rejected...
    // (there's no easy way to get a foreign membershipId here without
    // another registered user; covered structurally by switch-workspace
    // below instead, which is the more realistic attack surface.)

    const selectRes = await request(app.getHttpServer())
      .post('/auth/select-workspace')
      .send({ selectionToken, membershipId: firstChoice.membershipId })
      .expect(200);
    expect(selectRes.body.status).toBe('ok');
    expect(selectRes.body.membership.membershipId).toBe(firstChoice.membershipId);

    const me = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${selectRes.body.accessToken}`)
      .expect(200);
    expect(me.body.membershipId).toBe(firstChoice.membershipId);

    // Switch to the other membership without logging out.
    const otherChoice = choices.find((c) => c.membershipId !== firstChoice.membershipId)!;
    const switchRes = await request(app.getHttpServer())
      .post('/auth/switch-workspace')
      .set('Authorization', `Bearer ${selectRes.body.accessToken}`)
      .send({ membershipId: otherChoice.membershipId })
      .expect(200);
    expect(switchRes.body.membership.membershipId).toBe(otherChoice.membershipId);

    // Switching to a membership that isn't this user's own is forbidden.
    const studentMembers = await request(app.getHttpServer())
      .get('/memberships')
      .set('Authorization', `Bearer ${acmeAdmin.body.accessToken}`)
      .expect(200);
    const foreignMembershipId = (
      studentMembers.body as { id: string; user: { email: string } }[]
    ).find((m) => m.user.email === 'student@acme.test')!.id;

    await request(app.getHttpServer())
      .post('/auth/switch-workspace')
      .set('Authorization', `Bearer ${switchRes.body.accessToken}`)
      .send({ membershipId: foreignMembershipId })
      .expect(403);

    // GET /auth/my-memberships lists both.
    const mine = await request(app.getHttpServer())
      .get('/auth/my-memberships')
      .set('Authorization', `Bearer ${switchRes.body.accessToken}`)
      .expect(200);
    expect(mine.body).toHaveLength(2);
  });

  it('rejects an expired/garbage selection token', async () => {
    await request(app.getHttpServer())
      .post('/auth/select-workspace')
      .send({ selectionToken: 'not-a-real-token', membershipId: 'whatever' })
      .expect(401);
  });
});
