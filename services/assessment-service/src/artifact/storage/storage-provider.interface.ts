/**
 * DI token for the active storage provider. String-based because the
 * interface vanishes at runtime, so `design:paramtypes` can't resolve it.
 * ArtifactModule binds this token to a factory that picks the backend.
 */
export const STORAGE_PROVIDER = Symbol('STORAGE_PROVIDER');

/**
 * Storage provider strategy.
 *
 * Two concrete implementations:
 *   • LocalStorageProvider — HMAC-token-protected writes into a local
 *     directory. Default + dev.
 *   • S3StorageProvider    — AWS S3 presigned URLs (PUT for upload,
 *     GET for download). Enabled with STORAGE_MODE=s3.
 *
 * The external HTTP surface (`/artifacts/upload-url`,
 * `/artifacts/:id/download-url`) is identical across modes — the frontend
 * never needs to know which backend is active.
 */
export interface StorageProvider {
  /**
   * Produce the client-visible payload that lets a browser upload bytes
   * for `artifactId`. In local mode this is a relative URL + HMAC token;
   * in s3 mode this is an absolute S3 presigned PUT URL.
   */
  issueUploadUrl(args: {
    artifactId: string;
    orgId: string;
    mimeType: string;
    fileSizeBytes: number;
  }): Promise<{ uploadUrl: string; headers: Record<string, string> }>;

  /**
   * Produce a short-lived URL the browser can follow to download the
   * artifact's bytes. Access control is the service layer's job — the
   * provider only knows how to mint URLs.
   */
  issueDownloadUrl(args: {
    artifactId: string;
    orgId: string;
    mimeType: string;
    fileName: string;
  }): Promise<{ downloadUrl: string }>;

  /**
   * Upload-completion callback. Only meaningful in local mode — the
   * service layer writes bytes into the configured filesystem directory.
   * In s3 mode, browsers upload directly to S3 so this hook is absent.
   *
   * Returns the token's decoded `orgId` so the service layer can scope
   * the follow-up DB write via `withTenant()` — the token, not an env
   * lookup, is the source of truth for the tenant this write belongs to.
   */
  acceptUpload?: (args: {
    artifactId: string;
    token: string;
    buffer: Buffer;
    mimeType: string;
  }) => Promise<{ fileUrl: string; orgId: string }>;

  /** Lets callers branch on "local vs s3" without instanceof checks. */
  readonly mode: 'local' | 's3';
}
