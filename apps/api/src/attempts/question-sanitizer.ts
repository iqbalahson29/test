import { Prisma, QuestionType } from '@prisma/client';
import type { Question, QuestionOption } from '@prisma/client';

type QuestionWithOptions = Question & { options: QuestionOption[] };

export interface SanitizedOption {
  id: string;
  text: string;
  order: number;
}

export interface SanitizedQuestion {
  id: string;
  type: QuestionType;
  prompt: string;
  points: Prisma.Decimal;
  order: number;
  config: Record<string, unknown>;
  options: SanitizedOption[];
}

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * Strips the answer key before a question reaches a student mid-attempt:
 * option correctness, accepted answers, correct numeric value/tolerance,
 * and (for MATCHING, where the pairing itself IS the answer key) the
 * left/right correspondence.
 */
export function sanitizeQuestion(q: QuestionWithOptions): SanitizedQuestion {
  const options: SanitizedOption[] = q.options.map((o) => ({
    id: o.id,
    text: o.text,
    order: o.order,
  }));

  let config: Record<string, unknown> = q.config as Record<string, unknown>;
  switch (q.type) {
    case QuestionType.SHORT_TEXT:
    case QuestionType.NUMERIC:
      config = {};
      break;
    case QuestionType.MATCHING: {
      const pairs =
        (q.config as { pairs?: { left: string; right: string }[] }).pairs ?? [];
      config = {
        leftItems: pairs.map((p) => p.left),
        rightItems: shuffle(pairs.map((p) => p.right)),
      };
      break;
    }
    case QuestionType.FILL_BLANK: {
      const blanks = (q.config as { blanks?: unknown[] }).blanks ?? [];
      config = { blankCount: blanks.length };
      break;
    }
    default:
      // ESSAY / FILE_UPLOAD: config holds instructions, not answers — pass through.
      break;
  }

  return {
    id: q.id,
    type: q.type,
    prompt: q.prompt,
    points: q.points,
    order: q.order,
    config,
    options,
  };
}
