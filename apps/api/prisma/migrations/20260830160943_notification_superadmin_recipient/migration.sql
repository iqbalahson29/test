-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "recipientUserId" TEXT,
ALTER COLUMN "tenantId" DROP NOT NULL,
ALTER COLUMN "membershipId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "Notification_recipientUserId_read_idx" ON "Notification"("recipientUserId", "read");

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_recipientUserId_fkey" FOREIGN KEY ("recipientUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
