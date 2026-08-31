import { Type } from 'class-transformer';
import {
  IsArray,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { QuestionOptionDto } from './question-option.dto';

// `type` is intentionally excluded — immutable after creation, since
// changing it would invalidate the existing config/options shape.
export class UpdateQuestionDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  prompt?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  points?: number;

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
}
