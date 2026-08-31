import { BadRequestException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';

export const PASSWORD_HISTORY_LIMIT = 5;

/** Throws if `newPassword` matches the current password or any of the last
 * PASSWORD_HISTORY_LIMIT retired ones. */
export async function assertPasswordNotReused(
  newPassword: string,
  currentPasswordHash: string,
  previousPasswordHashes: string[],
): Promise<void> {
  for (const hash of [currentPasswordHash, ...previousPasswordHashes]) {
    if (await bcrypt.compare(newPassword, hash)) {
      throw new BadRequestException(
        "You've used this password before. Choose one you haven't used recently.",
      );
    }
  }
}

/** The history array to store alongside the new hash — the hash being
 * retired goes on the front, most-recent-first, capped to the limit. */
export function pushPasswordHistory(
  previousPasswordHashes: string[],
  retiredHash: string,
): string[] {
  return [retiredHash, ...previousPasswordHashes].slice(0, PASSWORD_HISTORY_LIMIT);
}
