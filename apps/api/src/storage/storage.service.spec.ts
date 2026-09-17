import { ConfigService } from '@nestjs/config';
import { StorageService } from './storage.service';

const KEY = 'attempts/attempt-1/question-1/0f9c-proof.txt';
const storage = (extra: Record<string, string> = {}) =>
  new StorageService(
    new ConfigService({
      S3_BUCKET: 'quiz-platform',
      S3_ENDPOINT: 'http://minio:9000',
      S3_REGION: 'us-east-1',
      S3_ACCESS_KEY_ID: 'storage-user',
      S3_SECRET_ACCESS_KEY: 'storage-secret-value',
      ...extra,
    }),
  );

describe('StorageService presigned URLs', () => {
  // A fixed clock makes two signatures of the same request byte-identical.
  beforeEach(() =>
    jest
      .useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'setTimeout'] })
      .setSystemTime(new Date('2026-09-17T12:00:00Z')),
  );
  afterEach(() => jest.useRealTimers());

  it('returns the URL signed for S3_ENDPOINT when no public endpoint is set', async () => {
    const url = new URL(await storage().getUploadUrl(KEY, 'text/plain'));
    expect(`${url.origin}${url.pathname}`).toBe(
      `http://minio:9000/quiz-platform/${KEY}`,
    );
    expect(url.searchParams.get('X-Amz-Signature')).toMatch(/^[0-9a-f]{64}$/);
  });

  it.each([
    'https://quiz.example.test/storage',
    'https://quiz.example.test/storage/',
  ])(
    'moves the signed URL under %s without changing what was signed',
    async (publicEndpoint) => {
      const signed = new URL(await storage().getDownloadUrl(KEY));
      const handedOut = new URL(
        await storage({ S3_PUBLIC_ENDPOINT: publicEndpoint }).getDownloadUrl(
          KEY,
        ),
      );
      expect(`${handedOut.origin}${handedOut.pathname}`).toBe(
        `https://quiz.example.test/storage/quiz-platform/${KEY}`,
      );
      expect(handedOut.search).toBe(signed.search);
    },
  );

  it('treats an empty S3_PUBLIC_ENDPOINT as unset', async () => {
    const url = new URL(
      await storage({ S3_PUBLIC_ENDPOINT: '' }).getViewUrl(KEY, 'proof.txt'),
    );
    expect(url.origin).toBe('http://minio:9000');
  });
});
