import { QuestionType } from '@prisma/client';
import { getAnswerSchema } from '@quiz-platform/shared';

// Structural, not the concrete PracticeQuestion type — satisfied by both
// PracticeQuestion (FIXED mode) and PracticeAttemptQuestion (BANK mode's
// frozen per-attempt snapshot), so this one scorer serves both without
// duplicating the per-type switch.
export interface ScorableQuestion {
  type: QuestionType;
  points: unknown; // Prisma.Decimal — kept as unknown so callers don't need to import it here
  config: unknown;
  options: { id: string; isCorrect: boolean }[];
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Scores one submitted answer against a question's current config/correct
 * answer. Extracted as a pure function (no DI, no Prisma calls) so both
 * PracticeGradingService's FIXED-mode grading/regrade path and the BANK-mode
 * grading path can share it without duplicating this per-type switch.
 */
export function scoreResponse(question: ScorableQuestion, rawAnswer: unknown): number {
  const schema = getAnswerSchema(question.type);
  const parsed = schema.safeParse(rawAnswer);
  const points = Number(question.points);
  if (!parsed.success) return 0;
  // Each branch below accesses only the fields its own schema guarantees;
  // a single loose cast here keeps the per-type branching readable (same
  // convention as practice-question-sanitizer.ts's per-type config casts).
  const answer = parsed.data as unknown as Record<string, unknown>;

  switch (question.type) {
    case QuestionType.MCQ_SINGLE:
    case QuestionType.TRUE_FALSE: {
      const correctOption = question.options.find((o) => o.isCorrect);
      return answer.optionId === correctOption?.id ? points : 0;
    }
    case QuestionType.MCQ_MULTI: {
      const correctIds = new Set(
        question.options.filter((o) => o.isCorrect).map((o) => o.id),
      );
      const selectedIds = (answer.optionIds as string[]) ?? [];
      const correctSelected = selectedIds.filter((id) => correctIds.has(id)).length;
      const incorrectSelected = selectedIds.length - correctSelected;
      if (correctIds.size === 0) return 0;
      const fraction = Math.max(0, correctSelected - incorrectSelected) / correctIds.size;
      return round2(points * fraction);
    }
    case QuestionType.NUMERIC: {
      const config = question.config as { correctAnswer: number; tolerance: number };
      const value = answer.value as number;
      return Math.abs(value - config.correctAnswer) <= config.tolerance ? points : 0;
    }
    case QuestionType.SHORT_TEXT: {
      const config = question.config as {
        acceptedAnswers: string[];
        caseSensitive: boolean;
      };
      const normalize = (s: string) =>
        config.caseSensitive ? s.trim() : s.trim().toLowerCase();
      const target = normalize((answer.text as string) ?? '');
      const matches = config.acceptedAnswers.some((a) => normalize(a) === target);
      return matches ? points : 0;
    }
    case QuestionType.MATCHING: {
      const config = question.config as { pairs: { left: string; right: string }[] };
      const selections = (answer.selections as { left: string; right: string }[]) ?? [];
      let correct = 0;
      for (const pair of config.pairs) {
        if (selections.some((s) => s.left === pair.left && s.right === pair.right)) {
          correct++;
        }
      }
      if (config.pairs.length === 0) return 0;
      return round2(points * (correct / config.pairs.length));
    }
    case QuestionType.FILL_BLANK: {
      const config = question.config as {
        blanks: { acceptedAnswers: string[]; caseSensitive: boolean }[];
      };
      const givenAnswers = (answer.answers as string[]) ?? [];
      let correct = 0;
      config.blanks.forEach((blank, i) => {
        const given = givenAnswers[i];
        if (given == null) return;
        const normalize = (s: string) =>
          blank.caseSensitive ? s.trim() : s.trim().toLowerCase();
        const target = normalize(given);
        if (blank.acceptedAnswers.some((a) => normalize(a) === target)) correct++;
      });
      if (config.blanks.length === 0) return 0;
      return round2(points * (correct / config.blanks.length));
    }
    default:
      return 0;
  }
}
