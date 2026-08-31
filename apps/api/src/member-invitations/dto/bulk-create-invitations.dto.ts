import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, ValidateNested } from 'class-validator';
import { CreateInvitationDto } from './create-invitation.dto';

export class BulkCreateInvitationsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateInvitationDto)
  entries: CreateInvitationDto[];
}
