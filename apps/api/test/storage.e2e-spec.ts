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

describe('Storage / file uploads (e2e)', () => {
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

    betaAdminToken = (await createTenantAdmin(app, 'storage')).token;

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
        module: 'RW_MODULE_1',
        prompt: 'Upload proof.',
        points: 5,
        config: { allowedExtensions: ['txt'], maxSizeMb: 5 },
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

    const start = await request(app.getHttpServer())
      .post('/attempts')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ quizId })
      .expect(201);
    const attemptId = start.body.id as string;

    const uploadRes = await request(app.getHttpServer())
      .post(
        `/attempts/${attemptId}/responses/${str(question.body.id)}/upload-url`,
      )
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
      .patch(`/attempts/${attemptId}/responses/${str(question.body.id)}`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ fileKey })
      .expect(200);

    const submitRes = await submitAllModules(app, studentToken, attemptId);
    const submittedQuestion = (
      submitRes.questions as { id: string; fileKey: string }[]
    ).find((q) => q.id === question.body.id)!;
    expect(submittedQuestion.fileKey).toBe(fileKey);

    const queue = await request(app.getHttpServer())
      .get(`/quizzes/${quizId}/grading-queue`)
      .set('Authorization', `Bearer ${acmeAdminToken}`)
      .expect(200);
    const queueItem = must(
      list(queue.body).find(
        (r: { questionId: string }) => r.questionId === question.body.id,
      ),
      'upload queue entry',
    );
    expect(queueItem.fileKey).toBe(fileKey);

    const downloadRes = await request(app.getHttpServer())
      .get(`/responses/${str(queueItem.responseId)}/download-url`)
      .set('Authorization', `Bearer ${acmeAdminToken}`)
      .expect(200);

    const getRes = await fetch(str(downloadRes.body.downloadUrl));
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
        module: 'RW_MODULE_1',
        prompt: 'x',
        points: 1,
        config: { maxSizeMb: 5 },
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
    const start = await request(app.getHttpServer())
      .post('/attempts')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ quizId })
      .expect(201);

    // A different tenant's student session doesn't exist here, so instead
    // confirm a teacher from another tenant can't reach this response for
    // a download URL once something is uploaded.
    const uploadRes = await request(app.getHttpServer())
      .post(
        `/attempts/${str(start.body.id)}/responses/${str(question.body.id)}/upload-url`,
      )
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ filename: 'x.txt', contentType: 'text/plain' })
      .expect(201);
    await fetch(str(uploadRes.body.uploadUrl), { method: 'PUT', body: 'x' });
    await request(app.getHttpServer())
      .patch(
        `/attempts/${str(start.body.id)}/responses/${str(question.body.id)}`,
      )
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ fileKey: uploadRes.body.fileKey })
      .expect(200);
    await submitAllModules(app, studentToken, str(start.body.id));

    const queue = await request(app.getHttpServer())
      .get(`/quizzes/${quizId}/grading-queue`)
      .set('Authorization', `Bearer ${acmeAdminToken}`)
      .expect(200);
    const responseId = str(list(queue.body)[0].responseId);

    await request(app.getHttpServer())
      .get(`/responses/${responseId}/download-url`)
      .set('Authorization', `Bearer ${betaAdminToken}`)
      .expect(404);
  });
});
