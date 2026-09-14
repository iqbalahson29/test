import type { Role } from '../roles.js';
export interface MembershipSummary { membershipId: string; tenantId: string; tenantName: string; role: Role }
export type OtpRequired = { status: 'otp-required'; challengeId: string; maskedEmail: string; expiresAt: string; resendAfterSeconds: 60 };
export type SessionResult =
  | { status: 'ok'; accessToken: string; membership: MembershipSummary }
  | { status: 'no-workspace'; accessToken: string }
  | { status: 'superadmin'; accessToken: string }
  | { status: 'choose-workspace'; selectionToken: string; choices: MembershipSummary[] };
export type RefreshResult = Exclude<SessionResult, {status: 'choose-workspace'}>;
export type GrantResult = { status: 'verified'; grantToken: string; expiresAt: string };
export type PendingRequestResult = { status: 'workspace-request-pending' };
export const AUTH_ACTIONS = ['PASSWORD_CHANGE','PASSWORD_SET','EMAIL_CHANGE_START','GOOGLE_LINK','GOOGLE_UNLINK','ADMIN_EMAIL_CHANGE','ADMIN_PASSWORD_SET','ADMIN_SUPPRESSION_CLEAR'] as const;
export type AuthAction = typeof AUTH_ACTIONS[number];
export type AuthResult = SessionResult | OtpRequired | PendingRequestResult;
