import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module';

async function bootstrap() {
  // Default body-parser (bodyParser: false + manual json/urlencoded) so we
  // can raise the limit above Express's 100kb default — profile updates
  // carry a base64-encoded avatar image in the JSON body.
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  app.use(json({ limit: '5mb' }));
  app.use(urlencoded({ extended: true, limit: '5mb' }));
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true }),
  );
  app.use(cookieParser());
  app.enableCors({
    credentials: true,
    origin: process.env.WEB_ORIGIN ?? 'http://localhost:5173',
  });
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
