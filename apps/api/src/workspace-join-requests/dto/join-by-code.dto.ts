import { IsString, MinLength } from 'class-validator';

export class JoinByCodeDto {
  @IsString()
  @MinLength(1)
  code: string;
}
