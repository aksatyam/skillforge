import { Module, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { MailerService } from './mailer.service';
import { ReminderWorker } from './reminder.worker';
import { ReminderScheduler } from './reminder.scheduler';

/**
 * NotificationsModule — Sprint 2 feature #12 (email reminders).
 *
 * Wires MailerService + ReminderWorker + ReminderScheduler.
 *
 * Graceful degradation: if Redis is unreachable the scheduler logs a warning
 * and skips registration; the HTTP service still starts. BullMQ itself will
 * surface connection errors via its own logger.
 */
@Module({
  providers: [MailerService, ReminderWorker, ReminderScheduler],
  exports: [MailerService],
})
export class NotificationsModule implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('NotificationsModule');

  constructor(
    private readonly scheduler: ReminderScheduler,
    private readonly worker: ReminderWorker,
  ) {}

  async onModuleInit(): Promise<void> {
    // Worker must be listening BEFORE the scheduler enqueues
    await this.worker.start();
    await this.scheduler.register();
    this.logger.log('Reminder subsystem online');
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker.stop();
    await this.scheduler.close();
    this.logger.log('Reminder subsystem stopped');
  }
}
