import { Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';
import IORedis, { type Redis } from 'ioredis';
import { REMINDER_QUEUE, REMINDER_JOB_NAME } from './reminder.worker';

/**
 * Registers a BullMQ repeatable job that enqueues the daily digest.
 *
 * Default schedule: 09:00 UTC daily (override via REMINDER_CRON env).
 * Sprint 3 will fan out per-tenant tz; Sprint 2 keeps it UTC.
 *
 * Never throws from register() — if Redis is down the HTTP service still
 * boots and the scheduler logs a warning (per ADR-010: queue is best-effort).
 */
@Injectable()
export class ReminderScheduler {
  private readonly logger = new Logger('ReminderScheduler');
  private queue: Queue | null = null;
  private connection: Redis | null = null;

  async register(): Promise<void> {
    const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';
    const cron = process.env.REMINDER_CRON ?? '0 9 * * *';

    try {
      this.connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
      this.queue = new Queue(REMINDER_QUEUE, { connection: this.connection });

      // Remove stale repeatables that point at an old cron string
      const existing = await this.queue.getRepeatableJobs();
      for (const j of existing) {
        if (j.name === REMINDER_JOB_NAME && j.pattern !== cron) {
          await this.queue.removeRepeatableByKey(j.key);
          this.logger.log(`Removed stale repeatable job ${j.key}`);
        }
      }

      await this.queue.add(
        REMINDER_JOB_NAME,
        {},
        {
          repeat: { pattern: cron },
          removeOnComplete: { count: 30 },
          removeOnFail: { count: 30 },
        },
      );

      this.logger.log(`Registered "${REMINDER_JOB_NAME}" cron="${cron}"`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Redis unavailable — reminder cron will NOT run. ${msg}`);
    }
  }

  async close(): Promise<void> {
    await this.queue?.close();
    await this.connection?.quit();
    this.queue = null;
    this.connection = null;
  }
}
