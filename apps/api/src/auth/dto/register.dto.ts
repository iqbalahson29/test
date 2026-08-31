import { IsEmail, IsString, MinLength } from 'class-validator';
import { IsStrongPassword } from '../../common/is-strong-password.decorator';

export class RegisterDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(1)
  name: string;

  @IsString()
  @IsStrongPassword()
  password: string;
}
