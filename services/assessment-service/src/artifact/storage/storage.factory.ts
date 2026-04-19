import { LocalStorageProvider } from './local-storage.provider';
import { S3StorageProvider } from './s3-storage.provider';
import type { StorageProvider } from './storage-provider.interface';

/**
 * Pick the storage backend at bootstrap based on STORAGE_MODE.
 * Defaults to local so developers can run the service without any AWS
 * credentials.
 */
export function createStorageProvider(): StorageProvider {
  const mode = process.env.STORAGE_MODE ?? 'local';
  if (mode === 's3') return new S3StorageProvider();
  return new LocalStorageProvider();
}
