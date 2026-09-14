import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureHttp } from './auth/security/http-security';
async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  configureHttp(app);
  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
