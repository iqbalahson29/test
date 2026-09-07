import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { PracticeQuizMode } from '@prisma/client';
import { BankDifficultyRatioDto, BankModuleTargetsDto } from './bank-mode.dto';

export class CreatePracticeQuizDto {
  @IsString()
  @MinLength(1)
  title: string;

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

  // Set once at creation, never changed afterward — see PracticeQuizMode.
  @IsOptional()
  @IsEnum(PracticeQuizMode)
  mode?: PracticeQuizMode;

  // Required (and validated for full module coverage + ratio summing to
  // 100) by PracticeQuizzesService when mode === BANK; ignored for FIXED.
  @IsOptional()
  @ValidateNested()
  @Type(() => BankModuleTargetsDto)
  bankModuleTargets?: BankModuleTargetsDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => BankDifficultyRatioDto)
  bankDifficultyRatio?: BankDifficultyRatioDto;
}
