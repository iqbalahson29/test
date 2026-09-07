import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { submitAllPracticeModules } from './module-test-helpers';

async function login(app: INestApplication<App>, email: string, password = 'password123') {
  const res = await request(app.getHttpServer())
    .post('/auth/login')
    .send({ email, password })
    .expect(200);
  return res.body as { accessToken?: string };
}

const TARGETS = { RW_MODULE_1: 5, RW_MODULE_2: 5, MATH_MODULE_1: 5, MATH_MODULE_2: 5 };
const RATIO = { EASY: 40, MEDIUM: 40, HARD: 20 };

/** Bulk-imports `perDifficulty` MCQ_SINGLE questions of each difficulty into
 * every module — enough to satisfy TARGETS/RATIO's 2/2/1 quota per module. */
async function seedBank(
  app: INestApplication<App>,
  token: string,
  quizId: string,
  perDifficulty: number,
) {
  const modules = ['RW_MODULE_1', 'RW_MODULE_2', 'MATH_MODULE_1', 'MATH_MODULE_2'];
  const questions = [];
  for (const module of modules) {
    for (const difficulty of ['EASY', 'MEDIUM', 'HARD']) {
      for (let i = 0; i < perDifficulty; i++) {
        questions.push({
          type: 'MCQ_SINGLE',
          module,
          difficulty,
          prompt: `${module} ${difficulty} Q${i}`,
          points: 1,
          config: {},
          options: [
            { text: 'Correct', isCorrect: true },
            { text: 'Wrong', isCorrect: false },
          ],
        });
      }
    }
  }
  const res = await request(app.getHttpServer())
    .post(`/practice-quizzes/${quizId}/questions/import`)
    .set('Authorization', `Bearer ${token}`)
    .send({ questions })
    .expect(201);
  return res.body as { created: unknown[]; errors: unknown[] };
}

describe('Practice quiz — question bank mode (e2e)', () => {
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

  async function createBankQuiz(title: string) {
    const res = await request(app.getHttpServer())
      .post('/practice-quizzes')
      .set('Authorization', `Bearer ${acmeAdminToken}`)
      .send({ title, mode: 'BANK', bankModuleTargets: TARGETS, bankDifficultyRatio: RATIO })
      .expect(201);
    return res.body.id as string;
  }

  it('rejects ESSAY/FILE_UPLOAD questions and questions with no difficulty', async () => {
    const quizId = await createBankQuiz('Bank Validation Quiz');

    await request(app.getHttpServer())
      .post(`/practice-quizzes/${quizId}/questions`)
      .set('Authorization', `Bearer ${acmeAdminToken}`)
      .send({ type: 'ESSAY', module: 'RW_MODULE_1', prompt: 'x', points: 1, config: {}, difficulty: 'EASY' })
      .expect(400);

    await request(app.getHttpServer())
      .post(`/practice-quizzes/${quizId}/questions`)
      .set('Authorization', `Bearer ${acmeAdminToken}`)
      .send({ type: 'FILE_UPLOAD', module: 'RW_MODULE_1', prompt: 'x', points: 1, config: {}, difficulty: 'EASY' })
      .expect(400);

    await request(app.getHttpServer())
      .post(`/practice-quizzes/${quizId}/questions`)
      .set('Authorization', `Bearer ${acmeAdminToken}`)
      .send({
        type: 'MCQ_SINGLE',
        module: 'RW_MODULE_1',
        prompt: 'no difficulty',
        points: 1,
        config: {},
        options: [{ text: 'A', isCorrect: true }, { text: 'B', isCorrect: false }],
      })
      .expect(400);
  });

  it('blocks publishing until the bank has enough questions of each difficulty per module', async () => {
    const quizId = await createBankQuiz('Bank Coverage Quiz');

    const short = await request(app.getHttpServer())
      .patch(`/practice-quizzes/${quizId}/status`)
      .set('Authorization', `Bearer ${acmeAdminToken}`)
      .send({ status: 'PUBLISHED' })
      .expect(400);
    expect(short.body.message).toContain('RW_MODULE_1 needs 2 EASY');

    await seedBank(app, acmeAdminToken, quizId, 4);

    await request(app.getHttpServer())
      .patch(`/practice-quizzes/${quizId}/status`)
      .set('Authorization', `Bearer ${acmeAdminToken}`)
      .send({ status: 'PUBLISHED' })
      .expect(200);
  });

  it('draws the configured count/difficulty-split per module, auto-grades to GRADED with no manual queue, and freezes the snapshot even after the bank is edited', async () => {
    const quizId = await createBankQuiz('Bank Attempt Quiz');
    await seedBank(app, acmeAdminToken, quizId, 4);
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

    expect(start.body.questions).toHaveLength(5);
    expect(JSON.stringify(start.body)).not.toContain('isCorrect');

    const final = await submitAllPracticeModules(app, studentToken, attemptId);
    expect(final.status).toBe('GRADED');

    const detail = await request(app.getHttpServer())
      .get(`/practice-quizzes/${quizId}/results/${attemptId}`)
      .set('Authorization', `Bearer ${acmeAdminToken}`)
      .expect(200);
    expect(detail.body.questions).toHaveLength(20);
    const byModuleDifficulty = new Map<string, number>();
    for (const q of detail.body.questions as { module: string; difficulty: string }[]) {
      const key = `${q.module}/${q.difficulty}`;
      byModuleDifficulty.set(key, (byModuleDifficulty.get(key) ?? 0) + 1);
    }
    for (const module of ['RW_MODULE_1', 'RW_MODULE_2', 'MATH_MODULE_1', 'MATH_MODULE_2']) {
      expect(byModuleDifficulty.get(`${module}/EASY`)).toBe(2);
      expect(byModuleDifficulty.get(`${module}/MEDIUM`)).toBe(2);
      expect(byModuleDifficulty.get(`${module}/HARD`)).toBe(1);
    }

    const queue = await request(app.getHttpServer())
      .get(`/practice-quizzes/${quizId}/grading-queue`)
      .set('Authorization', `Bearer ${acmeAdminToken}`)
      .expect(200);
    expect(queue.body).toEqual([]);

    await request(app.getHttpServer())
      .post(`/practice-quizzes/${quizId}/regrade`)
      .set('Authorization', `Bearer ${acmeAdminToken}`)
      .send()
      .expect(400);

    // Wipe the entire live bank — the already-taken attempt's snapshot must survive untouched.
    const bank = await request(app.getHttpServer())
      .get(`/practice-quizzes/${quizId}`)
      .set('Authorization', `Bearer ${acmeAdminToken}`)
      .expect(200);
    for (const q of bank.body.questions as { id: string }[]) {
      await request(app.getHttpServer())
        .delete(`/practice-quizzes/${quizId}/questions/${q.id}`)
        .set('Authorization', `Bearer ${acmeAdminToken}`)
        .expect(200);
    }

    const afterWipe = await request(app.getHttpServer())
      .get(`/practice-quizzes/${quizId}/results/${attemptId}`)
      .set('Authorization', `Bearer ${acmeAdminToken}`)
      .expect(200);
    expect(afterWipe.body.questions).toHaveLength(20);
    expect(afterWipe.body.score).toBe(detail.body.score);
    expect(afterWipe.body.maxScore).toBe(detail.body.maxScore);
  });

  it('aggregate analytics omit per-question/module/difficulty breakdowns for a bank-mode quiz', async () => {
    const quizId = await createBankQuiz('Bank Analytics Quiz');
    await seedBank(app, acmeAdminToken, quizId, 4);
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

    const analytics = await request(app.getHttpServer())
      .get(`/practice-quizzes/${quizId}/analytics`)
      .set('Authorization', `Bearer ${acmeAdminToken}`)
      .expect(200);
    expect(analytics.body.totalAttempts).toBe(1);
    expect(analytics.body.perQuestion).toBeUndefined();
    expect(analytics.body.byModule).toBeUndefined();
    expect(analytics.body.byDifficulty).toBeUndefined();
    expect(analytics.body.maxScore).toBeUndefined();
  });
});
