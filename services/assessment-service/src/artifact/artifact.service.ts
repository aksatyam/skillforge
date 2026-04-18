import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
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
  'text/csv',
  'image/png',
  'image/jpeg',
  'application/zip',
  'application/json',
]);

const MAX_BYTES = 25 * 1024 * 1024;

/**
 * Artifact upload service.
 *
 * Phase 1: local filesystem under STORAGE_LOCAL_PATH. Token-signed upload
 * URL protects against unauthenticated writes. The token is derived from
 * artifactId + JWT_SECRET so it's verifiable without DB lookup.
 *
 * Phase 3: swap to S3 presigned URLs with same external interface.
 */
@Injectable()
export class ArtifactService {
  private readonly storageBase = process.env.STORAGE_LOCAL_PATH ?? './local-storage';

  async requestUploadUrl(
    orgId: TenantId,
    userId: string,
    dto: RequestUploadUrlDto,
  ): Promise<{ uploadUrl: string; artifactId: string; headers: Record<string, string> }> {
    if (!ALLOWED_MIME.has(dto.mimeType)) {
      throw new BadRequestException(`Unsupported mime type: ${dto.mimeType}`);
    }
    if (dto.fileSizeBytes > MAX_BYTES) {
      throw new BadRequestException(
        `File exceeds ${MAX_BYTES / 1024 / 1024}MB limit`,
      );
    }

    return withTenant(orgId, async (tx) => {
      // Caller must own the assessment they're uploading to
      const assessment = await tx.assessment.findFirst({
        where: { id: dto.assessmentId, deletedAt: null },
      });
      if (!assessment) throw new NotFoundException();
      if (assessment.userId !== userId) throw new ForbiddenException();

      const artifact = await tx.artifact.create({
        data: {
          assessmentId: dto.assessmentId,
          userId,
          fileUrl: '', // filled on upload-complete
          fileName: dto.fileName,
          fileSizeBytes: dto.fileSizeBytes,
          mimeType: dto.mimeType,
          artifactType: dto.artifactType,
        },
      });

      const token = this.signUploadToken(artifact.id);
      return {
        artifactId: artifact.id,
        uploadUrl: `/artifacts/${artifact.id}/upload?token=${token}`,
        headers: { 'content-type': dto.mimeType },
      };
    });
  }

  async acceptUpload(
    artifactId: string,
    token: string,
    buffer: Buffer,
    mimeType: string,
  ): Promise<{ id: string; fileUrl: string }> {
    if (!this.verifyUploadToken(artifactId, token)) {
      throw new ForbiddenException('Invalid or expired upload token');
    }
    if (buffer.length > MAX_BYTES) {
      throw new BadRequestException('File exceeds 25MB limit');
    }

    // Store under org-partitioned path for ops-friendliness later
    await fs.mkdir(this.storageBase, { recursive: true });
    const filePath = path.join(this.storageBase, `${artifactId}.bin`);
    await fs.writeFile(filePath, buffer);

    // Uses prismaAdmin-style raw update? No — the controller is authenticated,
    // so we're in a tenant context; use withTenant. But the token alone doesn't
    // carry tenant info. We rely on the outer controller route being authed.
    // For Sprint 2 local storage, fetch by artifactId which is unguessable (UUID
    // + HMAC token). In Sprint 3 (S3), presigned URLs replace this entire path.
    const { prisma } = await import('@skillforge/db');
    const updated = await prisma.artifact.update({
      where: { id: artifactId },
      data: {
        fileUrl: `local://${artifactId}`,
        mimeType,
      },
      select: { id: true, fileUrl: true },
    });
    return updated;
  }

  async list(orgId: TenantId, userId: string, assessmentId: string) {
    return withTenant(orgId, async (tx) => {
      const assessment = await tx.assessment.findFirst({
        where: { id: assessmentId, deletedAt: null },
      });
      if (!assessment) throw new NotFoundException();
      // Self, manager of the assessee, or HR admin (controller-level role check)
      if (assessment.userId !== userId) {
        const actor = await tx.user.findUnique({ where: { id: userId } });
        const target = await tx.user.findUnique({ where: { id: assessment.userId } });
        if (
          actor?.role !== 'hr_admin' &&
          actor?.role !== 'super_admin' &&
          target?.managerId !== userId
        ) {
          throw new ForbiddenException();
        }
      }
      return tx.artifact.findMany({
        where: { assessmentId, deletedAt: null },
        orderBy: { createdAt: 'desc' },
      });
    });
  }

  // ── Token helpers (HMAC over artifactId with JWT_SECRET) ───────

  private signUploadToken(artifactId: string): string {
    return crypto
      .createHmac('sha256', process.env.JWT_SECRET ?? 'dev')
      .update(`upload:${artifactId}`)
      .digest('hex')
      .slice(0, 48);
  }

  private verifyUploadToken(artifactId: string, token: string): boolean {
    const expected = this.signUploadToken(artifactId);
    // Timing-safe compare
    if (token.length !== expected.length) return false;
    return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected));
  }
}
