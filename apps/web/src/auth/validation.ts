import { normalizeIdentifier } from '@quiz-platform/shared'

export function validateRequired(value: string, label: string): string | undefined {
  return value.trim() ? undefined : `${label} is required`
}

export function validateEmail(value: string): string | undefined {
  if (!value.trim()) return 'Email is required'
  try { normalizeIdentifier(value) } catch { return 'Enter a valid email address' }
  return undefined
}

export function validateConfirmPassword(password: string, confirm: string): string | undefined {
  if (!confirm) return 'Confirm your password'
  if (password !== confirm) return 'Passwords do not match'
  return undefined
}
