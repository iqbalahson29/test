import { applyDecorators } from '@nestjs/common';
import { Matches, MaxLength, MinLength } from 'class-validator';

// 72 is bcrypt's own input limit — anything past it is silently ignored, so
// capping here keeps "the password we validated" and "the password that
// actually gets hashed" the same string instead of let a long password give
// a false sense of strength.
const BCRYPT_MAX_BYTES = 72;

/**
 * Applies to every field that *creates or changes* a password (register,
 * profile password change, accept-invite, admin-created accounts, ...).
 * Deliberately not used on LoginDto.password, which verifies a password
 * that may predate this policy rather than create one under it.
 */
export function IsStrongPassword(): PropertyDecorator {
  return applyDecorators(
    MinLength(10, { message: 'Password must be at least 10 characters long' }),
    MaxLength(BCRYPT_MAX_BYTES, {
      message: `Password must be at most ${BCRYPT_MAX_BYTES} characters long`,
    }),
    Matches(/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, {
      message:
        'Password must include at least one uppercase letter, one lowercase letter, and one number',
    }),
  );
}
