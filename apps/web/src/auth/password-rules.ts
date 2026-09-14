// Mirrors IsStrongPassword (apps/api/src/common/is-strong-password.decorator.ts) so the
// client-side checklist never claims a password is valid when the API would reject it.
export interface PasswordCheck {
  label: string
  test: (value: string) => boolean
}

export { passwordChecks,isStrongPassword } from '@quiz-platform/shared'

export function passwordStrengthLabel(passed: number): string {
  if (passed <= 1) return 'Weak'
  if (passed === 2) return 'Fair'
  if (passed < 5) return 'Good'
  return 'Strong'
}
