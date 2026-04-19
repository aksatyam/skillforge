# ADR-011: Artifact storage — pluggable provider (local + S3) with JWT-signed short-lived tokens

- **Status**: Accepted
- **Date**: 2026-04-19
- **Deciders**: Platform team
- **Context tag**: Sprint 6 — C1/C2/C3 findings from the pre-release security audit

## Context

Sprint 4 shipped `/artifacts/prepare-upload` and `/artifacts/download` that
issued **HMAC tokens** (sha256 of `<scope>:<artifactId>:<random>:`secret``) and
persisted uploaded files to the local filesystem. The pre-Sprint-6 audit turned
up three critical gaps:

1. **C1 — Tenant scoping relied entirely on HMAC possession.** The download
   path resolved the artifact with `prismaAdmin` (BYPASSRLS) using only the
   artifactId from the token. If a token ever leaked across tenant boundaries
   (log file, error report, cached browser history), the server would happily
   stream back a different tenant's file. There was no belt-and-braces check
   against the caller's `orgId`.
2. **C2 — The HMAC had no expiry.** Tokens were valid forever unless we rotated
   the secret, which wasn't a routine operation.
3. **C3 — `JWT_SECRET` had a `'dev-secret'` fallback.** If an operator forgot
   to set the env var in a production-looking environment, the service booted
   and minted tokens with a known value. Any attacker with source-code access
   could forge uploads/downloads.

The audit also flagged that we still didn't have a real S3 backend — the
assumption "use S3 in prod" had been in the plan since Sprint 1 but the code
was local-only.

## Options considered

### Option A — Patch the HMAC tokens (add expiry, add orgId, fix secret)
- Pros: Minimal blast radius; small diff.
- Cons: Still invents our own token format. Expiry has to be encoded +
  verified manually. We already use `jose` for the session JWTs — adding a
  second bespoke crypto primitive doubles the audit surface.

### Option B — Signed short-lived JWTs (jose) + `storage-provider` strategy pattern
- Pros: **One** signing primitive (jose) across the service. Expiry comes for
  free (`exp` claim, jose throws on mismatch). `scope`/`orgId`/`artifactId`
  claims are the token's source of truth — the download handler trusts the
  token and then verifies the row exists in that tenant with
  `withTenant(orgId)` + `updateMany WHERE id`. Provider split lets us ship S3
  in production without changing controllers.
- Cons: Slightly more moving parts; need a production `JWT_SECRET` ≥32 chars
  (we enforce this at boot).

### Option C — Full S3 pre-signed URLs (client uploads directly to S3)
- Pros: No proxying bytes through our service.
- Cons: Client-side direct upload changes the UX and the `artifact` row
  lifecycle (we'd no longer know when the upload completes — requires S3
  event notifications). Out of scope for Sprint 6 with May 2026 deadline;
  revisit in Phase 2.

## Decision

Adopt **Option B**.

- `src/artifact/storage/artifact-token.ts` exports `signArtifactToken({scope,
  artifactId, orgId})` and `verifyArtifactToken(token, {scope, artifactId})`.
  Both use `jose.SignJWT` / `jwtVerify` with HS256 and the process-wide
  `JWT_SECRET`.
  - Upload tokens: `exp = iat + 15m`
  - Download tokens: `exp = iat + 5m`
- `storage-provider.interface.ts` defines the contract; `LocalStorageProvider`
  (dev/test) and `S3StorageProvider` (prod) implement it. The controller is
  provider-agnostic.
- `acceptUpload()` returns `{fileUrl, orgId}`. The service then runs under
  `withTenant(orgId as TenantId, tx => tx.artifact.updateMany({where:{id},
  data:{fileUrl, mimeType}}))` and throws `NotFoundException` if count=0. The
  token is the source-of-truth for which tenant the row belongs to; RLS is
  the belt-and-braces check.
- **`JWT_SECRET` is now required.** In production it must be ≥32 chars.
  Boot fails loudly if either is violated. The old `'dev-secret'` fallback
  is gone — setup documentation updated.

## Consequences

**Easier:**
- Single token format across sessions + artifacts. jose's `jwtVerify` handles
  expiry, algorithm, and signature in one call.
- Provider swap (local ↔ S3) is a single DI binding in the module.
- Rotating the secret invalidates **all** outstanding tokens immediately
  (they fail signature verification). No "valid forever" blast radius.

**Harder:**
- Ops must provision `JWT_SECRET`. We accept this — it was already required
  for session tokens; we simply stopped silently falling back.
- Tests have to seed `JWT_SECRET` (done via `test/setup-env.ts`), and import
  `__resetArtifactTokenSecretCache()` if they mutate the env at runtime.

**Risks / follow-ups:**
- S3 provider currently uses permanent IAM credentials from the environment.
  Migrate to IRSA / EKS service-account roles when we move the service to the
  EKS cluster (tracked in the infra backlog).
- `Artifact.fileUrl` now stores either `local://…` or `s3://…` — the download
  path routes on the prefix. When we introduce a third backend (Azure Blob,
  GCS), extend the provider map.

## Follow-ups

- [ ] Set `JWT_SECRET` in all prod/staging envs ≥32 chars; add to
      `docs/runbooks/secrets.md`.
- [ ] Add CloudWatch alarm on `artifact.download.failed` metric (Phase 2).
- [ ] Revisit direct-to-S3 uploads in Phase 2 once HR admin UX is stable.
