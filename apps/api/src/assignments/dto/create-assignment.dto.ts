import { IsDateString, IsEmail, IsOptional, IsString } from 'class-validator';

export class CreateAssignmentDto {
  @IsString()
  quizId: string;

  // Exactly one of these three must be set — checked in the service, since
  // class-validator doesn't have a clean built-in XOR. studentEmail is the
  // primary path used by the assignment-panel UI now (auto-joins the
  // student to this tenant if they aren't a member yet); studentMembershipId
  // is kept for backward compatibility.
  @IsOptional()
  @IsEmail()
  studentEmail?: string;

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
