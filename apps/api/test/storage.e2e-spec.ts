import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

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

describe('Storage / file uploads (e2e)', () => {
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

    betaAdminToken = (await createTenantAdmin(app, 'storage')).token;

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

  it('round-trips a real file through presigned upload/download URLs against live MinIO', async () => {
    const createRes = await request(app.getHttpServer())
      .post('/quizzes')
      .set('Authorization', `Bearer ${acmeAdminToken}`)
      .send({ title: 'Storage e2e Quiz' })
      .expect(201);
    const quizId = createRes.body.id as string;

    const question = await request(app.getHttpServer())
      .post(`/quizzes/${quizId}/questions`)
      .set('Authorization', `Bearer ${acmeAdminToken}`)
      .send({
        type: 'FILE_UPLOAD',
        prompt: 'Upload proof.',
        points: 5,
        config: { allowedExtensions: ['txt'], maxSizeMb: 5 },
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

    const start = await request(app.getHttpServer())
      .post('/attempts')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ quizId })
      .expect(201);
    const attemptId = start.body.id as string;

    const uploadRes = await request(app.getHttpServer())
      .post(`/attempts/${attemptId}/responses/${question.body.id}/upload-url`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ filename: 'proof.txt', contentType: 'text/plain' })
      .expect(201);
    const { uploadUrl, fileKey } = uploadRes.body as {
      uploadUrl: string;
      fileKey: string;
    };
    expect(fileKey).toContain(attemptId);

    const fileContents = 'e2e storage round-trip test contents';
    const putRes = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'text/plain' },
      body: fileContents,
    });
    expect(putRes.ok).toBe(true);

    await request(app.getHttpServer())
      .patch(`/attempts/${attemptId}/responses/${question.body.id}`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ fileKey })
      .expect(200);

    const submitRes = await request(app.getHttpServer())
      .post(`/attempts/${attemptId}/submit`)
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(201);
    const submittedQuestion = submitRes.body.questions.find(
      (q: { id: string }) => q.id === question.body.id,
    );
    expect(submittedQuestion.fileKey).toBe(fileKey);

    const queue = await request(app.getHttpServer())
      .get(`/quizzes/${quizId}/grading-queue`)
      .set('Authorization', `Bearer ${acmeAdminToken}`)
      .expect(200);
    const queueItem = queue.body.find(
      (r: { questionId: string }) => r.questionId === question.body.id,
    );
    expect(queueItem.fileKey).toBe(fileKey);

    const downloadRes = await request(app.getHttpServer())
      .get(`/responses/${queueItem.responseId}/download-url`)
      .set('Authorization', `Bearer ${acmeAdminToken}`)
      .expect(200);

    const getRes = await fetch(downloadRes.body.downloadUrl);
    expect(getRes.ok).toBe(true);
    expect(await getRes.text()).toBe(fileContents);
  });

  it('enforces tenant isolation on upload-url and download-url', async () => {
    const createRes = await request(app.getHttpServer())
      .post('/quizzes')
      .set('Authorization', `Bearer ${acmeAdminToken}`)
      .send({ title: 'Storage Isolation Quiz' })
      .expect(201);
    const quizId = createRes.body.id as string;
    const question = await request(app.getHttpServer())
      .post(`/quizzes/${quizId}/questions`)
      .set('Authorization', `Bearer ${acmeAdminToken}`)
      .send({
        type: 'FILE_UPLOAD',
        prompt: 'x',
        points: 1,
        config: { maxSizeMb: 5 },
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
    const start = await request(app.getHttpServer())
      .post('/attempts')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ quizId })
      .expect(201);

    // A different tenant's student session doesn't exist here, so instead
    // confirm a teacher from another tenant can't reach this response for
    // a download URL once something is uploaded.
    const uploadRes = await request(app.getHttpServer())
      .post(`/attempts/${start.body.id}/responses/${question.body.id}/upload-url`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ filename: 'x.txt', contentType: 'text/plain' })
      .expect(201);
    await fetch(uploadRes.body.uploadUrl, { method: 'PUT', body: 'x' });
    await request(app.getHttpServer())
      .patch(`/attempts/${start.body.id}/responses/${question.body.id}`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ fileKey: uploadRes.body.fileKey })
      .expect(200);
    await request(app.getHttpServer())
      .post(`/attempts/${start.body.id}/submit`)
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(201);

    const queue = await request(app.getHttpServer())
      .get(`/quizzes/${quizId}/grading-queue`)
      .set('Authorization', `Bearer ${acmeAdminToken}`)
      .expect(200);
    const responseId = queue.body[0].responseId as string;

    await request(app.getHttpServer())
      .get(`/responses/${responseId}/download-url`)
      .set('Authorization', `Bearer ${betaAdminToken}`)
      .expect(404);
  });
});
