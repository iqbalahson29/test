import { IsDateString, IsOptional, IsString } from 'class-validator';

export class AssignAllDto {
  @IsString()
  quizId: string;

  @IsOptional()
  @IsDateString()
  dueAt?: string;
}
