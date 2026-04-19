import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { TenantId } from '@skillforge/tenant-guard';

// ── Mocks ────────────────────────────────────────────────────────────
vi.mock('@skillforge/db', () => ({
  prisma: {},
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
import {
  signArtifactToken,
  __resetArtifactTokenSecretCache,
} from './storage/artifact-token';
import * as fs from 'node:fs/promises';

// ── Helpers ──────────────────────────────────────────────────────────
const ORG_ID = '11111111-1111-4111-8111-111111111111' as TenantId;
const USER_ID = '22222222-2222-4222-8222-222222222222';
const OTHER_USER_ID = '33333333-3333-4333-8333-333333333333';
const ASSESSMENT_ID = '44444444-4444-4444-8444-444444444444';
const ARTIFACT_ID = '55555555-5555-4555-8555-555555555555';

type TxDouble = {
  assessment: { findFirst: ReturnType<typeof vi.fn> };
  artifact: {
    create: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
  };
};

function makeTx(): TxDouble {
  return {
    assessment: { findFirst: vi.fn() },
    artifact: { create: vi.fn(), updateMany: vi.fn(), findFirst: vi.fn() },
  };
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
    // >= 32 chars so the prod-safety guard in artifact-token.ts is fine
    // under any NODE_ENV the test harness might set.
    process.env.JWT_SECRET = 'test-jwt-secret-value-xxxxxxxxxxxxx';
    __resetArtifactTokenSecretCache();
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
      // Token should now be a three-segment JWT (header.payload.sig).
      const token = out.uploadUrl.split('token=')[1];
      expect(token.split('.')).toHaveLength(3);
    });
  });

  describe('acceptUpload()', () => {
    it('rejects a garbage token string', async () => {
      await expect(
        svc.acceptUpload(ARTIFACT_ID, 'not-a-jwt', Buffer.from('x'), 'application/pdf'),
      ).rejects.toThrow(/Invalid or expired upload token/);
    });

    it('rejects a token whose artifactId claim does not match', async () => {
      const otherArtifact = '66666666-6666-4666-8666-666666666666';
      const token = await signArtifactToken('upload', otherArtifact, ORG_ID);
      await expect(
        svc.acceptUpload(ARTIFACT_ID, token, Buffer.from('x'), 'application/pdf'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects files > 25MB even when the token is valid', async () => {
      const token = await signArtifactToken('upload', ARTIFACT_ID, ORG_ID);
      const big = Buffer.alloc(26 * 1024 * 1024);
      await expect(
        svc.acceptUpload(ARTIFACT_ID, token, big, 'application/pdf'),
      ).rejects.toThrow(/exceeds 25MB/);
    });

    it('persists the file and updates under withTenant(orgId) on success', async () => {
      const token = await signArtifactToken('upload', ARTIFACT_ID, ORG_ID);
      tx.artifact.updateMany.mockResolvedValue({ count: 1 });

      const result = await svc.acceptUpload(
        ARTIFACT_ID,
        token,
        Buffer.from('hello'),
        'application/pdf',
      );

      expect(fs.mkdir).toHaveBeenCalledTimes(1);
      expect(fs.writeFile).toHaveBeenCalledTimes(1);
      // Critical: withTenant got the orgId the token carried (not a bypass).
      expect(withTenantMock).toHaveBeenCalledWith(ORG_ID, expect.any(Function));
      expect(tx.artifact.updateMany).toHaveBeenCalledWith({
        where: { id: ARTIFACT_ID },
        data: { fileUrl: `local://${ARTIFACT_ID}`, mimeType: 'application/pdf' },
      });
      expect(result.fileUrl).toBe(`local://${ARTIFACT_ID}`);
    });

    it('throws NotFound when the artifact row is absent in the token-scoped tenant', async () => {
      // A token with orgId=X reaching an artifact that only exists in
      // orgId=Y will hit `updateMany { count: 0 }` → 404, never an
      // accidental cross-tenant write.
      const token = await signArtifactToken('upload', ARTIFACT_ID, ORG_ID);
      tx.artifact.updateMany.mockResolvedValue({ count: 0 });
      await expect(
        svc.acceptUpload(ARTIFACT_ID, token, Buffer.from('x'), 'application/pdf'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
