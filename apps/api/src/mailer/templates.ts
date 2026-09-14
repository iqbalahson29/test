import type { MailMessage } from './mail-driver';
export const escapeHtml = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ]!,
  );
export function otpTemplate(
  purpose: string,
  code: string,
  origin: string,
  seconds: number,
) {
  const host = new URL(origin).hostname;
  const text = `${host}: ${purpose.toLowerCase().replaceAll('_', ' ')}\n\nYour code is ${code}. It expires in ${Math.max(1, Math.ceil(seconds / 60))} minutes.\n\nIgnore this message if you did not request it.`;
  return {
    subject: 'Your verification code',
    text,
    html: `<p>${escapeHtml(host)}: ${escapeHtml(purpose.toLowerCase().replaceAll('_', ' '))}</p><p>Your code is <strong style="font-size:28px;letter-spacing:6px">${code}</strong>.</p><p>Expires in ${Math.max(1, Math.ceil(seconds / 60))} minutes. Ignore this message if you did not request it.</p>`,
  };
}
export function noticeTemplate(
  kind: string,
  origin: string,
  detail: string,
  inviteToken?: string,
) {
  const url = new URL(inviteToken ? '/accept-invite' : '/login', origin);
  if (url.origin !== origin) throw new Error('Invalid mail origin');
  if (inviteToken) url.hash = `token=${inviteToken}`;
  const title =
    kind === 'INVITE'
      ? 'You have been invited to a workspace'
      : 'Account security notice';
  const text = `${title}\n\n${detail}\n\n${url.href}\n\nIf you did not request this, contact your administrator.`;
  return {
    subject: title,
    text,
    html: `<h1>${escapeHtml(title)}</h1><p>${escapeHtml(detail)}</p><p><a href="${escapeHtml(url.href)}">${inviteToken ? 'Review invitation' : 'Sign in'}</a></p><p>If you did not request this, contact your administrator.</p>`,
  };
}
export function safeMessage(m: MailMessage) {
  if (m.recipient.includes('\n') || m.subject.includes('\n'))
    throw new Error('Invalid mail');
  return m;
}
