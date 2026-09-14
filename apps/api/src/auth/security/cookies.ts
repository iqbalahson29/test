import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CookieOptions, Request, Response } from 'express';
import { AuthRandom, authError, hmac } from './primitives';
export interface BrowserContext {
  contextHash: string;
  source: string;
  userAgent: string;
  deviceToken?: string;
  refreshToken?: string;
}
export const CAPABILITY = /^[A-Za-z0-9_-]{43}$/;
@Injectable()
export class AuthCookies {
  constructor(
    private readonly config: ConfigService,
    private readonly random: AuthRandom,
  ) {}
  options(): CookieOptions {
    return {
      httpOnly: true,
      sameSite: 'lax',
      secure: this.config.get('COOKIE_SECURE') === 'true',
      path: '/',
    };
  }
  name(kind: 'refresh_token' | 'device_token' | 'auth_context') {
    return `${this.options().secure ? '__Host-' : ''}${kind}`;
  }
  get(
    req: Request,
    kind: 'refresh_token' | 'device_token' | 'auth_context',
  ): string | undefined {
    const value: unknown = req.cookies?.[this.name(kind)];
    return typeof value === 'string' ? value : undefined;
  }
  set(
    res: Response,
    kind: 'refresh_token' | 'device_token' | 'auth_context',
    value: string,
    maxAge: number,
  ) {
    res.cookie(this.name(kind), value, { ...this.options(), maxAge });
  }
  clear(
    res: Response,
    kind: 'refresh_token' | 'device_token' | 'auth_context',
  ) {
    res.clearCookie(this.name(kind), this.options());
    if (this.options().secure) res.clearCookie(kind, this.options());
  }
  ensure(req: Request, res: Response) {
    const prior = this.get(req, 'auth_context');
    const raw = prior && CAPABILITY.test(prior) ? prior : this.random.token();
    this.set(res, 'auth_context', raw, 600000);
    req.cookies ??= {};
    req.cookies[this.name('auth_context')] = raw;
    return this.context(req);
  }
  context(req: Request): BrowserContext {
    const token = this.get(req, 'auth_context');
    if (!token || !CAPABILITY.test(token)) throw authError('CHALLENGE_INVALID');
    return {
      contextHash: this.hash(token),
      source: req.ip ?? req.socket.remoteAddress ?? 'unknown',
      userAgent: (req.get('user-agent') ?? '').slice(0, 512),
      deviceToken: this.get(req, 'device_token'),
      refreshToken: this.get(req, 'refresh_token'),
    };
  }
  hash(raw: string) {
    return hmac(this.config.getOrThrow('AUTH_HASH_KEY'), `context:v1|${raw}`);
  }
}
