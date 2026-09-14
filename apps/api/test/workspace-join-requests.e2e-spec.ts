import { INestApplication } from '@nestjs/common';
import {
  request,
  makeApp,
  fixtureLogin,
  registerVerified,
  str,
  list,
} from './auth-test-helpers';
import { App } from 'supertest/types';

async function login(
  app: INestApplication<App>,
  email: string,
  _password = 'Password123',
) {
  return await fixtureLogin(app, email);
}

async function registerAndLogin(app: INestApplication<App>, label: string) {
  const email = `${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@e2e.test`;
  const password = 'Password123';
  await registerVerified(app, email, password);
  const loginRes = await login(app, email, password);
  return {
    email,
    password,
    accessToken: loginRes.body.accessToken,
    refreshCookie: loginRes.headers['set-cookie'],
  };
}

describe('Workspace join requests + profile (e2e)', () => {
  let app: INestApplication<App>;
  let acmeAdminToken: string;

  beforeAll(async () => {
    ({ app } = await makeApp(true));

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
    const acmeEntry1 = list<{
      tenantId: string;
      name: string;
      membershipStatus: string | null;
    }>(dir1.body).find((t) => t.name === 'Acme School');
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
    const acmeEntry2 = list<{
      tenantId: string;
      membershipStatus: string | null;
    }>(dir2.body).find((t) => t.tenantId === acmeEntry1!.tenantId);
    expect(acmeEntry2?.membershipStatus).toBe('PENDING');

    // Shows up in "mine".
    const mine = await request(app.getHttpServer())
      .get('/workspace-join-requests/mine')
      .set('Authorization', `Bearer ${student.accessToken}`)
      .expect(200);
    expect(
      list<{ id: string; status: string }>(mine.body).some(
        (r) => r.id === requestId && r.status === 'PENDING',
      ),
    ).toBe(true);

    // A student token (not the workspace's admin) can't see/approve pending requests.
    const otherStudentLogin = await login(app, 'student@acme.test');
    await request(app.getHttpServer())
      .get('/workspace-join-requests')
      .set('Authorization', `Bearer ${str(otherStudentLogin.body.accessToken)}`)
      .expect(403);

    // Acme admin sees it and approves.
    const pending = await request(app.getHttpServer())
      .get('/workspace-join-requests')
      .set('Authorization', `Bearer ${acmeAdminToken}`)
      .expect(200);
    expect(
      list<{ id: string }>(pending.body).some((r) => r.id === requestId),
    ).toBe(true);

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
    const acmeTenantId = list<{ tenantId: string; name: string }>(
      dir.body,
    ).find((t) => t.name === 'Acme School')!.tenantId;

    const createRes = await request(app.getHttpServer())
      .post('/workspace-join-requests')
      .set('Authorization', `Bearer ${student.accessToken}`)
      .send({ tenantId: acmeTenantId })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/workspace-join-requests/${str(createRes.body.id)}/reject`)
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
    const acmeTenantId = list<{ tenantId: string; name: string }>(
      dir.body,
    ).find((t) => t.name === 'Acme School')!.tenantId;

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
      .set('Authorization', `Bearer ${str(otherStudentLogin.body.accessToken)}`)
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
      list<{
        tenantId: string;
        membershipStatus: string | null;
      }>(dirAfterCancel.body).find((t) => t.tenantId === acmeTenantId)
        ?.membershipStatus,
    ).toBeNull();

    const reapplyRes = await request(app.getHttpServer())
      .post('/workspace-join-requests')
      .set('Authorization', `Bearer ${student.accessToken}`)
      .send({ tenantId: acmeTenantId })
      .expect(201);

    // Once a request is reviewed (rejected here), it can no longer be cancelled.
    await request(app.getHttpServer())
      .post(`/workspace-join-requests/${str(reapplyRes.body.id)}/reject`)
      .set('Authorization', `Bearer ${acmeAdminToken}`)
      .expect(201);
    await request(app.getHttpServer())
      .delete(`/workspace-join-requests/${str(reapplyRes.body.id)}`)
      .set('Authorization', `Bearer ${student.accessToken}`)
      .expect(400);

    // And a rejected request doesn't block reapplying again.
    await request(app.getHttpServer())
      .post('/workspace-join-requests')
      .set('Authorization', `Bearer ${student.accessToken}`)
      .send({ tenantId: acmeTenantId })
      .expect(201);
  });

  it('profile accepts a name edit and refuses every generic credential write', async () => {
    const student = await registerAndLogin(app, 'profile');
    const updated = await request(app.getHttpServer())
      .patch('/auth/profile')
      .auth(student.accessToken, { type: 'bearer' })
      .send({ name: 'Renamed Student' })
      .expect(200);
    expect(updated.body.name).toBe('Renamed Student');
    for (const body of [
      { email: student.email },
      { newPassword: 'NewPassword123' },
      { newPassword: 'NewPassword123', currentPassword: student.password },
    ])
      await request(app.getHttpServer())
        .patch('/auth/profile')
        .auth(student.accessToken, { type: 'bearer' })
        .send(body)
        .expect(400);
    const profile = await request(app.getHttpServer())
      .get('/auth/profile')
      .auth(student.accessToken, { type: 'bearer' })
      .expect(200);
    expect(profile.body.name).toBe('Renamed Student');
    // Dedicated recovery/password/email actions, history and revocation are covered in auth-security.
  });
});
