import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import type { StorageProvider } from './storage-provider.interface';

/** Upload URL lifetime — long enough for a human to finish picking a file
 * and for large attachments to PUT, short enough to limit replay risk. */
const UPLOAD_TTL_SECONDS = 15 * 60;

/** Download URL lifetime — just enough for the browser to follow the
 * redirect and start streaming. */
const DOWNLOAD_TTL_SECONDS = 5 * 60;

/**
 * S3-backed provider. Object keys are prefixed with the tenant id so
 * IAM least-privilege policies can scope an assume-role to a single
 * org's prefix: `${orgId}/*`.
 *
 * Credentials come from the default AWS provider chain
 * (AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY, IAM roles, etc.).
 *
 * The controller wires this to the same `/artifacts/upload-url` and
 * `/artifacts/:id/download-url` endpoints — the frontend can't tell the
 * two modes apart. The direct S3 upload PUT bypasses the Nest backend
 * entirely, so `acceptUpload` is intentionally omitted.
 */
export class S3StorageProvider implements StorageProvider {
  readonly mode = 's3' as const;

  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(client?: S3Client) {
    const bucket = process.env.S3_BUCKET;
    if (!bucket) {
      throw new Error(
        'S3_BUCKET env var is required when STORAGE_MODE=s3',
      );
    }
    this.bucket = bucket;
    this.client =
      client ?? new S3Client({ region: process.env.S3_REGION });
  }

  /** Tenant prefix first so bucket policies can grant `${orgId}/*`. */
  private keyFor(orgId: string, artifactId: string): string {
    return `${orgId}/${artifactId}`;
  }

  async issueUploadUrl(args: {
    artifactId: string;
    orgId: string;
    mimeType: string;
    fileSizeBytes: number;
  }): Promise<{ uploadUrl: string; headers: Record<string, string> }> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: this.keyFor(args.orgId, args.artifactId),
      // Pinning the ContentType in the presigned URL forces the client
      // to send a matching Content-Type header — otherwise S3 rejects
      // the request.
      ContentType: args.mimeType,
    });
    const uploadUrl = await getSignedUrl(this.client, command, {
      expiresIn: UPLOAD_TTL_SECONDS,
    });
    return {
      uploadUrl,
      headers: { 'content-type': args.mimeType },
    };
  }

  async issueDownloadUrl(args: {
    artifactId: string;
    orgId: string;
    mimeType: string;
    fileName: string;
  }): Promise<{ downloadUrl: string }> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: this.keyFor(args.orgId, args.artifactId),
      // Tells the browser to save the file with its original name rather
      // than a UUID. The quoting follows RFC 6266.
      ResponseContentDisposition: `attachment; filename="${sanitizeFileName(args.fileName)}"`,
      ResponseContentType: args.mimeType,
    });
    const downloadUrl = await getSignedUrl(this.client, command, {
      expiresIn: DOWNLOAD_TTL_SECONDS,
    });
    return { downloadUrl };
  }
}

/**
 * Strip characters that would break the Content-Disposition header.
 * S3 percent-encodes the query param, but we still guard against stray
 * quotes or newlines landing in the header value.
 */
function sanitizeFileName(name: string): string {
  return name.replace(/["\r\n]/g, '_');
}
