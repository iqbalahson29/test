import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { fillRemainingPracticeModules, submitAllPracticeModules } from './module-test-helpers';

async function login(app: INestApplication<App>, email: string) {
  const res = await request(app.getHttpServer())
    .post('/auth/login')
    .send({ email, password: 'password123' })
    .expect(200);
  return res.body as { accessToken?: string };
}

async function createAssignedPracticeQuiz(
  app: INestApplication<App>,
  teacherToken: string,
  studentMembershipId: string,
  title: string,
  extra: Record<string, unknown> = {},
) {
  const createRes = await request(app.getHttpServer())
    .post('/practice-quizzes')
    .set('Authorization', `Bearer ${teacherToken}`)
    .send({ title, ...extra })
    .expect(201);
  const quizId = createRes.body.id as string;

  const mcq = await request(app.getHttpServer())
    .post(`/practice-quizzes/${quizId}/questions`)
    .set('Authorization', `Bearer ${teacherToken}`)
    .send({
      type: 'MCQ_SINGLE',
      module: 'RW_MODULE_1',
      prompt: 'Capital of France?',
      points: 2,
      config: {},
      options: [
        { text: 'Paris', isCorrect: true },
        { text: 'Berlin', isCorrect: false },
      ],
    })
    .expect(201);

  await request(app.getHttpServer())
    .post(`/practice-quizzes/${quizId}/questions`)
    .set('Authorization', `Bearer ${teacherToken}`)
    .send({
      type: 'MATCHING',
      module: 'RW_MODULE_1',
      prompt: 'Match capitals',
      points: 4,
      config: {
        pairs: [
          { left: 'France', right: 'Paris' },
          { left: 'Japan', right: 'Tokyo' },
        ],
      },
    })
    .expect(201);

  await fillRemainingPracticeModules(app, teacherToken, quizId, ['RW_MODULE_1']);

  await request(app.getHttpServer())
    .patch(`/practice-quizzes/${quizId}/status`)
    .set('Authorization', `Bearer ${teacherToken}`)
    .send({ status: 'PUBLISHED' })
    .expect(200);

  await request(app.getHttpServer())
    .post('/practice-assignments')
    .set('Authorization', `Bearer ${teacherToken}`)
    .send({ quizId, studentMembershipId })
    .expect(201);

  return { quizId, mcqQuestionId: mcq.body.id as string };
}

describe('Practice attempts (e2e)', () => {
  let app: INestApplication<App>;
  let acmeAdminToken: string;
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

  it('rejects starting an attempt for a practice quiz not assigned to the student', async () => {
    const createRes = await request(app.getHttpServer())
      .post('/practice-quizzes')
      .set('Authorization', `Bearer ${acmeAdminToken}`)
      .send({ title: 'Unassigned Practice Quiz' })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/practice-quizzes/${createRes.body.id}/questions`)
      .set('Authorization', `Bearer ${acmeAdminToken}`)
      .send({ type: 'ESSAY', module: 'RW_MODULE_1', prompt: 'x', points: 1, config: {} })
      .expect(201);
    await fillRemainingPracticeModules(app, acmeAdminToken, createRes.body.id, ['RW_MODULE_1']);
    await request(app.getHttpServer())
      .patch(`/practice-quizzes/${createRes.body.id}/status`)
      .set('Authorization', `Bearer ${acmeAdminToken}`)
      .send({ status: 'PUBLISHED' })
      .expect(200);

    await request(app.getHttpServer())
      .post('/practice-attempts')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ quizId: createRes.body.id })
      .expect(403);
  });

  it('never leaks the answer key: options, matching pairs, accepted answers all stripped', async () => {
    const { quizId, mcqQuestionId } = await createAssignedPracticeQuiz(
      app,
      acmeAdminToken,
      studentMembershipId,
      'Sanitizer Test Practice Quiz',
    );

    const startRes = await request(app.getHttpServer())
      .post('/practice-attempts')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ quizId })
      .expect(201);

    const body = JSON.stringify(startRes.body);
    expect(body).not.toContain('isCorrect');

    const mcq = startRes.body.questions.find(
      (q: { id: string }) => q.id === mcqQuestionId,
    );
    expect(mcq.options.every((o: object) => !('isCorrect' in o))).toBe(true);

    const matching = startRes.body.questions.find(
      (q: { type: string }) => q.type === 'MATCHING',
    );
    expect(matching.config.pairs).toBeUndefined();
    expect(matching.config.leftItems).toEqual(['France', 'Japan']);
    expect(new Set(matching.config.rightItems)).toEqual(new Set(['Paris', 'Tokyo']));
  });

  it('autosaves, resumes an in-progress attempt, then submits and locks further edits', async () => {
    const { quizId, mcqQuestionId } = await createAssignedPracticeQuiz(
      app,
      acmeAdminToken,
      studentMembershipId,
      'Attempt Flow Practice Quiz',
    );

    const start = await request(app.getHttpServer())
      .post('/practice-attempts')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ quizId })
      .expect(201);
    const attemptId = start.body.id as string;

    await request(app.getHttpServer())
      .patch(`/practice-attempts/${attemptId}/responses/${mcqQuestionId}`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ answer: { optionId: 'whatever' } })
      .expect(200);

    // Resuming returns the same attempt with the saved answer intact.
    const resumed = await request(app.getHttpServer())
      .post('/practice-attempts')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ quizId })
      .expect(201);
    expect(resumed.body.id).toBe(attemptId);
    const savedAnswer = resumed.body.questions.find(
      (q: { id: string }) => q.id === mcqQuestionId,
    ).answer;
    expect(savedAnswer).toEqual({ optionId: 'whatever' });

    const final = await submitAllPracticeModules(app, studentToken, attemptId);
    expect(['SUBMITTED', 'GRADED']).toContain(final.status);

    await request(app.getHttpServer())
      .patch(`/practice-attempts/${attemptId}/responses/${mcqQuestionId}`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ answer: { optionId: 'too-late' } })
      .expect(400);

    await request(app.getHttpServer())
      .post(`/practice-attempts/${attemptId}/modules/complete`)
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(400);
  });

  it('blocks a new attempt once maxAttempts is exhausted', async () => {
    const { quizId } = await createAssignedPracticeQuiz(
      app,
      acmeAdminToken,
      studentMembershipId,
      'Max Attempts Practice Quiz',
      { maxAttempts: 1 },
    );

    const first = await request(app.getHttpServer())
      .post('/practice-attempts')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ quizId })
      .expect(201);

    await submitAllPracticeModules(app, studentToken, first.body.id);

    await request(app.getHttpServer())
      .post('/practice-attempts')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ quizId })
      .expect(400);
  });
});
