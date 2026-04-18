# Sprint 1 — Demo Walkthrough

**Sprint window**: 2026-04-20 → 2026-05-01 (Weeks 1–2)
**Exit criteria** (from BUILD_PLAN.md §5): *HR can log in, define a framework, invite employees. Employees can log in.*
**Status**: all 6 P0 features landed ✅

## How to run the demo

```bash
# One-time setup
pnpm install
make up                  # start Postgres + Redis locally (Homebrew)
pnpm db:generate
pnpm db:migrate:dev      # applies 0001_init_rls + 0002_add_password_and_invite
pnpm db:seed             # Qualtech org + 10 users with bcrypted Passw0rd!
pnpm dev                 # starts web (:3000) + assessment-service (:4001)
```

Open http://localhost:3000

## Demo script (10 minutes)

### 1. HR admin signs in (1 min)
- Go to **/login**
- Email: `hr@qualtech.com`
- Password: `Passw0rd!`
- Land on **/dashboard**

**What this shows**:
- Real bcrypt-validated login hitting `POST /auth/login`
- JWT issued with `{ sub, orgId, role, email }` claims
- Refresh token persisted in `refresh_tokens` table with a SHA-256 hash
- Sidebar populated by `GET /auth/me` — role-gated nav (HR sees Frameworks, Users, Cycles)

### 2. HR creates a framework (3 min)
- Click **Frameworks** in sidebar → **New framework**
- Name pre-filled: "Qualtech AI Capability Maturity Model"
- 5 default maturity levels pre-populated (Aware → Leader)
- Add/remove/edit levels inline
- Click **Create framework** → lands on the framework detail page in `draft` status

**What this shows**:
- `POST /frameworks` with zod-validated DTO
- Multi-level validation: at least 2 levels, contiguous L1..L5 numbering
- RLS auto-scopes the `INSERT` to Qualtech's `org_id`

### 3. HR adds role mappings (2 min)
- On framework detail page → **Add mapping**
- Role family: `Engineering`, target level: `3`
- Save → appears in the role-mappings table
- Repeat for `Product` (L3), `Design` (L2)

**What this shows**:
- `PUT /frameworks/:id/role-mappings` upserts the mapping (create-or-update semantics)
- Service-level validation: target level must exist in the framework's maturity ladder
- Rubric weight sum validation (must equal 1.0 ± 0.01)

### 4. HR publishes the framework (1 min)
- Click **Publish** (appears once there's ≥1 role mapping)
- Confirm dialog → status flips to `active`

**What this shows**:
- Any previously-active framework gets auto-archived (single-active invariant)
- Only `draft` → `active` transition is allowed; `service` raises 400 otherwise
- Audit-log row written (`action=FrameworkController.publish`)

### 5. HR invites a new employee (3 min)
- Click **Users** in sidebar
- Table shows 10 seeded users with status badges (Active / Pending invite)
- Click **Invite user**
- Email: `new.dev@qualtech.com`, Name: `Test User`, Role family: `Engineering`, Designation: `Senior Engineer`, Role: `employee`
- Click **Send invite**
- Green banner appears with a **one-time invite link** (in Sprint 4 this will be emailed)
- **Copy link** to clipboard

**What this shows**:
- `POST /users/invite` creates the user row + issues a 32-byte random invite token
- Only the SHA-256 *hash* of the token is persisted; the raw token is never stored
- HR can re-issue the invite (token rotation) via the **Re-send invite** button
- User appears in the table with the `● Pending invite` badge

### 6. Employee accepts the invite (2 min)
- Open a private/incognito window
- Paste the invite link → lands on `/invite/<token>`
- Set password: `TempPass1!`
- Click **Activate** → automatically signed in → land on employee dashboard

**What this shows**:
- `POST /auth/accept-invite` validates the token hash, checks expiry (7d), sets `password_hash`, marks `invite_accepted_at`
- Tokens are invalidated after first use (`invite_token_hash = NULL` after accept)
- Employee sidebar is narrower (no Frameworks/Users/Cycles) — role-gated nav in action

## What's running under the hood

### Security invariants verified in this demo

| Invariant | How it's enforced |
|---|---|
| Tenant isolation | `withTenant(orgId, ...)` wrapper + Postgres RLS policies. All HR's queries invisibly filter by `org_id = Qualtech`. |
| RBAC | `@Roles('hr_admin')` on HR-only controllers; guard chain (Jwt → Tenant → Rbac) runs globally. |
| Password strength | `AcceptInviteDtoSchema` (zod): 10+ chars, upper, lower, digit, symbol. |
| Append-only audit log | Postgres RLS policy denies UPDATE/DELETE on `audit_log`; interceptor writes on every mutation. |
| Session revocation | `POST /auth/logout` revokes the refresh token (DB flag); next refresh attempt fails. |
| Token rotation | Refresh endpoint revokes the old token and issues a new pair. |

### What CI verifies (green on `main`)

- Typecheck across all 4 workspaces
- ESLint + Prettier
- Unit tests:
  - `tenant-guard/src/tenant-guard.test.ts` — TenantId brand validation (5 cases)
  - `assessment-service/src/assessment/scoring.service.test.ts` — composite math (6 cases)
- Build (all workspaces)
- Security: `pnpm audit` + Semgrep + gitleaks

## Sprint 1 ticket status

| # | Feature | Status | Backend | Frontend |
|---|---|---|---|---|
| 1 | User management + RBAC | ✅ | `services/assessment-service/src/user/*` | `app/(app)/users/page.tsx`, `hooks/use-users.ts` |
| 2 | Competency Framework Engine | ✅ | `services/assessment-service/src/framework/*` | `app/(app)/frameworks/*`, `hooks/use-frameworks.ts` |
| 3 | Auth flow (JWT, refresh, invite) | ✅ | `services/assessment-service/src/auth/*` | `app/(auth)/login/*`, `app/(auth)/invite/[token]/*`, `lib/api.ts` |
| 4 | Layout shell + login/logout UI | ✅ | `/auth/me` | `components/AppShell.tsx` |
| 5 | User admin UI (HR invites) | ✅ | — | `app/(app)/users/page.tsx` |
| 6 | Migration tooling + seed | ✅ | `packages/db/prisma/migrations/0002_*`, `prisma/seed.ts` | — |

## Known gaps (scheduled for Sprint 2)

- **Session storage**: dev uses `sessionStorage` for the JWT. Sprint 2 migrates to httpOnly cookies via a Next.js Route Handler wrapper, to harden against XSS.
- **Invite email**: the notification service (Sprint 4) will email the invite link instead of requiring HR to copy it.
- **Edit user**: backend supports `PATCH /users/:id` but the UI doesn't yet expose an edit dialog (trivial to add; not P0).
- **Manager hierarchy**: service prevents cycles, but UI for picking a manager is deferred to Sprint 2 (appears as a searchable dropdown in the invite dialog).
- **Self-assessment module**: Sprint 2 target.

## Demo cleanup

```bash
make down            # stops Postgres + Redis
# Data persists in the default Postgres data directory.
# To fully reset (drops + recreates DB): pnpm db:reset && pnpm db:seed
```

## Sprint 1 retro prompts

1. Did the RLS + `withTenant` pattern feel natural or was it in the way?
2. Should we stay with dev-auth through Sprint 2 or prioritize Keycloak earlier?
3. Is the invite-link-via-UI flow acceptable for the hyper-MVP pilot, or do we need email in Sprint 2?
4. Any friction with the Prisma + zod duplication? (We have two schemas: Prisma in `packages/db` and zod in `shared-types`.)
