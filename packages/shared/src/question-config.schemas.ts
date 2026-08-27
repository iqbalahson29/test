import { z } from "zod";
import { QuestionType } from "./question-types.js";

/**
 * Config schema per QuestionType, stored in Question.config (Json).
 * MCQ_SINGLE / MCQ_MULTI / TRUE_FALSE take their choices from the
 * QuestionOption table instead, so their config is empty.
 */

export const mcqSingleConfigSchema = z.object({});
export const mcqMultiConfigSchema = z.object({});
export const trueFalseConfigSchema = z.object({});

export const shortTextConfigSchema = z.object({
  acceptedAnswers: z.array(z.string().min(1)).min(1),
  caseSensitive: z.boolean().default(false),
});

export const numericConfigSchema = z.object({
  correctAnswer: z.number(),
  tolerance: z.number().min(0).default(0),
});

export const essayConfigSchema = z.object({
  minWords: z.number().int().min(0).optional(),
  maxWords: z.number().int().min(1).optional(),
});

export const matchingConfigSchema = z.object({
  pairs: z
    .array(
      z.object({
        left: z.string().min(1),
        right: z.string().min(1),
      }),
    )
    .min(2),
});

export const fillBlankConfigSchema = z.object({
  blanks: z
    .array(
      z.object({
        acceptedAnswers: z.array(z.string().min(1)).min(1),
        caseSensitive: z.boolean().default(false),
      }),
    )
    .min(1),
});

export const fileUploadConfigSchema = z.object({
  allowedExtensions: z.array(z.string().min(1)).optional(),
  maxSizeMb: z.number().positive().max(100).default(10),
});

export const questionConfigSchemaByType = {
  [QuestionType.MCQ_SINGLE]: mcqSingleConfigSchema,
  [QuestionType.MCQ_MULTI]: mcqMultiConfigSchema,
  [QuestionType.TRUE_FALSE]: trueFalseConfigSchema,
  [QuestionType.SHORT_TEXT]: shortTextConfigSchema,
  [QuestionType.NUMERIC]: numericConfigSchema,
  [QuestionType.ESSAY]: essayConfigSchema,
  [QuestionType.MATCHING]: matchingConfigSchema,
  [QuestionType.FILL_BLANK]: fillBlankConfigSchema,
  [QuestionType.FILE_UPLOAD]: fileUploadConfigSchema,
} as const;

export function getQuestionConfigSchema(type: QuestionType) {
  return questionConfigSchemaByType[type];
}

export const questionOptionSchema = z.object({
  text: z.string().min(1),
  isCorrect: z.boolean(),
  order: z.number().int().min(0),
});
