import { Module } from '@nestjs/common';
import { ArtifactController } from './artifact.controller';
import { ArtifactService } from './artifact.service';
import { STORAGE_PROVIDER } from './storage/storage-provider.interface';
import { createStorageProvider } from './storage/storage.factory';

/**
 * Artifact module — Sprint 2 feature + Sprint 6 feature #2 (S3).
 *
 * The `STORAGE_PROVIDER` token resolves at bootstrap to either
 * LocalStorageProvider or S3StorageProvider based on `STORAGE_MODE`. Having
 * it as a factory provider (rather than a direct `new` in the service) keeps
 * ArtifactService unit tests free of AWS SDK imports and lets us swap the
 * backend via env without touching code.
 */
@Module({
  controllers: [ArtifactController],
  providers: [
    ArtifactService,
    { provide: STORAGE_PROVIDER, useFactory: () => createStorageProvider() },
  ],
})
export class ArtifactModule {}
