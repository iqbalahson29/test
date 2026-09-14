-- Coordinated contract release. Run only after an operator has prepared a clean target.
-- This preflight must precede every schema change; it NEVER resets or merges identities.
BEGIN;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM "User") OR EXISTS (SELECT 1 FROM "TenantRequest") OR EXISTS (SELECT 1 FROM "MemberInvitation") THEN
    RAISE EXCEPTION 'Auth migration requires zero User, TenantRequest and MemberInvitation rows. Stop deployment; confirm target and have the operator back up/prepare a clean database. No data was removed.';
  END IF;
END $$;
-- CreateEnum
CREATE TYPE "IdentityProvider" AS ENUM ('PASSWORD', 'GOOGLE');

-- CreateEnum
CREATE TYPE "SessionContext" AS ENUM ('ACCOUNT', 'MEMBERSHIP', 'SUPERADMIN', 'PICKER');

-- CreateEnum
CREATE TYPE "OtpPurpose" AS ENUM ('SIGNUP_VERIFY', 'LOGIN_VERIFY', 'PASSWORD_RESET', 'STEP_UP', 'TENANT_REQUEST', 'EMAIL_CHANGE');

-- CreateEnum
CREATE TYPE "PrincipalKind" AS ENUM ('USER', 'REGISTRATION', 'TENANT_REQUEST', 'DECOY');

-- CreateEnum
CREATE TYPE "ChallengeState" AS ENUM ('PENDING_SEND', 'READY', 'CONSUMED', 'EXPIRED', 'LOCKED', 'CANCELLED', 'FAILED');

-- CreateEnum
CREATE TYPE "MailSubmission" AS ENUM ('PENDING', 'CONFIRMED', 'FAILED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "DeliveryProvenance" AS ENUM ('BREVO', 'CONSOLE', 'TEST', 'OPERATOR');

-- CreateEnum
CREATE TYPE "GoogleIntent" AS ENUM ('LOGIN', 'LINK');

-- CreateEnum
CREATE TYPE "GrantAction" AS ENUM ('PASSWORD_RESET', 'PASSWORD_CHANGE', 'PASSWORD_SET', 'EMAIL_CHANGE_START', 'GOOGLE_LINK', 'GOOGLE_UNLINK', 'ADMIN_EMAIL_CHANGE', 'ADMIN_PASSWORD_SET', 'ADMIN_SUPPRESSION_CLEAR');

-- CreateEnum
CREATE TYPE "MailCategory" AS ENUM ('OTP', 'INVITE', 'SECURITY');

-- CreateEnum
CREATE TYPE "MailAttemptOutcome" AS ENUM ('RESERVED', 'ACCEPTED', 'REJECTED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "OutboxStatus" AS ENUM ('PENDING', 'SENDING', 'SENT', 'FAILED', 'UNKNOWN', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RecipientState" AS ENUM ('OK', 'SUPPRESSED');

-- AlterEnum
ALTER TYPE "MemberInvitationStatus" ADD VALUE 'EXPIRED';

-- DropForeignKey
ALTER TABLE "PasswordResetToken" DROP CONSTRAINT "PasswordResetToken_userId_fkey";

-- DropIndex
DROP INDEX "User_email_key";

-- DropIndex
DROP INDEX "TenantRequest_slug_key";

-- DropIndex
DROP INDEX "MemberInvitation_token_key";

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "emailNormalized" TEXT NOT NULL,
ADD COLUMN     "emailVerifiedAt" TIMESTAMPTZ(3),
ALTER COLUMN "passwordHash" DROP NOT NULL;

-- AlterTable
ALTER TABLE "TenantRequest" ADD COLUMN     "contextHash" TEXT NOT NULL,
ADD COLUMN     "emailNormalized" TEXT NOT NULL,
ADD COLUMN     "emailVerifiedAt" TIMESTAMPTZ(3),
ADD COLUMN     "expiresAt" TIMESTAMPTZ(3) NOT NULL,
ADD COLUMN     "updatedAt" TIMESTAMPTZ(3) NOT NULL,
ALTER COLUMN "passwordHash" DROP NOT NULL;

-- AlterTable
ALTER TABLE "MemberInvitation" DROP COLUMN "token",
ADD COLUMN     "emailNormalized" TEXT NOT NULL,
ADD COLUMN     "expiresAt" TIMESTAMPTZ(3) NOT NULL,
ADD COLUMN     "lastSentAt" TIMESTAMPTZ(3),
ADD COLUMN     "tokenHash" TEXT NOT NULL,
ADD COLUMN     "updatedAt" TIMESTAMPTZ(3) NOT NULL;

-- DropTable
DROP TABLE "PasswordResetToken";

-- CreateTable
CREATE TABLE "AuthIdentity" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" "IdentityProvider" NOT NULL,
    "providerUserId" TEXT NOT NULL,
    "email" TEXT,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "lastUsedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "AuthIdentity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" UUID NOT NULL,
    "userId" TEXT NOT NULL,
    "membershipId" TEXT,
    "context" "SessionContext" NOT NULL,
    "contextVersion" INTEGER NOT NULL DEFAULT 0,
    "refreshGeneration" INTEGER NOT NULL DEFAULT 0,
    "tokenVersion" INTEGER NOT NULL,
    "authMethods" TEXT[],
    "firstFactorAt" TIMESTAMPTZ(3) NOT NULL,
    "otpVerifiedAt" TIMESTAMPTZ(3),
    "currentRefreshHash" TEXT,
    "currentRefreshJti" TEXT,
    "lastUsedAt" TIMESTAMPTZ(3) NOT NULL,
    "idleExpiresAt" TIMESTAMPTZ(3) NOT NULL,
    "absoluteExpiresAt" TIMESTAMPTZ(3) NOT NULL,
    "revokedAt" TIMESTAMPTZ(3),
    "revokedReason" TEXT,
    "userAgent" VARCHAR(512),
    "ip" VARCHAR(45),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshTokenUse" (
    "id" TEXT NOT NULL,
    "sessionId" UUID NOT NULL,
    "jti" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "issuedAt" TIMESTAMPTZ(3) NOT NULL,
    "jwtExpiresAt" TIMESTAMPTZ(3) NOT NULL,
    "consumedAt" TIMESTAMPTZ(3),
    "graceUntil" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "RefreshTokenUse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrustedDevice" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "label" VARCHAR(100),
    "lastIp" VARCHAR(45),
    "lastUsedAt" TIMESTAMPTZ(3) NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "absoluteExpiresAt" TIMESTAMPTZ(3) NOT NULL,
    "revokedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "TrustedDevice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkspaceSelection" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "sessionId" UUID NOT NULL,
    "contextHash" TEXT NOT NULL,
    "tokenVersion" INTEGER NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "consumedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "WorkspaceSelection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthChallenge" (
    "id" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "purpose" "OtpPurpose" NOT NULL,
    "principalKind" "PrincipalKind" NOT NULL,
    "userId" TEXT,
    "pendingRegistrationId" TEXT,
    "tenantRequestId" TEXT,
    "contextHash" TEXT NOT NULL,
    "emailNormalized" TEXT NOT NULL,
    "userTokenVersion" INTEGER,
    "firstFactor" "IdentityProvider",
    "firstFactorAt" TIMESTAMPTZ(3),
    "loginReasons" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sessionId" UUID,
    "action" "GrantAction",
    "actionTargetHash" TEXT,
    "googleSub" TEXT,
    "googleEmail" TEXT,
    "googleAuthoritative" BOOLEAN,
    "pendingGoogleLinkId" TEXT,
    "invitationId" TEXT,
    "invitationTokenHash" TEXT,
    "pendingEmailChangeId" TEXT,
    "state" "ChallengeState" NOT NULL DEFAULT 'PENDING_SEND',
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "currentGeneration" INTEGER NOT NULL DEFAULT 0,
    "consumedAt" TIMESTAMPTZ(3),
    "failureReason" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "AuthChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailOtp" (
    "id" TEXT NOT NULL,
    "challengeId" TEXT NOT NULL,
    "generation" INTEGER NOT NULL,
    "codeHash" TEXT NOT NULL,
    "pepperVersion" INTEGER NOT NULL,
    "sentTo" TEXT NOT NULL,
    "submission" "MailSubmission" NOT NULL DEFAULT 'PENDING',
    "deliveryProvenance" "DeliveryProvenance" NOT NULL,
    "providerMessageId" TEXT,
    "dispatchId" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "confirmedAt" TIMESTAMPTZ(3),
    "consumedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "EmailOtp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PendingRegistration" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailNormalized" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "provider" "IdentityProvider" NOT NULL,
    "passwordHash" TEXT,
    "googleSub" TEXT,
    "googleEmail" TEXT,
    "googleAuthoritative" BOOLEAN,
    "contextHash" TEXT NOT NULL,
    "invitationId" TEXT,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "completedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PendingRegistration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoogleNonce" (
    "id" TEXT NOT NULL,
    "nonceHash" TEXT NOT NULL,
    "contextHash" TEXT NOT NULL,
    "intent" "GoogleIntent" NOT NULL,
    "userId" TEXT,
    "sessionId" UUID,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "consumedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "GoogleNonce_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PendingGoogleLink" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sessionId" UUID NOT NULL,
    "contextHash" TEXT NOT NULL,
    "googleSub" TEXT NOT NULL,
    "providerEmail" TEXT NOT NULL,
    "authoritative" BOOLEAN NOT NULL,
    "tokenVersion" INTEGER NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "consumedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PendingGoogleLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthGrant" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "sourceChallengeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sessionId" UUID,
    "contextHash" TEXT NOT NULL,
    "action" "GrantAction" NOT NULL,
    "actionTargetHash" TEXT,
    "tokenVersion" INTEGER NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "consumedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "AuthGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PendingEmailChange" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sessionId" UUID NOT NULL,
    "oldEmailNormalized" TEXT NOT NULL,
    "newEmail" TEXT NOT NULL,
    "newEmailNormalized" TEXT NOT NULL,
    "tokenVersion" INTEGER NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "completedAt" TIMESTAMPTZ(3),
    "invalidatedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PendingEmailChange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoginFailure" (
    "identifierHash" TEXT NOT NULL,
    "sourceHash" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "lastFailedAt" TIMESTAMPTZ(3) NOT NULL,
    "nextAllowedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "LoginFailure_pkey" PRIMARY KEY ("identifierHash","sourceHash")
);

-- CreateTable
CREATE TABLE "AccountLoginRisk" (
    "userId" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "lastFailedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "AccountLoginRisk_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "AuthRateBucket" (
    "scope" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "windowStart" TIMESTAMPTZ(3) NOT NULL,
    "count" INTEGER NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "AuthRateBucket_pkey" PRIMARY KEY ("scope","keyHash","windowStart")
);

-- CreateTable
CREATE TABLE "OtpSendReservation" (
    "id" TEXT NOT NULL,
    "recipientHash" TEXT NOT NULL,
    "sourceHash" TEXT NOT NULL,
    "challengeId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "OtpSendReservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MailSendBudget" (
    "day" DATE NOT NULL,
    "totalAttempts" INTEGER NOT NULL DEFAULT 0,
    "otpAttempts" INTEGER NOT NULL DEFAULT 0,
    "nonOtpAttempts" INTEGER NOT NULL DEFAULT 0,
    "budgetAlertedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "MailSendBudget_pkey" PRIMARY KEY ("day")
);

-- CreateTable
CREATE TABLE "MailAttempt" (
    "id" TEXT NOT NULL,
    "dispatchId" TEXT NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "category" "MailCategory" NOT NULL,
    "reservedAt" TIMESTAMPTZ(3) NOT NULL,
    "outcome" "MailAttemptOutcome" NOT NULL DEFAULT 'RESERVED',
    "providerCode" TEXT,
    "providerMessageId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "MailAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MailOutbox" (
    "id" TEXT NOT NULL,
    "category" "MailCategory" NOT NULL,
    "recipient" TEXT NOT NULL,
    "templateType" TEXT NOT NULL,
    "templateVersion" INTEGER NOT NULL DEFAULT 1,
    "payload" JSONB NOT NULL,
    "senderSnapshot" JSONB NOT NULL,
    "appOriginSnapshot" TEXT NOT NULL,
    "renderedPayloadCiphertext" TEXT,
    "payloadKeyVersion" INTEGER,
    "payloadNonce" TEXT,
    "renderedContentHash" TEXT,
    "dispatchId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "status" "OutboxStatus" NOT NULL DEFAULT 'PENDING',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMPTZ(3) NOT NULL,
    "firstAttemptAt" TIMESTAMPTZ(3),
    "leaseOwner" TEXT,
    "leaseExpiresAt" TIMESTAMPTZ(3),
    "lastErrorKind" TEXT,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "MailOutbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MailRecipient" (
    "emailCanonical" TEXT NOT NULL,
    "state" "RecipientState" NOT NULL DEFAULT 'OK',
    "reason" TEXT,
    "suppressedAt" TIMESTAMPTZ(3),
    "softFailureCount" INTEGER NOT NULL DEFAULT 0,
    "lastEventAt" TIMESTAMPTZ(3),
    "lastClearedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "MailRecipient_pkey" PRIMARY KEY ("emailCanonical")
);

-- CreateTable
CREATE TABLE "MailDelivery" (
    "id" TEXT NOT NULL,
    "dispatchId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "messageId" TEXT,
    "recipient" TEXT NOT NULL,
    "category" "MailCategory" NOT NULL,
    "submissionState" "MailSubmission" NOT NULL,
    "deliveryState" TEXT NOT NULL DEFAULT 'pending',
    "lastEventAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "MailDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MailDeliveryEvent" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "providerEventAt" TIMESTAMPTZ(3) NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "receivedAt" TIMESTAMPTZ(3) NOT NULL,
    "reason" TEXT,
    "dispatchId" TEXT,
    "reconciledAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "MailDeliveryEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SecurityEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "sessionId" UUID,
    "actorKey" TEXT,
    "type" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "sourceIpHash" TEXT,
    "metadata" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "SecurityEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperationalAlert" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "acknowledgedAt" TIMESTAMPTZ(3),
    "metadata" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "OperationalAlert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthJobLease" (
    "name" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "AuthJobLease_pkey" PRIMARY KEY ("name")
);

-- CreateTable
CREATE TABLE "CspReport" (
    "id" TEXT NOT NULL,
    "directive" TEXT NOT NULL,
    "blockedUrl" TEXT,
    "documentUrl" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CspReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AuthIdentity_provider_providerUserId_key" ON "AuthIdentity"("provider", "providerUserId");

-- CreateIndex
CREATE UNIQUE INDEX "AuthIdentity_userId_provider_key" ON "AuthIdentity"("userId", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "Session_currentRefreshHash_key" ON "Session"("currentRefreshHash");

-- CreateIndex
CREATE UNIQUE INDEX "Session_currentRefreshJti_key" ON "Session"("currentRefreshJti");

-- CreateIndex
CREATE INDEX "Session_userId_revokedAt_idx" ON "Session"("userId", "revokedAt");

-- CreateIndex
CREATE INDEX "Session_membershipId_idx" ON "Session"("membershipId");

-- CreateIndex
CREATE INDEX "Session_idleExpiresAt_idx" ON "Session"("idleExpiresAt");

-- CreateIndex
CREATE INDEX "Session_absoluteExpiresAt_idx" ON "Session"("absoluteExpiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshTokenUse_jti_key" ON "RefreshTokenUse"("jti");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshTokenUse_tokenHash_key" ON "RefreshTokenUse"("tokenHash");

-- CreateIndex
CREATE INDEX "RefreshTokenUse_sessionId_consumedAt_idx" ON "RefreshTokenUse"("sessionId", "consumedAt");

-- CreateIndex
CREATE INDEX "RefreshTokenUse_jwtExpiresAt_idx" ON "RefreshTokenUse"("jwtExpiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "TrustedDevice_tokenHash_key" ON "TrustedDevice"("tokenHash");

-- CreateIndex
CREATE INDEX "TrustedDevice_userId_expiresAt_idx" ON "TrustedDevice"("userId", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceSelection_tokenHash_key" ON "WorkspaceSelection"("tokenHash");

-- CreateIndex
CREATE INDEX "WorkspaceSelection_expiresAt_idx" ON "WorkspaceSelection"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "AuthChallenge_publicId_key" ON "AuthChallenge"("publicId");

-- CreateIndex
CREATE UNIQUE INDEX "AuthChallenge_pendingEmailChangeId_key" ON "AuthChallenge"("pendingEmailChangeId");

-- CreateIndex
CREATE INDEX "AuthChallenge_userId_purpose_idx" ON "AuthChallenge"("userId", "purpose");

-- CreateIndex
CREATE INDEX "AuthChallenge_pendingRegistrationId_idx" ON "AuthChallenge"("pendingRegistrationId");

-- CreateIndex
CREATE INDEX "AuthChallenge_tenantRequestId_idx" ON "AuthChallenge"("tenantRequestId");

-- CreateIndex
CREATE INDEX "AuthChallenge_sessionId_idx" ON "AuthChallenge"("sessionId");

-- CreateIndex
CREATE INDEX "AuthChallenge_expiresAt_idx" ON "AuthChallenge"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "EmailOtp_dispatchId_key" ON "EmailOtp"("dispatchId");

-- CreateIndex
CREATE INDEX "EmailOtp_expiresAt_idx" ON "EmailOtp"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "EmailOtp_challengeId_generation_key" ON "EmailOtp"("challengeId", "generation");

-- CreateIndex
CREATE INDEX "PendingRegistration_emailNormalized_idx" ON "PendingRegistration"("emailNormalized");

-- CreateIndex
CREATE INDEX "PendingRegistration_expiresAt_idx" ON "PendingRegistration"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "GoogleNonce_nonceHash_key" ON "GoogleNonce"("nonceHash");

-- CreateIndex
CREATE INDEX "GoogleNonce_expiresAt_idx" ON "GoogleNonce"("expiresAt");

-- CreateIndex
CREATE INDEX "PendingGoogleLink_userId_sessionId_idx" ON "PendingGoogleLink"("userId", "sessionId");

-- CreateIndex
CREATE INDEX "PendingGoogleLink_expiresAt_idx" ON "PendingGoogleLink"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "AuthGrant_tokenHash_key" ON "AuthGrant"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "AuthGrant_sourceChallengeId_key" ON "AuthGrant"("sourceChallengeId");

-- CreateIndex
CREATE INDEX "AuthGrant_expiresAt_idx" ON "AuthGrant"("expiresAt");

-- CreateIndex
CREATE INDEX "AuthGrant_userId_idx" ON "AuthGrant"("userId");

-- CreateIndex
CREATE INDEX "PendingEmailChange_expiresAt_idx" ON "PendingEmailChange"("expiresAt");

-- CreateIndex
CREATE INDEX "LoginFailure_lastFailedAt_idx" ON "LoginFailure"("lastFailedAt");

-- CreateIndex
CREATE INDEX "AuthRateBucket_expiresAt_idx" ON "AuthRateBucket"("expiresAt");

-- CreateIndex
CREATE INDEX "OtpSendReservation_recipientHash_createdAt_idx" ON "OtpSendReservation"("recipientHash", "createdAt");

-- CreateIndex
CREATE INDEX "OtpSendReservation_sourceHash_createdAt_idx" ON "OtpSendReservation"("sourceHash", "createdAt");

-- CreateIndex
CREATE INDEX "MailAttempt_reservedAt_category_idx" ON "MailAttempt"("reservedAt", "category");

-- CreateIndex
CREATE UNIQUE INDEX "MailAttempt_dispatchId_attemptNumber_key" ON "MailAttempt"("dispatchId", "attemptNumber");

-- CreateIndex
CREATE UNIQUE INDEX "MailOutbox_dispatchId_key" ON "MailOutbox"("dispatchId");

-- CreateIndex
CREATE UNIQUE INDEX "MailOutbox_idempotencyKey_key" ON "MailOutbox"("idempotencyKey");

-- CreateIndex
CREATE INDEX "MailOutbox_status_nextAttemptAt_idx" ON "MailOutbox"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "MailOutbox_leaseExpiresAt_idx" ON "MailOutbox"("leaseExpiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "MailDelivery_dispatchId_key" ON "MailDelivery"("dispatchId");

-- CreateIndex
CREATE INDEX "MailDelivery_createdAt_idx" ON "MailDelivery"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MailDelivery_provider_messageId_recipient_key" ON "MailDelivery"("provider", "messageId", "recipient");

-- CreateIndex
CREATE INDEX "MailDeliveryEvent_messageId_recipient_idx" ON "MailDeliveryEvent"("messageId", "recipient");

-- CreateIndex
CREATE INDEX "MailDeliveryEvent_receivedAt_idx" ON "MailDeliveryEvent"("receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "mail_event_dedup" ON "MailDeliveryEvent"("provider", "messageId", "recipient", "event", "providerEventAt", "payloadHash");

-- CreateIndex
CREATE INDEX "SecurityEvent_userId_createdAt_idx" ON "SecurityEvent"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "SecurityEvent_type_createdAt_idx" ON "SecurityEvent"("type", "createdAt");

-- CreateIndex
CREATE INDEX "SecurityEvent_createdAt_idx" ON "SecurityEvent"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "OperationalAlert_dedupeKey_key" ON "OperationalAlert"("dedupeKey");

-- CreateIndex
CREATE INDEX "OperationalAlert_createdAt_idx" ON "OperationalAlert"("createdAt");

-- CreateIndex
CREATE INDEX "CspReport_createdAt_idx" ON "CspReport"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "User_emailNormalized_key" ON "User"("emailNormalized");

-- CreateIndex
CREATE UNIQUE INDEX "MemberInvitation_tokenHash_key" ON "MemberInvitation"("tokenHash");

-- AddForeignKey
ALTER TABLE "AuthIdentity" ADD CONSTRAINT "AuthIdentity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "Membership"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshTokenUse" ADD CONSTRAINT "RefreshTokenUse_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrustedDevice" ADD CONSTRAINT "TrustedDevice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceSelection" ADD CONSTRAINT "WorkspaceSelection_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthChallenge" ADD CONSTRAINT "AuthChallenge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthChallenge" ADD CONSTRAINT "AuthChallenge_pendingRegistrationId_fkey" FOREIGN KEY ("pendingRegistrationId") REFERENCES "PendingRegistration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthChallenge" ADD CONSTRAINT "AuthChallenge_tenantRequestId_fkey" FOREIGN KEY ("tenantRequestId") REFERENCES "TenantRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthChallenge" ADD CONSTRAINT "AuthChallenge_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthChallenge" ADD CONSTRAINT "AuthChallenge_pendingGoogleLinkId_fkey" FOREIGN KEY ("pendingGoogleLinkId") REFERENCES "PendingGoogleLink"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthChallenge" ADD CONSTRAINT "AuthChallenge_invitationId_fkey" FOREIGN KEY ("invitationId") REFERENCES "MemberInvitation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthChallenge" ADD CONSTRAINT "AuthChallenge_pendingEmailChangeId_fkey" FOREIGN KEY ("pendingEmailChangeId") REFERENCES "PendingEmailChange"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailOtp" ADD CONSTRAINT "EmailOtp_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "AuthChallenge"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PendingRegistration" ADD CONSTRAINT "PendingRegistration_invitationId_fkey" FOREIGN KEY ("invitationId") REFERENCES "MemberInvitation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoogleNonce" ADD CONSTRAINT "GoogleNonce_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoogleNonce" ADD CONSTRAINT "GoogleNonce_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PendingGoogleLink" ADD CONSTRAINT "PendingGoogleLink_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PendingGoogleLink" ADD CONSTRAINT "PendingGoogleLink_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthGrant" ADD CONSTRAINT "AuthGrant_sourceChallengeId_fkey" FOREIGN KEY ("sourceChallengeId") REFERENCES "AuthChallenge"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthGrant" ADD CONSTRAINT "AuthGrant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthGrant" ADD CONSTRAINT "AuthGrant_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PendingEmailChange" ADD CONSTRAINT "PendingEmailChange_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PendingEmailChange" ADD CONSTRAINT "PendingEmailChange_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountLoginRisk" ADD CONSTRAINT "AccountLoginRisk_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SecurityEvent" ADD CONSTRAINT "SecurityEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SecurityEvent" ADD CONSTRAINT "SecurityEvent_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE SET NULL ON UPDATE CASCADE;


ALTER TABLE "User" ADD CONSTRAINT "user_token_version_nonnegative" CHECK ("tokenVersion" >= 0);
ALTER TABLE "Session" ADD CONSTRAINT "session_versions_nonnegative" CHECK ("tokenVersion">=0 AND "contextVersion">=0 AND "refreshGeneration">=0);
ALTER TABLE "Session" ADD CONSTRAINT "session_deadlines" CHECK ("idleExpiresAt"<="absoluteExpiresAt");
ALTER TABLE "AuthChallenge" ADD CONSTRAINT "challenge_principal" CHECK (
 ("principalKind"='USER' AND "userId" IS NOT NULL AND "pendingRegistrationId" IS NULL AND "tenantRequestId" IS NULL) OR
 ("principalKind"='REGISTRATION' AND "userId" IS NULL AND "pendingRegistrationId" IS NOT NULL AND "tenantRequestId" IS NULL) OR
 ("principalKind"='TENANT_REQUEST' AND "userId" IS NULL AND "pendingRegistrationId" IS NULL AND "tenantRequestId" IS NOT NULL) OR
 ("principalKind"='DECOY' AND "userId" IS NULL AND "pendingRegistrationId" IS NULL AND "tenantRequestId" IS NULL));
ALTER TABLE "AuthChallenge" ADD CONSTRAINT "challenge_purpose_state" CHECK (
 "attempts" BETWEEN 0 AND 5 AND "currentGeneration">=0 AND
 ("purpose" <> 'STEP_UP' OR ("sessionId" IS NOT NULL AND "action" IS NOT NULL AND "action" <> 'PASSWORD_RESET' AND "actionTargetHash" IS NOT NULL)) AND
 ("purpose" <> 'EMAIL_CHANGE' OR ("pendingEmailChangeId" IS NOT NULL AND "sessionId" IS NOT NULL)) AND
 ("action" IS DISTINCT FROM 'GOOGLE_LINK' OR "pendingGoogleLinkId" IS NOT NULL));
ALTER TABLE "PendingRegistration" ADD CONSTRAINT "registration_credentials" CHECK (
 ("completedAt" IS NOT NULL AND "passwordHash" IS NULL AND "googleSub" IS NULL AND "googleEmail" IS NULL AND "googleAuthoritative" IS NULL) OR
 ("completedAt" IS NULL AND (("provider"='PASSWORD' AND "passwordHash" IS NOT NULL AND "googleSub" IS NULL) OR
 ("provider"='GOOGLE' AND "passwordHash" IS NULL AND "googleSub" IS NOT NULL AND "googleEmail" IS NOT NULL AND "googleAuthoritative" IS NOT NULL))));
ALTER TABLE "GoogleNonce" ADD CONSTRAINT "nonce_intent" CHECK (("intent"='LOGIN' AND "userId" IS NULL AND "sessionId" IS NULL) OR ("intent"='LINK' AND "userId" IS NOT NULL AND "sessionId" IS NOT NULL));
ALTER TABLE "AuthGrant" ADD CONSTRAINT "grant_session" CHECK (("action"='PASSWORD_RESET' AND "sessionId" IS NULL) OR ("action"<>'PASSWORD_RESET' AND "sessionId" IS NOT NULL AND "actionTargetHash" IS NOT NULL));
ALTER TABLE "AuthIdentity" ADD CONSTRAINT "password_provider_key" CHECK ("provider"<>'PASSWORD' OR "providerUserId"="userId");
ALTER TABLE "MailSendBudget" ADD CONSTRAINT "mail_budget_counts" CHECK ("totalAttempts"="otpAttempts"+"nonOtpAttempts" AND "otpAttempts">=0 AND "nonOtpAttempts">=0 AND "totalAttempts"<=200 AND "nonOtpAttempts"<=50);
ALTER TABLE "MailOutbox" ADD CONSTRAINT "no_durable_otp" CHECK ("category"<>'OTP' AND "attemptCount" BETWEEN 0 AND 6);
CREATE UNIQUE INDEX "one_live_picker" ON "WorkspaceSelection"("sessionId") WHERE "consumedAt" IS NULL;
CREATE UNIQUE INDEX "one_pending_email_change" ON "PendingEmailChange"("userId") WHERE "completedAt" IS NULL AND "invalidatedAt" IS NULL;
CREATE UNIQUE INDEX "one_verified_pending_requester" ON "TenantRequest"("emailNormalized") WHERE "status"='PENDING' AND "emailVerifiedAt" IS NOT NULL;
CREATE UNIQUE INDEX "one_verified_pending_slug" ON "TenantRequest"("slug") WHERE "status"='PENDING' AND "emailVerifiedAt" IS NOT NULL;
CREATE UNIQUE INDEX "one_pending_invitation" ON "MemberInvitation"("tenantId","emailNormalized") WHERE "status"='PENDING';
CREATE INDEX "request_expiry" ON "TenantRequest"("expiresAt");
CREATE INDEX "request_email_status" ON "TenantRequest"("emailNormalized","status");
CREATE INDEX "invitation_expiry" ON "MemberInvitation"("expiresAt");
-- Deferred checks permit creation/rotation in one transaction, never an invalid committed session.
CREATE FUNCTION check_auth_session() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE s "Session"; BEGIN
  SELECT * INTO s FROM "Session" WHERE id=NEW.id;
  IF FOUND AND s."revokedAt" IS NULL AND (
    (s.context='MEMBERSHIP') IS DISTINCT FROM (s."membershipId" IS NOT NULL) OR
    (s.context='PICKER' AND (s."currentRefreshHash" IS NOT NULL OR s."currentRefreshJti" IS NOT NULL)) OR
    (s.context<>'PICKER' AND (s."currentRefreshHash" IS NULL OR s."currentRefreshJti" IS NULL))
  ) THEN RAISE EXCEPTION 'Invalid session context'; END IF; RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER "auth_session_consistency" AFTER INSERT OR UPDATE ON "Session" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_auth_session();
CREATE FUNCTION check_auth_grant() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE purpose "OtpPurpose"; BEGIN
  SELECT "purpose" INTO purpose FROM "AuthChallenge" WHERE id=NEW."sourceChallengeId";
  IF (NEW.action='PASSWORD_RESET' AND purpose<>'PASSWORD_RESET') OR (NEW.action<>'PASSWORD_RESET' AND purpose<>'STEP_UP') THEN RAISE EXCEPTION 'Invalid grant source'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "grant_source_purpose" BEFORE INSERT OR UPDATE ON "AuthGrant" FOR EACH ROW EXECUTE FUNCTION check_auth_grant();
-- Password identity equivalence is checked at commit, covering every administrative writer too.
CREATE FUNCTION check_password_identity() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE uid text; has_password boolean; has_identity boolean; BEGIN
  IF TG_TABLE_NAME='User' THEN uid=NEW.id; ELSE uid=COALESCE(NEW."userId",OLD."userId"); END IF;
  SELECT "passwordHash" IS NOT NULL INTO has_password FROM "User" WHERE id=uid;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT EXISTS(SELECT 1 FROM "AuthIdentity" WHERE "userId"=uid AND provider='PASSWORD') INTO has_identity;
  IF has_password IS DISTINCT FROM has_identity THEN RAISE EXCEPTION 'Password identity invariant violated'; END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER "user_password_identity" AFTER INSERT OR UPDATE ON "User" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_password_identity();
CREATE CONSTRAINT TRIGGER "identity_password_identity" AFTER INSERT OR UPDATE OR DELETE ON "AuthIdentity" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_password_identity();
COMMIT;
