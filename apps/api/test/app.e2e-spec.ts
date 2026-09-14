import { INestApplication } from '@nestjs/common';
import { request, makeApp } from './auth-test-helpers';
import { App } from 'supertest/types';

describe('AppModule (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    ({ app } = await makeApp(true));
  });

  it('/health (GET)', () => {
    return request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect({ status: 'ok' });
  });

  afterEach(async () => {
    await app.close();
  });
});
