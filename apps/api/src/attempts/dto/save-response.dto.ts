import { IsOptional, IsString } from 'class-validator';

export class SaveResponseDto {
  // Shape depends on question type and isn't schema-validated yet (see
  // Phase 3 plan notes) — grading in Phase 4 is where per-type parsing
  // actually matters.
  @IsOptional()
  answer?: unknown;

  @IsOptional()
  @IsString()
  fileKey?: string;
}
