-- Sprint 5: per-user notification preferences (HTML emails + opt-outs)
-- Shape is defined in @skillforge/shared-types → NotificationPrefsSchema
-- Default allows all channels on daily-digest cadence so existing users
-- keep receiving reminders after the migration (opt-out, not opt-in).
ALTER TABLE "users" ADD COLUMN "notification_prefs_json" JSONB NOT NULL DEFAULT '{"reminders":{"enabled":true,"digestFrequency":"daily"},"assignment":{"enabled":true},"managerReview":{"enabled":true}}'::jsonb;
COMMENT ON COLUMN "users"."notification_prefs_json" IS 'shape per shared-types NotificationPrefs';
