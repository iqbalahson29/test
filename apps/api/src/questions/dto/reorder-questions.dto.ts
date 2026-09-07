import { IsArray, IsEnum, IsString } from 'class-validator';
import { QuizModule } from '@prisma/client';

export class ReorderQuestionsDto {
  // orderedIds must exactly match this module's current question ids —
  // reordering is scoped per module, not whole-quiz.
  @IsEnum(QuizModule)
  module: QuizModule;

  @IsArray()
  @IsString({ each: true })
  orderedIds: string[];
}
