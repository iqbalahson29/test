import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client } from 'google-auth-library';
import { normalizeIdentifier } from '@quiz-platform/shared';
import {
  AuthClock,
  AuthRandom,
  Tx,
  authError,
  plusMs,
  sha256,
} from './security/primitives';
import { AuthPolicyService } from './auth-policy.service';
import { BrowserContext } from './security/cookies';
import { AnyAccessTokenPayload } from './token.types';
import { SessionService } from './session.service';
export interface GoogleFacts {
  sub: string;
  email: string;
  canonical: string;
  name: string;
  authoritative: boolean;
  nonce: string;
}
@Injectable()
export class GoogleService {
  private readonly client = new OAuth2Client();
  constructor(
    private readonly config: ConfigService,
    private readonly clock: AuthClock,
    private readonly random: AuthRandom,
    private readonly policy: AuthPolicyService,
    private readonly sessions: SessionService,
  ) {}
  async nonce(
    tx: Tx,
    intent: 'login' | 'link',
    ctx: BrowserContext,
    actor?: AnyAccessTokenPayload,
  ) {
    this.policy.googleEnabled();
    if (intent === 'link') {
      if (!actor) throw authError('SESSION_INVALID', 401);
      await this.sessions.live(tx, actor);
    }
    const nonce = this.random.token(),
      expiresAt = plusMs(this.clock.now(), 300000);
    await tx.googleNonce.create({
      data: {
        nonceHash: sha256(nonce),
        contextHash: ctx.contextHash,
        intent: intent === 'link' ? 'LINK' : 'LOGIN',
        userId: intent === 'link' ? actor!.sub : null,
        sessionId: intent === 'link' ? actor!.sessionId : null,
        expiresAt,
      },
    });
    return { nonce, expiresAt: expiresAt.toISOString() };
  }
  async verify(credential: string): Promise<GoogleFacts> {
    this.policy.googleEnabled();
    try {
      const audience = this.config.getOrThrow<string>('GOOGLE_CLIENT_ID');
      const ticket = await this.client.verifyIdToken({
        idToken: credential,
        audience,
      });
      const p = ticket.getPayload();
      const now = Math.floor(this.clock.now().getTime() / 1000);
      if (
        !p ||
        !['accounts.google.com', 'https://accounts.google.com'].includes(
          p.iss,
        ) ||
        p.aud !== audience ||
        (p.azp && p.azp !== audience) ||
        p.email_verified !== true ||
        !p.email ||
        typeof p.sub !== 'string' ||
        !p.sub ||
        p.sub.length > 255 ||
        !Number.isInteger(p.exp) ||
        p.exp <= now ||
        !Number.isInteger(p.iat) ||
        p.iat > now + 60 ||
        typeof p.nonce !== 'string' ||
        !/^[A-Za-z0-9_-]{43}$/.test(p.nonce)
      )
        throw new Error();
      const canonical = normalizeIdentifier(p.email).normalized;
      const email = p.email.toLowerCase();
      const authoritative =
        email === canonical &&
        (email.endsWith('@gmail.com') ||
          (typeof p.hd === 'string' && p.hd.length > 0));
      return {
        sub: p.sub,
        email,
        canonical,
        name: (p.name?.trim() || 'Learner').slice(0, 100),
        authoritative,
        nonce: p.nonce,
      };
    } catch {
      throw authError('INVALID_CREDENTIALS', 401);
    }
  }
  async consumeNonce(
    tx: Tx,
    f: GoogleFacts,
    intent: 'LOGIN' | 'LINK',
    ctx: BrowserContext,
    actor?: AnyAccessTokenPayload,
  ) {
    const now = this.clock.now();
    const nonce = await tx.googleNonce.findUnique({
      where: { nonceHash: sha256(f.nonce) },
    });
    if (
      !nonce ||
      nonce.contextHash !== ctx.contextHash ||
      nonce.intent !== intent ||
      nonce.consumedAt ||
      nonce.expiresAt <= now ||
      (intent === 'LINK' &&
        (nonce.userId !== actor?.sub || nonce.sessionId !== actor?.sessionId))
    )
      throw authError('INVALID_CREDENTIALS', 401);
    if (intent === 'LINK') {
      if (!actor) throw authError('SESSION_INVALID', 401);
      await this.sessions.live(tx, actor);
    }
    const changed = await tx.googleNonce.updateMany({
      where: { id: nonce.id, consumedAt: null, expiresAt: { gt: now } },
      data: { consumedAt: now },
    });
    if (changed.count !== 1) throw authError('INVALID_CREDENTIALS', 401);
  }
}
