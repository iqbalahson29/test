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
import { QuestionDifficulty, QuestionType, QuizModule } from '@prisma/client';
import { QuestionOptionDto } from './question-option.dto';

export class CreateQuestionDto {
  @IsEnum(QuestionType)
  type: QuestionType;

  @IsEnum(QuizModule)
  module: QuizModule;

  @IsString()
  @MinLength(1)
  prompt: string;

  @IsNumber()
  @Min(0)
  points: number;

  @IsOptional()
  @IsEnum(QuestionDifficulty)
  difficulty?: QuestionDifficulty;

  // Shape depends on `type` — validated against packages/shared's Zod
  // schemas in QuestionsService, not here.
  @IsObject()
  config: Record<string, unknown>;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuestionOptionDto)
  options?: QuestionOptionDto[];

  // Set together after calling the attachment-upload-url endpoint and
  // PUTting the file to S3 — see QuestionsService.
  @IsOptional()
  @IsString()
  attachmentKey?: string;

  @IsOptional()
  @IsString()
  attachmentFilename?: string;

  @IsOptional()
  @IsString()
  attachmentMimeType?: string;

  // Set together after calling the attachment-upload-url endpoint (with an
  // image content type) and PUTting the file to S3 — see QuestionsService.
  @IsOptional()
  @IsString()
  imageKey?: string;

  @IsOptional()
  @IsString()
  imageFilename?: string;

  @IsOptional()
  @IsString()
  imageMimeType?: string;
}
