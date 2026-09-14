export const passwordChecks = [
  { label: 'At least 10 characters', test: (v: string) => [...v].length >= 10 },
  { label: 'One uppercase letter', test: (v: string) => /[A-Z]/.test(v) },
  { label: 'One lowercase letter', test: (v: string) => /[a-z]/.test(v) },
  { label: 'One number', test: (v: string) => /[0-9]/.test(v) },
  { label: 'At most 72 UTF-8 bytes, without NUL', test: (v: string) => new TextEncoder().encode(v).length <= 72 && !v.includes('\0') },
];
export function validLoginPassword(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && !value.includes('\0') && new TextEncoder().encode(value).length <= 72;
}
export function isStrongPassword(value: unknown): value is string {
  return typeof value === 'string' && passwordChecks.every((check) => check.test(value));
}
