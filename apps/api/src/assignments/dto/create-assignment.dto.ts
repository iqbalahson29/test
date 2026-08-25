import { IsDateString, IsOptional, IsString } from 'class-validator';

export class CreateAssignmentDto {
  @IsString()
  quizId: string;

  // Exactly one of these two must be set — checked in the service, since
  // class-validator doesn't have a clean built-in XOR.
  @IsOptional()
  @IsString()
  studentMembershipId?: string;

  @IsOptional()
  @IsString()
  groupId?: string;

  @IsOptional()
  @IsDateString()
  dueAt?: string;
}
