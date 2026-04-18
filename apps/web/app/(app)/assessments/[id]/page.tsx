'use client';

/**
 * Self-assessment form — Sprint 2 feature #6.
 *
 * Flow:
 *   1. Fetch assessment (includes cycle + framework.roleMappings)
 *   2. Resolve rubric for the current user's role family
 *   3. Hydrate form from any previously-saved self-draft
 *   4. Auto-save draft every 30s when the form is dirty
 *   5. Submit when all dimensions have a score → redirect to /assessments
 *
 * Read-only view when status is past self_submitted.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useFieldArray, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  SubmitSelfAssessmentDtoSchema,
  type SubmitSelfAssessmentDto,
} from '@skillforge/shared-types';
import { ArrowLeft, CheckCircle2, Loader2, Save, AlertCircle } from 'lucide-react';
import {
  useAssessment,
  useSaveSelfDraft,
  useSubmitSelf,
  type AssessmentDetail,
  type RoleMapping,
} from '@/hooks/use-assessments';
import { useMe } from '@/hooks/use-me';
import { ArtifactUploader } from '@/components/ArtifactUploader';

const AUTOSAVE_MS = 30_000;

type FormValues = SubmitSelfAssessmentDto;

export default function AssessmentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const me = useMe();
  const { data: a, isLoading, isError, error } = useAssessment(id);

  if (isLoading || !a || !me.data) {
    return <div className="text-brand-medium">Loading…</div>;
  }
  if (isError) {
    return (
      <div className="rounded-md border border-brand-red/30 bg-red-50 p-4 text-sm text-brand-red">
        {error instanceof Error ? error.message : 'Failed to load assessment'}
      </div>
    );
  }

  const rubric = resolveRubric(a, me.data.roleFamily);
  const isEditable = a.status === 'not_started' || a.status === 'self_submitted';

  // Draft saves are only permitted server-side while status is
  // not_started or self_submitted; new submissions require not_started.
  const canSubmit = a.status === 'not_started';

  return (
    <div className="max-w-5xl">
      <Link
        href="/assessments"
        className="mb-4 inline-flex items-center gap-1 text-sm text-brand-blue hover:underline"
      >
        <ArrowLeft size={14} /> Back to my assessments
      </Link>

      <header className="mb-6">
        <h1 className="text-3xl font-bold text-brand-navy">{a.cycle.name}</h1>
        <p className="mt-1 text-sm text-brand-medium">
          {a.cycle.framework.name} · Role family:{' '}
          <span className="font-medium text-brand-dark">{me.data.roleFamily}</span>
        </p>
      </header>

      {rubric.length === 0 ? (
        <div className="rounded-md border border-brand-orange/30 bg-amber-50 p-4 text-sm text-brand-orange">
          No rubric is mapped to your role family ({me.data.roleFamily}) in this framework. Ask
          your HR admin to add a role mapping before you self-assess.
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
          {isEditable ? (
            <SelfAssessmentForm
              assessment={a}
              rubric={rubric}
              canSubmit={canSubmit}
              onSubmitted={() => router.push('/assessments')}
            />
          ) : (
            <ReadOnlyView a={a} rubric={rubric} />
          )}
          <aside className="space-y-4">
            <MaturityLegend a={a} />
            <ArtifactUploader
              assessmentId={a.id}
              existing={a.artifacts}
              disabled={!isEditable}
            />
          </aside>
        </div>
      )}
    </div>
  );
}

// ── Form ────────────────────────────────────────────────────────────

function SelfAssessmentForm({
  assessment,
  rubric,
  canSubmit,
  onSubmitted,
}: {
  assessment: AssessmentDetail;
  rubric: RoleMapping['assessmentCriteriaJson']['rubric'];
  canSubmit: boolean;
  onSubmitted: () => void;
}) {
  const saveDraft = useSaveSelfDraft();
  const submitSelf = useSubmitSelf();

  const [lastSavedAt, setLastSavedAt] = useState<string | null>(
    assessment.responsesJson?.self?.savedAt ?? null,
  );
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Seed form from saved draft, falling back to rubric with score=0
  const defaultValues = useMemo<FormValues>(() => {
    const saved = assessment.responsesJson?.self?.responses ?? [];
    const byDim = new Map(saved.map((r) => [r.dimension, r]));
    return {
      assessmentId: assessment.id,
      responses: rubric.map((r) => {
        const prev = byDim.get(r.dimension);
        return {
          dimension: r.dimension,
          score: prev?.score ?? 0,
          comment: prev?.comment ?? '',
        };
      }),
    };
  }, [assessment, rubric]);

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isDirty, isSubmitting },
    reset,
    getValues,
  } = useForm<FormValues>({
    resolver: zodResolver(SubmitSelfAssessmentDtoSchema),
    defaultValues,
  });

  const { fields } = useFieldArray({ control, name: 'responses' });

  // Watch values to drive both (a) auto-save "dirty" heuristics and
  // (b) the "submit disabled until every dimension scored" rule.
  const watched = useWatch({ control, name: 'responses' });
  const allScored = (watched ?? []).every((r) => typeof r?.score === 'number' && r.score > 0);

  // Auto-save on a 30s interval — only when dirty and not mid-submit.
  // The mutation itself debounces concurrent attempts by checking isPending.
  const lastSavedSnapshotRef = useRef<string>(JSON.stringify(defaultValues.responses));
  useEffect(() => {
    const timer = setInterval(async () => {
      if (!isDirty || isSubmitting) return;
      if (saveDraft.isPending) return;
      const current = JSON.stringify(getValues('responses'));
      if (current === lastSavedSnapshotRef.current) return;
      try {
        const res = await saveDraft.mutateAsync({
          assessmentId: assessment.id,
          responses: getValues('responses'),
        });
        lastSavedSnapshotRef.current = current;
        const savedAt = (res.responsesJson as { self?: { savedAt?: string } } | null)?.self
          ?.savedAt;
        if (savedAt) setLastSavedAt(savedAt);
      } catch {
        /* quiet — the banner below surfaces persistent failures */
      }
    }, AUTOSAVE_MS);
    return () => clearInterval(timer);
  }, [isDirty, isSubmitting, saveDraft, getValues, assessment.id]);

  async function onSaveDraftClick() {
    try {
      const res = await saveDraft.mutateAsync({
        assessmentId: assessment.id,
        responses: getValues('responses'),
      });
      const savedAt = (res.responsesJson as { self?: { savedAt?: string } } | null)?.self
        ?.savedAt;
      if (savedAt) setLastSavedAt(savedAt);
      lastSavedSnapshotRef.current = JSON.stringify(getValues('responses'));
      // Rebase the form's baseline so isDirty flips back to false.
      reset(getValues());
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to save draft');
    }
  }

  async function onSubmit(values: FormValues) {
    setSubmitError(null);
    try {
      await submitSelf.mutateAsync(values);
      onSubmitted();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to submit');
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="rounded-lg border border-neutral-200 bg-white p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-brand-navy">Self-assessment</h2>
            <p className="text-xs text-brand-medium">
              Rate each dimension 0–5. Add a comment with evidence or context.
            </p>
          </div>
          <DraftStatus
            pending={saveDraft.isPending}
            lastSavedAt={lastSavedAt}
            dirty={isDirty}
          />
        </div>

        {submitError && (
          <div className="mb-3 flex items-start gap-2 rounded-md border border-brand-red/30 bg-red-50 p-2 text-sm text-brand-red">
            <AlertCircle size={14} /> <span>{submitError}</span>
          </div>
        )}

        <ul className="space-y-4">
          {fields.map((field, idx) => (
            <li key={field.id} className="rounded-md border border-neutral-200 p-4">
              <div className="flex items-center justify-between">
                <label className="font-medium text-brand-dark">
                  {field.dimension}
                  <span className="ml-2 text-xs font-normal text-brand-medium">
                    weight {(rubric[idx]?.weight * 100).toFixed(0)}%
                  </span>
                </label>
                <span className="font-mono text-sm text-brand-blue">
                  {(watched?.[idx]?.score ?? 0).toFixed(1)} / 5
                </span>
              </div>

              <input
                type="range"
                min={0}
                max={5}
                step={0.5}
                {...register(`responses.${idx}.score`, { valueAsNumber: true })}
                className="mt-2 w-full accent-brand-blue"
              />
              <div className="mt-1 flex justify-between text-[10px] uppercase tracking-wider text-brand-medium">
                <span>0</span>
                <span>1</span>
                <span>2</span>
                <span>3</span>
                <span>4</span>
                <span>5</span>
              </div>

              <textarea
                {...register(`responses.${idx}.comment`)}
                rows={2}
                placeholder="Optional — evidence, tools used, impact…"
                className="mt-3 w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm outline-none focus:border-brand-blue focus:ring-1 focus:ring-brand-blue"
              />
              {errors.responses?.[idx]?.score && (
                <p className="mt-1 text-xs text-brand-red">
                  {errors.responses[idx]?.score?.message}
                </p>
              )}
            </li>
          ))}
        </ul>

        <div className="mt-5 flex items-center justify-between">
          <button
            type="button"
            onClick={onSaveDraftClick}
            disabled={saveDraft.isPending}
            className="inline-flex items-center gap-1 rounded-md border border-neutral-300 px-3 py-1.5 text-sm text-brand-dark hover:border-brand-blue hover:text-brand-blue disabled:opacity-50"
          >
            <Save size={14} /> {saveDraft.isPending ? 'Saving…' : 'Save draft'}
          </button>

          <button
            type="submit"
            disabled={!canSubmit || !allScored || isSubmitting}
            title={
              !canSubmit
                ? 'Already submitted'
                : !allScored
                  ? 'Score every dimension before submitting'
                  : undefined
            }
            className="inline-flex items-center gap-2 rounded-md bg-brand-navy px-4 py-2 text-sm font-semibold text-white hover:bg-brand-blue disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmitting ? (
              <Loader2 className="animate-spin" size={14} />
            ) : (
              <CheckCircle2 size={14} />
            )}
            {canSubmit ? 'Submit self-assessment' : 'Already submitted'}
          </button>
        </div>
      </div>
    </form>
  );
}

function DraftStatus({
  pending,
  lastSavedAt,
  dirty,
}: {
  pending: boolean;
  lastSavedAt: string | null;
  dirty: boolean;
}) {
  if (pending)
    return (
      <span className="inline-flex items-center gap-1 text-xs text-brand-medium">
        <Loader2 size={12} className="animate-spin" /> Saving draft…
      </span>
    );
  if (!lastSavedAt)
    return <span className="text-xs text-brand-medium">No draft saved yet</span>;
  return (
    <span className="text-xs text-brand-medium">
      {dirty ? 'Unsaved changes · last save' : 'Draft saved'}{' '}
      {new Date(lastSavedAt).toLocaleTimeString()}
    </span>
  );
}

function ReadOnlyView({
  a,
  rubric,
}: {
  a: AssessmentDetail;
  rubric: RoleMapping['assessmentCriteriaJson']['rubric'];
}) {
  const self = a.responsesJson?.self?.responses ?? [];
  const byDim = new Map(self.map((r) => [r.dimension, r]));

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-neutral-200 bg-white p-5">
        <h2 className="font-semibold text-brand-navy">Your submission</h2>
        <p className="text-xs text-brand-medium">
          Submitted {a.submittedAt ? new Date(a.submittedAt).toLocaleString() : '—'} · Self score{' '}
          <span className="font-mono text-brand-blue">
            {a.selfScore != null ? a.selfScore.toFixed(2) : '—'}
          </span>
        </p>

        <ul className="mt-4 space-y-3">
          {rubric.map((r) => {
            const resp = byDim.get(r.dimension);
            return (
              <li key={r.dimension} className="rounded-md border border-neutral-200 p-3">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-brand-dark">{r.dimension}</span>
                  <span className="font-mono text-sm text-brand-blue">
                    {resp ? resp.score.toFixed(1) : '—'} / 5
                  </span>
                </div>
                {resp?.comment && (
                  <p className="mt-1 text-sm text-brand-medium">{resp.comment}</p>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      {(a.managerScore != null || a.compositeScore != null) && (
        <div className="rounded-lg border border-neutral-200 bg-white p-5">
          <h2 className="font-semibold text-brand-navy">Manager & composite</h2>
          <div className="mt-2 grid grid-cols-3 gap-3 text-sm">
            {(
              [
                ['Self', a.selfScore],
                ['Manager', a.managerScore],
                ['Composite', a.compositeScore],
              ] as const
            ).map(([label, value]) => (
              <div key={label} className="rounded-md bg-neutral-50 p-3">
                <div className="text-xs uppercase tracking-wider text-brand-medium">{label}</div>
                <div className="mt-1 font-mono text-xl font-semibold text-brand-navy">
                  {value != null ? value.toFixed(2) : '—'}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function MaturityLegend({ a }: { a: AssessmentDetail }) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-5">
      <h3 className="font-semibold text-brand-navy">Maturity levels</h3>
      <p className="mt-0.5 text-xs text-brand-medium">
        Use these descriptors as anchors when scoring 0–5.
      </p>
      <ul className="mt-3 space-y-2 text-xs">
        {a.cycle.framework.maturityLevelsJson.map((l) => (
          <li key={l.level} className="flex gap-2">
            <span className="font-mono font-semibold text-brand-blue">L{l.level}</span>
            <span>
              <span className="font-medium text-brand-dark">{l.name}.</span>{' '}
              <span className="text-brand-medium">{l.description}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────

function resolveRubric(
  a: AssessmentDetail,
  roleFamily: string,
): RoleMapping['assessmentCriteriaJson']['rubric'] {
  const mapping = a.cycle.framework.roleMappings.find((m) => m.roleFamily === roleFamily);
  return mapping?.assessmentCriteriaJson.rubric ?? [];
}
