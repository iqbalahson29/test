import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';

export class PracticeQuestionOptionDto {
  // Present when updating an existing option — lets PracticeQuestionsService.update
  // preserve the option's id (and thus keep it scoreable against past
  // answers) instead of deleting and recreating it. Absent/omitted means
  // "this is a new option". Ignored on question creation.
  @IsOptional()
  @IsString()
  id?: string;

  @IsString()
  @MinLength(1)
  text: string;

  @IsBoolean()
  isCorrect: boolean;

  // Same tri-state convention as CreatePracticeQuestionDto's attachment/image
  // fields: undefined = leave as-is, '' = clear, any other string = replace.
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
