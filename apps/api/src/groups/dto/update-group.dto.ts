import { IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateGroupDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;
}
