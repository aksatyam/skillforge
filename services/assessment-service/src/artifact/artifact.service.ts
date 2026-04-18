import { Injectable, BadRequestException } from '@nestjs/common';
import { withTenant, type TenantId } from '@skillforge/tenant-guard';
import type { RequestUploadUrlDto } from '@skillforge/shared-types';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import * as crypto from 'node:crypto';

const ALLOWED_MIME = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
  'application/vnd.openxmlformats-officedocument.presentationml.presentation', // .pptx
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'text/plain',
  'text/markdown',
  'image/png',
  'image/jpeg',
  'application/zip',
]);

const MAX_BYTES = 25 * 1024 * 1024;

/**
 * Artifact upload service.
 *
 * Phase 1: local filesystem under STORAGE_LOCAL_PATH.
 * Phase 3: swap to S3 presigned URLs with same interface.
 */
@Injectable()
export class ArtifactService {
  async requestUploadUrl(
    orgId: TenantId,
    userId: string,
    dto: RequestUploadUrlDto,
  ): Promise<{ uploadUrl: string; artifactId: string; headers: Record<string, string> }> {
    if (!ALLOWED_MIME.has(dto.mimeType)) {
      throw new BadRequestException(`Unsupported mime type: ${dto.mimeType}`);
    }
    if (dto.fileSizeBytes > MAX_BYTES) {
      throw new BadRequestException(`File exceeds ${MAX_BYTES / 1024 / 1024}MB limit`);
    }

    return withTenant(orgId, async (tx) => {
      const artifact = await tx.artifact.create({
        data: {
          assessmentId: dto.assessmentId,
          userId,
          fileUrl: '', // filled on upload completion
          fileName: dto.fileName,
          fileSizeBytes: dto.fileSizeBytes,
          mimeType: dto.mimeType,
          artifactType: dto.artifactType,
        },
      });

      // For local-dev we return a PUT URL to an internal endpoint that accepts the file.
      // TODO(Sprint 2): swap to S3 presigned URL when STORAGE_MODE=s3.
      const uploadToken = crypto
        .createHash('sha256')
        .update(`${artifact.id}:${process.env.JWT_SECRET}`)
        .digest('hex')
        .slice(0, 32);

      return {
        artifactId: artifact.id,
        uploadUrl: `/artifacts/${artifact.id}/upload?token=${uploadToken}`,
        headers: { 'content-type': dto.mimeType },
      };
    });
  }

  async storeLocal(artifactId: string, buffer: Buffer): Promise<string> {
    const base = process.env.STORAGE_LOCAL_PATH ?? './local-storage';
    await fs.mkdir(base, { recursive: true });
    const filePath = path.join(base, `${artifactId}.bin`);
    await fs.writeFile(filePath, buffer);
    return filePath;
  }
}
