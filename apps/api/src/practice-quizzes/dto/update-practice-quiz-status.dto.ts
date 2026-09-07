import { IsEnum } from 'class-validator';
import { QuizStatus } from '@prisma/client';

export class UpdatePracticeQuizStatusDto {
  @IsEnum(QuizStatus)
  status: QuizStatus;
}
