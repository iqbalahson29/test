import { IsString } from 'class-validator';

export class StartPracticeAttemptDto {
  @IsString()
  quizId: string;
}
