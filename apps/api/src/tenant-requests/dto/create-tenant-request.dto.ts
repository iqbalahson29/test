import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { IsStrongPassword } from '../../common/is-strong-password.decorator';

export class CreateTenantRequestDto {
  @IsString()
  @MinLength(2)
  workspaceName: string;

  @IsOptional()
  @IsString()
  @MaxLength(280)
  description?: string;

  @IsString()
  @MinLength(2)
  requesterName: string;

  @IsEmail()
  requesterEmail: string;

  @IsString()
  @IsStrongPassword()
  password: string;
}
