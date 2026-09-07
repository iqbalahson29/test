import { Type } from 'class-transformer';
import { IsArray, ArrayMinSize, ValidateNested } from 'class-validator';
import { CreatePracticeQuestionDto } from './create-practice-question.dto';

export class ImportPracticeQuestionsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreatePracticeQuestionDto)
  questions: CreatePracticeQuestionDto[];
}
