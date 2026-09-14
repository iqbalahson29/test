/** Product policy: plus aliases collapse for every domain; dots stay significant. */
export function normalizeIdentifier(value: unknown): { raw: string; normalized: string; kind: 'EMAIL' } {
  if (typeof value !== 'string') throw new Error('Enter a valid email address');
  const raw = value.trim();
  if (raw.length > 254 || !/^[\x21-\x7e]+$/.test(raw)) throw new Error('Enter a valid email address');
  const parts = raw.split('@');
  if (parts.length !== 2) throw new Error('Enter a valid email address');
  const [local, domain] = parts;
  if (!local || local.length > 64 || !/^[a-zA-Z0-9!#$%&'*+\-/=?^_`{|}~]+(?:\.[a-zA-Z0-9!#$%&'*+\-/=?^_`{|}~]+)*$/.test(local)) throw new Error('Enter a valid email address');
  const labels = domain.split('.');
  if (labels.length < 2 || labels.some((label) => !/^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/.test(label))) throw new Error('Enter a valid email address');
  const canonicalLocal = local.split('+')[0].toLowerCase();
  if (!canonicalLocal || canonicalLocal.endsWith('.')) throw new Error('Enter a valid email address');
  return { raw, normalized: `${canonicalLocal}@${domain.toLowerCase()}`, kind: 'EMAIL' };
}
export function maskEmail(email: string): string {
  const [local, domain] = normalizeIdentifier(email).normalized.split('@');
  return `${local[0]}***@${domain}`;
}
