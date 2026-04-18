# SkillForge AI — Production Deployment Runbook

**Version**: v1.0 (Sprint 3)
**Last updated**: 2026-04-18
**Owners**: Tech Lead + DevOps
**Target release window**: 2026-05-29 (Fri) EOD — **production go-live Monday 2026-06-01**

This runbook is the single source of truth for the Hyper-MVP production deployment. Every step has an owner and a verification command.

---

## 0. Pre-flight — 1 week before release (by 2026-05-22)

| # | Step | Owner | Verify |
|---|---|---|---|
| 0.1 | AWS account provisioned (VPC, subnets, security groups, KMS keys) | DevOps | `aws ec2 describe-vpcs --filters Name=tag:Name,Values=skillforge-prod` |
| 0.2 | RDS Postgres 15 cluster (multi-AZ) created in `ap-south-1` (Mumbai) | DevOps | `aws rds describe-db-instances --db-instance-identifier skillforge-prod` |
| 0.3 | ElastiCache Redis 7 cluster (2-node cluster-mode disabled for Sprint 3; cluster-mode in Sprint 4+) | DevOps | `aws elasticache describe-replication-groups` |
| 0.4 | ECR repositories: `skillforge/assessment-service`, `skillforge/web` | DevOps | `aws ecr describe-repositories` |
| 0.5 | ECS cluster `skillforge-prod` with 2 service slots | DevOps | `aws ecs describe-clusters` |
| 0.6 | ALB + ACM cert for `skillforge.qualtech.internal` + `api.skillforge.qualtech.internal` | DevOps | `curl -I https://skillforge.qualtech.internal/` (expect 200 or 503 pre-deploy) |
| 0.7 | Secrets Manager entries: `DATABASE_URL`, `DATABASE_URL_ADMIN`, `JWT_SECRET` (32-byte random), `CLAUDE_API_KEY` (Phase 2), `SMTP_*` | Security Lead | `aws secretsmanager list-secrets \| jq '.SecretList[].Name'` |
| 0.8 | CloudWatch log groups + alarms (CPU, memory, 5xx rate, queue depth) | DevOps | `aws logs describe-log-groups --log-group-name-prefix /ecs/skillforge` |
| 0.9 | Sentry project + DSN issued | DevOps | Sentry UI shows `skillforge-prod` project |
| 0.10 | Backup strategy: RDS automated backups (35-day retention), daily snapshots | DevOps | `aws rds describe-db-instances --query 'DBInstances[0].BackupRetentionPeriod'` (expect 35) |
| 0.11 | DNS records confirmed with Qualtech IT | Tech Lead | `dig skillforge.qualtech.internal` resolves to ALB |
| 0.12 | SSO Keycloak realm configured (or Auth0 if ADR-009 was revised) | Tech Lead | Login flow works end-to-end in staging |

---

## 1. Pre-release gates — day of (2026-05-29 AM)

**DO NOT PROCEED** until every gate is green.

| Gate | Criterion | Evidence |
|---|---|---|
| G1 — CI green | Latest `main` passed typecheck + lint + test + build + security scan | GitHub Actions run URL |
| G2 — Security audit | Internal `sf-security-audit` skill run, zero Critical + High | `docs/reports/SF-SECURITY-AUDIT-20260529.md` |
| G3 — Tenant-check scan | `make tenant-check` returns zero Critical findings | CI output |
| G4 — UAT sign-off | 20 pilot users have completed self-assessment at least once on staging | UAT sign-off form in [UAT_CHECKLIST.md](UAT_CHECKLIST.md) |
| G5 — Performance | Staging smoke test at 200 concurrent users: p95 response <500ms, 0 errors | k6 report |
| G6 — Backup tested | RDS snapshot restored to a sandbox DB successfully | DevOps sign-off |
| G7 — On-call rotation | First 48h coverage confirmed; escalation path documented | Slack `#skillforge-oncall` has pinned rotation |

---

## 2. Deploy sequence — 2026-05-29 Friday EOD

All times in IST (UTC+5:30).

### 2.1 — 18:00: Announce downtime window
```
Slack #skillforge-releases:
  "Starting SkillForge production deployment. ~45 min window. No impact expected
  since we haven't gone live yet; this is the initial cutover for Monday go-live."
```

### 2.2 — 18:05: Tag the release
```bash
cd /path/to/skillforge
git checkout main && git pull
git tag -a v1.0.0-hyper-mvp -m "Hyper-MVP production deployment"
git push origin v1.0.0-hyper-mvp
```

The `release.yml` workflow fires on tag push. Monitor GitHub Actions — pipeline:
1. Build Docker images → ECR (assessment-service + web)
2. Run `prisma migrate deploy` against prod DB (admin connection) from the migration runner task
3. ECS service update: rolling deploy (2 new tasks, drain old after health-check passes)

### 2.3 — 18:15: Verify migrations applied
```bash
aws rds-data execute-statement \
  --resource-arn "$RDS_ARN" \
  --secret-arn "$DB_ADMIN_SECRET_ARN" \
  --database skillforge \
  --sql "SELECT id FROM _prisma_migrations ORDER BY started_at;"
```
Expect: `0001_init`, `0002_enable_rls`, `0003_add_responses_json` rows.

### 2.4 — 18:20: Seed the first tenant
```bash
# one-off ECS task with SEED=qualtech
aws ecs run-task --cluster skillforge-prod \
  --task-definition skillforge-seed-prod \
  --launch-type FARGATE \
  --network-configuration "..."
```
Seed script creates the Qualtech org + HR admin user + the framework draft. HR will then log in and activate the cycle manually from the UI.

### 2.5 — 18:25: Health checks
```bash
# Assessment service
curl https://api.skillforge.qualtech.internal/health
# Expect: { status: "ok", service: "assessment-service", checks: { database: true } }

# Web app
curl -I https://skillforge.qualtech.internal/
# Expect: 200 OK with `x-frame-options: DENY`
```

### 2.6 — 18:30: Smoke test
Log in as the HR admin seed user from incognito. Verify:
- [ ] Dashboard loads
- [ ] Frameworks page loads, shows 1 draft framework
- [ ] Users page loads
- [ ] Invite a test user (the first engineering lead)
- [ ] Copy the invite link, paste into another incognito window → activate account → success

### 2.7 — 18:40: HR cycle preparation (OFFLINE — HR does this over the weekend)
HR reviews the draft framework, adds role mappings for their real role families, publishes the framework, then creates + activates the cycle. See [HR_CYCLE_SETUP.md](HR_CYCLE_SETUP.md).

### 2.8 — 18:45: Enable reminders cron
The BullMQ scheduler registers itself on service startup. Verify:
```bash
aws logs tail /ecs/skillforge-prod --follow --filter-pattern "ReminderScheduler"
```
Expect: `Registered "daily-digest" cron="0 9 * * *"`.

### 2.9 — 18:50: Post-deploy Slack update
```
Slack #skillforge-releases:
  "✅ SkillForge v1.0.0-hyper-mvp deployed. All health checks green.
  HR (Priya) will complete cycle setup Sat/Sun. Cycle goes live for employees Mon 06-01 09:00 IST.
  On-call: DevOps for the weekend, Tech Lead Mon morning."
```

---

## 3. Day-1 Monday 2026-06-01 — live cutover

| Time (IST) | Action | Owner |
|---|---|---|
| 08:00 | Final health check on prod. Run `make status` equivalent CURL checks. | On-call |
| 08:30 | HR sends launch email to all 500+ employees with the SkillForge URL + onboarding guide | HR |
| 09:00 | Cycle status → `open` (HR clicks Activate in `/hr/cycles/[id]`) | HR + Tech Lead |
| 09:00–09:30 | Monitor dashboard + Sentry closely for the first 30 minutes | Tech Lead |
| 10:00 | Sanity audit: verify ~some% of employees have logged in, no Sentry errors | Tech Lead |
| 17:00 | End-of-day #skillforge-eng update with adoption metrics (login count, self-assessments started) | Tech Lead |

---

## 4. Rollback plan

**Trigger condition**: any of
- 5xx error rate >1% sustained for 5 min
- Database corruption detected
- Security incident (credential leak, tenant-isolation violation)
- HR or executive stakeholder escalation to halt

### Rollback steps

1. **Announce** in `#skillforge-incidents`: `"ROLLBACK in progress for v1.0.0-hyper-mvp"`
2. **Revert ECS services** to previous task definition:
   ```bash
   aws ecs update-service --cluster skillforge-prod \
     --service assessment-service \
     --task-definition skillforge-assessment:$PREVIOUS_REVISION
   # same for web
   ```
3. **Do NOT roll back the database** — forward-only migrations. Any fix goes via a new migration.
4. **If the DB is corrupted**: restore from the latest RDS automated backup. See "DB restore" below.
5. **Re-run smoke tests** on the rolled-back stack.
6. **Post-mortem** within 48h per incident response template.

### DB restore (nuclear option — only if schema is compromised)

```bash
# 1. Identify the last-known-good automated backup
aws rds describe-db-snapshots --db-instance-identifier skillforge-prod

# 2. Restore to a new instance
aws rds restore-db-instance-from-db-snapshot \
  --db-instance-identifier skillforge-prod-restore \
  --db-snapshot-identifier <snapshot-arn>

# 3. Swap the DNS endpoint after verifying the restore is healthy
aws rds modify-db-instance --db-instance-identifier skillforge-prod-restore --new-db-instance-identifier skillforge-prod
```

---

## 5. Go/no-go decision matrix

Decision is owned by Tech Lead + Product Owner jointly.

| Signal | Go | No-go |
|---|---|---|
| All gates G1–G7 green | ✓ | Any red |
| UAT completion rate | ≥80% of 20 pilot users | <80% |
| Open P0 bugs | 0 | Any |
| Open P1 bugs | ≤5, all with workarounds documented | >5 or critical workaround missing |
| On-call confirmed | ✓ | Not confirmed |
| Rollback tested | ✓ in staging | Not tested |

If **no-go**, push deployment window by one week; use the week for triage. Appraisal cycle deadline is end-of-May — a one-week slip is the max tolerable delay before the Hyper-MVP fails its primary objective.

---

## 6. Observability quick-links

| Tool | URL | Use for |
|---|---|---|
| CloudWatch dashboards | `/cloudwatch/home#dashboards:name=skillforge-prod` | CPU, memory, request rate |
| Sentry | `sentry.io/organizations/qualtech/projects/skillforge-prod/` | Exceptions + performance |
| ALB access logs | S3 bucket `skillforge-prod-alb-logs` | Request-level debug |
| RDS performance insights | `/rds/home#performance-insights-v20206:` | Slow-query hunt |
| Postgres query log | CloudWatch `/aws/rds/instance/skillforge-prod/postgresql` | Individual statements |

---

## 7. Contact + escalation

- **Slack channels**:
  - `#skillforge-releases` — deployment coordination
  - `#skillforge-incidents` — active incidents (paging)
  - `#skillforge-oncall` — rotation + handoffs
- **PagerDuty service**: `skillforge-prod` — paged on `5xx >1%`, `db-cpu >80%`, `queue-depth >1000`
- **Escalation**:
  1. First responder → on-call engineer (SLA 15 min)
  2. Tech Lead (SLA 30 min)
  3. Engineering Manager (SLA 1 hour)

---

## 8. Post-launch monitoring — first 72 hours

Check twice daily (09:00 + 18:00 IST):

- [ ] 5xx error rate <0.1% on both services
- [ ] p95 response time <500ms
- [ ] Zero tenant-isolation violations in audit log (query: `SELECT * FROM audit_log WHERE action LIKE '%cross_tenant%'` — should return only legitimate super_admin ops)
- [ ] Daily reminder cron fires at 09:00 UTC (check CloudWatch)
- [ ] Self-assessment submission count growing
- [ ] No failed audit writes in logs

On day-3 (2026-06-03), write a short post-launch status note to `#skillforge-releases` summarizing adoption, any incidents, and the plan for Phase 2 kickoff.
