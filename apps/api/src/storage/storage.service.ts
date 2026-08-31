import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CreateBucketCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const PRESIGNED_URL_EXPIRY_SECONDS = 300;

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private readonly s3: S3Client;
  private readonly bucket: string;

  constructor(private readonly config: ConfigService) {
    this.bucket = this.config.getOrThrow<string>('S3_BUCKET');
    this.s3 = new S3Client({
      endpoint: this.config.getOrThrow<string>('S3_ENDPOINT'),
      region: this.config.getOrThrow<string>('S3_REGION'),
      credentials: {
        accessKeyId: this.config.getOrThrow<string>('S3_ACCESS_KEY_ID'),
        secretAccessKey: this.config.getOrThrow<string>('S3_SECRET_ACCESS_KEY'),
      },
      forcePathStyle: true,
    });
  }

  // Bucket CORS is set via the MINIO_API_CORS_ALLOW_ORIGIN server env var
  // (see README), not the S3 PutBucketCors API — MinIO's implementation of
  // that operation 501s against the checksum trailer header newer AWS SDK
  // v3 versions send by default, so calling it here isn't viable.
  async onModuleInit() {
    try {
      await this.s3.send(new CreateBucketCommand({ Bucket: this.bucket }));
      this.logger.log(`Created bucket "${this.bucket}"`);
    } catch (err) {
      const name = (err as { name?: string }).name;
      if (name !== 'BucketAlreadyOwnedByYou' && name !== 'BucketAlreadyExists') {
        this.logger.error('Failed to create/verify storage bucket', err as Error);
      }
    }
  }

  async getUploadUrl(key: string, contentType: string): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType,
    });
    return getSignedUrl(this.s3, command, { expiresIn: PRESIGNED_URL_EXPIRY_SECONDS });
  }

  async getDownloadUrl(key: string): Promise<string> {
    const command = new GetObjectCommand({ Bucket: this.bucket, Key: key });
    return getSignedUrl(this.s3, command, { expiresIn: PRESIGNED_URL_EXPIRY_SECONDS });
  }

  /**
   * Same as getDownloadUrl, but asks the browser to render the file inline
   * rather than prompting a save dialog — used for view-only attachments.
   * This is a UX nicety, not an access-control boundary: a presigned GET
   * URL is fetchable by whoever holds it regardless of this header.
   */
  async getViewUrl(key: string, filename: string): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ResponseContentDisposition: `inline; filename="${filename.replace(/"/g, '')}"`,
    });
    return getSignedUrl(this.s3, command, { expiresIn: PRESIGNED_URL_EXPIRY_SECONDS });
  }
}
