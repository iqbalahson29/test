import { IsString, MinLength } from 'class-validator';
import { IsStrongPassword } from '../../common/is-strong-password.decorator';

export class AcceptInvitationDto {
  @IsString()
  @MinLength(1)
  name: string;

  @IsString()
  @IsStrongPassword()
  password: string;
}
