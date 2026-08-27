import { IsEmail, IsString, MinLength } from 'class-validator';

export class CreateTenantRequestDto {
  @IsString()
  @MinLength(2)
  workspaceName: string;

  @IsString()
  @MinLength(2)
  requesterName: string;

  @IsEmail()
  requesterEmail: string;

  @IsString()
  @MinLength(8)
  password: string;
}
