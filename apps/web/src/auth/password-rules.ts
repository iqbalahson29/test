// Mirrors IsStrongPassword (apps/api/src/common/is-strong-password.decorator.ts) so the
// client-side checklist never claims a password is valid when the API would reject it.
export interface PasswordCheck {
  label: string
  test: (value: string) => boolean
}

export const passwordChecks: PasswordCheck[] = [
  { label: 'At least 10 characters', test: (v) => v.length >= 10 },
  { label: 'One uppercase letter', test: (v) => /[A-Z]/.test(v) },
  { label: 'One lowercase letter', test: (v) => /[a-z]/.test(v) },
  { label: 'One number', test: (v) => /\d/.test(v) },
]

export function isStrongPassword(value: string): boolean {
  return passwordChecks.every((check) => check.test(value))
}

export function passwordStrengthLabel(passed: number): string {
  if (passed <= 1) return 'Weak'
  if (passed === 2) return 'Fair'
  if (passed === 3) return 'Good'
  return 'Strong'
}
