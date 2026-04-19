---
name: sf-security-audit
description: Run a SkillForge-specific security audit aligned with OWASP ASVS L2, OWASP API Top 10, SOC 2, and DPDP Act 2023. Use when the user asks to "security review", "audit", "check for vulnerabilities", "OWASP scan", "VAPT", or before a production release.
---

# Security Audit

Audits SkillForge code against the nine security areas listed in the plan §8, producing a prioritized findings report.

## Audit areas and checks

### 1. Authentication (OWASP ASVS L2)
- [ ] Every protected endpoint uses auth middleware (JWT verified, signature checked)
- [ ] JWT expiry ≤ 15 min for access tokens; refresh tokens rotated
- [ ] MFA enforcement for admin roles (`hr_admin`, `super_admin`, `ai_champion`)
- [ ] SSO flow: SAML 2.0 signature verification, OIDC `nonce` check, `state` CSRF param
- [ ] **OIDC `aud` claim** validated against `ssoConfig.audience ?? KEYCLOAK_CLIENT_ID` — realms have multiple clients; any-aud acceptance is a replay vector
- [ ] **OIDC `iss` claim** validated against the tenant-configured realm URL
- [ ] OIDC callback sanitises upstream error bodies before logging (`where / status / error / error_description` only — NEVER tokens or Authorization headers)
- [ ] Session storage in Redis, not JWT payload (for revocation)

### 2. Authorization (RBAC)
- [ ] Every endpoint has an explicit `@Roles(...)` decorator
- [ ] Tenant guard enforced globally (not per-controller)
- [ ] Resource-level ownership checks: "can this user access this `assessment_id`?"
- [ ] No `IDOR` possibilities: endpoints verify row belongs to JWT `org_id`

### 3. Data Encryption (NIST SP 800-175B)
- [ ] RDS encryption-at-rest enabled, KMS-managed keys
- [ ] TLS 1.3 on all public endpoints
- [ ] PII columns (`email`, `phone`) use `pgcrypto` field-level encryption
- [ ] Secrets in AWS Secrets Manager, not `.env` in prod images

### 4. Data Isolation (SOC 2 Type II)
- [ ] Every data-access method filters by `org_id`
- [ ] RLS policies on every tenant-scoped table
- [ ] Integration tests verify cross-tenant access returns 404, not 403 (information disclosure)
- [ ] Backup/restore paths preserve tenant boundaries

### 5. Audit Logging (ISO 27001 A.12.4)
- [ ] Write operations on `assessments`, `assessment_cycles`, `artifacts` log actor + old/new values
- [ ] Audit log is append-only (no UPDATE/DELETE permissions for service role)
- [ ] Manager overrides of AI suggestions logged with `rationale`
- [ ] Audit log retention: ≥ 7 years per SOC 2

### 6. API Security (OWASP API Top 10)
- [ ] Rate limiting at gateway (Kong/API Gateway) **AND** in-app via `@nestjs/throttler`
  - [ ] `ThrottlerGuard` first in `APP_GUARD` chain (runs BEFORE JWT verification)
  - [ ] Named buckets: `default` (120/min) for reads, `short` (10/min) for credential-y paths
  - [ ] `@Throttle({ short: {...} })` on `/auth/login`, `/auth/refresh`, `/auth/accept-invite`, `/auth/sso/exchange`
- [ ] Origin-header CSRF check on every state-changing BFF POST (`apps/web/app/api/**/route.ts`)
  - [ ] `checkSameOrigin(req)` returns 403 on mismatch
  - [ ] Allowlist driven by `APP_BASE_URL` + `APP_ORIGIN_ALLOWLIST`
- [ ] Input validation: DTOs with `class-validator`, `forbidNonWhitelisted: true`
- [ ] Output encoding in responses (no raw HTML from user input)
- [ ] CORS: explicit allowlist, no `*`
- [ ] GraphQL depth/complexity limits if GraphQL is used

### 6a. Signed-URL / token-carries-tenant checks
- [ ] Every signed short-lived URL (artifact upload/download, invite, verify) uses jose-signed JWT with **HS256** + `exp`
- [ ] Claims include `orgId` + `scope` — consumer re-runs DB access under `withTenant(claims.orgId)` + `updateMany WHERE id` (404 if count=0)
- [ ] `JWT_SECRET` has NO default fallback; production requires `>=32` chars (asserted at boot)
- [ ] `SSO_BRIDGE_SECRET` has NO default; production requires `>=32` chars, dev allows `>=8`
- [ ] Token verifier checks `scope` matches the handler's scope (upload token CAN'T pass at download endpoint)

### 7. Privacy (DPDP Act 2023)
- [ ] Consent records stored with timestamp + version
- [ ] Data minimization: don't collect DOB, home address unless required
- [ ] Right to erasure: `DELETE /users/:id` triggers cascading soft-delete + PII scrub job
- [ ] Data residency: tenant config routes Claude calls to appropriate region

### 8. AI Data Handling (Responsible AI)
- [ ] PII stripped before Claude API call (grep for `user.name`, `user.email` in prompts)
- [ ] `anthropic-beta: prompt-caching-*` used for system prompts
- [ ] No `user_id` stored in Anthropic's logs (use opaque session ID)
- [ ] AI outputs validated against schema before write

### 9. VAPT (OWASP Testing Guide v4)
- [ ] SAST scan (ESLint security plugin + Semgrep) passes
- [ ] Dependency scan (npm audit / Snyk) has no High/Critical vulns
- [ ] Container scan (Trivy) on every image build
- [ ] Quarterly pentest schedule in place; pentest report referenced here

## Workflow

1. Identify scope: full audit, a single service, a PR, or a specific area.
2. Run checks via grep/ast-grep/Semgrep where possible; manual read for the rest.
3. Produce findings table with: ID, Area, Severity (Critical/High/Medium/Low), File:line, Description, OWASP/CWE mapping, Remediation.
4. If invoked pre-release, block on any Critical or High findings per §11.1.

## Output artifact (follows global CLAUDE.md VAPT pattern)

Three deliverables, as in the TPE VAPT workflow:
1. **Markdown report**: `SF-SECURITY-AUDIT-<DATE>.md`
2. **DOCX report**: `SF-Security-Audit-<DATE>.docx` — use python-docx with the VAPT brand colors
3. **Post-fix verification prompt**: `SF-POST-FIX-VERIFICATION-<DATE>.md`

## Learning opportunity

**Question**: When the audit finds a High-severity issue mid-sprint, what's the preferred workflow?

- (a) Block the sprint, fix immediately, no new feature work until resolved
- (b) File as a sprint-capacity task, fix within current sprint alongside features
- (c) Create a P0 ticket for next sprint (so the current sprint goal is protected)

Security ownership is listed under Tech Lead + Security Lead in the risk register. Your answer sets the default severity→action mapping.
