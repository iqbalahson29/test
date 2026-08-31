import { IsString, Matches } from 'class-validator';

export class SetJoinCodeDto {
  @IsString()
  @Matches(/^[A-Za-z0-9]{4,12}$/, {
    message: 'Code must be 4-12 letters and numbers',
  })
  joinCode: string;
}
