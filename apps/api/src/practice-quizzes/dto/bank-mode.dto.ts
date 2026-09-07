import { IsInt, Max, Min } from 'class-validator';

// Keys intentionally match the QuizModule enum's string values (not
// camelCase) so this DTO's shape is identical to the Record<QuizModule,
// number> stored verbatim in PracticeQuiz.bankModuleTargets — no
// translation layer between the API boundary and the stored JSON.
export class BankModuleTargetsDto {
  @IsInt()
  @Min(1)
  RW_MODULE_1: number;

  @IsInt()
  @Min(1)
  RW_MODULE_2: number;

  @IsInt()
  @Min(1)
  MATH_MODULE_1: number;

  @IsInt()
  @Min(1)
  MATH_MODULE_2: number;
}

// Percentages must sum to 100 — checked in PracticeQuizzesService (a
// cross-field sum isn't expressible with plain class-validator decorators),
// same convention as the "exactly one of X/Y/Z" checks elsewhere in this
// codebase (e.g. AssignmentsService.create).
export class BankDifficultyRatioDto {
  @IsInt()
  @Min(0)
  @Max(100)
  EASY: number;

  @IsInt()
  @Min(0)
  @Max(100)
  MEDIUM: number;

  @IsInt()
  @Min(0)
  @Max(100)
  HARD: number;
}
