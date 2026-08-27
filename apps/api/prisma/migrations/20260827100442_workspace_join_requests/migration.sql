-- CreateTable
CREATE TABLE "WorkspaceJoinRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "status" "TenantRequestStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),

    CONSTRAINT "WorkspaceJoinRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkspaceJoinRequest_tenantId_idx" ON "WorkspaceJoinRequest"("tenantId");

-- CreateIndex
CREATE INDEX "WorkspaceJoinRequest_userId_idx" ON "WorkspaceJoinRequest"("userId");

-- AddForeignKey
ALTER TABLE "WorkspaceJoinRequest" ADD CONSTRAINT "WorkspaceJoinRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceJoinRequest" ADD CONSTRAINT "WorkspaceJoinRequest_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
