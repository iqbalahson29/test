export const QuizModule = {
  RW_MODULE_1: "RW_MODULE_1",
  RW_MODULE_2: "RW_MODULE_2",
  MATH_MODULE_1: "MATH_MODULE_1",
  MATH_MODULE_2: "MATH_MODULE_2",
} as const;

export type QuizModule = (typeof QuizModule)[keyof typeof QuizModule];

/** Declared in play order — callers that need modules in sequence (attempt
 * flow, print/export grouping) should iterate this rather than Object.values
 * on an object literal, whose key order isn't a contract. */
export const QUIZ_MODULE_SEQUENCE: QuizModule[] = [
  QuizModule.RW_MODULE_1,
  QuizModule.RW_MODULE_2,
  QuizModule.MATH_MODULE_1,
  QuizModule.MATH_MODULE_2,
];

export const ALL_QUIZ_MODULES: QuizModule[] = QUIZ_MODULE_SEQUENCE;

export type QuizModuleSubject = "RW" | "MATH";

export const QUIZ_MODULE_SUBJECT: Record<QuizModule, QuizModuleSubject> = {
  [QuizModule.RW_MODULE_1]: "RW",
  [QuizModule.RW_MODULE_2]: "RW",
  [QuizModule.MATH_MODULE_1]: "MATH",
  [QuizModule.MATH_MODULE_2]: "MATH",
};

/** Fixed to match real digital SAT module timing — not admin-configurable. */
export const QUIZ_MODULE_TIME_LIMIT_SEC: Record<QuizModule, number> = {
  [QuizModule.RW_MODULE_1]: 32 * 60,
  [QuizModule.RW_MODULE_2]: 32 * 60,
  [QuizModule.MATH_MODULE_1]: 35 * 60,
  [QuizModule.MATH_MODULE_2]: 35 * 60,
};

export const QUIZ_MODULE_LABELS: Record<QuizModule, string> = {
  [QuizModule.RW_MODULE_1]: "Reading & Writing — Module 1",
  [QuizModule.RW_MODULE_2]: "Reading & Writing — Module 2",
  [QuizModule.MATH_MODULE_1]: "Math — Module 1",
  [QuizModule.MATH_MODULE_2]: "Math — Module 2",
};

export const QUIZ_MODULE_SHORT_LABELS: Record<QuizModule, string> = {
  [QuizModule.RW_MODULE_1]: "R&W Module 1",
  [QuizModule.RW_MODULE_2]: "R&W Module 2",
  [QuizModule.MATH_MODULE_1]: "Math Module 1",
  [QuizModule.MATH_MODULE_2]: "Math Module 2",
};

export function moduleAllowsCalculator(module: QuizModule): boolean {
  return QUIZ_MODULE_SUBJECT[module] === "MATH";
}

/** True when `from` immediately precedes `to` in QUIZ_MODULE_SEQUENCE — the
 * one boundary (R&W Module 2 -> Math Module 1) where a break screen shows. */
export function isSubjectBoundary(from: QuizModule, to: QuizModule): boolean {
  return QUIZ_MODULE_SUBJECT[from] !== QUIZ_MODULE_SUBJECT[to];
}

export const TOTAL_QUIZ_TIME_LIMIT_SEC: number = QUIZ_MODULE_SEQUENCE.reduce(
  (sum, m) => sum + QUIZ_MODULE_TIME_LIMIT_SEC[m],
  0,
);
