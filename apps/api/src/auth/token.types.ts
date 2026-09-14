import { Role } from '@prisma/client';
export interface TokenClaims {
  sub: string;
  sessionId: string;
  tokenVersion: number;
  contextVersion: number;
  refreshGeneration: number;
  iat: number;
  exp: number;
  iss: string;
  aud: string;
  jti: string;
}
export interface AccessTokenPayload extends TokenClaims {
  type: 'access';
  membershipId: string;
  tenantId: string;
  role: Role;
}
export interface SuperAdminTokenPayload extends TokenClaims {
  type: 'superadmin';
}
export interface AccountTokenPayload extends TokenClaims {
  type: 'account';
}
export interface RefreshTokenPayload extends TokenClaims {
  type: 'refresh';
  membershipId: string;
}
export interface SuperAdminRefreshTokenPayload extends TokenClaims {
  type: 'superadmin-refresh';
}
export interface AccountRefreshTokenPayload extends TokenClaims {
  type: 'account-refresh';
}
export type AnyAccessTokenPayload =
  AccessTokenPayload | SuperAdminTokenPayload | AccountTokenPayload;
export type AnyRefreshTokenPayload =
  | RefreshTokenPayload
  | SuperAdminRefreshTokenPayload
  | AccountRefreshTokenPayload;
export type AnyTokenPayload = AnyAccessTokenPayload;
export type AuthenticatedUser = AnyAccessTokenPayload;
