import { registerDecorator } from 'class-validator';
import { isStrongPassword } from '@quiz-platform/shared';
export function IsStrongPassword(): PropertyDecorator {
  return (target, propertyKey) =>
    registerDecorator({
      name: 'isStrongPassword',
      target: target.constructor,
      propertyName: String(propertyKey),
      options: {
        message:
          'Password needs 10 characters, uppercase, lowercase and a digit; maximum 72 UTF-8 bytes, no NUL',
      },
      validator: {
        validate: (value: unknown) =>
          isStrongPassword(value) && Buffer.byteLength(value, 'utf8') <= 72,
      },
    });
}
