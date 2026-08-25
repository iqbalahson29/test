import { IsBoolean, IsString, MinLength } from 'class-validator';

export class QuestionOptionDto {
  @IsString()
  @MinLength(1)
  text: string;

  @IsBoolean()
  isCorrect: boolean;
}
