import {
  Body,
  Controller,
  HttpCode,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { authError, equalHash, sha256 } from '../auth/security/primitives';
import { WebhookService } from './webhook.service';
@Controller()
export class SecurityController {
  constructor(
    private readonly config: ConfigService,
    private readonly webhooks: WebhookService,
    private readonly db: PrismaService,
  ) {}
  @Post('webhooks/brevo')
  @HttpCode(204)
  async webhook(@Req() req: Request, @Body() body: unknown) {
    const auth = req.get('authorization') ?? '',
      secret = this.config.get<string>('BREVO_WEBHOOK_SECRET');
    const previous = this.config.get<string>('BREVO_WEBHOOK_PREVIOUS_SECRET'),
      until = this.config.get<string>('BREVO_WEBHOOK_PREVIOUS_UNTIL');
    const matches =
      !!secret && equalHash(sha256(auth), sha256(`Bearer ${secret}`));
    const validPrevious =
      previous &&
      until &&
      Date.parse(until) > Date.now() &&
      Date.parse(until) - Date.now() <= 86400000 &&
      equalHash(sha256(auth), sha256(`Bearer ${previous}`));
    if (!matches && !validPrevious) throw new UnauthorizedException();
    await this.webhooks.receive(body);
  }
  @Post('security/csp-report')
  @HttpCode(204)
  async csp(@Body() input: unknown) {
    if (!input || typeof input !== 'object' || Array.isArray(input))
      throw authError('VALIDATION_ERROR');
    const report = (input as Record<string, unknown>)['csp-report'];
    if (!report || typeof report !== 'object' || Array.isArray(report))
      throw authError('VALIDATION_ERROR');
    const r = report as Record<string, unknown>;
    const directive = r['effective-directive'] ?? r['violated-directive'];
    if (typeof directive !== 'string') throw authError('VALIDATION_ERROR');
    const clean = (url: unknown) => {
      if (typeof url !== 'string') return null;
      try {
        const u = new URL(url);
        if (!['http:', 'https:'].includes(u.protocol)) return null;
        return `${u.origin}${u.pathname}`.slice(0, 500);
      } catch {
        return null;
      }
    };
    await this.db.cspReport.create({
      data: {
        directive: directive.split(' ')[0].slice(0, 80),
        blockedUrl: clean(r['blocked-uri']),
        documentUrl: clean(r['document-uri']),
      },
    });
  }
}
