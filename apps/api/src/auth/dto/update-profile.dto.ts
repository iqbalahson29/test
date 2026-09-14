import {
  IsBoolean,
  IsDateString,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  // A plain URL or a base64 data: URL for an uploaded photo — bounded well
  // above what a resized (256px) JPEG avatar encodes to.
  @IsOptional()
  @IsString()
  @MaxLength(350000)
  avatarUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  lastName?: string;

  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  bio?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  location?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  timezone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(35)
  locale?: string;

  @IsOptional()
  @IsBoolean()
  emailNotifications?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  gradeLevel?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  studentId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  guardianName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  guardianContact?: string;
}
