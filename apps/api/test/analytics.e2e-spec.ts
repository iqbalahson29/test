import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

async function login(app: INestApplication<App>, email: string) {
  const res = await request(app.getHttpServer())
    .post('/auth/login')
    .send({ email, password: 'password123' })
    .expect(200);
  return res.body as { accessToken?: string };
}

// Requests + approves a brand-new one-tenant workspace via the platform
// super admin, to get an admin token scoped to a *different* tenant than
// acme-school — used to exercise tenant isolation.
async function createTenantAdmin(app: INestApplication<App>, label: string) {
  const superadmin = await login(app, 'superadmin@quiz-platform.test');
  const email = `${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@e2e.test`;
  const reqRes = await request(app.getHttpServer())
    .post('/tenant-requests')
    .send({
      workspaceName: `Beta ${label} ${Date.now()}`,
      requesterName: 'Beta Admin',
      requesterEmail: email,
      password: 'password123',
    })
    .expect(201);
  await request(app.getHttpServer())
    .post(`/tenant-requests/${reqRes.body.id}/approve`)
    .set('Authorization', `Bearer ${superadmin.accessToken}`)
    .expect(201);
  const adminLogin = await login(app, email);
  return { token: adminLogin.accessToken as string, email };
}

describe('Analytics (e2e)', () => {
  let app: INestApplication<App>;
  let acmeAdminToken: string;
  let betaAdminToken: string;
  let studentToken: string;
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

    const studentLogin = await login(app, 'student@acme.test');
    studentToken = studentLogin.accessToken!;

    betaAdminToken = (await createTenantAdmin(app, 'analytics')).token;

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

  it('computes average/median/distribution/per-question stats correctly', async () => {
    // 10-point NUMERIC-only quiz, maxAttempts high enough for 2 attempts.
    const createRes = await request(app.getHttpServer())
      .post('/quizzes')
      .set('Authorization', `Bearer ${acmeAdminToken}`)
      .send({ title: 'Analytics Test Quiz', maxAttempts: 5, passMarkPercent: 60 })
      .expect(201);
    const quizId = createRes.body.id as string;

    const numeric = await request(app.getHttpServer())
      .post(`/quizzes/${quizId}/questions`)
      .set('Authorization', `Bearer ${acmeAdminToken}`)
      .send({
        type: 'NUMERIC',
        prompt: 'What is 2+2?',
        points: 10,
        config: { correctAnswer: 4, tolerance: 0 },
      })
      .expect(201);

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
      .patch(`/attempts/${a1.body.id}/responses/${numeric.body.id}`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ answer: { value: 4 } })
      .expect(200);
    await request(app.getHttpServer())
      .post(`/attempts/${a1.body.id}/submit`)
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(201);

    // Attempt 2: wrong -> 0%.
    const a2 = await request(app.getHttpServer())
      .post('/attempts')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ quizId })
      .expect(201);
    await request(app.getHttpServer())
      .patch(`/attempts/${a2.body.id}/responses/${numeric.body.id}`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ answer: { value: 999 } })
      .expect(200);
    await request(app.getHttpServer())
      .post(`/attempts/${a2.body.id}/submit`)
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(201);

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

    const dist = analytics.body.scoreDistribution as { bucket: string; count: number }[];
    expect(dist.find((b) => b.bucket === '0-10%').count).toBe(1);
    expect(dist.find((b) => b.bucket === '90-100%').count).toBe(1);
    expect(dist.reduce((sum, b) => sum + b.count, 0)).toBe(2);

    const q = analytics.body.perQuestion[0];
    expect(q.percentCorrect).toBe(50); // 1 of 2 fully correct
    expect(q.averagePercent).toBe(50); // (100 + 0) / 2
  });

  it("myAnalytics reflects the caller's own attempt history and trend", async () => {
    const mine = await request(app.getHttpServer())
      .get('/students/me/analytics')
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(200);

    expect(mine.body.attempts.length).toBeGreaterThanOrEqual(2);
    const gradedInTrend = mine.body.trend as { percent: number }[];
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
      .get(`/quizzes/${createRes.body.id}/analytics`)
      .set('Authorization', `Bearer ${betaAdminToken}`)
      .expect(404);

    await request(app.getHttpServer())
      .get('/students/me/analytics')
      .set('Authorization', `Bearer ${betaAdminToken}`)
      .expect(403);
  });
});
