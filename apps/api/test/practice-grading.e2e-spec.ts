import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { fillRemainingPracticeModules, submitAllPracticeModules } from './module-test-helpers';

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

describe('Practice grading (e2e)', () => {
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

    betaAdminToken = (await createTenantAdmin(app, 'practicegrading')).token;

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

  it('auto-grades on submit, queues manual items, and reaches GRADED once all are scored', async () => {
    const createRes = await request(app.getHttpServer())
      .post('/practice-quizzes')
      .set('Authorization', `Bearer ${acmeAdminToken}`)
      .send({ title: 'Grading Flow Practice Quiz' })
      .expect(201);
    const quizId = createRes.body.id as string;

    const mcq = await request(app.getHttpServer())
      .post(`/practice-quizzes/${quizId}/questions`)
      .set('Authorization', `Bearer ${acmeAdminToken}`)
      .send({
        type: 'MCQ_MULTI',
        module: 'RW_MODULE_1',
        prompt: 'Pick primes',
        points: 4,
        config: {},
        options: [
          { text: '2', isCorrect: true },
          { text: '3', isCorrect: true },
          { text: '4', isCorrect: false },
          { text: '5', isCorrect: true },
        ],
      })
      .expect(201);
    const correctIds = mcq.body.options
      .filter((o: { isCorrect: boolean }) => o.isCorrect)
      .map((o: { id: string }) => o.id);
    const wrongId = mcq.body.options.find(
      (o: { isCorrect: boolean }) => !o.isCorrect,
    ).id;

    const numeric = await request(app.getHttpServer())
      .post(`/practice-quizzes/${quizId}/questions`)
      .set('Authorization', `Bearer ${acmeAdminToken}`)
      .send({
        type: 'NUMERIC',
        module: 'RW_MODULE_1',
        prompt: 'Approx value',
        points: 2,
        config: { correctAnswer: 10, tolerance: 1 },
      })
      .expect(201);

    const essay = await request(app.getHttpServer())
      .post(`/practice-quizzes/${quizId}/questions`)
      .set('Authorization', `Bearer ${acmeAdminToken}`)
      .send({ type: 'ESSAY', module: 'RW_MODULE_1', prompt: 'Explain.', points: 5, config: {} })
      .expect(201);

    // A second essay the student will leave unanswered entirely.
    const skippedEssay = await request(app.getHttpServer())
      .post(`/practice-quizzes/${quizId}/questions`)
      .set('Authorization', `Bearer ${acmeAdminToken}`)
      .send({ type: 'ESSAY', module: 'RW_MODULE_1', prompt: 'Skip me.', points: 3, config: {} })
      .expect(201);

    await fillRemainingPracticeModules(app, acmeAdminToken, quizId, ['RW_MODULE_1']);

    await request(app.getHttpServer())
      .patch(`/practice-quizzes/${quizId}/status`)
      .set('Authorization', `Bearer ${acmeAdminToken}`)
      .send({ status: 'PUBLISHED' })
      .expect(200);

    await request(app.getHttpServer())
      .post('/practice-assignments')
      .set('Authorization', `Bearer ${acmeAdminToken}`)
      .send({ quizId, studentMembershipId })
      .expect(201);

    const start = await request(app.getHttpServer())
      .post('/practice-attempts')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ quizId })
      .expect(201);
    const attemptId = start.body.id as string;

    // 2 correct + 1 incorrect selected of 3 total correct options:
    // 4 * max(0, 2-1)/3 = 1.33
    await request(app.getHttpServer())
      .patch(`/practice-attempts/${attemptId}/responses/${mcq.body.id}`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ answer: { optionIds: [correctIds[0], correctIds[1], wrongId] } })
      .expect(200);

    // Within tolerance (10.5 vs correctAnswer 10, tolerance 1) -> full 2 points.
    await request(app.getHttpServer())
      .patch(`/practice-attempts/${attemptId}/responses/${numeric.body.id}`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ answer: { value: 10.5 } })
      .expect(200);

    await request(app.getHttpServer())
      .patch(`/practice-attempts/${attemptId}/responses/${essay.body.id}`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ answer: { text: 'My essay answer.' } })
      .expect(200);

    // skippedEssay intentionally left with no autosaved response.

    const submitRes = await submitAllPracticeModules(app, studentToken, attemptId);

    expect(submitRes.status).toBe('SUBMITTED');
    expect((submitRes as { score: unknown }).score).toBeNull();
    expect(Number((submitRes as { maxScore: unknown }).maxScore)).toBe(14);
    const submittedQuestions = submitRes.questions as {
      id: string;
      awardedPoints: string | null;
    }[];
    const mcqQ = submittedQuestions.find((q) => q.id === mcq.body.id)!;
    expect(Number(mcqQ.awardedPoints)).toBeCloseTo(1.33, 2);
    const numericQ = submittedQuestions.find((q) => q.id === numeric.body.id)!;
    expect(Number(numericQ.awardedPoints)).toBe(2);
    const essayQ = submittedQuestions.find((q) => q.id === essay.body.id)!;
    expect(essayQ.awardedPoints).toBeNull();

    const queue = await request(app.getHttpServer())
      .get(`/practice-quizzes/${quizId}/grading-queue`)
      .set('Authorization', `Bearer ${acmeAdminToken}`)
      .expect(200);
    expect(queue.body).toHaveLength(2);
    const skippedEntry = queue.body.find(
      (r: { questionId: string }) => r.questionId === skippedEssay.body.id,
    );
    expect(skippedEntry.answer).toBeNull();
    const essayEntry = queue.body.find(
      (r: { questionId: string }) => r.questionId === essay.body.id,
    );

    // Rejects a grade above the question's max points.
    await request(app.getHttpServer())
      .post(`/practice-responses/${essayEntry.responseId}/grade`)
      .set('Authorization', `Bearer ${acmeAdminToken}`)
      .send({ awardedPoints: 99 })
      .expect(400);

    await request(app.getHttpServer())
      .post(`/practice-responses/${essayEntry.responseId}/grade`)
      .set('Authorization', `Bearer ${acmeAdminToken}`)
      .send({ awardedPoints: 4, feedback: 'Good but incomplete.' })
      .expect(201);

    // Still SUBMITTED — one manual item left.
    const midway = await request(app.getHttpServer())
      .get(`/practice-attempts/${attemptId}`)
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(200);
    expect(midway.body.status).toBe('SUBMITTED');

    await request(app.getHttpServer())
      .post(`/practice-responses/${skippedEntry.responseId}/grade`)
      .set('Authorization', `Bearer ${acmeAdminToken}`)
      .send({ awardedPoints: 0, feedback: 'No answer submitted.' })
      .expect(201);

    const final = await request(app.getHttpServer())
      .get(`/practice-attempts/${attemptId}`)
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(200);
    expect(final.body.status).toBe('GRADED');
    expect(Number(final.body.score)).toBeCloseTo(1.33 + 2 + 4 + 0, 2);
    expect(Number(final.body.maxScore)).toBe(14);

    const mine = await request(app.getHttpServer())
      .get('/practice-assignments/mine')
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(200);
    const mineEntry = (
      mine.body as { quizId: string; status: string; score: string }[]
    ).find((a) => a.quizId === quizId)!;
    expect(mineEntry.status).toBe('GRADED');
    expect(Number(mineEntry.score)).toBeCloseTo(7.33, 2);
  });

  it('enforces tenant isolation on the grading queue and grade endpoint', async () => {
    const createRes = await request(app.getHttpServer())
      .post('/practice-quizzes')
      .set('Authorization', `Bearer ${acmeAdminToken}`)
      .send({ title: 'Grading Isolation Practice Quiz' })
      .expect(201);
    const quizId = createRes.body.id as string;
    await request(app.getHttpServer())
      .post(`/practice-quizzes/${quizId}/questions`)
      .set('Authorization', `Bearer ${acmeAdminToken}`)
      .send({ type: 'ESSAY', module: 'RW_MODULE_1', prompt: 'x', points: 1, config: {} })
      .expect(201);
    await fillRemainingPracticeModules(app, acmeAdminToken, quizId, ['RW_MODULE_1']);
    await request(app.getHttpServer())
      .patch(`/practice-quizzes/${quizId}/status`)
      .set('Authorization', `Bearer ${acmeAdminToken}`)
      .send({ status: 'PUBLISHED' })
      .expect(200);
    await request(app.getHttpServer())
      .post('/practice-assignments')
      .set('Authorization', `Bearer ${acmeAdminToken}`)
      .send({ quizId, studentMembershipId })
      .expect(201);
    const start = await request(app.getHttpServer())
      .post('/practice-attempts')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ quizId })
      .expect(201);
    await submitAllPracticeModules(app, studentToken, start.body.id);

    await request(app.getHttpServer())
      .get(`/practice-quizzes/${quizId}/grading-queue`)
      .set('Authorization', `Bearer ${betaAdminToken}`)
      .expect(404);

    const queue = await request(app.getHttpServer())
      .get(`/practice-quizzes/${quizId}/grading-queue`)
      .set('Authorization', `Bearer ${acmeAdminToken}`)
      .expect(200);
    const responseId = queue.body[0].responseId as string;

    await request(app.getHttpServer())
      .post(`/practice-responses/${responseId}/grade`)
      .set('Authorization', `Bearer ${betaAdminToken}`)
      .send({ awardedPoints: 1 })
      .expect(404);
  });
});
