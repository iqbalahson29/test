/*
  Warnings:

  - You are about to drop the column `calculatorAllowed` on the `Quiz` table. All the data in the column will be lost.
  - You are about to drop the column `timeLimitSec` on the `Quiz` table. All the data in the column will be lost.
  - Added the required column `module` to the `Question` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "QuizModule" AS ENUM ('RW_MODULE_1', 'RW_MODULE_2', 'MATH_MODULE_1', 'MATH_MODULE_2');

-- AlterTable
ALTER TABLE "Question" ADD COLUMN     "module" "QuizModule" NOT NULL;

-- AlterTable
ALTER TABLE "Quiz" DROP COLUMN "calculatorAllowed",
DROP COLUMN "timeLimitSec";

-- CreateTable
CREATE TABLE "AttemptModuleProgress" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "module" "QuizModule" NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" TIMESTAMP(3),
    "autoSubmitted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "AttemptModuleProgress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AttemptModuleProgress_attemptId_idx" ON "AttemptModuleProgress"("attemptId");

-- CreateIndex
CREATE UNIQUE INDEX "AttemptModuleProgress_attemptId_module_key" ON "AttemptModuleProgress"("attemptId", "module");

-- AddForeignKey
ALTER TABLE "AttemptModuleProgress" ADD CONSTRAINT "AttemptModuleProgress_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "Attempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;
