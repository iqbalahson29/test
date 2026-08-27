import { IsString } from 'class-validator';

export class SelectWorkspaceDto {
  @IsString()
  selectionToken: string;

  @IsString()
  membershipId: string;
}
