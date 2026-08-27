import { IsEnum } from 'class-validator';
import { QuizStatus } from '@prisma/client';

export class UpdateQuizStatusDto {
  @IsEnum(QuizStatus)
  status: QuizStatus;
}
