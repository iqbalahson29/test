// Run by deploy/release.sh from the operations image, on the compose network and before the
// maintenance switch: proves that S3_ENDPOINT and the S3 credentials in .env work from where
// the API runs, and creates the bucket on a fresh MinIO volume. The API makes the same call at
// startup but only logs a failure, which previously surfaced as broken uploads on a live site.
import { CreateBucketCommand, S3Client } from '@aws-sdk/client-s3';

const env = process.env;
const s3 = new S3Client({
  endpoint: env.S3_ENDPOINT,
  region: env.S3_REGION,
  forcePathStyle: true,
  credentials: {
    accessKeyId: env.S3_ACCESS_KEY_ID ?? '',
    secretAccessKey: env.S3_SECRET_ACCESS_KEY ?? '',
  },
});

try {
  await s3.send(new CreateBucketCommand({ Bucket: env.S3_BUCKET }));
  console.log(`Created storage bucket "${env.S3_BUCKET}".`);
} catch (err) {
  if (err?.name !== 'BucketAlreadyOwnedByYou' && err?.name !== 'BucketAlreadyExists') {
    console.error(`Storage check against S3_ENDPOINT=${env.S3_ENDPOINT} failed: ${err?.name}: ${err?.message}`);
    process.exit(1);
  }
  console.log(`Storage bucket "${env.S3_BUCKET}" is reachable.`);
}
