import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { fillRemainingModules } from './module-test-helpers';

async function login(app: INestApplication<App>, email: string, password = 'password123') {
  const res = await request(app.getHttpServer())
    .post('/auth/login')
    .send({ email, password })
    .expect(200);
  return res.body as { accessToken?: string };
}

// Requests + approves a brand-new one-tenant workspace via the platform
// super admin, to get an admin token scoped to a *different* tenant than
// acme-school — used to exercise tenant isolation.
async function createTenantAdmin(app: INestApplication<App>, label: string) {
  const superadmin = await login(app, 'superadmin@quiz-platform.test');
  const email = `${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@e2e.test`;
  const password = 'Password123';
  const reqRes = await request(app.getHttpServer())
    .post('/tenant-requests')
    .send({
      workspaceName: `Beta ${label} ${Date.now()}`,
      requesterName: 'Beta Admin',
      requesterEmail: email,
      password,
    })
    .expect(201);
  await request(app.getHttpServer())
    .post(`/tenant-requests/${reqRes.body.id}/approve`)
    .set('Authorization', `Bearer ${superadmin.accessToken}`)
    .expect(201);
  const adminLogin = await login(app, email, password);
  return { token: adminLogin.accessToken as string, email };
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
    .send({ type: 'ESSAY', module: 'RW_MODULE_1', prompt: 'Reflect.', points: 1, config: {} })
    .expect(201);

  await fillRemainingModules(app, token, quizId, ['RW_MODULE_1']);

  await request(app.getHttpServer())
    .patch(`/quizzes/${quizId}/status`)
    .set('Authorization', `Bearer ${token}`)
    .send({ status: 'PUBLISHED' })
    .expect(200);

  return quizId;
}

describe('Assignments (e2e)', () => {
  let app: INestApplication<App>;
  let acmeAdminToken: string;
  let betaAdminToken: string;
  let studentMembershipId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.use(cookieParser());
    await app.init();

    const adminLogin = await login(app, 'admin@acme.test');
    acmeAdminToken = adminLogin.accessToken!;

    betaAdminToken = (await createTenantAdmin(app, 'assignments')).token;

    const members = await request(app.getHttpServer())
      .get('/memberships')
      .set('Authorization', `Bearer ${acmeAdminToken}`)
      .expect(200);
    studentMembershipId = (
      members.body as { id: string; user: { email: string } }[]
    ).find((m) => m.user.email === 'student@acme.test')!.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('assigns a published quiz to a student and rejects a duplicate', async () => {
    const quizId = await createPublishedQuiz(app, acmeAdminToken, 'Assign Test Quiz A');

    await request(app.getHttpServer())
      .post('/assignments')
      .set('Authorization', `Bearer ${acmeAdminToken}`)
      .send({ quizId, studentMembershipId })
      .expect(201);

    await request(app.getHttpServer())
      .post('/assignments')
      .set('Authorization', `Bearer ${acmeAdminToken}`)
      .send({ quizId, studentMembershipId })
      .expect(409);
  });

  it('rejects assigning a quiz that is still DRAFT', async () => {
    const createRes = await request(app.getHttpServer())
      .post('/quizzes')
      .set('Authorization', `Bearer ${acmeAdminToken}`)
      .send({ title: 'Draft Assign Test' })
      .expect(201);

    await request(app.getHttpServer())
      .post('/assignments')
      .set('Authorization', `Bearer ${acmeAdminToken}`)
      .send({ quizId: createRes.body.id, studentMembershipId })
      .expect(400);
  });

  it('rejects a body with both or neither of studentMembershipId/groupId', async () => {
    const quizId = await createPublishedQuiz(app, acmeAdminToken, 'Assign Test Quiz B');
    await request(app.getHttpServer())
      .post('/assignments')
      .set('Authorization', `Bearer ${acmeAdminToken}`)
      .send({ quizId })
      .expect(400);
  });

  it('enforces tenant isolation: cannot assign across tenants', async () => {
    const quizId = await createPublishedQuiz(app, acmeAdminToken, 'Assign Test Quiz C');

    // Beta admin can't target Acme's quiz.
    await request(app.getHttpServer())
      .post('/assignments')
      .set('Authorization', `Bearer ${betaAdminToken}`)
      .send({ quizId, studentMembershipId })
      .expect(404);

    // Beta admin can't target Acme's student even with a Beta quiz.
    const betaQuizId = await createPublishedQuiz(app, betaAdminToken, 'Beta Quiz');
    await request(app.getHttpServer())
      .post('/assignments')
      .set('Authorization', `Bearer ${betaAdminToken}`)
      .send({ quizId: betaQuizId, studentMembershipId })
      .expect(400);
  });

  it('GET /assignments/mine de-dupes by quiz and reports status', async () => {
    const quizId = await createPublishedQuiz(app, acmeAdminToken, 'Mine Test Quiz');
    await request(app.getHttpServer())
      .post('/assignments')
      .set('Authorization', `Bearer ${acmeAdminToken}`)
      .send({ quizId, studentMembershipId })
      .expect(201);

    const studentLogin = await login(app, 'student@acme.test');
    const mine = await request(app.getHttpServer())
      .get('/assignments/mine')
      .set('Authorization', `Bearer ${studentLogin.accessToken}`)
      .expect(200);

    const entries = (
      mine.body as { quizId: string; status: string }[]
    ).filter((a) => a.quizId === quizId);
    expect(entries).toHaveLength(1);
    expect(entries[0].status).toBe('NOT_STARTED');
  });
});
