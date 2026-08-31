import { IsIn, IsString, MinLength } from 'class-validator';

export const ALLOWED_ATTACHMENT_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
] as const;

export class RequestAttachmentUploadUrlDto {
  @IsString()
  @MinLength(1)
  filename: string;

  @IsIn(ALLOWED_ATTACHMENT_MIME_TYPES)
  contentType: string;
}
