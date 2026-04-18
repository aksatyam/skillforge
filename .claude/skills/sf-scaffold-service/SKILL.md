---
name: sf-scaffold-service
description: Scaffold a new NestJS microservice for SkillForge with multi-tenant guards, RBAC, standard folder layout, and a health endpoint. Use when the user asks to "create a new service", "add a microservice", "scaffold <name> service", or starts a new backend module (assessment, framework, analytics, notification, integration, ai-evaluation).
---

# Scaffold NestJS Service

Generates a new NestJS service under `backend/services/<service-name>/` following SkillForge conventions.

## Standard service layout

```
backend/services/<service-name>/
├── src/
│   ├── main.ts
│   ├── app.module.ts
│   ├── common/
│   │   ├── guards/
│   │   │   ├── tenant.guard.ts        # enforces org_id from JWT
│   │   │   └── rbac.guard.ts          # role-based access
│   │   ├── decorators/
│   │   │   ├── tenant.decorator.ts    # @CurrentTenant()
│   │   │   └── roles.decorator.ts     # @Roles('hr_admin', 'manager')
│   │   ├── interceptors/
│   │   │   └── audit-log.interceptor.ts
│   │   └── filters/
│   │       └── http-exception.filter.ts
│   ├── <domain>/                       # e.g. assessment, framework
│   │   ├── <domain>.module.ts
│   │   ├── <domain>.controller.ts
│   │   ├── <domain>.service.ts
│   │   ├── dto/
│   │   └── entities/
│   └── health/
│       └── health.controller.ts
├── test/
├── Dockerfile
├── package.json
├── tsconfig.json
├── nest-cli.json
└── .env.example
```

## Workflow

1. Ask the user for the service name (if not supplied): e.g. `assessment-service`, `framework-service`.
2. Create the folder structure above.
3. In `main.ts`, bootstrap with:
   - `helmet()` middleware
   - Global `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true })`
   - Global `TenantGuard` and `RbacGuard`
   - Swagger setup at `/api/docs`
   - CORS from allowed origins only
4. In `common/guards/tenant.guard.ts`, extract `org_id` from JWT and attach to request context.
5. Add a `/health` endpoint that returns `{ status: 'ok', service: '<name>', ts: ... }`.
6. Add `.env.example` with: `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `CLAUDE_API_KEY` (if AI service), `ORG_SCHEMA_PREFIX`.
7. Add a `Dockerfile` with multi-stage build (node:20-alpine).
8. Update the root `docker-compose.yml` to include the new service.

## Critical conventions (from memory)

- **Every** controller method goes through `TenantGuard` — no exceptions. Admin-only cross-tenant endpoints require an explicit `@AllowCrossTenant()` decorator and audit logging.
- Every service method that queries the DB must accept `orgId` as a parameter (pulled from `@CurrentTenant()`).
- DTOs must use `class-validator` with strict types — no `any`, no optional `orgId` (it's injected server-side from the JWT).
- Audit-logged actions (score writes, cycle transitions, AI overrides) go through `AuditLogInterceptor`.

## Learning opportunity — you decide

Before I generate the guards, I need your input on **one key design choice**:

**Question**: How should `TenantGuard` handle the case where a user's JWT claims `org_id=A` but the request URL path includes `/orgs/B/...`?

Three valid approaches:
1. **Reject hard (403)** — safest, but breaks admin UX for legit super-admins.
2. **Allow if role = `super_admin` AND audit-log the cross-tenant access** — matches §7.4 audit principles but adds a role check at the guard layer.
3. **Silently rewrite to JWT `org_id`** — user-friendly but hides bugs and creates security ambiguity.

This choice propagates across every service we scaffold. Tell me which you want, or describe a fourth approach, and I'll implement it consistently.
