import { INestApplication } from '@nestjs/common';
import {
  request,
  makeApp,
  fixtureLogin,
  fixtureTenantAdmin,
  str,
  list,
  must,
} from './auth-test-helpers';
import { App } from 'supertest/types';
import { fillRemainingModules, submitAllModules } from './module-test-helpers';

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

describe('Analytics (e2e)', () => {
  let app: INestApplication<App>;
  let acmeAdminToken: string;
  let betaAdminToken: string;
  let studentToken: string;
  let studentMembershipId: string;

  beforeAll(async () => {
    ({ app } = await makeApp(true));

    const adminLogin = await login(app, 'admin@acme.test');
    acmeAdminToken = adminLogin.accessToken!;

    const studentLogin = await login(app, 'student@acme.test');
    studentToken = studentLogin.accessToken!;

    betaAdminToken = (await createTenantAdmin(app, 'analytics')).token;

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

  it('computes average/median/distribution/per-question stats correctly', async () => {
    // 10-point NUMERIC-only quiz, maxAttempts high enough for 2 attempts.
    const createRes = await request(app.getHttpServer())
      .post('/quizzes')
      .set('Authorization', `Bearer ${acmeAdminToken}`)
      .send({
        title: 'Analytics Test Quiz',
        maxAttempts: 5,
        passMarkPercent: 60,
      })
      .expect(201);
    const quizId = createRes.body.id as string;

    const numeric = await request(app.getHttpServer())
      .post(`/quizzes/${quizId}/questions`)
      .set('Authorization', `Bearer ${acmeAdminToken}`)
      .send({
        type: 'NUMERIC',
        module: 'RW_MODULE_1',
        prompt: 'What is 2+2?',
        points: 10,
        config: { correctAnswer: 4, tolerance: 0 },
      })
      .expect(201);

    await fillRemainingModules(app, acmeAdminToken, quizId, ['RW_MODULE_1']);

    await request(app.getHttpServer())
      .patch(`/quizzes/${quizId}/status`)
      .set('Authorization', `Bearer ${acmeAdminToken}`)
      .send({ status: 'PUBLISHED' })
      .expect(200);

    await request(app.getHttpServer())
      .post('/assignments')
      .set('Authorization', `Bearer ${acmeAdminToken}`)
      .send({ quizId, studentMembershipId })
      .expect(201);

    // Attempt 1: correct -> 100%.
    const a1 = await request(app.getHttpServer())
      .post('/attempts')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ quizId })
      .expect(201);
    await request(app.getHttpServer())
      .patch(`/attempts/${str(a1.body.id)}/responses/${str(numeric.body.id)}`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ answer: { value: 4 } })
      .expect(200);
    await submitAllModules(app, studentToken, str(a1.body.id));

    // Attempt 2: wrong -> 0%.
    const a2 = await request(app.getHttpServer())
      .post('/attempts')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ quizId })
      .expect(201);
    await request(app.getHttpServer())
      .patch(`/attempts/${str(a2.body.id)}/responses/${str(numeric.body.id)}`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ answer: { value: 999 } })
      .expect(200);
    await submitAllModules(app, studentToken, str(a2.body.id));

    const analytics = await request(app.getHttpServer())
      .get(`/quizzes/${quizId}/analytics`)
      .set('Authorization', `Bearer ${acmeAdminToken}`)
      .expect(200);

    expect(analytics.body.totalAttempts).toBe(2);
    expect(analytics.body.gradedAttempts).toBe(2);
    expect(analytics.body.averageScore).toBe(5); // (10 + 0) / 2
    expect(analytics.body.medianScore).toBe(5);
    expect(analytics.body.averagePercent).toBe(50);
    expect(analytics.body.maxScore).toBe(10);
    expect(analytics.body.passRate).toBe(50); // one of two attempts >= 60%

    const dist = list<{
      bucket: string;
      count: number;
    }>(analytics.body.scoreDistribution);
    expect(must(dist.find((b) => b.bucket === '0-10%')).count).toBe(1);
    expect(must(dist.find((b) => b.bucket === '90-100%')).count).toBe(1);
    expect(dist.reduce((sum, b) => sum + b.count, 0)).toBe(2);

    const q = list(analytics.body.perQuestion)[0];
    expect(q.percentCorrect).toBe(50); // 1 of 2 fully correct
    expect(q.averagePercent).toBe(50); // (100 + 0) / 2
  });

  it("myAnalytics reflects the caller's own attempt history and trend", async () => {
    const mine = await request(app.getHttpServer())
      .get('/students/me/analytics')
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(200);

    expect(list(mine.body.attempts).length).toBeGreaterThanOrEqual(2);
    const gradedInTrend = list<{ percent: number }>(mine.body.trend);
    expect(gradedInTrend.some((t) => t.percent === 100)).toBe(true);
    expect(gradedInTrend.some((t) => t.percent === 0)).toBe(true);
  });

  it('enforces tenant isolation on both analytics endpoints', async () => {
    const createRes = await request(app.getHttpServer())
      .post('/quizzes')
      .set('Authorization', `Bearer ${acmeAdminToken}`)
      .send({ title: 'Analytics Isolation Quiz' })
      .expect(201);

    await request(app.getHttpServer())
      .get(`/quizzes/${str(createRes.body.id)}/analytics`)
      .set('Authorization', `Bearer ${betaAdminToken}`)
      .expect(404);

    await request(app.getHttpServer())
      .get('/students/me/analytics')
      .set('Authorization', `Bearer ${betaAdminToken}`)
      .expect(403);
  });
});
