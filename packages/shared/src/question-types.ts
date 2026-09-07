export const QuestionType = {
  MCQ_SINGLE: "MCQ_SINGLE",
  MCQ_MULTI: "MCQ_MULTI",
  TRUE_FALSE: "TRUE_FALSE",
  SHORT_TEXT: "SHORT_TEXT",
  NUMERIC: "NUMERIC",
  ESSAY: "ESSAY",
  MATCHING: "MATCHING",
  FILL_BLANK: "FILL_BLANK",
  FILE_UPLOAD: "FILE_UPLOAD",
} as const;

export type QuestionType = (typeof QuestionType)[keyof typeof QuestionType];

export const ALL_QUESTION_TYPES: QuestionType[] = Object.values(QuestionType);

/**
 * Question types scored automatically on submit. Everything else
 * (ESSAY, FILE_UPLOAD) lands in the teacher's manual grading queue.
 */
export const AUTO_GRADABLE_TYPES: QuestionType[] = [
  QuestionType.MCQ_SINGLE,
  QuestionType.MCQ_MULTI,
  QuestionType.TRUE_FALSE,
  QuestionType.SHORT_TEXT,
  QuestionType.NUMERIC,
  QuestionType.MATCHING,
  QuestionType.FILL_BLANK,
];

/** Question types that use the QuestionOption table for their choices. */
export const OPTION_BASED_TYPES: QuestionType[] = [
  QuestionType.MCQ_SINGLE,
  QuestionType.MCQ_MULTI,
  QuestionType.TRUE_FALSE,
];

export const QuestionDifficulty = {
  EASY: "EASY",
  MEDIUM: "MEDIUM",
  HARD: "HARD",
} as const;

export type QuestionDifficulty =
  (typeof QuestionDifficulty)[keyof typeof QuestionDifficulty];

export const ALL_QUESTION_DIFFICULTIES: QuestionDifficulty[] =
  Object.values(QuestionDifficulty);
