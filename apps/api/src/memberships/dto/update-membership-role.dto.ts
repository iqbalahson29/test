import { IsEnum } from 'class-validator';
import { Role } from '@prisma/client';

export class UpdateMembershipRoleDto {
  @IsEnum(Role)
  role: Role;
}
