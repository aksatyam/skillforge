import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import type { TenantId } from '@skillforge/tenant-guard';
import * as crypto from 'node:crypto';

// ── Mocks ────────────────────────────────────────────────────────────
const prismaArtifactUpdate = vi.fn();
vi.mock('@skillforge/db', () => ({
  prisma: { artifact: { update: (...args: unknown[]) => prismaArtifactUpdate(...args) } },
  prismaAdmin: {},
}));

const withTenantMock = vi.fn();
vi.mock('@skillforge/tenant-guard', () => ({
  withTenant: (orgId: unknown, fn: (tx: unknown) => unknown) => withTenantMock(orgId, fn),
}));

vi.mock('node:fs/promises', () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
  readFile: vi.fn().mockResolvedValue(Buffer.from('stub')),
}));

// Import AFTER mocks
import { ArtifactService } from './artifact.service';
import { LocalStorageProvider } from './storage/local-storage.provider';
import * as fs from 'node:fs/promises';

// ── Helpers ──────────────────────────────────────────────────────────
const ORG_ID = '11111111-1111-4111-8111-111111111111' as TenantId;
const USER_ID = '22222222-2222-4222-8222-222222222222';
const OTHER_USER_ID = '33333333-3333-4333-8333-333333333333';
const ASSESSMENT_ID = '44444444-4444-4444-8444-444444444444';
const ARTIFACT_ID = '55555555-5555-4555-8555-555555555555';

type TxDouble = {
  assessment: { findFirst: ReturnType<typeof vi.fn> };
  artifact: { create: ReturnType<typeof vi.fn> };
};

function makeTx(): TxDouble {
  return {
    assessment: { findFirst: vi.fn() },
    artifact: { create: vi.fn() },
  };
}

function signUploadToken(
  artifactId: string,
  secret = process.env.JWT_SECRET ?? 'dev',
) {
  return crypto
    .createHmac('sha256', secret)
    .update(`upload:${artifactId}`)
    .digest('hex')
    .slice(0, 48);
}

const baseDto = {
  assessmentId: ASSESSMENT_ID,
  fileName: 'rpt.pdf',
  fileSizeBytes: 1_000,
  mimeType: 'application/pdf',
  artifactType: 'document' as const,
};

describe('ArtifactService', () => {
  let svc: ArtifactService;
  let tx: TxDouble;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.JWT_SECRET = 'test-secret-value';
    // Force local mode regardless of caller env so the token shape is stable
    process.env.STORAGE_MODE = 'local';
    svc = new ArtifactService(new LocalStorageProvider());
    tx = makeTx();
    withTenantMock.mockImplementation(async (_orgId, fn) => fn(tx));
  });

  describe('requestUploadUrl()', () => {
    it('rejects unsupported mime types', async () => {
      await expect(
        svc.requestUploadUrl(ORG_ID, USER_ID, { ...baseDto, mimeType: 'application/x-sh' }),
      ).rejects.toThrow(/Unsupported mime type/);
    });

    it('rejects files > 25MB', async () => {
      await expect(
        svc.requestUploadUrl(ORG_ID, USER_ID, {
          ...baseDto,
          fileSizeBytes: 26 * 1024 * 1024,
        }),
      ).rejects.toThrow(/exceeds/);
    });

    it('rejects if assessment.userId !== caller', async () => {
      tx.assessment.findFirst.mockResolvedValue({
        id: ASSESSMENT_ID,
        userId: OTHER_USER_ID,
      });
      await expect(svc.requestUploadUrl(ORG_ID, USER_ID, baseDto)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('throws NotFound when assessment is missing', async () => {
      tx.assessment.findFirst.mockResolvedValue(null);
      await expect(svc.requestUploadUrl(ORG_ID, USER_ID, baseDto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('returns { artifactId, uploadUrl, headers } with the expected shape', async () => {
      tx.assessment.findFirst.mockResolvedValue({ id: ASSESSMENT_ID, userId: USER_ID });
      tx.artifact.create.mockResolvedValue({ id: ARTIFACT_ID });

      const out = await svc.requestUploadUrl(ORG_ID, USER_ID, baseDto);

      expect(out.artifactId).toBe(ARTIFACT_ID);
      expect(out.uploadUrl).toMatch(new RegExp(`^/artifacts/${ARTIFACT_ID}/upload\\?token=`));
      expect(out.headers).toEqual({ 'content-type': 'application/pdf' });
      // Token prefix should be 48 hex chars
      const token = out.uploadUrl.split('token=')[1];
      expect(token).toMatch(/^[0-9a-f]{48}$/);
    });
  });

  describe('acceptUpload()', () => {
    it('rejects an invalid HMAC token', async () => {
      const badToken = 'a'.repeat(48);
      await expect(
        svc.acceptUpload(ARTIFACT_ID, badToken, Buffer.from('x'), 'application/pdf'),
      ).rejects.toThrow(/Invalid or expired upload token/);
    });

    it('rejects a token of wrong length (timing-safe compare guard)', async () => {
      await expect(
        svc.acceptUpload(ARTIFACT_ID, 'short', Buffer.from('x'), 'application/pdf'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects files > 25MB even when the token is valid', async () => {
      const token = signUploadToken(ARTIFACT_ID);
      const big = Buffer.alloc(26 * 1024 * 1024);
      await expect(
        svc.acceptUpload(ARTIFACT_ID, token, big, 'application/pdf'),
      ).rejects.toThrow(/exceeds 25MB/);
    });

    it('persists the file and updates prisma on success (valid token round-trip)', async () => {
      const token = signUploadToken(ARTIFACT_ID);
      prismaArtifactUpdate.mockResolvedValue({
        id: ARTIFACT_ID,
        fileUrl: `local://${ARTIFACT_ID}`,
      });

      const result = await svc.acceptUpload(
        ARTIFACT_ID,
        token,
        Buffer.from('hello'),
        'application/pdf',
      );

      expect(fs.mkdir).toHaveBeenCalledTimes(1);
      expect(fs.writeFile).toHaveBeenCalledTimes(1);
      expect(prismaArtifactUpdate).toHaveBeenCalledWith({
        where: { id: ARTIFACT_ID },
        data: { fileUrl: `local://${ARTIFACT_ID}`, mimeType: 'application/pdf' },
        select: { id: true, fileUrl: true },
      });
      expect(result.fileUrl).toBe(`local://${ARTIFACT_ID}`);
    });
  });
});
