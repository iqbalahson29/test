import { IsOptional, IsString } from 'class-validator';

export class SavePracticeResponseDto {
  // Shape depends on question type and isn't schema-validated here — grading
  // is where per-type parsing actually matters.
  @IsOptional()
  answer?: unknown;

  @IsOptional()
  @IsString()
  fileKey?: string;
}
