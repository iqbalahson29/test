import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

async function login(app: INestApplication<App>, email: string, password = 'password123') {
  return request(app.getHttpServer()).post('/auth/login').send({ email, password });
}

async function registerAndLogin(app: INestApplication<App>, label: string) {
  const email = `${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@e2e.test`;
  const password = 'Password123';
  await request(app.getHttpServer())
    .post('/auth/register')
    .send({ email, name: 'Directory Student', password })
    .expect(201);
  const loginRes = await login(app, email, password);
  return {
    email,
    password,
    accessToken: loginRes.body.accessToken as string,
    refreshCookie: loginRes.headers['set-cookie'] as unknown as string[],
  };
}

describe('Workspace join requests + profile (e2e)', () => {
  let app: INestApplication<App>;
  let acmeAdminToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.use(cookieParser());
    await app.init();

    acmeAdminToken = (await login(app, 'admin@acme.test')).body.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  it('full directory -> request -> approve flow upgrades the account to a real session', async () => {
    const student = await registerAndLogin(app, 'jr');

    // Directory lists Acme with no relationship yet.
    const dir1 = await request(app.getHttpServer())
      .get('/workspace-join-requests/directory')
      .set('Authorization', `Bearer ${student.accessToken}`)
      .expect(200);
    const acmeEntry1 = (dir1.body as { tenantId: string; name: string; membershipStatus: string | null }[]).find(
      (t) => t.name === 'Acme School',
    );
    expect(acmeEntry1?.membershipStatus).toBeNull();

    // Request to join.
    const createRes = await request(app.getHttpServer())
      .post('/workspace-join-requests')
      .set('Authorization', `Bearer ${student.accessToken}`)
      .send({ tenantId: acmeEntry1!.tenantId })
      .expect(201);
    const requestId = createRes.body.id as string;

    // Duplicate request rejected.
    await request(app.getHttpServer())
      .post('/workspace-join-requests')
      .set('Authorization', `Bearer ${student.accessToken}`)
      .send({ tenantId: acmeEntry1!.tenantId })
      .expect(409);

    // Directory now shows PENDING.
    const dir2 = await request(app.getHttpServer())
      .get('/workspace-join-requests/directory')
      .set('Authorization', `Bearer ${student.accessToken}`)
      .expect(200);
    const acmeEntry2 = (dir2.body as { tenantId: string; membershipStatus: string | null }[]).find(
      (t) => t.tenantId === acmeEntry1!.tenantId,
    );
    expect(acmeEntry2?.membershipStatus).toBe('PENDING');

    // Shows up in "mine".
    const mine = await request(app.getHttpServer())
      .get('/workspace-join-requests/mine')
      .set('Authorization', `Bearer ${student.accessToken}`)
      .expect(200);
    expect((mine.body as { id: string; status: string }[]).some((r) => r.id === requestId && r.status === 'PENDING')).toBe(
      true,
    );

    // A student token (not the workspace's admin) can't see/approve pending requests.
    const otherStudentLogin = await login(app, 'student@acme.test');
    await request(app.getHttpServer())
      .get('/workspace-join-requests')
      .set('Authorization', `Bearer ${otherStudentLogin.body.accessToken}`)
      .expect(403);

    // Acme admin sees it and approves.
    const pending = await request(app.getHttpServer())
      .get('/workspace-join-requests')
      .set('Authorization', `Bearer ${acmeAdminToken}`)
      .expect(200);
    expect((pending.body as { id: string }[]).some((r) => r.id === requestId)).toBe(true);

    await request(app.getHttpServer())
      .post(`/workspace-join-requests/${requestId}/approve`)
      .set('Authorization', `Bearer ${acmeAdminToken}`)
      .expect(201);

    // Re-approving (now non-pending) is rejected.
    await request(app.getHttpServer())
      .post(`/workspace-join-requests/${requestId}/approve`)
      .set('Authorization', `Bearer ${acmeAdminToken}`)
      .expect(400);

    // The student now has a real membership -> login returns 'ok', not 'no-workspace'.
    const secondLogin = await login(app, student.email, student.password);
    expect(secondLogin.body.status).toBe('ok');
    expect(secondLogin.body.membership.role).toBe('STUDENT');
  });

  it('reject leaves no membership behind, and a nonexistent tenant is rejected up front', async () => {
    const student = await registerAndLogin(app, 'jr-reject');

    await request(app.getHttpServer())
      .post('/workspace-join-requests')
      .set('Authorization', `Bearer ${student.accessToken}`)
      .send({ tenantId: 'not-a-real-tenant-id' })
      .expect(404);

    const dir = await request(app.getHttpServer())
      .get('/workspace-join-requests/directory')
      .set('Authorization', `Bearer ${student.accessToken}`)
      .expect(200);
    const acmeTenantId = (dir.body as { tenantId: string; name: string }[]).find(
      (t) => t.name === 'Acme School',
    )!.tenantId;

    const createRes = await request(app.getHttpServer())
      .post('/workspace-join-requests')
      .set('Authorization', `Bearer ${student.accessToken}`)
      .send({ tenantId: acmeTenantId })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/workspace-join-requests/${createRes.body.id}/reject`)
      .set('Authorization', `Bearer ${acmeAdminToken}`)
      .expect(201);

    const stillNoWorkspace = await login(app, student.email, student.password);
    expect(stillNoWorkspace.body.status).toBe('no-workspace');
  });

  it('a student can cancel their own pending request, and reapply after rejection', async () => {
    const student = await registerAndLogin(app, 'jr-cancel');

    const dir = await request(app.getHttpServer())
      .get('/workspace-join-requests/directory')
      .set('Authorization', `Bearer ${student.accessToken}`)
      .expect(200);
    const acmeTenantId = (dir.body as { tenantId: string; name: string }[]).find(
      (t) => t.name === 'Acme School',
    )!.tenantId;

    const createRes = await request(app.getHttpServer())
      .post('/workspace-join-requests')
      .set('Authorization', `Bearer ${student.accessToken}`)
      .send({ tenantId: acmeTenantId })
      .expect(201);
    const requestId = createRes.body.id as string;

    // Another student can't cancel someone else's request.
    const otherStudentLogin = await login(app, 'student@acme.test');
    await request(app.getHttpServer())
      .delete(`/workspace-join-requests/${requestId}`)
      .set('Authorization', `Bearer ${otherStudentLogin.body.accessToken}`)
      .expect(404);

    // Owner cancels it.
    await request(app.getHttpServer())
      .delete(`/workspace-join-requests/${requestId}`)
      .set('Authorization', `Bearer ${student.accessToken}`)
      .expect(204);

    // Cancelling again (already gone) is a 404.
    await request(app.getHttpServer())
      .delete(`/workspace-join-requests/${requestId}`)
      .set('Authorization', `Bearer ${student.accessToken}`)
      .expect(404);

    // Directory shows no relationship again, so they can immediately reapply.
    const dirAfterCancel = await request(app.getHttpServer())
      .get('/workspace-join-requests/directory')
      .set('Authorization', `Bearer ${student.accessToken}`)
      .expect(200);
    expect(
      (dirAfterCancel.body as { tenantId: string; membershipStatus: string | null }[]).find(
        (t) => t.tenantId === acmeTenantId,
      )?.membershipStatus,
    ).toBeNull();

    const reapplyRes = await request(app.getHttpServer())
      .post('/workspace-join-requests')
      .set('Authorization', `Bearer ${student.accessToken}`)
      .send({ tenantId: acmeTenantId })
      .expect(201);

    // Once a request is reviewed (rejected here), it can no longer be cancelled.
    await request(app.getHttpServer())
      .post(`/workspace-join-requests/${reapplyRes.body.id}/reject`)
      .set('Authorization', `Bearer ${acmeAdminToken}`)
      .expect(201);
    await request(app.getHttpServer())
      .delete(`/workspace-join-requests/${reapplyRes.body.id}`)
      .set('Authorization', `Bearer ${student.accessToken}`)
      .expect(400);

    // And a rejected request doesn't block reapplying again.
    await request(app.getHttpServer())
      .post('/workspace-join-requests')
      .set('Authorization', `Bearer ${student.accessToken}`)
      .send({ tenantId: acmeTenantId })
      .expect(201);
  });

  it('profile: name-only update needs no password, email/password changes require currentPassword', async () => {
    const student = await registerAndLogin(app, 'profile');

    // Name-only change, no currentPassword needed.
    const nameUpdate = await request(app.getHttpServer())
      .patch('/auth/profile')
      .set('Authorization', `Bearer ${student.accessToken}`)
      .send({ name: 'Renamed Student' })
      .expect(200);
    expect(nameUpdate.body.name).toBe('Renamed Student');

    // Submitting the *unchanged* email alongside a name edit (what the
    // profile form actually does — it always includes the current email)
    // must NOT be treated as an email change requiring currentPassword.
    const unchangedEmailUpdate = await request(app.getHttpServer())
      .patch('/auth/profile')
      .set('Authorization', `Bearer ${student.accessToken}`)
      .send({ name: 'Renamed Again', email: student.email })
      .expect(200);
    expect(unchangedEmailUpdate.body.name).toBe('Renamed Again');

    // Password change without currentPassword is rejected.
    await request(app.getHttpServer())
      .patch('/auth/profile')
      .set('Authorization', `Bearer ${student.accessToken}`)
      .send({ newPassword: 'NewPassword123' })
      .expect(401);

    // Wrong currentPassword is rejected.
    await request(app.getHttpServer())
      .patch('/auth/profile')
      .set('Authorization', `Bearer ${student.accessToken}`)
      .send({ newPassword: 'NewPassword123', currentPassword: 'wrong-password' })
      .expect(401);

    // Weak newPassword (no uppercase) is rejected by the strength policy.
    await request(app.getHttpServer())
      .patch('/auth/profile')
      .set('Authorization', `Bearer ${student.accessToken}`)
      .send({ newPassword: 'weakpassword1', currentPassword: student.password })
      .expect(400);

    // Reusing the current password as the "new" one is rejected.
    await request(app.getHttpServer())
      .patch('/auth/profile')
      .set('Authorization', `Bearer ${student.accessToken}`)
      .send({ newPassword: student.password, currentPassword: student.password })
      .expect(400);

    // Correct currentPassword succeeds, and the new password actually works.
    const changeRes = await request(app.getHttpServer())
      .patch('/auth/profile')
      .set('Authorization', `Bearer ${student.accessToken}`)
      .send({ newPassword: 'NewPassword123', currentPassword: student.password })
      .expect(200);
    expect(changeRes.body.accessToken).toEqual(expect.any(String));

    const oldPasswordLogin = await login(app, student.email, student.password);
    expect(oldPasswordLogin.status).toBe(401);

    const newPasswordLogin = await login(app, student.email, 'NewPassword123');
    expect(newPasswordLogin.status).toBe(200);

    // GET /auth/profile reflects the rename.
    const profile = await request(app.getHttpServer())
      .get('/auth/profile')
      .set('Authorization', `Bearer ${newPasswordLogin.body.accessToken}`)
      .expect(200);
    expect(profile.body.name).toBe('Renamed Again');

    // The refresh token from *before* the password change is a stale
    // session — its next refresh must be rejected, even though it hasn't
    // expired yet.
    await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', student.refreshCookie)
      .expect(401);

    // The tokens the PATCH itself just issued are for this same session —
    // they must still work.
    const newRefreshCookie = changeRes.headers['set-cookie'] as unknown as string[];
    await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', newRefreshCookie)
      .expect(200);
  });
});
