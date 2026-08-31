import { IsEmail, IsEnum, IsOptional, IsString } from 'class-validator';
import { Role } from '@prisma/client';
import { IsStrongPassword } from '../../common/is-strong-password.decorator';

export class CreateMembershipDto {
  @IsEmail()
  email: string;

  @IsEnum(Role)
  role: Role;

  // Required only when `email` doesn't belong to an existing user yet.
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  @IsStrongPassword()
  password?: string;
}
