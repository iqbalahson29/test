import { IsIn, IsString, MinLength } from 'class-validator';

export const ALLOWED_ATTACHMENT_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
] as const;

export const ALLOWED_IMAGE_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
] as const;

const ALLOWED_UPLOAD_MIME_TYPES = [
  ...ALLOWED_ATTACHMENT_MIME_TYPES,
  ...ALLOWED_IMAGE_MIME_TYPES,
];

export class RequestPracticeAttachmentUploadUrlDto {
  @IsString()
  @MinLength(1)
  filename: string;

  @IsIn(ALLOWED_UPLOAD_MIME_TYPES)
  contentType: string;
}
