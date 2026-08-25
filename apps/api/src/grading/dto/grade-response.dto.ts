import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class GradeResponseDto {
  @IsNumber()
  @Min(0)
  awardedPoints: number;

  @IsOptional()
  @IsString()
  feedback?: string;
}
