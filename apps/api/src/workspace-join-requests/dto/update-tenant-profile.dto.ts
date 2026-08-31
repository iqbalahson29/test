import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateTenantProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsString()
  bannerImageUrl?: string;
}
