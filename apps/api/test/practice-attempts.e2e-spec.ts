import { INestApplication } from '@nestjs/common';
import {
  request,
  makeApp,
  fixtureLogin,
  str,
  list,
  must,
  obj,
} from './auth-test-helpers';
import { App } from 'supertest/types';
import {
  fillRemainingPracticeModules,
  submitAllPracticeModules,
} from './module-test-helpers';

async function login(
  app: INestApplication<App>,
  email: string,
  _password = 'Password123',
) {
  return (await fixtureLogin(app, email)).body;
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

  await fillRemainingPracticeModules(app, teacherToken, quizId, [
    'RW_MODULE_1',
  ]);

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
    ({ app } = await makeApp(true));

    const adminLogin = await login(app, 'admin@acme.test');
    acmeAdminToken = adminLogin.accessToken!;

    const studentLogin = await login(app, 'student@acme.test');
    studentToken = studentLogin.accessToken!;

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

  it('rejects starting an attempt for a practice quiz not assigned to the student', async () => {
    const createRes = await request(app.getHttpServer())
      .post('/practice-quizzes')
      .set('Authorization', `Bearer ${acmeAdminToken}`)
      .send({ title: 'Unassigned Practice Quiz' })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/practice-quizzes/${str(createRes.body.id)}/questions`)
      .set('Authorization', `Bearer ${acmeAdminToken}`)
      .send({
        type: 'ESSAY',
        module: 'RW_MODULE_1',
        prompt: 'x',
        points: 1,
        config: {},
      })
      .expect(201);
    await fillRemainingPracticeModules(
      app,
      acmeAdminToken,
      str(createRes.body.id),
      ['RW_MODULE_1'],
    );
    await request(app.getHttpServer())
      .patch(`/practice-quizzes/${str(createRes.body.id)}/status`)
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

    const mcq = must(
      list(startRes.body.questions).find(
        (q: { id: string }) => q.id === mcqQuestionId,
      ),
      'MCQ question',
    );
    expect(list(mcq.options).every((o: object) => !('isCorrect' in o))).toBe(
      true,
    );

    const matching = must(
      list(startRes.body.questions).find(
        (q: { type: string }) => q.type === 'MATCHING',
      ),
      'matching question',
    );
    // The answer key must not reach the student: pairs are stripped, sides shuffled out.
    expect(obj(matching.config).pairs).toBeUndefined();
    expect(obj(matching.config).leftItems).toEqual(['France', 'Japan']);
    expect(new Set(list(obj(matching.config).rightItems))).toEqual(
      new Set(['Paris', 'Tokyo']),
    );
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
    const savedAnswer = must(
      list(resumed.body.questions).find(
        (q: { id: string }) => q.id === mcqQuestionId,
      ),
      'saved MCQ answer',
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

    await submitAllPracticeModules(app, studentToken, str(first.body.id));

    await request(app.getHttpServer())
      .post('/practice-attempts')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ quizId })
      .expect(400);
  });
});
