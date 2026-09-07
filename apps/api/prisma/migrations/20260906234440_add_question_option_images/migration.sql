-- AlterTable
ALTER TABLE "PracticeAttemptQuestion" ADD COLUMN     "imageFilename" TEXT,
ADD COLUMN     "imageKey" TEXT,
ADD COLUMN     "imageMimeType" TEXT;

-- AlterTable
ALTER TABLE "PracticeAttemptQuestionOption" ADD COLUMN     "imageFilename" TEXT,
ADD COLUMN     "imageKey" TEXT,
ADD COLUMN     "imageMimeType" TEXT;

-- AlterTable
ALTER TABLE "PracticeQuestion" ADD COLUMN     "imageFilename" TEXT,
ADD COLUMN     "imageKey" TEXT,
ADD COLUMN     "imageMimeType" TEXT;

-- AlterTable
ALTER TABLE "PracticeQuestionOption" ADD COLUMN     "imageFilename" TEXT,
ADD COLUMN     "imageKey" TEXT,
ADD COLUMN     "imageMimeType" TEXT;

-- AlterTable
ALTER TABLE "Question" ADD COLUMN     "imageFilename" TEXT,
ADD COLUMN     "imageKey" TEXT,
ADD COLUMN     "imageMimeType" TEXT;

-- AlterTable
ALTER TABLE "QuestionOption" ADD COLUMN     "imageFilename" TEXT,
ADD COLUMN     "imageKey" TEXT,
ADD COLUMN     "imageMimeType" TEXT;
