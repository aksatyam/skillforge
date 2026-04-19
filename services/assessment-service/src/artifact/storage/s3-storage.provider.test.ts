import { describe, it, expect, beforeEach, vi } from 'vitest';

// ── Mock the AWS SDKs before importing the provider ────────────────
// Vitest hoists `vi.mock(...)` calls above every module-level statement,
// so any variable the factory references must also be hoisted — that's
// what `vi.hoisted()` is for. Without it, `FakeS3Client` and friends
// are in the temporal dead zone when the factory runs.
const { sentCommands, FakeS3Client, FakePutCommand, FakeGetCommand } =
  vi.hoisted(() => {
    const sent: Array<{ name: string; input: Record<string, unknown> }> = [];

    class FakePutCommand {
      readonly name = 'PutObjectCommand';
      constructor(public readonly input: Record<string, unknown>) {
        sent.push({ name: this.name, input });
      }
    }

    class FakeGetCommand {
      readonly name = 'GetObjectCommand';
      constructor(public readonly input: Record<string, unknown>) {
        sent.push({ name: this.name, input });
      }
    }

    class FakeS3Client {
      // Captured for completeness; the real client also takes region + creds.
      constructor(public readonly cfg: Record<string, unknown> = {}) {}
    }

    return {
      sentCommands: sent,
      FakeS3Client,
      FakePutCommand,
      FakeGetCommand,
    };
  });

vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: FakeS3Client,
  PutObjectCommand: FakePutCommand,
  GetObjectCommand: FakeGetCommand,
}));

// getSignedUrl is the only S3 call the provider actually makes. We
// stitch together a URL from the command input so the assertions can
// grep for bucket/key/disposition without a real AWS request.
vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn(
    async (
      _client: unknown,
      // `FakePutCommand` / `FakeGetCommand` are destructured values out of
      // `vi.hoisted()`, so they're value bindings — not types. Use
      // `InstanceType<typeof X>` to get the matching instance type.
      command: InstanceType<typeof FakePutCommand> | InstanceType<typeof FakeGetCommand>,
      opts: { expiresIn: number },
    ) => {
      const input = command.input as Record<string, string>;
      const base = `https://${String(input.Bucket)}.s3.amazonaws.com/${String(input.Key)}`;
      const query: string[] = [
        `X-Amz-Expires=${opts.expiresIn}`,
        `X-Amz-Signature=stub`,
      ];
      if (typeof input.ResponseContentDisposition === 'string') {
        query.push(
          `response-content-disposition=${encodeURIComponent(
            input.ResponseContentDisposition,
          )}`,
        );
      }
      if (typeof input.ContentType === 'string') {
        query.push(`Content-Type=${encodeURIComponent(input.ContentType)}`);
      }
      return `${base}?${query.join('&')}`;
    },
  ),
}));

// Import AFTER mocks
import { S3StorageProvider } from './s3-storage.provider';

const ORG_A = 'org-1111-1111-4111-8111-aaaaaaaaaaaa';
const ORG_B = 'org-1111-1111-4111-8111-bbbbbbbbbbbb';
const ARTIFACT = 'art-5555-5555-4555-8555-111111111111';

describe('S3StorageProvider', () => {
  beforeEach(() => {
    sentCommands.length = 0;
    process.env.S3_BUCKET = 'skillforge-test-bucket';
    process.env.S3_REGION = 'ap-south-1';
  });

  it('throws during construction if S3_BUCKET is missing', () => {
    delete process.env.S3_BUCKET;
    expect(() => new S3StorageProvider()).toThrow(/S3_BUCKET/);
  });

  it('reports mode = "s3"', () => {
    const provider = new S3StorageProvider();
    expect(provider.mode).toBe('s3');
  });

  describe('issueUploadUrl()', () => {
    it('sends PutObjectCommand with bucket + tenant prefix + artifact id and pinned content-type', async () => {
      const provider = new S3StorageProvider();
      const { uploadUrl, headers } = await provider.issueUploadUrl({
        artifactId: ARTIFACT,
        orgId: ORG_A,
        mimeType: 'application/pdf',
        fileSizeBytes: 1024,
      });

      expect(sentCommands).toHaveLength(1);
      expect(sentCommands[0].name).toBe('PutObjectCommand');
      expect(sentCommands[0].input).toMatchObject({
        Bucket: 'skillforge-test-bucket',
        Key: `${ORG_A}/${ARTIFACT}`,
        ContentType: 'application/pdf',
      });

      // The stitched URL should contain all three discriminators.
      expect(uploadUrl).toContain('skillforge-test-bucket');
      expect(uploadUrl).toContain(ORG_A);
      expect(uploadUrl).toContain(ARTIFACT);
      // Browser must echo the same Content-Type header S3 signed over.
      expect(headers).toEqual({ 'content-type': 'application/pdf' });
    });

    it('tenant prefix appears first in the key (IAM path-prefix policies)', async () => {
      const provider = new S3StorageProvider();
      await provider.issueUploadUrl({
        artifactId: ARTIFACT,
        orgId: ORG_B,
        mimeType: 'image/png',
        fileSizeBytes: 2048,
      });
      const cmd = sentCommands[0];
      const key = String(cmd.input.Key);
      expect(key.startsWith(`${ORG_B}/`)).toBe(true);
      expect(key).toBe(`${ORG_B}/${ARTIFACT}`);
    });

    it('accepts an injected S3Client (DI for tests and IAM role swaps)', async () => {
      const injected = new (class {
        constructor() {}
      })() as unknown as import('@aws-sdk/client-s3').S3Client;
      const provider = new S3StorageProvider(injected);
      const { uploadUrl } = await provider.issueUploadUrl({
        artifactId: ARTIFACT,
        orgId: ORG_A,
        mimeType: 'application/pdf',
        fileSizeBytes: 1024,
      });
      expect(uploadUrl).toContain('skillforge-test-bucket');
    });
  });

  describe('issueDownloadUrl()', () => {
    it('sends GetObjectCommand with tenant prefix and response-content-disposition', async () => {
      const provider = new S3StorageProvider();
      const { downloadUrl } = await provider.issueDownloadUrl({
        artifactId: ARTIFACT,
        orgId: ORG_A,
        mimeType: 'application/pdf',
        fileName: 'q3-report.pdf',
      });

      expect(sentCommands).toHaveLength(1);
      expect(sentCommands[0].name).toBe('GetObjectCommand');
      expect(sentCommands[0].input).toMatchObject({
        Bucket: 'skillforge-test-bucket',
        Key: `${ORG_A}/${ARTIFACT}`,
        ResponseContentDisposition: 'attachment; filename="q3-report.pdf"',
        ResponseContentType: 'application/pdf',
      });

      // The stitched URL surfaces the disposition in the query string so
      // IAM-side logs and the browser see the same instruction.
      expect(downloadUrl).toContain('response-content-disposition=');
      expect(downloadUrl).toContain(
        encodeURIComponent('attachment; filename="q3-report.pdf"'),
      );
    });

    it('sanitizes filenames that contain quotes or newlines', async () => {
      const provider = new S3StorageProvider();
      await provider.issueDownloadUrl({
        artifactId: ARTIFACT,
        orgId: ORG_A,
        mimeType: 'text/plain',
        fileName: 'evil"\nname.txt',
      });
      const disposition = String(sentCommands[0].input.ResponseContentDisposition);
      expect(disposition).toBe('attachment; filename="evil__name.txt"');
    });

    it('keeps tenant isolation on download URLs too', async () => {
      const provider = new S3StorageProvider();
      await provider.issueDownloadUrl({
        artifactId: ARTIFACT,
        orgId: ORG_B,
        mimeType: 'application/pdf',
        fileName: 'f.pdf',
      });
      const key = String(sentCommands[0].input.Key);
      expect(key.startsWith(`${ORG_B}/`)).toBe(true);
    });
  });
});
