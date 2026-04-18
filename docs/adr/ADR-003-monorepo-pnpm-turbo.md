# ADR-003: pnpm workspaces + Turborepo for the monorepo

- **Status**: Proposed (default pick)
- **Date**: 2026-04-18
- **Deciders**: Tech Lead + DevOps
- **Context tag**: D3

## Context

The monorepo has apps (web, mobile, api-gateway), services (assessment, framework, ai-evaluation, analytics, notification, integration), and shared packages (types, ui, tenant-guard, audit-log). We need fast `install`, task caching, and an easy mental model.

## Options considered

### Option A — pnpm workspaces only
- Pros: simplest setup; no extra tools; fastest install.
- Cons: no task caching or affected graph; every CI run rebuilds everything.

### Option B — pnpm + Turborepo (chosen)
- Pros: task caching (local + remote); affected-graph support; minimal config; great DX.
- Cons: one more tool to learn; remote cache requires Vercel or self-hosted.

### Option C — Nx
- Pros: most features (generators, affected graph, plugins); great for big orgs.
- Cons: steeper learning curve; heavier config.

## Decision

Use **pnpm workspaces + Turborepo**. Start with local-only Turbo cache; add remote cache only if CI times justify it.

Workspace layout:

```
/ (root)
  pnpm-workspace.yaml
  turbo.json
  package.json   (dev-only scripts)
  tsconfig.base.json
  apps/*
  services/*
  packages/*
```

Every workspace has `package.json` with `name: "@skillforge/<workspace-name>"`. Cross-workspace deps use `"workspace:*"`.

## Consequences

**Easier**:
- `pnpm install` once at root installs everything.
- `pnpm turbo run build` parallelizes across workspaces with caching.
- `pnpm turbo run test --filter=...[origin/main]` runs only what changed.

**Harder**:
- Adding a new workspace requires updating `pnpm-workspace.yaml`.
- Shared package publishing (if we ever need it) needs changesets or similar tooling.

**Follow-ups**:
- Set up Turbo remote cache in Sprint 4 once CI times exceed ~5min.
- Add `turbo prune` scripts for service-specific Docker builds later (Phase 3).
