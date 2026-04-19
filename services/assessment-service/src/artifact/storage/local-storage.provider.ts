import { BadRequestException, ForbiddenException } from '@nestjs/common';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import type { StorageProvider } from './storage-provider.interface';
import {
  signArtifactToken,
  verifyArtifactToken,
  type ArtifactTokenClaims,
} from './artifact-token';

const MAX_BYTES = 25 * 1024 * 1024;

/**
 * Default/dev provider.
 *
 * Upload flow:
 *   1. Service creates the artifact row and asks the provider to mint a
 *      signed JWT bound to `{ scope: 'upload', artifactId, orgId }` with
 *      a 15-min TTL.
 *   2. Browser PUTs raw bytes to `/artifacts/:id/upload?token=...`.
 *   3. The controller re-enters the provider via {@link acceptUpload} to
 *      verify the token (returns the decoded `orgId`), write the file to
 *      disk, and let the service update the row under `withTenant()`.
 *
 * Download flow: a matching 5-min JWT routes through
 * `/artifacts/:id/download?token=...`; the provider's
 * {@link verifyDownloadToken} returns `orgId` so the service can scope
 * the `artifact.findUnique` that resolves the filename + mime.
 *
 * The JWT carries `orgId` explicitly — the previous HMAC-over-artifactId
 * design had no tenant binding, which let a leaked token bypass the RLS
 * guarantee on the write path (pre-Sprint-6-audit regression).
 */
export class LocalStorageProvider implements StorageProvider {
  readonly mode = 'local' as const;

  private readonly storageBase =
    process.env.STORAGE_LOCAL_PATH ?? './local-storage';

  async issueUploadUrl(args: {
    artifactId: string;
    orgId: string;
    mimeType: string;
    fileSizeBytes: number;
  }): Promise<{ uploadUrl: string; headers: Record<string, string> }> {
    const token = await signArtifactToken('upload', args.artifactId, args.orgId);
    return {
      uploadUrl: `/artifacts/${args.artifactId}/upload?token=${token}`,
      headers: { 'content-type': args.mimeType },
    };
  }

  async issueDownloadUrl(args: {
    artifactId: string;
    orgId: string;
    mimeType: string;
    fileName: string;
  }): Promise<{ downloadUrl: string }> {
    const token = await signArtifactToken('download', args.artifactId, args.orgId);
    return {
      downloadUrl: `/artifacts/${args.artifactId}/download?token=${token}`,
    };
  }

  async acceptUpload(args: {
    artifactId: string;
    token: string;
    buffer: Buffer;
    mimeType: string;
  }): Promise<{ fileUrl: string; orgId: string }> {
    const claims = await verifyArtifactToken(args.token, {
      scope: 'upload',
      artifactId: args.artifactId,
    });
    if (!claims) {
      throw new ForbiddenException('Invalid or expired upload token');
    }
    if (args.buffer.length > MAX_BYTES) {
      throw new BadRequestException('File exceeds 25MB limit');
    }
    await fs.mkdir(this.storageBase, { recursive: true });
    const filePath = path.join(this.storageBase, `${args.artifactId}.bin`);
    await fs.writeFile(filePath, args.buffer);
    return { fileUrl: `local://${args.artifactId}`, orgId: claims.orgId };
  }

  /**
   * Controller helper for the local-mode download route. Exposed so the
   * service layer can stream bytes back after the token's orgId has been
   * plumbed back into `withTenant()` for the row lookup.
   */
  async readArtifactBytes(
    artifactId: string,
    token: string,
  ): Promise<{ buffer: Buffer; claims: ArtifactTokenClaims }> {
    const claims = await verifyArtifactToken(token, {
      scope: 'download',
      artifactId,
    });
    if (!claims) {
      throw new ForbiddenException('Invalid or expired download token');
    }
    const filePath = path.join(this.storageBase, `${artifactId}.bin`);
    const buffer = await fs.readFile(filePath);
    return { buffer, claims };
  }
}
