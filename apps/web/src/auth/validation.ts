const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function validateRequired(value: string, label: string): string | undefined {
  return value.trim() ? undefined : `${label} is required`
}

export function validateEmail(value: string): string | undefined {
  if (!value.trim()) return 'Email is required'
  if (!EMAIL_PATTERN.test(value.trim())) return 'Enter a valid email address'
  return undefined
}

export function validateConfirmPassword(password: string, confirm: string): string | undefined {
  if (!confirm) return 'Confirm your password'
  if (password !== confirm) return 'Passwords do not match'
  return undefined
}
