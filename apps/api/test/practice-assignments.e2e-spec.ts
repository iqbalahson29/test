import { INestApplication } from '@nestjs/common';
import {
  request,
  makeApp,
  fixtureLogin,
  fixtureTenantAdmin,
  list,
} from './auth-test-helpers';
import { App } from 'supertest/types';
import { fillRemainingPracticeModules } from './module-test-helpers';

async function login(
  app: INestApplication<App>,
  email: string,
  _password = 'Password123',
) {
  return (await fixtureLogin(app, email)).body;
}

// Requests + approves a brand-new one-tenant workspace via the platform
// super admin, to get an admin token scoped to a *different* tenant than
// acme-school — used to exercise tenant isolation.
async function createTenantAdmin(app: INestApplication<App>, label: string) {
  return fixtureTenantAdmin(app, label);
}

async function createPublishedPracticeQuiz(
  app: INestApplication<App>,
  token: string,
  title: string,
) {
  const createRes = await request(app.getHttpServer())
    .post('/practice-quizzes')
    .set('Authorization', `Bearer ${token}`)
    .send({ title })
    .expect(201);
  const quizId = createRes.body.id as string;

  await request(app.getHttpServer())
    .post(`/practice-quizzes/${quizId}/questions`)
    .set('Authorization', `Bearer ${token}`)
    .send({
      type: 'ESSAY',
      module: 'RW_MODULE_1',
      prompt: 'Reflect.',
      points: 1,
      config: {},
    })
    .expect(201);

  await fillRemainingPracticeModules(app, token, quizId, ['RW_MODULE_1']);

  await request(app.getHttpServer())
    .patch(`/practice-quizzes/${quizId}/status`)
    .set('Authorization', `Bearer ${token}`)
    .send({ status: 'PUBLISHED' })
    .expect(200);

  return quizId;
}

describe('Practice assignments (e2e)', () => {
  let app: INestApplication<App>;
  let acmeAdminToken: string;
  let betaAdminToken: string;
  let studentMembershipId: string;

  beforeAll(async () => {
    ({ app } = await makeApp(true));

    const adminLogin = await login(app, 'admin@acme.test');
    acmeAdminToken = adminLogin.accessToken!;

    betaAdminToken = (await createTenantAdmin(app, 'practiceassignments'))
      .token;

    const members = await request(app.getHttpServer())
      .get('/memberships')
      .set('Authorization', `Bearer ${acmeAdminToken}`)
      .expect(200);
    studentMembershipId = list<{ id: string; user: { email: string } }>(
      members.body,
    ).find((m) => m.user.email === 'student@acme.test')!.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('assigns a published practice quiz to a student and rejects a duplicate', async () => {
    const quizId = await createPublishedPracticeQuiz(
      app,
      acmeAdminToken,
      'Assign Test Practice Quiz A',
    );

    await request(app.getHttpServer())
      .post('/practice-assignments')
      .set('Authorization', `Bearer ${acmeAdminToken}`)
      .send({ quizId, studentMembershipId })
      .expect(201);

    await request(app.getHttpServer())
      .post('/practice-assignments')
      .set('Authorization', `Bearer ${acmeAdminToken}`)
      .send({ quizId, studentMembershipId })
      .expect(409);
  });

  it('rejects assigning a practice quiz that is still DRAFT', async () => {
    const createRes = await request(app.getHttpServer())
      .post('/practice-quizzes')
      .set('Authorization', `Bearer ${acmeAdminToken}`)
      .send({ title: 'Draft Assign Test' })
      .expect(201);

    await request(app.getHttpServer())
      .post('/practice-assignments')
      .set('Authorization', `Bearer ${acmeAdminToken}`)
      .send({ quizId: createRes.body.id, studentMembershipId })
      .expect(400);
  });

  it('rejects a body with both or neither of studentMembershipId/groupId', async () => {
    const quizId = await createPublishedPracticeQuiz(
      app,
      acmeAdminToken,
      'Assign Test Practice Quiz B',
    );
    await request(app.getHttpServer())
      .post('/practice-assignments')
      .set('Authorization', `Bearer ${acmeAdminToken}`)
      .send({ quizId })
      .expect(400);
  });

  it('enforces tenant isolation: cannot assign across tenants', async () => {
    const quizId = await createPublishedPracticeQuiz(
      app,
      acmeAdminToken,
      'Assign Test Practice Quiz C',
    );

    // Beta admin can't target Acme's practice quiz.
    await request(app.getHttpServer())
      .post('/practice-assignments')
      .set('Authorization', `Bearer ${betaAdminToken}`)
      .send({ quizId, studentMembershipId })
      .expect(404);

    // Beta admin can't target Acme's student even with a Beta practice quiz.
    const betaQuizId = await createPublishedPracticeQuiz(
      app,
      betaAdminToken,
      'Beta Practice Quiz',
    );
    await request(app.getHttpServer())
      .post('/practice-assignments')
      .set('Authorization', `Bearer ${betaAdminToken}`)
      .send({ quizId: betaQuizId, studentMembershipId })
      .expect(400);
  });

  it('GET /practice-assignments/mine de-dupes by quiz and reports status', async () => {
    const quizId = await createPublishedPracticeQuiz(
      app,
      acmeAdminToken,
      'Mine Test Practice Quiz',
    );
    await request(app.getHttpServer())
      .post('/practice-assignments')
      .set('Authorization', `Bearer ${acmeAdminToken}`)
      .send({ quizId, studentMembershipId })
      .expect(201);

    const studentLogin = await login(app, 'student@acme.test');
    const mine = await request(app.getHttpServer())
      .get('/practice-assignments/mine')
      .set('Authorization', `Bearer ${studentLogin.accessToken}`)
      .expect(200);

    const entries = list<{ quizId: string; status: string }>(mine.body).filter(
      (a) => a.quizId === quizId,
    );
    expect(entries).toHaveLength(1);
    expect(entries[0].status).toBe('NOT_STARTED');
  });
});
