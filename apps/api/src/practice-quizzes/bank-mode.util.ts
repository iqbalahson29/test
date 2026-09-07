import { QuestionDifficulty, QuizModule } from '@prisma/client';
import { QUIZ_MODULE_SEQUENCE } from '@quiz-platform/shared';
import { PrismaService } from '../prisma/prisma.service';

export type BankModuleTargets = Record<QuizModule, number>;
export type BankDifficultyRatio = Record<'EASY' | 'MEDIUM' | 'HARD', number>;
export type DifficultyQuota = Record<'EASY' | 'MEDIUM' | 'HARD', number>;

export const DEFAULT_BANK_DIFFICULTY_RATIO: BankDifficultyRatio = {
  EASY: 40,
  MEDIUM: 40,
  HARD: 20,
};

/**
 * Splits one module's target question count into an easy/medium/hard quota
 * matching `ratio`. EASY and MEDIUM are rounded independently; HARD absorbs
 * whatever rounding leaves over so the three always sum to exactly `target`
 * (never negative — a target of 1-2 with a lopsided ratio can zero out a
 * tier entirely, which is fine, just means that tier isn't drawn from).
 */
export function computeDifficultyQuota(
  target: number,
  ratio: BankDifficultyRatio,
): DifficultyQuota {
  const easy = Math.round((target * ratio.EASY) / 100);
  const medium = Math.round((target * ratio.MEDIUM) / 100);
  const hard = Math.max(0, target - easy - medium);
  return { EASY: easy, MEDIUM: medium, HARD: hard };
}

export interface BankShortfall {
  module: QuizModule;
  difficulty: QuestionDifficulty;
  needed: number;
  have: number;
}

/**
 * Checks whether a BANK-mode quiz's question pool has enough questions of
 * each difficulty in each module to fill computeDifficultyQuota's targets.
 * Used both at publish time (block with a clear error) and could be reused
 * for a "bank readiness" indicator in the UI later.
 */
export async function validateBankCoverage(
  prisma: PrismaService,
  quizId: string,
  targets: BankModuleTargets,
  ratio: BankDifficultyRatio,
): Promise<BankShortfall[]> {
  const counts = await prisma.practiceQuestion.groupBy({
    by: ['module', 'difficulty'],
    where: { quizId, difficulty: { not: null } },
    _count: { _all: true },
  });
  const countFor = (module: QuizModule, difficulty: QuestionDifficulty) =>
    counts.find((c) => c.module === module && c.difficulty === difficulty)?._count
      ._all ?? 0;

  const shortfalls: BankShortfall[] = [];
  for (const sharedModule of QUIZ_MODULE_SEQUENCE) {
    // QUIZ_MODULE_SEQUENCE is typed against @quiz-platform/shared's own
    // QuizModule union — identical string values to Prisma's generated
    // enum, but a nominally distinct TS type (see the same bridge in
    // practice-attempts.service.ts's toSatModule).
    const module = sharedModule as unknown as QuizModule;
    const quota = computeDifficultyQuota(targets[module], ratio);
    for (const difficulty of ['EASY', 'MEDIUM', 'HARD'] as const) {
      const needed = quota[difficulty];
      if (needed <= 0) continue;
      const have = countFor(module, difficulty as QuestionDifficulty);
      if (have < needed) {
        shortfalls.push({ module, difficulty: difficulty as QuestionDifficulty, needed, have });
      }
    }
  }
  return shortfalls;
}

export function formatShortfalls(shortfalls: BankShortfall[]): string {
  return shortfalls
    .map(
      (s) =>
        `${s.module} needs ${s.needed} ${s.difficulty} question${s.needed === 1 ? '' : 's'}, has ${s.have}`,
    )
    .join('; ');
}
