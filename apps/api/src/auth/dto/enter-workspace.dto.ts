import { IsString } from 'class-validator';

export class EnterWorkspaceDto {
  @IsString()
  tenantId: string;
}
