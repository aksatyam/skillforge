import { BadRequestException, ForbiddenException } from '@nestjs/common';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import type { StorageProvider } from './storage-provider.interface';

const MAX_BYTES = 25 * 1024 * 1024;

/**
 * Default/dev provider.
 *
 * Upload flow:
 *   1. Service creates the artifact row and asks the provider to mint an
 *      HMAC-signed relative URL.
 *   2. Browser PUTs raw bytes to `/artifacts/:id/upload?token=...`.
 *   3. The controller re-enters the provider via {@link acceptUpload} to
 *      verify the token, write the file to disk, and update the row.
 *
 * Download flow (local): a matching HMAC-signed relative URL routes
 * through `/artifacts/:id/download?token=...` (wired up in the
 * controller layer).
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
    const token = this.signToken('upload', args.artifactId);
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
    const token = this.signToken('download', args.artifactId);
    return {
      downloadUrl: `/artifacts/${args.artifactId}/download?token=${token}`,
    };
  }

  async acceptUpload(args: {
    artifactId: string;
    token: string;
    buffer: Buffer;
    mimeType: string;
  }): Promise<{ fileUrl: string }> {
    if (!this.verifyToken('upload', args.artifactId, args.token)) {
      throw new ForbiddenException('Invalid or expired upload token');
    }
    if (args.buffer.length > MAX_BYTES) {
      throw new BadRequestException('File exceeds 25MB limit');
    }
    await fs.mkdir(this.storageBase, { recursive: true });
    const filePath = path.join(this.storageBase, `${args.artifactId}.bin`);
    await fs.writeFile(filePath, args.buffer);
    return { fileUrl: `local://${args.artifactId}` };
  }

  /**
   * Controller helper for the local-mode download route. Exposed so the
   * service layer can stream bytes back to the client after verifying
   * the token matches.
   */
  async readArtifactBytes(artifactId: string, token: string): Promise<Buffer> {
    if (!this.verifyToken('download', artifactId, token)) {
      throw new ForbiddenException('Invalid or expired download token');
    }
    const filePath = path.join(this.storageBase, `${artifactId}.bin`);
    return fs.readFile(filePath);
  }

  // ── HMAC token helpers (scope-prefixed so an upload token can't be
  //    replayed as a download token and vice-versa) ────────────────────

  private signToken(scope: 'upload' | 'download', artifactId: string): string {
    return crypto
      .createHmac('sha256', process.env.JWT_SECRET ?? 'dev')
      .update(`${scope}:${artifactId}`)
      .digest('hex')
      .slice(0, 48);
  }

  private verifyToken(
    scope: 'upload' | 'download',
    artifactId: string,
    token: string,
  ): boolean {
    const expected = this.signToken(scope, artifactId);
    if (token.length !== expected.length) return false;
    return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected));
  }
}
