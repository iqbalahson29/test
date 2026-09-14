import { z } from 'zod';
import {
  AUTH_ACTIONS,
  isStrongPassword,
  normalizeIdentifier,
} from '@quiz-platform/shared';
import { authError } from './security/primitives';
const token = z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  id = z.string().min(1).max(128);
const email = z
  .string()
  .max(254)
  .refine((v) => {
    try {
      normalizeIdentifier(v);
      return true;
    } catch {
      return false;
    }
  });
const password = z.string().refine(isStrongPassword),
  name = z.string().trim().min(1).max(100);
const code = z.string().regex(/^[0-9]{6}$/);
export const schemas = {
  empty: z.object({}).strict(),
  login: z
    .object({ identifier: z.string().max(254), password: z.string().max(1024) })
    .strict(),
  register: z.object({ email, name, password }).strict(),
  resend: z.object({ challengeId: token }).strict(),
  verify: z
    .object({
      challengeId: token,
      code,
      rememberDevice: z.boolean().optional().default(false),
    })
    .strict(),
  verifyOnly: z.object({ challengeId: token, code }).strict(),
  nonce: z.object({ intent: z.enum(['login', 'link']) }).strict(),
  credential: z.object({ credential: z.string().min(1).max(12288) }).strict(),
  link: z.object({ pendingLinkId: id, grantToken: token }).strict(),
  grant: z.object({ grantToken: token }).strict(),
  stepUp: z
    .object({
      action: z.enum(AUTH_ACTIONS),
      target: z
        .object({
          userId: id.optional(),
          email: email.optional(),
          pendingLinkId: id.optional(),
        })
        .strict(),
    })
    .strict(),
  resetRequest: z.object({ identifier: email }).strict(),
  resetComplete: z
    .object({ grantToken: token, newPassword: password })
    .strict(),
  passwordChange: z
    .object({
      currentPassword: z.string().min(1).max(1024),
      newPassword: password,
      grantToken: token,
    })
    .strict(),
  passwordSet: z.object({ newPassword: password, grantToken: token }).strict(),
  emailChange: z
    .object({
      email,
      currentPassword: z.string().max(1024).optional(),
      grantToken: token,
    })
    .strict(),
  selection: z.object({ selectionToken: token, membershipId: id }).strict(),
  switch: z.object({ membershipId: id }).strict(),
  enter: z.object({ tenantId: id }).strict(),
  logout: z
    .object({ forgetDevice: z.boolean().optional().default(false) })
    .strict(),
  inspect: z.object({ token }).strict(),
  accept: z
    .object({ token, name: name.optional(), password: password.optional() })
    .strict(),
  adminUpdate: z
    .object({
      name: name.optional(),
      email: email.optional(),
      newPassword: password.optional(),
      emailChangeGrantToken: token.optional(),
      passwordSetGrantToken: token.optional(),
      reason: z.string().trim().min(10).max(500).optional(),
    })
    .strict(),
  clearSuppression: z
    .object({ grantToken: token, reason: z.string().trim().min(10).max(500) })
    .strict(),
};
export function parse<T extends z.ZodTypeAny>(
  schema: T,
  body: unknown,
): z.infer<T> {
  const result = schema.safeParse(body);
  if (!result.success)
    throw authError(
      (schema as z.ZodTypeAny) === schemas.login
        ? 'INVALID_CREDENTIALS'
        : (schema as z.ZodTypeAny) === schemas.verify ||
            (schema as z.ZodTypeAny) === schemas.verifyOnly
          ? 'CHALLENGE_INVALID'
          : 'VALIDATION_ERROR',
      (schema as z.ZodTypeAny) === schemas.login ? 401 : 400,
    );
  return result.data as z.infer<T>;
}
