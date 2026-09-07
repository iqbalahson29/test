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

const VALID_QUESTIONS: Array<{
  type: string;
  module: string;
  prompt: string;
  points: number;
  config: object;
  options?: { text: string; isCorrect: boolean }[];
}> = [
  {
    type: 'MCQ_SINGLE',
    module: 'RW_MODULE_1',
    prompt: 'Capital of France?',
    points: 2,
    config: {},
    options: [
      { text: 'Paris', isCorrect: true },
      { text: 'Berlin', isCorrect: false },
    ],
  },
  {
    type: 'MCQ_MULTI',
    module: 'RW_MODULE_1',
    prompt: 'Pick primes',
    points: 3,
    config: {},
    options: [
      { text: '2', isCorrect: true },
      { text: '3', isCorrect: true },
      { text: '4', isCorrect: false },
    ],
  },
  {
    type: 'TRUE_FALSE',
    module: 'RW_MODULE_1',
    prompt: 'Sky is blue',
    points: 1,
    config: {},
    options: [
      { text: 'True', isCorrect: true },
      { text: 'False', isCorrect: false },
    ],
  },
  {
    type: 'SHORT_TEXT',
    module: 'RW_MODULE_1',
    prompt: 'Symbol for water?',
    points: 2,
    config: { acceptedAnswers: ['H2O'], caseSensitive: false },
  },
  {
    type: 'NUMERIC',
    module: 'RW_MODULE_1',
    prompt: 'Pi to 2dp?',
    points: 2,
    config: { correctAnswer: 3.14, tolerance: 0.01 },
  },
  {
    type: 'ESSAY',
    module: 'RW_MODULE_1',
    prompt: 'Explain photosynthesis.',
    points: 5,
    config: { minWords: 50, maxWords: 300 },
  },
  {
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
  },
  {
    type: 'FILL_BLANK',
    module: 'RW_MODULE_1',
    prompt: 'The {{1}} orbits the {{2}}.',
    points: 2,
    config: {
      blanks: [
        { acceptedAnswers: ['Moon'], caseSensitive: false },
        { acceptedAnswers: ['Earth'], caseSensitive: false },
      ],
    },
  },
  {
    type: 'FILE_UPLOAD',
    module: 'RW_MODULE_1',
    prompt: 'Upload your proof.',
    points: 10,
    config: { allowedExtensions: ['pdf'], maxSizeMb: 5 },
  },
];

describe('Quiz builder (e2e)', () => {
  let app: INestApplication<App>;
  let acmeAdminToken: string;
  let betaAdminToken: string;

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

    betaAdminToken = (await createTenantAdmin(app, 'quizzes')).token;
  });

  afterAll(async () => {
    await app.close();
  });

  it('builds a quiz containing all 9 question types, reorders, and publishes it', async () => {
    const createRes = await request(app.getHttpServer())
      .post('/quizzes')
      .set('Authorization', `Bearer ${acmeAdminToken}`)
      .send({ title: 'Full Coverage Quiz' })
      .expect(201);
    const quizId = createRes.body.id as string;

    const createdIds: string[] = [];
    for (const q of VALID_QUESTIONS) {
      const res = await request(app.getHttpServer())
        .post(`/quizzes/${quizId}/questions`)
        .set('Authorization', `Bearer ${acmeAdminToken}`)
        .send(q)
        .expect(201);
      expect(res.body.type).toBe(q.type);
      createdIds.push(res.body.id);
    }

    // Reorder: reverse the list (all 9 questions live in RW_MODULE_1, so
    // reordering is scoped to that module).
    const reversed = [...createdIds].reverse();
    await request(app.getHttpServer())
      .patch(`/quizzes/${quizId}/questions/reorder`)
      .set('Authorization', `Bearer ${acmeAdminToken}`)
      .send({ module: 'RW_MODULE_1', orderedIds: reversed })
      .expect(200);

    const detail = await request(app.getHttpServer())
      .get(`/quizzes/${quizId}`)
      .set('Authorization', `Bearer ${acmeAdminToken}`)
      .expect(200);
    const rwModule1Ids = detail.body.questions
      .filter((q: { module: string }) => q.module === 'RW_MODULE_1')
      .map((q: { id: string }) => q.id);
    expect(rwModule1Ids).toEqual(reversed);

    await fillRemainingModules(app, acmeAdminToken, quizId, ['RW_MODULE_1']);

    await request(app.getHttpServer())
      .patch(`/quizzes/${quizId}/status`)
      .set('Authorization', `Bearer ${acmeAdminToken}`)
      .send({ status: 'PUBLISHED' })
      .expect(200);

    // Questions can still be added after publishing — QuestionsService
    // intentionally allows edits on a quiz in any status (see its top-of-file
    // comment) so teachers can fix content on a live quiz; only quiz-level
    // settings (QuizzesService.update) are locked to DRAFT.
    await request(app.getHttpServer())
      .post(`/quizzes/${quizId}/questions`)
      .set('Authorization', `Bearer ${acmeAdminToken}`)
      .send(VALID_QUESTIONS[0])
      .expect(201);
  });

  it('rejects invalid config and invalid option correctness per Zod schema / business rules', async () => {
    const createRes = await request(app.getHttpServer())
      .post('/quizzes')
      .set('Authorization', `Bearer ${acmeAdminToken}`)
      .send({ title: 'Invalid Config Quiz' })
      .expect(201);
    const quizId = createRes.body.id as string;

    await request(app.getHttpServer())
      .post(`/quizzes/${quizId}/questions`)
      .set('Authorization', `Bearer ${acmeAdminToken}`)
      .send({ type: 'NUMERIC', module: 'RW_MODULE_1', prompt: 'Bad numeric', points: 1, config: {} })
      .expect(400);

    await request(app.getHttpServer())
      .post(`/quizzes/${quizId}/questions`)
      .set('Authorization', `Bearer ${acmeAdminToken}`)
      .send({
        type: 'MCQ_SINGLE',
        module: 'RW_MODULE_1',
        prompt: 'Two correct',
        points: 1,
        config: {},
        options: [
          { text: 'A', isCorrect: true },
          { text: 'B', isCorrect: true },
        ],
      })
      .expect(400);
  });

  it('blocks publishing a quiz with no questions', async () => {
    const createRes = await request(app.getHttpServer())
      .post('/quizzes')
      .set('Authorization', `Bearer ${acmeAdminToken}`)
      .send({ title: 'Empty Quiz' })
      .expect(201);
    const quizId = createRes.body.id as string;

    await request(app.getHttpServer())
      .patch(`/quizzes/${quizId}/status`)
      .set('Authorization', `Bearer ${acmeAdminToken}`)
      .send({ status: 'PUBLISHED' })
      .expect(400);
  });

  it("enforces tenant isolation on quizzes", async () => {
    const createRes = await request(app.getHttpServer())
      .post('/quizzes')
      .set('Authorization', `Bearer ${acmeAdminToken}`)
      .send({ title: 'Acme Only Quiz' })
      .expect(201);
    const quizId = createRes.body.id as string;

    await request(app.getHttpServer())
      .get(`/quizzes/${quizId}`)
      .set('Authorization', `Bearer ${betaAdminToken}`)
      .expect(404);

    await request(app.getHttpServer())
      .post(`/quizzes/${quizId}/questions`)
      .set('Authorization', `Bearer ${betaAdminToken}`)
      .send(VALID_QUESTIONS[0])
      .expect(404);

    const list = await request(app.getHttpServer())
      .get('/quizzes')
      .set('Authorization', `Bearer ${betaAdminToken}`)
      .expect(200);
    expect(
      (list.body as { title: string }[]).some((q) => q.title === 'Acme Only Quiz'),
    ).toBe(false);
  });
});
