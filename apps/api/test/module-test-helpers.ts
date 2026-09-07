import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';

export const MODULE_SEQUENCE = [
  'RW_MODULE_1',
  'RW_MODULE_2',
  'MATH_MODULE_1',
  'MATH_MODULE_2',
] as const;

/** Publishing/scheduling a quiz now requires every module to have at least
 * one question — fills whichever modules aren't already covered with a
 * throwaway, 0-point, auto-graded TRUE_FALSE question so tests that don't
 * care about module structure can still publish without the filler
 * affecting maxScore or showing up in the manual grading queue (which an
 * ESSAY filler would). */
export async function fillRemainingModules(
  app: INestApplication<App>,
  teacherToken: string,
  quizId: string,
  usedModules: string[],
) {
  for (const module of MODULE_SEQUENCE) {
    if (usedModules.includes(module)) continue;
    await request(app.getHttpServer())
      .post(`/quizzes/${quizId}/questions`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        type: 'TRUE_FALSE',
        module,
        prompt: 'Filler',
        points: 0,
        config: {},
        options: [
          { text: 'True', isCorrect: true },
          { text: 'False', isCorrect: false },
        ],
      })
      .expect(201);
  }
}

/** Walks an in-progress attempt to completion by repeatedly completing the
 * active module and beginning the next one — replaces the old single
 * POST /attempts/:id/submit call now that submission is per-module. Returns
 * the final attempt body (status SUBMITTED or GRADED). */
export async function submitAllModules(
  app: INestApplication<App>,
  studentToken: string,
  attemptId: string,
) {
  let body: { status: string; questions?: unknown[] } = { status: 'IN_PROGRESS' };
  for (let i = 0; i < MODULE_SEQUENCE.length && body.status === 'IN_PROGRESS'; i++) {
    const complete = await request(app.getHttpServer())
      .post(`/attempts/${attemptId}/modules/complete`)
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(201);
    body = complete.body;
    if (body.status === 'IN_PROGRESS') {
      const next = await request(app.getHttpServer())
        .post(`/attempts/${attemptId}/modules/begin-next`)
        .set('Authorization', `Bearer ${studentToken}`)
        .expect(201);
      body = next.body;
    }
  }
  return body;
}

/** Practice-quiz equivalent of fillRemainingModules, targeting
 * /practice-quizzes/:id/questions instead of /quizzes/:id/questions. */
export async function fillRemainingPracticeModules(
  app: INestApplication<App>,
  teacherToken: string,
  quizId: string,
  usedModules: string[],
) {
  for (const module of MODULE_SEQUENCE) {
    if (usedModules.includes(module)) continue;
    await request(app.getHttpServer())
      .post(`/practice-quizzes/${quizId}/questions`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        type: 'TRUE_FALSE',
        module,
        prompt: 'Filler',
        points: 0,
        config: {},
        options: [
          { text: 'True', isCorrect: true },
          { text: 'False', isCorrect: false },
        ],
      })
      .expect(201);
  }
}

/** Practice-quiz equivalent of submitAllModules, targeting
 * /practice-attempts/:id/modules/* instead of /attempts/:id/modules/*. */
export async function submitAllPracticeModules(
  app: INestApplication<App>,
  studentToken: string,
  attemptId: string,
) {
  let body: { status: string; questions?: unknown[] } = { status: 'IN_PROGRESS' };
  for (let i = 0; i < MODULE_SEQUENCE.length && body.status === 'IN_PROGRESS'; i++) {
    const complete = await request(app.getHttpServer())
      .post(`/practice-attempts/${attemptId}/modules/complete`)
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(201);
    body = complete.body;
    if (body.status === 'IN_PROGRESS') {
      const next = await request(app.getHttpServer())
        .post(`/practice-attempts/${attemptId}/modules/begin-next`)
        .set('Authorization', `Bearer ${studentToken}`)
        .expect(201);
      body = next.body;
    }
  }
  return body;
}
