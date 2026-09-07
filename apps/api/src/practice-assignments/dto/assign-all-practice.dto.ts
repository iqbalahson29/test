import { IsDateString, IsOptional, IsString } from 'class-validator';

export class AssignAllPracticeDto {
  @IsString()
  quizId: string;

  @IsOptional()
  @IsDateString()
  dueAt?: string;
}
