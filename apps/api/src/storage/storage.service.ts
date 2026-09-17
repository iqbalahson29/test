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
  private readonly endpoint: string;
  // Where browsers reach storage, when that is not where the API does. In production the API
  // talks to MinIO on the compose network and browsers go through nginx's /storage/ prefix.
  private readonly publicEndpoint?: string;

  constructor(private readonly config: ConfigService) {
    this.bucket = this.config.getOrThrow<string>('S3_BUCKET');
    this.endpoint = this.config.getOrThrow<string>('S3_ENDPOINT');
    this.publicEndpoint =
      this.config.get<string>('S3_PUBLIC_ENDPOINT') || undefined;
    this.s3 = new S3Client({
      endpoint: this.endpoint,
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
      if (
        name !== 'BucketAlreadyOwnedByYou' &&
        name !== 'BucketAlreadyExists'
      ) {
        this.logger.error(
          'Failed to create/verify storage bucket',
          err as Error,
        );
      }
    }
  }

  /**
   * A presigned URL is valid only for the host and path it was signed with, and a proxy that
   * strips a path prefix changes the path. So URLs are signed for S3_ENDPOINT and only then
   * moved under S3_PUBLIC_ENDPOINT; nginx strips that prefix again and forwards S3_ENDPOINT's
   * host, so MinIO verifies exactly the request that was signed.
   */
  private toPublicUrl(signedUrl: string): string {
    if (!this.publicEndpoint) return signedUrl;
    const url = new URL(signedUrl);
    const signedBase = new URL(this.endpoint).pathname.replace(/\/+$/, '');
    const publicBase = new URL(this.publicEndpoint);
    return `${publicBase.origin}${publicBase.pathname.replace(/\/+$/, '')}${url.pathname.slice(signedBase.length)}${url.search}`;
  }

  async getUploadUrl(key: string, contentType: string): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType,
    });
    return this.toPublicUrl(
      await getSignedUrl(this.s3, command, {
        expiresIn: PRESIGNED_URL_EXPIRY_SECONDS,
      }),
    );
  }

  async getDownloadUrl(key: string): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ResponseContentDisposition: 'attachment',
    });
    return this.toPublicUrl(
      await getSignedUrl(this.s3, command, {
        expiresIn: PRESIGNED_URL_EXPIRY_SECONDS,
      }),
    );
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
      ResponseContentDisposition: `attachment; filename="${filename.replace(/["\r\n]/g, '')}"`,
    });
    return this.toPublicUrl(
      await getSignedUrl(this.s3, command, {
        expiresIn: PRESIGNED_URL_EXPIRY_SECONDS,
      }),
    );
  }
}
