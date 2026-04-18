import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { withTenant, type TenantId } from '@skillforge/tenant-guard';
import {
  NotificationPrefsSchema,
  DEFAULT_NOTIFICATION_PREFS,
  DigestFrequencySchema,
  type NotificationPrefs,
  type UpdateNotificationPrefsDto,
} from '@skillforge/shared-types';

/**
 * NotificationPreferencesService
 *
 * Read + partial-update a user's notification preferences.
 * The column is a raw JSONB in Postgres; the schema is enforced with zod
 * both on write (controller DTO) AND on read (defensive — in case a row
 * pre-dates a schema extension).
 */
@Injectable()
export class NotificationPreferencesService {
  /** Return the merged preferences for the given user. Falls back to defaults. */
  async get(orgId: TenantId, userId: string): Promise<NotificationPrefs> {
    return withTenant(orgId, async (tx) => {
      const u = await tx.user.findFirst({
        where: { id: userId, deletedAt: null },
        select: { notificationPrefsJson: true },
      });
      if (!u) throw new NotFoundException();
      return mergePrefs(DEFAULT_NOTIFICATION_PREFS, u.notificationPrefsJson);
    });
  }

  /** Deep-merge patch into stored prefs and return the updated shape. */
  async update(
    orgId: TenantId,
    userId: string,
    patch: UpdateNotificationPrefsDto,
  ): Promise<NotificationPrefs> {
    // Extra guard: even though zod validates, double-check digestFrequency
    // in case callers bypass the controller (tests, internal services).
    if (patch.reminders?.digestFrequency !== undefined) {
      const check = DigestFrequencySchema.safeParse(patch.reminders.digestFrequency);
      if (!check.success) {
        throw new BadRequestException('digestFrequency must be one of daily|weekly|off');
      }
    }

    return withTenant(orgId, async (tx) => {
      const u = await tx.user.findFirst({
        where: { id: userId, deletedAt: null },
        select: { notificationPrefsJson: true },
      });
      if (!u) throw new NotFoundException();

      const current = mergePrefs(DEFAULT_NOTIFICATION_PREFS, u.notificationPrefsJson);
      const merged = mergePrefs(current, patch);

      // Re-validate the merged result so we never persist an incoherent row.
      const parsed = NotificationPrefsSchema.parse(merged);

      await tx.user.update({
        where: { id: userId },
        data: { notificationPrefsJson: parsed },
      });

      return parsed;
    });
  }
}

/**
 * Deep-merge two preference trees.
 *
 * - `base` provides fallback values (defaults or the current row).
 * - `overlay` is either a stored JSON blob or a partial PATCH body.
 *
 * Only the known sub-trees (`reminders`, `assignment`, `managerReview`)
 * are merged — unknown top-level keys are ignored so we can't smuggle
 * arbitrary data into the column.
 */
function mergePrefs(base: NotificationPrefs, overlay: unknown): NotificationPrefs {
  if (!overlay || typeof overlay !== 'object') return base;
  const o = overlay as Partial<NotificationPrefs>;

  return {
    reminders: {
      enabled: o.reminders?.enabled ?? base.reminders.enabled,
      digestFrequency: o.reminders?.digestFrequency ?? base.reminders.digestFrequency,
    },
    assignment: {
      enabled: o.assignment?.enabled ?? base.assignment.enabled,
    },
    managerReview: {
      enabled: o.managerReview?.enabled ?? base.managerReview.enabled,
    },
  };
}
