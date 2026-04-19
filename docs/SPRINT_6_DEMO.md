# Sprint 6 — Demo Walkthrough

**Sprint window**: 2026-06-29 → 2026-07-10 (Weeks 11–12)
**Focus**: Enterprise readiness — SSO, S3 artifact storage, HR-editable CSV templates
**Status**: 3 deliverables landed ✅

## What shipped

### 1. Keycloak OIDC SSO (Feature #1, ADR-009)
End-to-end OpenID Connect authorization-code flow with PKCE, bridged into SkillForge's own short-lived JWT issuance.

**Backend (`services/assessment-service`)**
- `src/auth/auth.sso.service.ts` — `AuthSsoService.exchange()` verifies the Keycloak idToken signature against the realm's JWKS (cached in-process, ~10 min), extracts claims via zod, resolves tenant by `organization.settings_json.sso.issuer`, finds-or-provisions the user, and issues our own `AuthTokens` (same shape as password login).
- `src/auth/sso.controller.ts` — `POST /auth/sso/exchange`, protected by a **shared bridge secret** header (`x-sso-bridge-secret`, `timingSafeEqual` compared). Not JWT-guarded because no SkillForge session exists at call time.
- `src/auth/auth.module.ts` — wires the new controller + service.

**BFF (`apps/web/app/api/session/sso`)**
- `start/route.ts` — initiates PKCE: generates `code_verifier`, stores state + `returnTo` in a signed cookie, redirects to Keycloak's `/auth`.
- `callback/route.ts` — validates state, swaps code for Keycloak tokens, POSTs `{idToken, accessToken, refreshToken, issuer}` to `/auth/sso/exchange` with the bridge secret, writes the returned SkillForge tokens into `sf_access`/`sf_refresh` cookies, redirects to `returnTo`.
- `logout/route.ts` — clears our cookies + optionally hits Keycloak's end-session endpoint.
- `lib/sso-cookies.ts` — signed-cookie helpers (HMAC-SHA256 with `SSO_BRIDGE_SECRET`).

**Login page** — `apps/web/app/(auth)/login/page.tsx` shows "Sign in with SSO" when `NEXT_PUBLIC_SSO_ENABLED=true`, falls back to password login. Friendly error messages mapped from `?sso_error=...` codes (state_mismatch, missing_params, token_exchange_failed, bridge_failed).

**Seed** — `packages/db/prisma/seed.ts` now attaches an `sso` block to Qualtech's `settings_json`:
```json
{ "sso": { "issuer": "http://localhost:8080/realms/qualtech", "autoProvision": false } }
```

### 2. S3 presigned URL artifact storage (Feature #2)
Swapped the hardcoded local-filesystem artifact provider for a **strategy** picked at bootstrap.

- `src/artifact/storage/storage-provider.interface.ts` — `StorageProvider` contract: `issueUploadUrl`, `issueDownloadUrl`, optional `acceptUpload`, `mode: 'local' | 's3'`. Introduces `STORAGE_PROVIDER` `Symbol` DI token.
- `local-storage.provider.ts` — existing HMAC-signed relative URLs.
- `s3-storage.provider.ts` — `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`. Object keys prefixed with tenant ID (`${orgId}/${artifactId}`) so IAM policies can scope assume-roles to `${orgId}/*`. Upload URL TTL = 15 min, download TTL = 5 min.
- `storage.factory.ts` — picks `s3` when `STORAGE_MODE=s3`, else `local`.
- `artifact.module.ts` — binds `STORAGE_PROVIDER` via `useFactory`.
- `artifact.service.ts` — takes provider via `@Optional() @Inject(STORAGE_PROVIDER)`, preserves direct-construction in Vitest (`new ArtifactService(new LocalStorageProvider())`).
- `artifact.controller.ts` — added `GET /artifacts/:id/download-url` (used by both modes).

The frontend can't tell the two modes apart — same `/artifacts/upload-url` + `/artifacts/:id/download-url` surface; in s3 mode the browser PUTs directly to the bucket, bypassing the Nest process entirely.

### 3. HR-editable CSV export templates (Feature #3)
CSV exports are now template-driven, with 4 built-ins (SkillForge Default, SAP SuccessFactors, Workday, Oracle HCM) and per-tenant custom templates persisted in `organization.settings_json.exportTemplates`.

**Backend**
- `src/export/export.templates.ts` — `columnSourcePaths` allowlist (18 dot-paths), `evalSource(row, path)` walker, 4 built-in templates frozen as `BUILTIN_TEMPLATES`, `mergeTemplates(custom)` helper, `validateSources(template)` gate. Server-side allowlist means tenants cannot exfiltrate columns we haven't denormalized.
- `src/export/export.service.ts` — template-driven renderer with legacy 15-column fallback (byte-identical to pre-Sprint-6 exporter); added `listTemplates`, `upsertTemplate`, `deleteTemplate`. Built-ins cannot be overwritten or deleted (400).
- `src/export/export.controller.ts` — `GET /cycles/:cycleId/export.csv?templateId=...`, `GET /export/templates`, `PUT /export/templates/:id`, `DELETE /export/templates/:id`. All `hr_admin`-gated.
- `packages/shared-types/src/index.ts` — `ExportTemplateSchema`, `ExportColumnSchema`, `UpsertExportTemplateDtoSchema`.

**Frontend**
- `apps/web/hooks/use-export-templates.ts` — TanStack Query hooks: `useExportTemplates`, `useUpsertExportTemplate`, `useDeleteExportTemplate`, plus the client-side mirror of `COLUMN_SOURCE_PATHS`.
- `apps/web/app/(app)/hr/templates/page.tsx` — HR-only page at `/hr/templates`: lists built-ins (read-only) + custom templates (editable), inline column-row editor with source dropdown + header text input, delete confirmation.
- `AppShell.tsx` — new "Export templates" nav entry under HR Reports.

## Live verification

All three modules wire into the Nest bootstrap cleanly:

```
[RoutesResolver] SsoController {/auth/sso}:
[RouterExplorer] Mapped {/auth/sso/exchange, POST}
[RoutesResolver] ArtifactController {/artifacts}:
[RouterExplorer] Mapped {/artifacts/:id/download-url, GET}
[RoutesResolver] ExportController {/}:
[RouterExplorer] Mapped {/cycles/:cycleId/export.csv, GET}
[RouterExplorer] Mapped {/export/templates, GET}
[RouterExplorer] Mapped {/export/templates/:id, PUT}
[RouterExplorer] Mapped {/export/templates/:id, DELETE}
[Bootstrap] 🚀 assessment-service on http://localhost:4001
```

## Notable design choices

- **Bridge-secret over mutual TLS for the BFF↔assessment-service SSO exchange** — simpler to rotate, no cert management in dev. The secret never leaves the two server processes. If we move the BFF to a different pod, we rotate via env.
- **`@Optional() @Inject(SYMBOL)` for the storage provider** — lets the same `ArtifactService` work under both Nest DI (production bootstrap) and direct `new` construction (Vitest). Standard NestJS idiom for replacing an interface param.
- **Source-path allowlist instead of raw column expressions** — HR gets a template editor, not a mini DSL. Server validates every column on upsert, so a compromised admin couldn't dump PII we haven't denormalized.
- **`/export/templates` lives at the root**, not under `/cycles`, because templates are tenant-wide config, not cycle-scoped data. Audit trails tag template edits against the org, not a cycle.
- **Built-ins are frozen + merged at read time** — no database rows for built-ins, no seed duplication, no risk of accidental deletion. A tenant with a custom template named `default` will shadow the built-in in the merged list; the server still guards against `builtin: true` coming off the wire.

## Env additions (`.env.example`)

```
NEXT_PUBLIC_SSO_ENABLED=false
KEYCLOAK_URL=http://localhost:8080
KEYCLOAK_REALM=qualtech
KEYCLOAK_CLIENT_ID=skillforge-web
KEYCLOAK_CLIENT_SECRET=
SSO_BRIDGE_SECRET=dev-shared-secret-change-in-prod

STORAGE_MODE=local            # flip to 's3' for presigned S3 URLs
S3_BUCKET=
S3_REGION=
```

## Known follow-ups (→ Sprint 7)

- Tenant-default template picker in HR settings page (backend already resolves `settings_json.defaultExportTemplate`; UI pending).
- Inline "Export as…" dropdown on cycle detail to pass `?templateId=` instead of dropping the user into `/hr/templates`.
- SAML 2.0 path parallel to OIDC (Phase 3 work, already stubbed in `auth.sso.service.ts` comments).
- k6 load test `tests/perf/hyper-mvp-load.js` — 50 VU smoke clean, 200 VU ramp has a tagging false-positive to fix.
