import { INestApplication } from '@nestjs/common';
import {
  request,
  makeApp,
  fixtureLogin,
  fixtureTenantAdmin,
  list,
} from './auth-test-helpers';
import { App } from 'supertest/types';

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

describe('Memberships tenant isolation (e2e)', () => {
  let app: INestApplication<App>;
  let acmeAdminToken: string;
  let betaAdminToken: string;
  let betaAdminEmail: string;
  let acmeStudentToken: string;
  let acmeStudentMembershipId: string;

  beforeAll(async () => {
    ({ app } = await makeApp(true));

    const adminLogin = await login(app, 'admin@acme.test');
    acmeAdminToken = adminLogin.accessToken!;

    const studentLogin = await login(app, 'student@acme.test');
    acmeStudentToken = studentLogin.accessToken!;

    const betaAdmin = await createTenantAdmin(app, 'memberships');
    betaAdminToken = betaAdmin.token;
    betaAdminEmail = betaAdmin.email;

    const listRes = await request(app.getHttpServer())
      .get('/memberships')
      .set('Authorization', `Bearer ${acmeAdminToken}`)
      .expect(200);
    acmeStudentMembershipId = list<{ id: string; user: { email: string } }>(
      listRes.body,
    ).find((m) => m.user.email === 'student@acme.test')!.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it("only returns the caller's own tenant memberships", async () => {
    const res = await request(app.getHttpServer())
      .get('/memberships')
      .set('Authorization', `Bearer ${betaAdminToken}`)
      .expect(200);
    const emails = list<{ user: { email: string } }>(res.body).map(
      (m) => m.user.email,
    );
    expect(emails).toEqual([betaAdminEmail]);
  });

  it("404s deleting another tenant's membership by id", async () => {
    await request(app.getHttpServer())
      .delete(`/memberships/${acmeStudentMembershipId}`)
      .set('Authorization', `Bearer ${betaAdminToken}`)
      .expect(404);
  });

  it('rejects non-admin roles with 403', async () => {
    await request(app.getHttpServer())
      .get('/memberships')
      .set('Authorization', `Bearer ${acmeStudentToken}`)
      .expect(403);
  });

  it('rejects requests with no token', async () => {
    await request(app.getHttpServer()).get('/memberships').expect(401);
  });
});
