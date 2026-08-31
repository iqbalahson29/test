import { IsEmail, IsOptional, IsString } from 'class-validator';
import { IsStrongPassword } from '../../common/is-strong-password.decorator';

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @IsStrongPassword()
  newPassword?: string;
}
