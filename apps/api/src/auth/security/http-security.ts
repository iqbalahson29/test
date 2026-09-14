import {
  ArgumentsHost,
  CanActivate,
  Catch,
  ExceptionFilter,
  ExecutionContext,
  HttpException,
  INestApplication,
  Injectable,
  ValidationPipe,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import cookieParser from 'cookie-parser';
import { json } from 'express';
import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import { RateLimitsService } from './rate-limits.service';
import { authError } from './primitives';
export function originAllowed(req: Pick<Request, 'headers'>, origin: string) {
  if (
    req.headers['x-quiz-client'] !== 'web' ||
    req.headers['sec-fetch-site'] === 'cross-site'
  )
    return false;
  if (req.headers.origin !== undefined) return req.headers.origin === origin;
  if (typeof req.headers.referer !== 'string') return false;
  try {
    return new URL(req.headers.referer).origin === origin;
  } catch {
    return false;
  }
}
@Injectable()
export class PersistentRequestGuard implements CanActivate {
  constructor(private readonly rates: RateLimitsService) {}
  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<Request>();
    if (req.path === '/health/live') return true;
    const limit =
      req.path === '/webhooks/brevo'
        ? 300
        : req.path === '/security/csp-report'
          ? 30
          : 200;
    await this.rates.gate(
      req.path === '/webhooks/brevo'
        ? 'webhook'
        : req.path === '/security/csp-report'
          ? 'csp'
          : 'general',
      req.ip ?? '',
      limit,
    );
    return true;
  }
}
@Catch()
export class AuthExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    if (response.headersSent) return;
    const status =
      exception instanceof HttpException ? exception.getStatus() : 503;
    const body =
      exception instanceof HttpException ? exception.getResponse() : null;
    const object =
      body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
    const code =
      typeof object.code === 'string'
        ? object.code
        : status === 401
          ? 'SESSION_INVALID'
          : status === 403
            ? 'FORBIDDEN'
            : status === 404
              ? 'NOT_FOUND'
              : status === 400
                ? 'VALIDATION_ERROR'
                : 'AUTH_RETRY_LATER';
    const message =
      typeof object.message === 'string'
        ? object.message
        : status === 400
          ? 'Invalid request'
          : status === 401
            ? 'Please sign in again'
            : status === 503
              ? 'Service is temporarily unavailable'
              : 'Request could not be completed';
    if (typeof object.retryAfterSeconds === 'number')
      response.setHeader('Retry-After', String(object.retryAfterSeconds));
    response.status(status).json({
      code,
      message,
      ...(object.retryAfterSeconds !== undefined
        ? { retryAfterSeconds: object.retryAfterSeconds }
        : {}),
      ...(object.challenge ? { challenge: object.challenge } : {}),
    });
  }
}
export function configureHttp(app: INestApplication) {
  const config = app.get(ConfigService),
    origin = config.getOrThrow<string>('WEB_ORIGIN');
  const express = app.getHttpAdapter().getInstance() as {
    set: (k: string, v: unknown) => void;
  };
  express.set(
    'trust proxy',
    Number(config.get('TRUST_PROXY_HOPS')) === 1 ? 1 : false,
  );
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
      crossOriginEmbedderPolicy: false,
      hsts:
        config.get('COOKIE_SECURE') === 'true'
          ? { maxAge: 31536000, includeSubDomains: false, preload: false }
          : false,
      frameguard: { action: 'deny' },
      referrerPolicy: { policy: 'no-referrer' },
    }),
  );
  app.use((req: Request, res: Response, next: NextFunction) => {
    res.setHeader(
      'Permissions-Policy',
      'camera=(), microphone=(), geolocation=()',
    );
    if (
      req.path.startsWith('/auth') ||
      req.path.startsWith('/member-invitations') ||
      req.path.startsWith('/tenant-requests')
    )
      res.setHeader('Cache-Control', 'no-store');
    if (
      !['GET', 'HEAD', 'OPTIONS'].includes(req.method) &&
      !['/webhooks/brevo', '/security/csp-report'].includes(req.path)
    ) {
      if (!originAllowed(req, origin)) {
        res.status(403).json({
          code: 'ORIGIN_REJECTED',
          message: 'Request origin rejected',
        });
        return;
      }
      if (!req.is('application/json')) {
        res
          .status(400)
          .json({ code: 'VALIDATION_ERROR', message: 'JSON body required' });
        return;
      }
    }
    next();
  });
  const small = json({ limit: '16kb' }),
    webhook = json({ limit: '64kb' }),
    profile = json({ limit: '512kb' }),
    large = json({ limit: '5mb' }),
    csp = json({
      limit: '16kb',
      type: ['application/json', 'application/csp-report'],
    });
  app.use((req: Request, res: Response, next: NextFunction) => {
    const parser =
      req.path === '/webhooks/brevo'
        ? webhook
        : req.path === '/security/csp-report'
          ? csp
          : req.path === '/auth/profile'
            ? profile
            : req.path.startsWith('/auth/') ||
                req.path.startsWith('/member-invitations') ||
                req.path.startsWith('/tenant-requests')
              ? small
              : large;
    parser(req, res, (error?: unknown) => {
      if (error) {
        res.status(400).json({
          code: 'VALIDATION_ERROR',
          message: 'Invalid or oversized JSON body',
        });
        return;
      }
      next();
    });
  });
  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: () => authError('VALIDATION_ERROR'),
    }),
  );
  app.useGlobalFilters(new AuthExceptionFilter());
  app.enableCors({
    origin,
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Quiz-Client'],
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    exposedHeaders: ['Retry-After', 'X-Quiz-Remember-Device'],
  });
}
