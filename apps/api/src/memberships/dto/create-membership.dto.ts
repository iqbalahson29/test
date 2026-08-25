import { IsEmail, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { Role } from '@prisma/client';

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
  @MinLength(8)
  password?: string;
}
