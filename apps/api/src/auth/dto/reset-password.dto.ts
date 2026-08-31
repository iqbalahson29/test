import { IsString, MinLength } from 'class-validator';
import { IsStrongPassword } from '../../common/is-strong-password.decorator';

export class ResetPasswordDto {
  @IsString()
  @MinLength(1)
  token: string;

  @IsString()
  @IsStrongPassword()
  newPassword: string;
}
