import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { BankDifficultyRatioDto, BankModuleTargetsDto } from './bank-mode.dto';

// `mode` is intentionally excluded — immutable after creation, since
// switching a quiz between fixed and bank mode mid-life would orphan its
// existing questions/attempts semantics.
export class UpdatePracticeQuizDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxAttempts?: number;

  @IsOptional()
  @IsBoolean()
  shuffleQuestions?: boolean;

  @IsOptional()
  @IsBoolean()
  shuffleOptions?: boolean;

  @IsOptional()
  @IsBoolean()
  showDifficultyToStudents?: boolean;

  @IsOptional()
  @IsDateString()
  availableFrom?: string;

  @IsOptional()
  @IsDateString()
  availableUntil?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  passMarkPercent?: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => BankModuleTargetsDto)
  bankModuleTargets?: BankModuleTargetsDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => BankDifficultyRatioDto)
  bankDifficultyRatio?: BankDifficultyRatioDto;
}
