import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { QuestionDifficulty, QuizModule } from '@prisma/client';
import { QuestionOptionDto } from './question-option.dto';

// `type` is intentionally excluded — immutable after creation, since
// changing it would invalidate the existing config/options shape.
export class UpdateQuestionDto {
  // undefined leaves the question in its current module; a value moves it
  // (order is recomputed to append at the end of the target module).
  @IsOptional()
  @IsEnum(QuizModule)
  module?: QuizModule;

  @IsOptional()
  @IsString()
  @MinLength(1)
  prompt?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  points?: number;

  // undefined leaves difficulty untouched; null clears it.
  @IsOptional()
  @IsEnum(QuestionDifficulty)
  difficulty?: QuestionDifficulty | null;

  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuestionOptionDto)
  options?: QuestionOptionDto[];

  // Omit to leave the attachment as-is; pass a new key/filename/mimeType
  // (from the attachment-upload-url endpoint) to replace it, or an empty
  // string to remove it — see QuestionsService.update.
  @IsOptional()
  @IsString()
  attachmentKey?: string;

  @IsOptional()
  @IsString()
  attachmentFilename?: string;

  @IsOptional()
  @IsString()
  attachmentMimeType?: string;

  // Same convention as attachment* above, for the question's inline image.
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
