import { IsString } from 'class-validator';

export class SwitchWorkspaceDto {
  @IsString()
  membershipId: string;
}
