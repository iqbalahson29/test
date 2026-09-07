-- CreateEnum
CREATE TYPE "PracticeQuizMode" AS ENUM ('FIXED', 'BANK');

-- AlterTable
ALTER TABLE "PracticeQuiz" ADD COLUMN     "bankDifficultyRatio" JSONB,
ADD COLUMN     "bankModuleTargets" JSONB,
ADD COLUMN     "mode" "PracticeQuizMode" NOT NULL DEFAULT 'FIXED';

-- CreateTable
CREATE TABLE "PracticeAttemptQuestion" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
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
    "sourceQuestionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PracticeAttemptQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PracticeAttemptQuestionOption" (
    "id" TEXT NOT NULL,
    "attemptQuestionId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "isCorrect" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL,

    CONSTRAINT "PracticeAttemptQuestionOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PracticeAttemptResponse" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "attemptQuestionId" TEXT NOT NULL,
    "answer" JSONB,
    "awardedPoints" DECIMAL(6,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PracticeAttemptResponse_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PracticeAttemptQuestion_attemptId_idx" ON "PracticeAttemptQuestion"("attemptId");

-- CreateIndex
CREATE INDEX "PracticeAttemptQuestionOption_attemptQuestionId_idx" ON "PracticeAttemptQuestionOption"("attemptQuestionId");

-- CreateIndex
CREATE UNIQUE INDEX "PracticeAttemptResponse_attemptQuestionId_key" ON "PracticeAttemptResponse"("attemptQuestionId");

-- CreateIndex
CREATE INDEX "PracticeAttemptResponse_attemptId_idx" ON "PracticeAttemptResponse"("attemptId");

-- AddForeignKey
ALTER TABLE "PracticeAttemptQuestion" ADD CONSTRAINT "PracticeAttemptQuestion_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "PracticeAttempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PracticeAttemptQuestionOption" ADD CONSTRAINT "PracticeAttemptQuestionOption_attemptQuestionId_fkey" FOREIGN KEY ("attemptQuestionId") REFERENCES "PracticeAttemptQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PracticeAttemptResponse" ADD CONSTRAINT "PracticeAttemptResponse_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "PracticeAttempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PracticeAttemptResponse" ADD CONSTRAINT "PracticeAttemptResponse_attemptQuestionId_fkey" FOREIGN KEY ("attemptQuestionId") REFERENCES "PracticeAttemptQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
