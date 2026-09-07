import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class GradePracticeResponseDto {
  @IsNumber()
  @Min(0)
  awardedPoints: number;

  @IsOptional()
  @IsString()
  feedback?: string;
}
