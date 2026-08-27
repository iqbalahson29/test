-- DropIndex
DROP INDEX "Membership_userId_key";

-- CreateIndex
CREATE UNIQUE INDEX "Membership_userId_tenantId_key" ON "Membership"("userId", "tenantId");
