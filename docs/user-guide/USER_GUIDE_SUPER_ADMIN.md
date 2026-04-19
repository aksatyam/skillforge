# SkillForge AI — Super Admin Quick Guide

> **For**: Super Administrators (tenant owners, on-call operators) · **Read time**: ~10 minutes · **Version**: 1.0 · **Last updated**: 2026-04-19
> **Full guide**: [`../USER_GUIDE.md`](../USER_GUIDE.md) · **Support**: `skillforge-security@qualtech.ai`

If your role pill says `SUPER_ADMIN`, you hold break-glass. Everything an HR Admin, AI Champion, and Leadership role can do, you can do — plus role changes, tenant configuration, and audit access. Use this power sparingly.

---

## The two rules

1. **Use your real role for day-to-day work.** If you're functionally an HR Admin, keep a separate HR Admin account and use Super Admin only for privileged operations. Separation of concerns applies to you personally.
2. **Leave a trail.** Every Super Admin action is audit-logged. SOC 2 expects monthly review of that log. Write rationale into audit where the UI supports it (Phase 2 makes reason mandatory for break-glass reads).

---

## What's added on top of HR Admin

| Capability | Where | Used when |
|---|---|---|
| **Change any user's role** (including yours) | `/users` → edit row | New super admin joining; demoting an admin after handoff |
| **Force-unlock a locked cycle** | `/hr/cycles/[id]` → Force unlock | Data-quality issue found after lock; one more score needed |
| **Force-close a cycle** | `/hr/cycles/[id]` → Force close | Emergency abort; data integrity compromised |
| **Reopen any assessment** | `/hr/cycles/[id]` → row → Reopen | Even on closed cycles for regulatory requests |
| **Tenant configuration** | Env variables (SSH into infra) | SSO endpoint, Keycloak realm, secret rotation |
| **Audit log access** | Database direct (Phase 2: in-app viewer) | Incident investigations, monthly SOC 2 review |
| **Impersonation** | N/A — not exposed to prevent misuse | — |

> _Screenshot placeholder: `screenshots/super-01-role-edit.png` — the user edit dialog with the full role dropdown (including super_admin) and the audit-reason field._

> **We deliberately do not expose impersonation.** The temptation is real — "let me see what this manager sees" — but the audit ambiguity is worse than the convenience gain. If you need to debug a user's view, reproduce on a test tenant.

---

## Flow 1 — Onboard a new Super Admin

1. `/users` → **Invite user** with role `super_admin`.
2. The new user gets a standard invite email.
3. Their first action after accepting: **enable MFA**. Super Admin MFA is not optional — if they skip it, their first privileged action will be blocked.
4. Audit the invite: verify your user id is the issuer.

**Handoff when you leave:**
1. New Super Admin is already onboarded (step above).
2. On your last day, you (or another Super Admin) demote your account to `hr_admin` or deactivate it.
3. Do **not** share credentials during handoff — the replacement accepts their own invite.

---

## Flow 2 — Rotate secrets (security incident)

Rotations happen by updating environment variables on the running services and restarting them. These are **infra operations**, not UI toggles.

### Rotate `JWT_SECRET`

- **Invalidates**: every access token, every refresh token, every signed artifact/invite URL across the tenant.
- **User impact**: everyone signs out immediately. They just sign in again.
- **When**: suspected token leak, suspected JWT_SECRET exposure, compromised backup.

```bash
# infra side (one of):
kubectl -n skillforge rollout restart deploy/assessment-service     # after updating the Secret
# or via your secrets manager:
aws secretsmanager update-secret --secret-id skillforge/prod/jwt --secret-string "$(openssl rand -base64 48)"
# then restart the service to re-read
```

### Rotate `SSO_BRIDGE_SECRET`

- **Invalidates**: all outstanding SSO bridge exchanges.
- **User impact**: in-flight SSO callbacks fail; users retry and succeed.
- **When**: suspected bridge-secret leak, or scheduled quarterly rotation.
- **Constraint**: production requires ≥32 chars (enforced at service boot — the service will refuse to start with a short secret).

### Rotate `SESSION_COOKIE_SECRET` (BFF)

- **Invalidates**: cookie signatures. Everyone signs out.
- **Same cadence** as JWT rotation, usually done together during an incident.

### Rotate database credentials

- `DATABASE_URL` and `DATABASE_URL_ADMIN` (the RLS-bypass admin URL for audit-log writes).
- Done at the Postgres level + secrets update + restart.
- Heads up: `DATABASE_URL_ADMIN` uses the `skillforge_admin` Postgres role with `BYPASSRLS`. This role is used only by a small allowlist of code paths — see `docs/adr/` for the admin-client pattern.

---

## Flow 3 — Investigate an incident

**Scenario**: HR Admin reports "our data is showing up for another tenant."

1. **Pull the audit log** for the window:
   ```sql
   SELECT * FROM audit_log
   WHERE org_id = '<suspected-tenant>'
     AND created_at >= '2026-04-15'
   ORDER BY created_at DESC;
   ```
2. **Check for RLS bypass** — any action with `prismaAdmin` client outside the allowlist (`services/*/src/auth/**`, `services/*/src/common/interceptors/**`, `packages/tenant-guard/**`) is a red flag.
3. **Check artifact tokens** — if any signed URL was issued with an `orgId` claim not matching the requesting user's JWT `orgId`, that's a cross-tenant leak vector. The token-carries-tenant pattern is documented in `docs/adr/ADR-011-s3-storage-provider.md`.
4. **If confirmed**, rotate `JWT_SECRET` to invalidate all in-flight tokens, then do the deeper forensics.

**Scenario**: A manager reports "I'm getting 404 on my team member's assessment."

1. 404 (not 403) is the platform's standard response to cross-tenant access attempts — telling an attacker the resource exists is itself a leak.
2. Verify: does the target assessment's `org_id` match the manager's JWT `orgId`?
3. If mismatch, this is correct behavior (no bug).
4. If match, check the manager→report relationship in `/users`. Assessment belongs to a person who isn't their direct report → correct 404.
5. If match AND direct-report relationship is correct, this is a real bug — file P0.

---

## Flow 4 — Break-glass read

You need to open someone's assessment to investigate a dispute or audit claim.

1. Go to the assessment URL directly (e.g. `/team/[userId]/assessment/[assessmentId]`).
2. The page renders because your role bypass.
3. **Every read is logged** as `audit.break_glass_read` with your user id, timestamp, and request path.
4. (Phase 2) a modal will intercept and require a one-line reason before loading the page.

**After the read**, write the reason into a short incident memo and file it in your runbook. Reviewers will look for these during SOC 2 audits.

---

## Flow 5 — Monthly SOC 2 audit-log review

Once a month, pull the audit log summary:

```sql
SELECT
  actor_user_id,
  action,
  COUNT(*) AS n,
  MAX(created_at) AS last_action
FROM audit_log
WHERE created_at >= NOW() - INTERVAL '30 days'
  AND action IN ('break_glass_read', 'force_unlock', 'force_close', 'role_change', 'reopen_assessment')
GROUP BY actor_user_id, action
ORDER BY n DESC;
```

Expected pattern:
- `role_change` by Super Admin: 0–3 per month (new hires / demotions).
- `break_glass_read`: <10 per month; spikes indicate either incident activity or misuse.
- `force_unlock` / `force_close`: <2 per month; each should have an incident memo.

Anomalies → investigate or escalate to Security Lead.

---

## Cheat sheet

| I want to… | How |
|---|---|
| Make someone an HR Admin | `/users` → edit → role |
| Make someone a Super Admin | `/users` → invite with role = super_admin |
| Force-open a closed cycle | Not possible. `closed` is terminal. Reopen individual assessments instead. |
| Force-unlock a locked cycle | `/hr/cycles/[id]` → Force unlock (audit logged) |
| Reopen any assessment | `/hr/cycles/[id]` → row → Reopen (audit logged) |
| Rotate JWT secret | Infra; see Flow 2 |
| Pull audit log | DB direct (Phase 2: in-app viewer) |
| Change SSO config | Env variables; redeploy |
| Disable MFA for a user (emergency) | Don't — reset MFA instead, force re-enrol |

## Hard invariants you must not break

1. **Tenant isolation** — every DB query filters by `org_id`, enforced by RLS. Do not add bypass paths unless they go into `prismaAdmin` with an `@AllowCrossTenant` decorator and a written justification in the PR.
2. **Audit append-only** — no UPDATE or DELETE grants on `audit_log` for the service role. If you need to "fix" an audit entry, file an incident; the fix is a compensating INSERT, not a mutation.
3. **AI advisory only** — the manager-score-over-AI-score invariant is platform-level. Do not add a "trust AI by default" toggle even as an experiment.
4. **PII stripped before AI calls** — the anonymizer runs server-side. Do not add an override, even for debugging.
5. **No shared Super Admin credentials** — every admin is an identifiable human.

## Common gotchas

- **"I rotated JWT_SECRET and everyone's complaining"** → expected. Post in #skillforge-support: *"Sign out and sign back in — security rotation in progress."*
- **"SSO stopped working after rotation"** → check the bridge-secret length in prod (`>=32`). Boot-time assertion will have printed a log line if the secret was too short.
- **"Audit log query is slow"** → `audit_log` has `(org_id, created_at DESC)` index. Queries missing `org_id` in the WHERE will table-scan.
- **"I can see another tenant's data in the DB"** → you're connected as `skillforge_admin` (BYPASSRLS). Use the regular app role for most DBA work; only use admin for audit writes and the allowlisted paths.

## References

- `docs/adr/ADR-011-s3-storage-provider.md` — artifact tokens + JWT_SECRET lifecycle
- `docs/adr/ADR-012-export-templates.md` — default-deny export allowlist
- `docs/runbooks/DEPLOY.md` — production deploy + rollback
- `~/.claude/projects/-Users-aksatyam-SelfWork-SkillForge/memory/reference_bff_security_posture.md` — the 5 non-negotiables
- `~/.claude/projects/-Users-aksatyam-SelfWork-SkillForge/memory/reference_token_carries_tenant.md` — signed-URL pattern

---

## Need help?

| What's wrong | Who to ping |
|---|---|
| Security incident | `skillforge-security@qualtech.ai` **and** on-call pager |
| Data cross-tenant leak | Security + CTO; rotate JWT_SECRET first |
| Infra outage | `#skillforge-ops` Slack + status page update |
| Policy question | Tech Lead + Security Lead |
