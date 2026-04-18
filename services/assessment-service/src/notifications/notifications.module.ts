import { Module, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { MailerService } from './mailer.service';
import { ReminderWorker } from './reminder.worker';
import { ReminderScheduler } from './reminder.scheduler';
import { NotificationPreferencesController } from './preferences.controller';
import { NotificationPreferencesService } from './preferences.service';

/**
 * NotificationsModule — Sprint 2 feature #12 (email reminders) +
 * Sprint 5 feature #1 (HTML templates + per-user preferences).
 *
 * Wires MailerService + ReminderWorker + ReminderScheduler +
 * NotificationPreferencesService (controller) so users can opt out.
 *
 * Graceful degradation: if Redis is unreachable the scheduler logs a warning
 * and skips registration; the HTTP service still starts. BullMQ itself will
 * surface connection errors via its own logger.
 */
@Module({
  controllers: [NotificationPreferencesController],
  providers: [
    MailerService,
    ReminderWorker,
    ReminderScheduler,
    NotificationPreferencesService,
  ],
  exports: [MailerService, NotificationPreferencesService],
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
