'use client';

import { useEffect, useState } from 'react';
import type {
  DigestFrequency,
  NotificationPrefs,
  UpdateNotificationPrefsDto,
} from '@skillforge/shared-types';
import {
  useNotificationPrefs,
  useUpdateNotificationPrefs,
} from '@/hooks/use-notification-prefs';

/**
 * /settings/notifications — per-user, role-agnostic.
 *
 * Three toggle groups:
 *   1. Assessment reminders (with daily|weekly|off dropdown)
 *   2. New assessment assignments
 *   3. Manager review pending
 *
 * The page holds the "draft" prefs locally so users can toggle several things
 * and Save in one request. A diff is computed at save time so the PATCH body
 * only carries changed sub-trees.
 */
export default function NotificationSettingsPage() {
  const { data, isLoading, isError } = useNotificationPrefs();
  const update = useUpdateNotificationPrefs();

  const [draft, setDraft] = useState<NotificationPrefs | null>(null);
  const [showSaved, setShowSaved] = useState(false);

  useEffect(() => {
    if (data && !draft) setDraft(data);
  }, [data, draft]);

  if (isLoading || !draft) {
    return <div className="text-brand-medium">Loading notification settings…</div>;
  }

  if (isError || !data) {
    return (
      <div className="text-brand-red">
        Couldn&apos;t load notification settings. Please refresh.
      </div>
    );
  }

  const dirty = !deepEqual(draft, data);

  const onSave = async () => {
    if (!data) return;
    const patch = diffPrefs(data, draft);
    if (Object.keys(patch).length === 0) return;
    setShowSaved(false);
    await update.mutateAsync(patch);
    setShowSaved(true);
    setTimeout(() => setShowSaved(false), 2500);
  };

  const onReset = () => setDraft(data);

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-brand-navy">Notification settings</h1>
      <p className="mt-1 text-sm text-brand-medium">
        Control which emails SkillForge sends you. Changes apply the next time a
        notification is triggered.
      </p>

      {showSaved && (
        <div className="mt-4 rounded-md border border-brand-green/30 bg-brand-green/10 p-3 text-sm text-brand-green">
          Notification preferences saved.
        </div>
      )}

      <div className="mt-6 space-y-4">
        <ToggleCard
          title="Assessment reminders"
          description="Daily or weekly digest when you have an incomplete self-assessment that is approaching its deadline."
          enabled={draft.reminders.enabled}
          onToggle={(enabled) =>
            setDraft({ ...draft, reminders: { ...draft.reminders, enabled } })
          }
        >
          <div className="mt-3 flex items-center gap-3">
            <label className="text-xs font-medium uppercase tracking-wider text-brand-medium">
              Digest frequency
            </label>
            <select
              value={draft.reminders.digestFrequency}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  reminders: {
                    ...draft.reminders,
                    digestFrequency: e.target.value as DigestFrequency,
                  },
                })
              }
              disabled={!draft.reminders.enabled}
              className="rounded-md border border-neutral-300 bg-white px-2 py-1 text-sm text-brand-dark disabled:opacity-50"
            >
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="off">Off</option>
            </select>
          </div>
        </ToggleCard>

        <ToggleCard
          title="New assessment assignments"
          description="Email me when HR assigns me to a new assessment cycle."
          enabled={draft.assignment.enabled}
          onToggle={(enabled) =>
            setDraft({ ...draft, assignment: { enabled } })
          }
        />

        <ToggleCard
          title="Manager review pending"
          description="If I am a manager, email me when one of my reports submits their self-assessment and is waiting for my review."
          enabled={draft.managerReview.enabled}
          onToggle={(enabled) =>
            setDraft({ ...draft, managerReview: { enabled } })
          }
        />
      </div>

      <div className="mt-6 flex items-center gap-3">
        <button
          onClick={onSave}
          disabled={!dirty || update.isPending}
          className="rounded-md bg-brand-navy px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-navy/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {update.isPending ? 'Saving…' : 'Save changes'}
        </button>
        {dirty && (
          <button
            onClick={onReset}
            className="text-sm text-brand-medium hover:text-brand-dark"
          >
            Reset
          </button>
        )}
        {update.isError && (
          <span className="text-sm text-brand-red">
            {update.error instanceof Error ? update.error.message : 'Save failed'}
          </span>
        )}
      </div>
    </div>
  );
}

function ToggleCard(props: {
  title: string;
  description: string;
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  children?: React.ReactNode;
}) {
  const { title, description, enabled, onToggle, children } = props;
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-brand-navy">{title}</h3>
          <p className="mt-1 text-sm text-brand-medium">{description}</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          onClick={() => onToggle(!enabled)}
          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition ${
            enabled ? 'bg-brand-navy' : 'bg-neutral-300'
          }`}
        >
          <span
            className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${
              enabled ? 'translate-x-5' : 'translate-x-0.5'
            }`}
          />
        </button>
      </div>
      {enabled && children}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function deepEqual(a: NotificationPrefs, b: NotificationPrefs): boolean {
  return (
    a.reminders.enabled === b.reminders.enabled &&
    a.reminders.digestFrequency === b.reminders.digestFrequency &&
    a.assignment.enabled === b.assignment.enabled &&
    a.managerReview.enabled === b.managerReview.enabled
  );
}

function diffPrefs(
  prev: NotificationPrefs,
  next: NotificationPrefs,
): UpdateNotificationPrefsDto {
  const patch: UpdateNotificationPrefsDto = {};
  if (
    prev.reminders.enabled !== next.reminders.enabled ||
    prev.reminders.digestFrequency !== next.reminders.digestFrequency
  ) {
    patch.reminders = {
      enabled: next.reminders.enabled,
      digestFrequency: next.reminders.digestFrequency,
    };
  }
  if (prev.assignment.enabled !== next.assignment.enabled) {
    patch.assignment = { enabled: next.assignment.enabled };
  }
  if (prev.managerReview.enabled !== next.managerReview.enabled) {
    patch.managerReview = { enabled: next.managerReview.enabled };
  }
  return patch;
}
