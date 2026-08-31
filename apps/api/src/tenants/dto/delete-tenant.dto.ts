import { IsString } from 'class-validator';

export class DeleteTenantDto {
  @IsString()
  slug: string;
}
