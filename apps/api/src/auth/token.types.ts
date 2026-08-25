import { Role } from '@prisma/client';

export interface AccessTokenPayload {
  sub: string;
  membershipId: string;
  tenantId: string;
  role: Role;
  type: 'access';
}

export interface SuperAdminTokenPayload {
  sub: string;
  type: 'superadmin';
}

export interface RefreshTokenPayload {
  sub: string;
  membershipId: string;
  type: 'refresh';
}

export interface SuperAdminRefreshTokenPayload {
  sub: string;
  type: 'superadmin-refresh';
}

export type AnyTokenPayload =
  | AccessTokenPayload
  | SuperAdminTokenPayload
  | RefreshTokenPayload
  | SuperAdminRefreshTokenPayload;

/** What req.user is set to after JwtStrategy.validate() runs. */
export type AuthenticatedUser = AccessTokenPayload | SuperAdminTokenPayload;
