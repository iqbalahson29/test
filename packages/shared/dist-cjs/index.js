"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var index_exports = {};
__export(index_exports, {
  ALL_QUESTION_DIFFICULTIES: () => ALL_QUESTION_DIFFICULTIES,
  ALL_QUESTION_TYPES: () => ALL_QUESTION_TYPES,
  ALL_QUIZ_MODULES: () => ALL_QUIZ_MODULES,
  ALL_ROLES: () => ALL_ROLES,
  AUTO_GRADABLE_TYPES: () => AUTO_GRADABLE_TYPES,
  OPTION_BASED_TYPES: () => OPTION_BASED_TYPES,
  QUIZ_MODULE_LABELS: () => QUIZ_MODULE_LABELS,
  QUIZ_MODULE_SEQUENCE: () => QUIZ_MODULE_SEQUENCE,
  QUIZ_MODULE_SHORT_LABELS: () => QUIZ_MODULE_SHORT_LABELS,
  QUIZ_MODULE_SUBJECT: () => QUIZ_MODULE_SUBJECT,
  QUIZ_MODULE_TIME_LIMIT_SEC: () => QUIZ_MODULE_TIME_LIMIT_SEC,
  QuestionDifficulty: () => QuestionDifficulty,
  QuestionType: () => QuestionType,
  QuizModule: () => QuizModule,
  Role: () => Role,
  TOTAL_QUIZ_TIME_LIMIT_SEC: () => TOTAL_QUIZ_TIME_LIMIT_SEC,
  answerSchemaByType: () => answerSchemaByType,
  essayAnswerSchema: () => essayAnswerSchema,
  essayConfigSchema: () => essayConfigSchema,
  fileUploadAnswerSchema: () => fileUploadAnswerSchema,
  fileUploadConfigSchema: () => fileUploadConfigSchema,
  fillBlankAnswerSchema: () => fillBlankAnswerSchema,
  fillBlankConfigSchema: () => fillBlankConfigSchema,
  getAnswerSchema: () => getAnswerSchema,
  getQuestionConfigSchema: () => getQuestionConfigSchema,
  isSubjectBoundary: () => isSubjectBoundary,
  matchingAnswerSchema: () => matchingAnswerSchema,
  matchingConfigSchema: () => matchingConfigSchema,
  mcqMultiAnswerSchema: () => mcqMultiAnswerSchema,
  mcqMultiConfigSchema: () => mcqMultiConfigSchema,
  mcqSingleAnswerSchema: () => mcqSingleAnswerSchema,
  mcqSingleConfigSchema: () => mcqSingleConfigSchema,
  moduleAllowsCalculator: () => moduleAllowsCalculator,
  numericAnswerSchema: () => numericAnswerSchema,
  numericConfigSchema: () => numericConfigSchema,
  questionConfigSchemaByType: () => questionConfigSchemaByType,
  questionOptionSchema: () => questionOptionSchema,
  shortTextAnswerSchema: () => shortTextAnswerSchema,
  shortTextConfigSchema: () => shortTextConfigSchema,
  trueFalseAnswerSchema: () => trueFalseAnswerSchema,
  trueFalseConfigSchema: () => trueFalseConfigSchema
});
module.exports = __toCommonJS(index_exports);

// src/roles.ts
var Role = {
  ADMIN: "ADMIN",
  STUDENT: "STUDENT"
};
var ALL_ROLES = [Role.ADMIN, Role.STUDENT];

// src/question-types.ts
var QuestionType = {
  MCQ_SINGLE: "MCQ_SINGLE",
  MCQ_MULTI: "MCQ_MULTI",
  TRUE_FALSE: "TRUE_FALSE",
  SHORT_TEXT: "SHORT_TEXT",
  NUMERIC: "NUMERIC",
  ESSAY: "ESSAY",
  MATCHING: "MATCHING",
  FILL_BLANK: "FILL_BLANK",
  FILE_UPLOAD: "FILE_UPLOAD"
};
var ALL_QUESTION_TYPES = Object.values(QuestionType);
var AUTO_GRADABLE_TYPES = [
  QuestionType.MCQ_SINGLE,
  QuestionType.MCQ_MULTI,
  QuestionType.TRUE_FALSE,
  QuestionType.SHORT_TEXT,
  QuestionType.NUMERIC,
  QuestionType.MATCHING,
  QuestionType.FILL_BLANK
];
var OPTION_BASED_TYPES = [
  QuestionType.MCQ_SINGLE,
  QuestionType.MCQ_MULTI,
  QuestionType.TRUE_FALSE
];
var QuestionDifficulty = {
  EASY: "EASY",
  MEDIUM: "MEDIUM",
  HARD: "HARD"
};
var ALL_QUESTION_DIFFICULTIES = Object.values(QuestionDifficulty);

// src/question-config.schemas.ts
var import_zod = require("zod");
var mcqSingleConfigSchema = import_zod.z.object({});
var mcqMultiConfigSchema = import_zod.z.object({});
var trueFalseConfigSchema = import_zod.z.object({});
var shortTextConfigSchema = import_zod.z.object({
  acceptedAnswers: import_zod.z.array(import_zod.z.string().min(1)).min(1),
  caseSensitive: import_zod.z.boolean().default(false)
});
var numericConfigSchema = import_zod.z.object({
  correctAnswer: import_zod.z.number(),
  tolerance: import_zod.z.number().min(0).default(0)
});
var essayConfigSchema = import_zod.z.object({
  minWords: import_zod.z.number().int().min(0).optional(),
  maxWords: import_zod.z.number().int().min(1).optional()
});
var matchingConfigSchema = import_zod.z.object({
  pairs: import_zod.z.array(
    import_zod.z.object({
      left: import_zod.z.string().min(1),
      right: import_zod.z.string().min(1)
    })
  ).min(2)
});
var fillBlankConfigSchema = import_zod.z.object({
  blanks: import_zod.z.array(
    import_zod.z.object({
      acceptedAnswers: import_zod.z.array(import_zod.z.string().min(1)).min(1),
      caseSensitive: import_zod.z.boolean().default(false)
    })
  ).min(1)
});
var fileUploadConfigSchema = import_zod.z.object({
  allowedExtensions: import_zod.z.array(import_zod.z.string().min(1)).optional(),
  maxSizeMb: import_zod.z.number().positive().max(100).default(10)
});
var questionConfigSchemaByType = {
  [QuestionType.MCQ_SINGLE]: mcqSingleConfigSchema,
  [QuestionType.MCQ_MULTI]: mcqMultiConfigSchema,
  [QuestionType.TRUE_FALSE]: trueFalseConfigSchema,
  [QuestionType.SHORT_TEXT]: shortTextConfigSchema,
  [QuestionType.NUMERIC]: numericConfigSchema,
  [QuestionType.ESSAY]: essayConfigSchema,
  [QuestionType.MATCHING]: matchingConfigSchema,
  [QuestionType.FILL_BLANK]: fillBlankConfigSchema,
  [QuestionType.FILE_UPLOAD]: fileUploadConfigSchema
};
function getQuestionConfigSchema(type) {
  return questionConfigSchemaByType[type];
}
var questionOptionSchema = import_zod.z.object({
  text: import_zod.z.string().min(1),
  isCorrect: import_zod.z.boolean(),
  order: import_zod.z.number().int().min(0)
});

// src/answer.schemas.ts
var import_zod2 = require("zod");
var mcqSingleAnswerSchema = import_zod2.z.object({
  optionId: import_zod2.z.string().min(1)
});
var mcqMultiAnswerSchema = import_zod2.z.object({
  optionIds: import_zod2.z.array(import_zod2.z.string().min(1))
});
var trueFalseAnswerSchema = mcqSingleAnswerSchema;
var shortTextAnswerSchema = import_zod2.z.object({
  text: import_zod2.z.string()
});
var numericAnswerSchema = import_zod2.z.object({
  value: import_zod2.z.number()
});
var essayAnswerSchema = import_zod2.z.object({
  text: import_zod2.z.string()
});
var matchingAnswerSchema = import_zod2.z.object({
  selections: import_zod2.z.array(
    import_zod2.z.object({
      left: import_zod2.z.string(),
      right: import_zod2.z.string()
    })
  )
});
var fillBlankAnswerSchema = import_zod2.z.object({
  answers: import_zod2.z.array(import_zod2.z.string())
});
var fileUploadAnswerSchema = import_zod2.z.object({
  fileKey: import_zod2.z.string().optional()
});
var answerSchemaByType = {
  [QuestionType.MCQ_SINGLE]: mcqSingleAnswerSchema,
  [QuestionType.MCQ_MULTI]: mcqMultiAnswerSchema,
  [QuestionType.TRUE_FALSE]: trueFalseAnswerSchema,
  [QuestionType.SHORT_TEXT]: shortTextAnswerSchema,
  [QuestionType.NUMERIC]: numericAnswerSchema,
  [QuestionType.ESSAY]: essayAnswerSchema,
  [QuestionType.MATCHING]: matchingAnswerSchema,
  [QuestionType.FILL_BLANK]: fillBlankAnswerSchema,
  [QuestionType.FILE_UPLOAD]: fileUploadAnswerSchema
};
function getAnswerSchema(type) {
  return answerSchemaByType[type];
}

// src/quiz-module.ts
var QuizModule = {
  RW_MODULE_1: "RW_MODULE_1",
  RW_MODULE_2: "RW_MODULE_2",
  MATH_MODULE_1: "MATH_MODULE_1",
  MATH_MODULE_2: "MATH_MODULE_2"
};
var QUIZ_MODULE_SEQUENCE = [
  QuizModule.RW_MODULE_1,
  QuizModule.RW_MODULE_2,
  QuizModule.MATH_MODULE_1,
  QuizModule.MATH_MODULE_2
];
var ALL_QUIZ_MODULES = QUIZ_MODULE_SEQUENCE;
var QUIZ_MODULE_SUBJECT = {
  [QuizModule.RW_MODULE_1]: "RW",
  [QuizModule.RW_MODULE_2]: "RW",
  [QuizModule.MATH_MODULE_1]: "MATH",
  [QuizModule.MATH_MODULE_2]: "MATH"
};
var QUIZ_MODULE_TIME_LIMIT_SEC = {
  [QuizModule.RW_MODULE_1]: 32 * 60,
  [QuizModule.RW_MODULE_2]: 32 * 60,
  [QuizModule.MATH_MODULE_1]: 35 * 60,
  [QuizModule.MATH_MODULE_2]: 35 * 60
};
var QUIZ_MODULE_LABELS = {
  [QuizModule.RW_MODULE_1]: "Reading & Writing \u2014 Module 1",
  [QuizModule.RW_MODULE_2]: "Reading & Writing \u2014 Module 2",
  [QuizModule.MATH_MODULE_1]: "Math \u2014 Module 1",
  [QuizModule.MATH_MODULE_2]: "Math \u2014 Module 2"
};
var QUIZ_MODULE_SHORT_LABELS = {
  [QuizModule.RW_MODULE_1]: "R&W Module 1",
  [QuizModule.RW_MODULE_2]: "R&W Module 2",
  [QuizModule.MATH_MODULE_1]: "Math Module 1",
  [QuizModule.MATH_MODULE_2]: "Math Module 2"
};
function moduleAllowsCalculator(module2) {
  return QUIZ_MODULE_SUBJECT[module2] === "MATH";
}
function isSubjectBoundary(from, to) {
  return QUIZ_MODULE_SUBJECT[from] !== QUIZ_MODULE_SUBJECT[to];
}
var TOTAL_QUIZ_TIME_LIMIT_SEC = QUIZ_MODULE_SEQUENCE.reduce(
  (sum, m) => sum + QUIZ_MODULE_TIME_LIMIT_SEC[m],
  0
);
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  ALL_QUESTION_DIFFICULTIES,
  ALL_QUESTION_TYPES,
  ALL_QUIZ_MODULES,
  ALL_ROLES,
  AUTO_GRADABLE_TYPES,
  OPTION_BASED_TYPES,
  QUIZ_MODULE_LABELS,
  QUIZ_MODULE_SEQUENCE,
  QUIZ_MODULE_SHORT_LABELS,
  QUIZ_MODULE_SUBJECT,
  QUIZ_MODULE_TIME_LIMIT_SEC,
  QuestionDifficulty,
  QuestionType,
  QuizModule,
  Role,
  TOTAL_QUIZ_TIME_LIMIT_SEC,
  answerSchemaByType,
  essayAnswerSchema,
  essayConfigSchema,
  fileUploadAnswerSchema,
  fileUploadConfigSchema,
  fillBlankAnswerSchema,
  fillBlankConfigSchema,
  getAnswerSchema,
  getQuestionConfigSchema,
  isSubjectBoundary,
  matchingAnswerSchema,
  matchingConfigSchema,
  mcqMultiAnswerSchema,
  mcqMultiConfigSchema,
  mcqSingleAnswerSchema,
  mcqSingleConfigSchema,
  moduleAllowsCalculator,
  numericAnswerSchema,
  numericConfigSchema,
  questionConfigSchemaByType,
  questionOptionSchema,
  shortTextAnswerSchema,
  shortTextConfigSchema,
  trueFalseAnswerSchema,
  trueFalseConfigSchema
});
