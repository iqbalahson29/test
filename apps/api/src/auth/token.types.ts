import { Role } from '@prisma/client';

export interface AccessTokenPayload {
  sub: string;
  membershipId: string;
  tenantId: string;
  role: Role;
  type: 'access';
  /** Identifies this login session, carried through unchanged across
   * refreshes. Used to claim/verify an Attempt's session lock — see
   * SESSION_LOCK_TIMEOUT_MS. */
  sessionId: string;
  /** Snapshot of User.tokenVersion at issuance. Only checked on refresh (not
   * per-request) — an access token stays valid for its own short lifetime
   * even after a password change; refresh() rejects it once that lifetime
   * is up. */
  tokenVersion: number;
}

export interface SuperAdminTokenPayload {
  sub: string;
  type: 'superadmin';
  tokenVersion: number;
}

export interface RefreshTokenPayload {
  sub: string;
  membershipId: string;
  type: 'refresh';
  sessionId: string;
  tokenVersion: number;
}

export interface SuperAdminRefreshTokenPayload {
  sub: string;
  type: 'superadmin-refresh';
  tokenVersion: number;
}

// Issued by login() when a user has multiple memberships, so the client can
// complete workspace selection without re-sending the password. Verified
// manually inside AuthService.selectWorkspace() — deliberately NOT part of
// AnyTokenPayload/JwtStrategy, since it must never be accepted as a Bearer
// access token (JwtAuthGuard already rejects any payload with type !==
// 'access' regardless, so this is defense in depth, not the only guard).
export interface WorkspaceSelectionTokenPayload {
  sub: string;
  type: 'workspace-selection';
}

// Issued by login()/refresh() when a user has zero memberships — a real,
// fully logged-in session (unlike WorkspaceSelectionTokenPayload above),
// just one with no tenant/role to scope it to yet. Usable as a Bearer
// access token for account-level endpoints (profile, workspace directory,
// join requests) via the bare AuthGuard('jwt') — but JwtAuthGuard still
// rejects it for anything requiring a real membership, since its type
// isn't 'access'.
export interface AccountTokenPayload {
  sub: string;
  type: 'account';
  tokenVersion: number;
}

export interface AccountRefreshTokenPayload {
  sub: string;
  type: 'account-refresh';
  tokenVersion: number;
}

export type AnyTokenPayload =
  | AccessTokenPayload
  | SuperAdminTokenPayload
  | RefreshTokenPayload
  | SuperAdminRefreshTokenPayload
  | AccountTokenPayload
  | AccountRefreshTokenPayload;

/** What req.user is set to after JwtStrategy.validate() runs. */
export type AuthenticatedUser =
  | AccessTokenPayload
  | SuperAdminTokenPayload
  | AccountTokenPayload;
