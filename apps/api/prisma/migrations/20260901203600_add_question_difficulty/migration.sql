-- CreateEnum
CREATE TYPE "QuestionDifficulty" AS ENUM ('EASY', 'MEDIUM', 'HARD');

-- AlterTable
ALTER TABLE "Question" ADD COLUMN     "difficulty" "QuestionDifficulty";

-- AlterTable
ALTER TABLE "Quiz" ADD COLUMN     "showDifficultyToStudents" BOOLEAN NOT NULL DEFAULT false;
