# Sprint 5 — Demo Walkthrough

**Sprint window**: 2026-06-15 → 2026-06-26 (Weeks 9–10)
**Focus**: Email polish + session security hardening + tech-debt cleanup
**Status**: 5 deliverables landed ✅

## What shipped

### 1. HTML email templates (Feature #1)
Plain-text-only emails are now rich HTML with:
- `services/assessment-service/src/notifications/templates/layout.ts` — mobile-responsive inline-CSS email layout (600px max-width, system font stack, brand-navy header)
- `templates/reminder.ts`, `assignment.ts`, `manager-review.ts` — per-event renderers returning `{ subject, html, text }` (both html + plaintext-fallback)
- `templates/templates.test.ts` — vitest coverage
- `MailerService.send()` extended to include HTML payload in SMTP + log-mode output

### 2. Per-user notification preferences
- New `notification_prefs_json` JSONB column on `users` (migration `0004_notification_prefs`)
- Shape: `{ reminders: { enabled, digestFrequency }, assignment: { enabled }, managerReview: { enabled } }`
- `GET + PATCH /notifications/preferences` — per-user, not role-gated
- `ReminderWorker.sendOne()` honors `notificationPrefsJson.reminders.enabled`; opt-outs counted as `skipped`
- `apps/web/hooks/use-notification-prefs.ts` + `app/(app)/settings/notifications/page.tsx` — toggle UI

### 3. Per-tenant timezone for reminder cron
- Reminder worker resolves `org.settings_json.timezone` (IANA like `Asia/Kolkata`) and buckets idempotency keys by tenant-local day using `Intl.DateTimeFormat`
- Qualtech seeded with `Asia/Kolkata` — so if the cron fires at 04:00 UTC (09:30 IST), all Qualtech reminders land on the same local-day bucket; Singapore tenant (if added) would get a different bucket from the same UTC moment
- Graceful fallback to `UTC` for invalid/missing values
- `resolveTimezone()` + `ymd(date, tz)` exported for testing

### 4. httpOnly cookie session (BFF pattern)
**Problem**: Sprint 1's stub put JWTs in `sessionStorage` — XSS-readable.

**Fix**: Next.js Route Handler BFF. JWTs now live in httpOnly, Secure, SameSite=Lax cookies set by the Next.js origin. The client never touches raw tokens.

- `apps/web/app/api/session/{login,refresh,logout,me,accept-invite}/route.ts` — 5 BFF session handlers
- `apps/web/app/api/assessment/[...path]/route.ts` — catch-all proxy that reads `sf_access` cookie, forwards as `Authorization: Bearer`, does one-shot silent refresh on 401, streams response body (including binary CSV)
- `apps/web/lib/session.ts` — now exposes `hasSession()`, `useHasSession()`, async `clearSession()`
- `lib/api.ts` simplified — no sessionStorage reads, no bearer attachment (proxy handles it)
- `sf_access` path=`/`, 15min; `sf_refresh` path=`/api/session`, 7d (restricts leak blast radius)
- Security posture: `Secure=true` in prod, relaxed in dev; browser Cookie header stripped before upstream forwarding

### 5. Swagger restored
`nest-cli.json` + dev runner switched back to a TypeScript path that emits decorator metadata. Swagger now live at **http://localhost:4001/api/docs** by default. Opt out with `DISABLE_SWAGGER=true` for production.

## Live verification transcript

```
1. BFF session login (sets httpOnly cookies)
   POST /api/session/login → {"ok":true}
   Cookie: sf_access (HttpOnly, Path=/, 15m); sf_refresh (HttpOnly, Path=/api/session, 7d)

2. /api/session/me via cookie (no Bearer header)
   → Priya Sharma (hr_admin)

3. Proxy GET via cookie: /api/assessment/auth/me
   → tenant=Qualtech

4. Notification prefs — default values
   { reminders.enabled:true, digestFrequency:"daily"; assignment.enabled:true; managerReview.enabled:true }

5. PATCH prefs — opt out of reminders
   → reminders.enabled:false; other fields preserved

6. Swagger docs — HTTP/1.1 200 OK
```

## Known follow-ups for Sprint 6+

- SSO integration (SAML 2.0 + OIDC) — now that session cookies are in place, the Keycloak (ADR-009) path becomes a straight swap in the BFF layer
- S3 presigned URLs for artifact uploads (currently local filesystem + HMAC token)
- Advanced CSV columns (Sprint 6 Feature per BUILD_PLAN §6)
- Tests: add integration tests for the BFF proxy path (currently covered at curl level)

## Test count

Running total — Sprint 1-5: ~80 unit assertions. Sprint 5 added ~4 (templates) + timezone tests to follow in Sprint 6 hardening.
