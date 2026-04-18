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

## Canonical guard chain (Sprint 1 implementation)

The guard chain is registered globally in `app.module.ts` via `APP_GUARD`. Order matters:

1. **JwtAuthGuard** — verifies JWT, attaches `req.user` + `req.orgId`. Respects `@Public()`.
2. **TenantGuard** — if URL path has `:orgId`, must match JWT `orgId`. Returns **404 Not Found** on mismatch (not 403 — avoids tenant enumeration). `@AllowCrossTenant()` routes require `super_admin` role.
3. **RbacGuard** — checks `@Roles(...)` metadata.

Every new service scaffold inherits this chain. Don't register local `@UseGuards()` — it's already global.

## DB access pattern

- For **tenant-scoped work** (99% of cases): inject nothing; import `withTenant` + `TenantId` from `@skillforge/tenant-guard`, take `@CurrentTenant() orgId: TenantId` on controller methods, pass to service.
- For **pre-tenant / append-only work** (login, audit, seed): import `prismaAdmin` from `@skillforge/db`. See `reference_admin_client_pattern.md` memory.

## Required endpoints on every new service

- `GET /health` (public) — returns `{ status, service, version, uptimeSec, timestamp, checks }`
- Swagger at `/api/docs` via `@nestjs/swagger` with `addBearerAuth()`
