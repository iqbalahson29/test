-- CreateTable
CREATE TABLE "PracticeQuiz" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "createdByMembershipId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "maxAttempts" INTEGER,
    "shuffleQuestions" BOOLEAN NOT NULL DEFAULT false,
    "shuffleOptions" BOOLEAN NOT NULL DEFAULT false,
    "showDifficultyToStudents" BOOLEAN NOT NULL DEFAULT false,
    "availableFrom" TIMESTAMP(3),
    "availableUntil" TIMESTAMP(3),
    "passMarkPercent" DECIMAL(5,2),
    "status" "QuizStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PracticeQuiz_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PracticeQuestion" (
    "id" TEXT NOT NULL,
    "quizId" TEXT NOT NULL,
    "module" "QuizModule" NOT NULL,
    "type" "QuestionType" NOT NULL,
    "prompt" TEXT NOT NULL,
    "points" DECIMAL(6,2) NOT NULL,
    "order" INTEGER NOT NULL,
    "config" JSONB NOT NULL DEFAULT '{}',
    "difficulty" "QuestionDifficulty",
    "attachmentKey" TEXT,
    "attachmentFilename" TEXT,
    "attachmentMimeType" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PracticeQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PracticeQuestionOption" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "isCorrect" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL,

    CONSTRAINT "PracticeQuestionOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PracticeQuizAssignment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "quizId" TEXT NOT NULL,
    "studentMembershipId" TEXT,
    "groupId" TEXT,
    "assignedByMembershipId" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PracticeQuizAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PracticeAttempt" (
    "id" TEXT NOT NULL,
    "quizId" TEXT NOT NULL,
    "studentMembershipId" TEXT NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "status" "AttemptStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" TIMESTAMP(3),
    "score" DECIMAL(7,2),
    "maxScore" DECIMAL(7,2),
    "lockSessionId" TEXT,
    "lockedAt" TIMESTAMP(3),
    "lastHeartbeatAt" TIMESTAMP(3),

    CONSTRAINT "PracticeAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PracticeAttemptModuleProgress" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "module" "QuizModule" NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" TIMESTAMP(3),
    "autoSubmitted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "PracticeAttemptModuleProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PracticeResponse" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "answer" JSONB,
    "fileKey" TEXT,
    "awardedPoints" DECIMAL(6,2),
    "autoGraded" BOOLEAN NOT NULL DEFAULT false,
    "gradedByMembershipId" TEXT,
    "feedback" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PracticeResponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PracticeAuditLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "practiceQuizId" TEXT,
    "actorMembershipId" TEXT,
    "action" TEXT NOT NULL,
    "detail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PracticeAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PracticeQuiz_tenantId_idx" ON "PracticeQuiz"("tenantId");

-- CreateIndex
CREATE INDEX "PracticeQuestion_quizId_idx" ON "PracticeQuestion"("quizId");

-- CreateIndex
CREATE INDEX "PracticeQuestionOption_questionId_idx" ON "PracticeQuestionOption"("questionId");

-- CreateIndex
CREATE INDEX "PracticeQuizAssignment_tenantId_idx" ON "PracticeQuizAssignment"("tenantId");

-- CreateIndex
CREATE INDEX "PracticeQuizAssignment_quizId_idx" ON "PracticeQuizAssignment"("quizId");

-- CreateIndex
CREATE INDEX "PracticeAttempt_quizId_idx" ON "PracticeAttempt"("quizId");

-- CreateIndex
CREATE INDEX "PracticeAttempt_studentMembershipId_idx" ON "PracticeAttempt"("studentMembershipId");

-- CreateIndex
CREATE UNIQUE INDEX "PracticeAttempt_quizId_studentMembershipId_attemptNumber_key" ON "PracticeAttempt"("quizId", "studentMembershipId", "attemptNumber");

-- CreateIndex
CREATE INDEX "PracticeAttemptModuleProgress_attemptId_idx" ON "PracticeAttemptModuleProgress"("attemptId");

-- CreateIndex
CREATE UNIQUE INDEX "PracticeAttemptModuleProgress_attemptId_module_key" ON "PracticeAttemptModuleProgress"("attemptId", "module");

-- CreateIndex
CREATE INDEX "PracticeResponse_attemptId_idx" ON "PracticeResponse"("attemptId");

-- CreateIndex
CREATE UNIQUE INDEX "PracticeResponse_attemptId_questionId_key" ON "PracticeResponse"("attemptId", "questionId");

-- CreateIndex
CREATE INDEX "PracticeAuditLog_practiceQuizId_idx" ON "PracticeAuditLog"("practiceQuizId");

-- CreateIndex
CREATE INDEX "PracticeAuditLog_tenantId_idx" ON "PracticeAuditLog"("tenantId");

-- AddForeignKey
ALTER TABLE "PracticeQuiz" ADD CONSTRAINT "PracticeQuiz_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PracticeQuiz" ADD CONSTRAINT "PracticeQuiz_createdByMembershipId_fkey" FOREIGN KEY ("createdByMembershipId") REFERENCES "Membership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PracticeQuestion" ADD CONSTRAINT "PracticeQuestion_quizId_fkey" FOREIGN KEY ("quizId") REFERENCES "PracticeQuiz"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PracticeQuestionOption" ADD CONSTRAINT "PracticeQuestionOption_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "PracticeQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PracticeQuizAssignment" ADD CONSTRAINT "PracticeQuizAssignment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PracticeQuizAssignment" ADD CONSTRAINT "PracticeQuizAssignment_quizId_fkey" FOREIGN KEY ("quizId") REFERENCES "PracticeQuiz"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PracticeQuizAssignment" ADD CONSTRAINT "PracticeQuizAssignment_studentMembershipId_fkey" FOREIGN KEY ("studentMembershipId") REFERENCES "Membership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PracticeQuizAssignment" ADD CONSTRAINT "PracticeQuizAssignment_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PracticeQuizAssignment" ADD CONSTRAINT "PracticeQuizAssignment_assignedByMembershipId_fkey" FOREIGN KEY ("assignedByMembershipId") REFERENCES "Membership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PracticeAttempt" ADD CONSTRAINT "PracticeAttempt_quizId_fkey" FOREIGN KEY ("quizId") REFERENCES "PracticeQuiz"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PracticeAttempt" ADD CONSTRAINT "PracticeAttempt_studentMembershipId_fkey" FOREIGN KEY ("studentMembershipId") REFERENCES "Membership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PracticeAttemptModuleProgress" ADD CONSTRAINT "PracticeAttemptModuleProgress_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "PracticeAttempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PracticeResponse" ADD CONSTRAINT "PracticeResponse_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "PracticeAttempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PracticeResponse" ADD CONSTRAINT "PracticeResponse_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "PracticeQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PracticeResponse" ADD CONSTRAINT "PracticeResponse_gradedByMembershipId_fkey" FOREIGN KEY ("gradedByMembershipId") REFERENCES "Membership"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PracticeAuditLog" ADD CONSTRAINT "PracticeAuditLog_practiceQuizId_fkey" FOREIGN KEY ("practiceQuizId") REFERENCES "PracticeQuiz"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PracticeAuditLog" ADD CONSTRAINT "PracticeAuditLog_actorMembershipId_fkey" FOREIGN KEY ("actorMembershipId") REFERENCES "Membership"("id") ON DELETE SET NULL ON UPDATE CASCADE;
