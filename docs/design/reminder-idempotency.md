# Reminder idempotency — Redis SET vs NotificationSend table

**Decision**: Redis `SET NX EX 86400` keyed by `reminder:sent:{userId}:{YYYYMMDD}`.
**Status**: Chosen for Sprint 2.

## Key schema

| Key pattern                              | Value | TTL     |
|------------------------------------------|-------|---------|
| `reminder:sent:{userId}:{YYYYMMDD-UTC}`  | `"1"` | 86400 s |

- `userId` — UUID of the assessment subject (not the org).
- `YYYYMMDD` — UTC date stamp when the reminder was attempted.
- Values are not read; presence is the signal. `SET NX` atomically claims.

## Failure semantics

- Successful send → key persists 24h, duplicate sends suppressed.
- Mail failure → worker `DEL`s the key so the next cron tick can retry.
- Redis outage → worker cannot run (BullMQ needs Redis); scheduler logs a warning and the service still boots per ADR-010.

## Why not a NotificationSend Prisma table

Considered and rejected for Sprint 2:

- Write volume is low but nonzero — a daily row per at-risk employee adds retention churn without a corresponding query.
- Durability already exists in `audit_log` (`action='reminder.sent'` / `action='reminder.failed'`), which is the system-of-record.
- Pruning — Redis TTL is free; a Prisma table needs a nightly cron.
- Race-free at worker concurrency=1 without extra schema.

If reminder analytics are needed later (e.g. "how many reminders last quarter?"), query `audit_log` filtered by action. If that gets slow, Sprint 3 can add a projection table.
