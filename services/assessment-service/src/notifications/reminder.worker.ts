import { Injectable, Logger } from '@nestjs/common';
import { Worker, type Job } from 'bullmq';
import IORedis, { type Redis } from 'ioredis';
import { prismaAdmin } from '@skillforge/db';
import {
  NotificationPrefsSchema,
  DEFAULT_NOTIFICATION_PREFS,
  type NotificationPrefs,
} from '@skillforge/shared-types';
import { MailerService } from './mailer.service';
import { renderReminderEmail } from './templates/reminder';

/**
 * ReminderWorker — BullMQ worker for the Sprint 2 daily-digest feature.
 *
 * "At risk" = Assessment row with status='not_started' on the tenant's
 * currently-open cycle AND cycle.endDate is within
 * REMINDER_DAYS_BEFORE_DEADLINE days from today.
 *
 * Concurrency=1 for Sprint 2 — avoids idempotency-key races entirely.
 * Uses `prismaAdmin` because the worker runs outside any HTTP request and
 * has no tenant context (see reference_admin_client_pattern memory).
 *
 * Idempotency: Redis SET NX EX 86400, key `reminder:sent:{userId}:{YYYYMMDD}`.
 * Rationale in docs/design/reminder-idempotency.md.
 *
 * Sprint 5: per-user `notificationPrefsJson.reminders.enabled` gates sending.
 * Opted-out users are counted as `skipped` (not `failed`) and no audit is
 * written — the pref itself is the audit trail.
 */

export const REMINDER_QUEUE = 'reminder-digest';
export const REMINDER_JOB_NAME = 'daily-digest';

const IDEMPOTENCY_KEY_PREFIX = 'reminder:sent';
const IDEMPOTENCY_TTL_SEC = 24 * 60 * 60;

interface ReminderJobPayload {
  runAt?: string;
}

export interface RunSummary {
  cyclesScanned: number;
  sends: number;
  skipped: number;
  failed: number;
}

/** Coerce untyped JSON to a valid NotificationPrefs; fall back to defaults. */
function readPrefs(raw: unknown): NotificationPrefs {
  const parsed = NotificationPrefsSchema.safeParse(raw);
  return parsed.success ? parsed.data : DEFAULT_NOTIFICATION_PREFS;
}

@Injectable()
export class ReminderWorker {
  private readonly logger = new Logger('ReminderWorker');
  private worker: Worker<ReminderJobPayload> | null = null;
  private redis: Redis | null = null;

  constructor(private readonly mailer: MailerService) {}

  async start(): Promise<void> {
    const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';
    this.redis = new IORedis(redisUrl, { maxRetriesPerRequest: null });

    this.worker = new Worker<ReminderJobPayload>(
      REMINDER_QUEUE,
      (job) => this.process(job),
      { connection: this.redis, concurrency: 1 },
    );

    this.worker.on('failed', (job, err) => {
      this.logger.error(`Job ${job?.id ?? '?'} failed: ${err.message}`, err.stack);
    });
    this.worker.on('completed', (job, result: unknown) => {
      this.logger.log(`Job ${job.id} completed: ${JSON.stringify(result)}`);
    });

    this.logger.log(`Worker listening on queue "${REMINDER_QUEUE}"`);
  }

  async stop(): Promise<void> {
    await this.worker?.close();
    await this.redis?.quit();
    this.worker = null;
    this.redis = null;
  }

  async process(job: Job<ReminderJobPayload>): Promise<RunSummary> {
    const now = job.data.runAt ? new Date(job.data.runAt) : new Date();
    return this.runDigest(now);
  }

  async runDigest(now: Date): Promise<RunSummary> {
    const daysBefore = Number(process.env.REMINDER_DAYS_BEFORE_DEADLINE ?? 7);
    const deadlineCutoff = addDays(now, daysBefore);

    const atRiskCycles = await prismaAdmin.assessmentCycle.findMany({
      where: {
        status: 'open',
        deletedAt: null,
        endDate: { gte: now, lte: deadlineCutoff },
      },
      select: { id: true, orgId: true, name: true, endDate: true },
    });

    if (atRiskCycles.length === 0) {
      this.logger.log('No cycles within deadline window — 0 sends');
      return { cyclesScanned: 0, sends: 0, skipped: 0, failed: 0 };
    }

    let sends = 0;
    let skipped = 0;
    let failed = 0;

    for (const cycle of atRiskCycles) {
      // Sprint 5: load prefs alongside the assessment fetch so we can honor
      // opt-out without a second round-trip per employee.
      const pending = await prismaAdmin.assessment.findMany({
        where: {
          cycleId: cycle.id,
          status: 'not_started',
          deletedAt: null,
          user: { deletedAt: null },
        },
        select: {
          id: true,
          userId: true,
          user: {
            select: {
              id: true,
              email: true,
              name: true,
              notificationPrefsJson: true,
            },
          },
        },
      });

      for (const a of pending) {
        const prefs = readPrefs(a.user.notificationPrefsJson);
        if (!prefs.reminders.enabled) {
          this.logger.debug(`skip ${a.user.email} — skipped=user_opted_out`);
          skipped += 1;
          continue;
        }

        const result = await this.sendOne({
          orgId: cycle.orgId,
          cycleName: cycle.name,
          cycleEndDate: cycle.endDate,
          userId: a.user.id,
          email: a.user.email,
          name: a.user.name,
          now,
        });
        if (result === 'sent') sends += 1;
        else if (result === 'skipped') skipped += 1;
        else failed += 1;
      }
    }

    this.logger.log(
      `runDigest done: cycles=${atRiskCycles.length} sent=${sends} skipped=${skipped} failed=${failed}`,
    );
    return { cyclesScanned: atRiskCycles.length, sends, skipped, failed };
  }

  private async sendOne(args: {
    orgId: string;
    cycleName: string;
    cycleEndDate: Date;
    userId: string;
    email: string;
    name: string;
    now: Date;
    tenantTimezone: string;
  }): Promise<'sent' | 'skipped' | 'failed'> {
    const { orgId, cycleName, cycleEndDate, userId, email, name, now, tenantTimezone } = args;
    const key = `${IDEMPOTENCY_KEY_PREFIX}:${userId}:${ymd(now, tenantTimezone)}`;

    if (this.redis) {
      const claimed = await this.redis.set(key, '1', 'EX', IDEMPOTENCY_TTL_SEC, 'NX');
      if (claimed !== 'OK') {
        this.logger.debug(`skip ${email} — reminder already sent today`);
        return 'skipped';
      }
    }

    const daysLeft = Math.max(
      0,
      Math.ceil((cycleEndDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)),
    );
    const appBaseUrl = process.env.APP_BASE_URL ?? 'https://app.skillforge.local';
    const assessmentUrl = `${appBaseUrl}/assessments`;

    const rendered = renderReminderEmail({
      employeeName: name,
      cycleName,
      daysLeft,
      cycleEndDate,
      assessmentUrl,
    });

    const mailResult = await this.mailer.send({
      to: email,
      subject: rendered.subject,
      text: rendered.text,
      html: rendered.html,
    });

    if (!mailResult.ok) {
      if (this.redis) await this.redis.del(key);
      await this.writeAudit(orgId, userId, 'reminder.failed', mailResult.error);
      return 'failed';
    }

    await this.writeAudit(orgId, userId, 'reminder.sent', null);
    return 'sent';
  }

  private async writeAudit(
    orgId: string,
    subjectUserId: string,
    action: string,
    error: string | null,
  ): Promise<void> {
    try {
      await prismaAdmin.auditLog.create({
        data: {
          orgId,
          actorId: null,
          action,
          entityType: 'assessment',
          entityId: subjectUserId,
          rationale: error,
        },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`audit write failed for ${action}: ${msg}`);
    }
  }
}

function addDays(d: Date, days: number): Date {
  const out = new Date(d);
  out.setUTCDate(out.getUTCDate() + days);
  return out;
}

/**
 * Date bucket for idempotency. Per-tenant timezone means a cycle in
 * Asia/Kolkata gets ONE reminder per local day, even if the UTC
 * worker fires across a midnight boundary. Sprint 5 fix.
 */
function ymd(d: Date, timeZone = 'UTC'): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d);
  const y = parts.find((p) => p.type === 'year')?.value ?? '0000';
  const m = parts.find((p) => p.type === 'month')?.value ?? '00';
  const day = parts.find((p) => p.type === 'day')?.value ?? '00';
  return `${y}${m}${day}`;
}

/**
 * Read the tenant's IANA timezone from organization.settings_json.timezone.
 * Falls back to UTC if missing or invalid (invalid tz strings throw from Intl).
 */
export function resolveTimezone(settingsJson: unknown): string {
  const raw = (settingsJson as { timezone?: unknown } | null)?.timezone;
  if (typeof raw !== 'string' || raw.length === 0) return 'UTC';
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: raw });
    return raw;
  } catch {
    return 'UTC';
  }
}
