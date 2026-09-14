import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { isStrongPassword, validLoginPassword } from '@quiz-platform/shared';
import { authError } from './security/primitives';
// Fixed valid cost-10 hash: timing work only; it can never identify an account.
const DUMMY_HASH =
  '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';
@Injectable()
export class PasswordService {
  async verify(password: unknown, hash?: string | null) {
    const valid = validLoginPassword(password);
    const matched = await bcrypt.compare(
      valid ? password : 'invalid-input',
      hash ?? DUMMY_HASH,
    );
    return valid && !!hash && matched;
  }
  async hash(password: string) {
    if (!isStrongPassword(password) || Buffer.byteLength(password, 'utf8') > 72)
      throw authError('VALIDATION_ERROR');
    return bcrypt.hash(password, 10);
  }
  async ensureFresh(
    password: string,
    current: string | null,
    history: string[],
  ) {
    for (const hash of [current, ...history].filter((s): s is string => !!s)) {
      if (await bcrypt.compare(password, hash))
        throw authError('PASSWORD_REUSED');
    }
  }
  history(current: string | null, previous: string[]) {
    return [...(current ? [current] : []), ...previous].slice(0, 5);
  }
}
