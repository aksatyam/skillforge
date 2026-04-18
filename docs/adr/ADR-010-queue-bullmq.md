# ADR-010: BullMQ on Redis as the job queue

- **Status**: Proposed (default pick)
- **Date**: 2026-04-18
- **Deciders**: Tech Lead + DevOps
- **Context tag**: D10

## Decision

Use **BullMQ on Redis** for background jobs:
- Email sending
- AI artifact analysis (async)
- CSV export generation
- Bias detection cron
- File virus scanning

Each service owns its queues; a shared `@skillforge/queue` package wraps BullMQ with typed job producers/consumers and tenant-context propagation.

## Rationale

- **No new infra** — Redis is already in the stack for sessions and cache.
- **Native NestJS integration** via `@nestjs/bullmq` module.
- **Typed jobs** are easy to express with generics.
- **Dashboard** via Bull Board (mount on `/admin/queues`, super_admin only).

## Consequences

**Easier**:
- One infra piece does two jobs.
- Team already ramps on Redis.

**Harder**:
- Redis becomes a tier-0 dependency (sessions + cache + queues all fail together if Redis is down).
- Scaling queues beyond a single Redis requires Redis Cluster or migrating to SQS — plan for this in Phase 3.

**Follow-ups**:
- Redis HA plan in Sprint 7 (hardening).
- Migrate heavy-volume queues to SQS in Phase 3 if Redis becomes a bottleneck.
