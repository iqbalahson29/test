import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

async function login(app: INestApplication<App>, email: string) {
  const res = await request(app.getHttpServer())
    .post('/auth/login')
    .send({ email, password: 'password123' })
    .expect(200);
  return res.body as { accessToken?: string };
}

// Requests + approves a brand-new one-tenant workspace via the platform
// super admin, to get an admin token scoped to a *different* tenant than
// acme-school — used to exercise tenant isolation.
async function createTenantAdmin(app: INestApplication<App>, label: string) {
  const superadmin = await login(app, 'superadmin@quiz-platform.test');
  const email = `${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@e2e.test`;
  const reqRes = await request(app.getHttpServer())
    .post('/tenant-requests')
    .send({
      workspaceName: `Beta ${label} ${Date.now()}`,
      requesterName: 'Beta Admin',
      requesterEmail: email,
      password: 'password123',
    })
    .expect(201);
  await request(app.getHttpServer())
    .post(`/tenant-requests/${reqRes.body.id}/approve`)
    .set('Authorization', `Bearer ${superadmin.accessToken}`)
    .expect(201);
  const adminLogin = await login(app, email);
  return { token: adminLogin.accessToken as string, email };
}

describe('Memberships tenant isolation (e2e)', () => {
  let app: INestApplication<App>;
  let acmeAdminToken: string;
  let betaAdminToken: string;
  let betaAdminEmail: string;
  let acmeStudentToken: string;
  let acmeStudentMembershipId: string;

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
    acmeStudentToken = studentLogin.accessToken!;

    const betaAdmin = await createTenantAdmin(app, 'memberships');
    betaAdminToken = betaAdmin.token;
    betaAdminEmail = betaAdmin.email;

    const list = await request(app.getHttpServer())
      .get('/memberships')
      .set('Authorization', `Bearer ${acmeAdminToken}`)
      .expect(200);
    acmeStudentMembershipId = (
      list.body as { id: string; user: { email: string } }[]
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
    const emails = (res.body as { user: { email: string } }[]).map(
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
