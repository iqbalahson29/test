-- AlterTable
ALTER TABLE "Attempt" ADD COLUMN     "lastHeartbeatAt" TIMESTAMP(3),
ADD COLUMN     "lockSessionId" TEXT,
ADD COLUMN     "lockedAt" TIMESTAMP(3);
