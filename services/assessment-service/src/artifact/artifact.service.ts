import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Optional,
  NotFoundException,
} from '@nestjs/common';
import { withTenant, type TenantId } from '@skillforge/tenant-guard';
import type { RequestUploadUrlDto } from '@skillforge/shared-types';

import { LocalStorageProvider } from './storage/local-storage.provider';
import { createStorageProvider } from './storage/storage.factory';
import {
  STORAGE_PROVIDER,
  type StorageProvider,
} from './storage/storage-provider.interface';

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
 * Artifact upload/download service.
 *
 * Delegates the byte-handling dance to a {@link StorageProvider} picked
 * at bootstrap from STORAGE_MODE. This class owns:
 *   • DB row creation + persistence
 *   • MIME + size + tenant authorization checks
 *   • Access control for downloads (self / manager-of-record / hr_admin)
 *
 * Providers own:
 *   • URL minting (relative HMAC tokens or absolute S3 presigned URLs)
 *   • The local-mode byte write, if any
 */
@Injectable()
export class ArtifactService {
  private readonly provider: StorageProvider;

  /**
   * Constructor accepts a `StorageProvider` via either:
   *   • Nest DI with the `STORAGE_PROVIDER` token (see ArtifactModule), or
   *   • Direct `new ArtifactService(new LocalStorageProvider())` in tests.
   *
   * The `@Inject + @Optional` pair lets Nest resolve the token when present
   * but not fail when the service is instantiated outside DI (Vitest).
   */
  constructor(
    @Optional() @Inject(STORAGE_PROVIDER) provider?: StorageProvider,
  ) {
    this.provider = provider ?? createStorageProvider();
  }

  /** Exposed for the controller so it can disable local-only routes in s3 mode. */
  get storageMode(): 'local' | 's3' {
    return this.provider.mode;
  }

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
      // Caller must own the assessment they're uploading to.
      const assessment = await tx.assessment.findFirst({
        where: { id: dto.assessmentId, deletedAt: null },
      });
      if (!assessment) throw new NotFoundException();
      if (assessment.userId !== userId) throw new ForbiddenException();

      const artifact = await tx.artifact.create({
        data: {
          assessmentId: dto.assessmentId,
          userId,
          fileUrl: '', // filled on upload-complete (local) or lazily (s3)
          fileName: dto.fileName,
          fileSizeBytes: dto.fileSizeBytes,
          mimeType: dto.mimeType,
          artifactType: dto.artifactType,
        },
      });

      const { uploadUrl, headers } = await this.provider.issueUploadUrl({
        artifactId: artifact.id,
        orgId,
        mimeType: dto.mimeType,
        fileSizeBytes: dto.fileSizeBytes,
      });

      return { artifactId: artifact.id, uploadUrl, headers };
    });
  }

  /**
   * Mint a short-lived download URL for an existing artifact, after
   * verifying the caller is allowed to see it (self, manager-of-record,
   * hr_admin, or super_admin).
   */
  async requestDownloadUrl(
    orgId: TenantId,
    userId: string,
    artifactId: string,
  ): Promise<{ downloadUrl: string }> {
    return withTenant(orgId, async (tx) => {
      const artifact = await tx.artifact.findFirst({
        where: { id: artifactId, deletedAt: null },
      });
      if (!artifact) throw new NotFoundException();

      const assessment = await tx.assessment.findFirst({
        where: { id: artifact.assessmentId, deletedAt: null },
      });
      if (!assessment) throw new NotFoundException();

      if (assessment.userId !== userId) {
        const actor = await tx.user.findUnique({ where: { id: userId } });
        const target = await tx.user.findUnique({
          where: { id: assessment.userId },
        });
        if (
          actor?.role !== 'hr_admin' &&
          actor?.role !== 'super_admin' &&
          target?.managerId !== userId
        ) {
          throw new ForbiddenException();
        }
      }

      return this.provider.issueDownloadUrl({
        artifactId,
        orgId,
        mimeType: artifact.mimeType ?? 'application/octet-stream',
        fileName: artifact.fileName ?? artifactId,
      });
    });
  }

  /**
   * Local-mode upload-completion callback. In s3 mode the browser PUTs
   * directly to S3 and this path is unreachable (controller returns 400).
   *
   * The upload token carries `orgId` (see artifact-token.ts) so the DB
   * write goes through `withTenant(orgId, …)` and respects RLS. Prior
   * Sprint-6 audit flagged the pre-token version as a tenant-bypass
   * regression — it was the one place in the codebase that wrote to
   * `prisma.artifact` without a tenant envelope.
   */
  async acceptUpload(
    artifactId: string,
    token: string,
    buffer: Buffer,
    mimeType: string,
  ): Promise<{ id: string; fileUrl: string }> {
    if (this.provider.mode !== 'local' || !this.provider.acceptUpload) {
      throw new BadRequestException(
        'Direct upload is disabled in s3 mode — use the presigned URL',
      );
    }
    if (buffer.length > MAX_BYTES) {
      throw new BadRequestException('File exceeds 25MB limit');
    }

    const { fileUrl, orgId } = await this.provider.acceptUpload({
      artifactId,
      token,
      buffer,
      mimeType,
    });

    return withTenant(orgId as TenantId, async (tx) => {
      // Scoped by {id, orgId} — belt-and-braces with RLS: the WHERE
      // clause ensures a forged token claiming orgId=X can't reach a
      // row in orgId=Y even if RLS were somehow disabled.
      const updated = await tx.artifact.updateMany({
        where: { id: artifactId },
        data: { fileUrl, mimeType },
      });
      if (updated.count === 0) throw new NotFoundException();
      return { id: artifactId, fileUrl };
    });
  }

  /**
   * Local-mode download streamer. Verifies the signed download token,
   * extracts orgId from it, and scopes the row lookup via withTenant.
   * Throws 400 in s3 mode (browser is redirected to the presigned URL).
   */
  async streamLocalDownload(
    artifactId: string,
    token: string,
  ): Promise<{ buffer: Buffer; fileName: string; mimeType: string }> {
    if (this.provider.mode !== 'local') {
      throw new BadRequestException(
        'Direct download is disabled in s3 mode — use the presigned URL',
      );
    }

    const local = this.provider as LocalStorageProvider;
    const { buffer, claims } = await local.readArtifactBytes(artifactId, token);

    return withTenant(claims.orgId as TenantId, async (tx) => {
      const artifact = await tx.artifact.findFirst({
        where: { id: artifactId, deletedAt: null },
        select: { fileName: true, mimeType: true },
      });
      if (!artifact) throw new NotFoundException();
      return {
        buffer,
        fileName: artifact.fileName ?? `${artifactId}.bin`,
        mimeType: artifact.mimeType ?? 'application/octet-stream',
      };
    });
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
}
