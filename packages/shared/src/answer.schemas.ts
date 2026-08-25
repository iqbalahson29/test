import { z } from "zod";
import { QuestionType } from "./question-types.js";

/**
 * Shape of Response.answer per QuestionType. Grading parses these to
 * score a response; a parse failure (missing/malformed answer, e.g. a
 * skipped question) is treated as 0 points, not an error.
 */

export const mcqSingleAnswerSchema = z.object({
  optionId: z.string().min(1),
});
export const mcqMultiAnswerSchema = z.object({
  optionIds: z.array(z.string().min(1)),
});
export const trueFalseAnswerSchema = mcqSingleAnswerSchema;

export const shortTextAnswerSchema = z.object({
  text: z.string(),
});

export const numericAnswerSchema = z.object({
  value: z.number(),
});

export const essayAnswerSchema = z.object({
  text: z.string(),
});

export const matchingAnswerSchema = z.object({
  selections: z.array(
    z.object({
      left: z.string(),
      right: z.string(),
    }),
  ),
});

export const fillBlankAnswerSchema = z.object({
  answers: z.array(z.string()),
});

export const fileUploadAnswerSchema = z.object({
  fileKey: z.string().optional(),
});

export const answerSchemaByType = {
  [QuestionType.MCQ_SINGLE]: mcqSingleAnswerSchema,
  [QuestionType.MCQ_MULTI]: mcqMultiAnswerSchema,
  [QuestionType.TRUE_FALSE]: trueFalseAnswerSchema,
  [QuestionType.SHORT_TEXT]: shortTextAnswerSchema,
  [QuestionType.NUMERIC]: numericAnswerSchema,
  [QuestionType.ESSAY]: essayAnswerSchema,
  [QuestionType.MATCHING]: matchingAnswerSchema,
  [QuestionType.FILL_BLANK]: fillBlankAnswerSchema,
  [QuestionType.FILE_UPLOAD]: fileUploadAnswerSchema,
} as const;

export function getAnswerSchema(type: QuestionType) {
  return answerSchemaByType[type];
}
