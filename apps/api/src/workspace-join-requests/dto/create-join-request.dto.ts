import { IsString } from 'class-validator';

export class CreateJoinRequestDto {
  @IsString()
  tenantId: string;
}
