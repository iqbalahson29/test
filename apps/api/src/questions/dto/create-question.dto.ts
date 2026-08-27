import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  MinLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { QuestionType } from '@prisma/client';
import { QuestionOptionDto } from './question-option.dto';

export class CreateQuestionDto {
  @IsEnum(QuestionType)
  type: QuestionType;

  @IsString()
  @MinLength(1)
  prompt: string;

  @IsNumber()
  @Min(0)
  points: number;

  // Shape depends on `type` — validated against packages/shared's Zod
  // schemas in QuestionsService, not here.
  @IsObject()
  config: Record<string, unknown>;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuestionOptionDto)
  options?: QuestionOptionDto[];
}
