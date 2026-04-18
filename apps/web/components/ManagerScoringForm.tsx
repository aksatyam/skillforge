'use client';

/**
 * ManagerScoringForm — Sprint 3 Feature #13.
 *
 * Rubric-driven form a manager uses to score a direct report after
 * self-submission. The page owns access/status gating + surrounding
 * context; this component is just the form.
 *
 * The submitted `managerScore` is the rubric-weighted average of the
 * per-dimension scores — matching the weights that settle into the
 * composite on the backend.
 */
import { useMemo, useState } from 'react';
import { useForm, useFieldArray, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  SubmitManagerAssessmentDtoSchema,
  type SubmitManagerAssessmentDto,
} from '@skillforge/shared-types';
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { useSubmitManagerScore } from '@/hooks/use-manager-scoring';
import type { AssessmentDetail, RoleMapping } from '@/hooks/use-assessments';
import { AiSuggestionBadge } from '@/components/AiSuggestionBadge';

type FormValues = SubmitManagerAssessmentDto;
type Rubric = RoleMapping['assessmentCriteriaJson']['rubric'];

const MIN_RATIONALE = 20;
const DEFAULT_WEIGHTS = { self: 0.15, manager: 0.5, peer: 0.2, ai: 0.15 } as const;

export function ManagerScoringForm({
  assessment,
  onSubmitted,
}: {
  assessment: AssessmentDetail;
  onSubmitted: () => void;
}) {
  const submit = useSubmitManagerScore();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const rubric = useMemo<Rubric>(
    () => resolveRubric(assessment, assessment.user.roleFamily),
    [assessment],
  );

  const defaultValues = useMemo<FormValues>(
    () => ({
      assessmentId: assessment.id,
      managerScore: 0,
      rationale: '',
      overrodeAiSuggestion: false,
      responses: rubric.map((r) => ({ dimension: r.dimension, score: 0, comment: '' })),
    }),
    [assessment.id, rubric],
  );

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
    setValue,
  } = useForm<FormValues>({
    resolver: zodResolver(SubmitManagerAssessmentDtoSchema),
    defaultValues,
  });

  const { fields } = useFieldArray({ control, name: 'responses' });

  const watchedResponses = useWatch({ control, name: 'responses' }) ?? [];
  const rationale = useWatch({ control, name: 'rationale' }) ?? '';

  const weightedAvg = useMemo(
    () => computeWeightedAverage(watchedResponses, rubric),
    [watchedResponses, rubric],
  );

  const allScored = watchedResponses.every((r) => typeof r?.score === 'number' && r.score > 0);
  const rationaleOk = rationale.trim().length >= MIN_RATIONALE;
  const canSubmit = allScored && rationaleOk && rubric.length > 0;

  async function onSubmit(values: FormValues) {
    setSubmitError(null);
    try {
      await submit.mutateAsync({ ...values, managerScore: weightedAvg });
      onSubmitted();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to submit manager score');
    }
  }

  if (rubric.length === 0) {
    return (
      <div className="rounded-md border border-brand-orange/30 bg-amber-50 p-4 text-sm text-brand-orange">
        No rubric is mapped to this employee's role family (
        <span className="font-medium">{assessment.user.roleFamily}</span>). Ask HR to add a role
        mapping before scoring.
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="rounded-lg border border-neutral-200 bg-white p-5">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="font-semibold text-brand-navy">Manager scoring</h2>
            <p className="text-xs text-brand-medium">
              Rate each rubric dimension 0–5. Your weighted average becomes the manager score.
            </p>
          </div>
          <div className="rounded-md bg-neutral-50 px-3 py-2 text-right">
            <div className="text-[10px] uppercase tracking-wider text-brand-medium">Weighted avg</div>
            <div className="font-mono text-xl font-semibold text-brand-navy">
              {weightedAvg.toFixed(2)}
            </div>
          </div>
        </div>

        {submitError && (
          <div className="mb-3 flex items-start gap-2 rounded-md border border-brand-red/30 bg-red-50 p-2 text-sm text-brand-red">
            <AlertCircle size={14} /> <span>{submitError}</span>
          </div>
        )}

        <ul className="space-y-4">
          {fields.map((field, idx) => {
            const weight = rubric[idx]?.weight ?? 0;
            const score = watchedResponses[idx]?.score ?? 0;
            return (
              <li key={field.id} className="rounded-md border border-neutral-200 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <label className="font-medium text-brand-dark">{field.dimension}</label>
                    <span className="text-xs font-normal text-brand-medium">
                      weight {(weight * 100).toFixed(0)}%
                    </span>
                    <AiSuggestionBadge dimension={field.dimension} />
                  </div>
                  <span className="font-mono text-sm text-brand-blue">{score.toFixed(1)} / 5</span>
                </div>

                <input
                  type="range"
                  min={0}
                  max={5}
                  step={0.5}
                  {...register(`responses.${idx}.score`, { valueAsNumber: true })}
                  className="mt-2 w-full accent-brand-blue"
                />
                <textarea
                  {...register(`responses.${idx}.comment`)}
                  rows={2}
                  placeholder="Manager comment — observed evidence, gaps, growth areas…"
                  className="mt-3 w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm outline-none focus:border-brand-blue focus:ring-1 focus:ring-brand-blue"
                />
                {errors.responses?.[idx]?.score && (
                  <p className="mt-1 text-xs text-brand-red">
                    {errors.responses[idx]?.score?.message}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      <div className="rounded-lg border border-neutral-200 bg-white p-5">
        <label className="font-semibold text-brand-navy">Rationale</label>
        <p className="mt-0.5 text-xs text-brand-medium">
          Explain the overall score. At least {MIN_RATIONALE} characters — visible to the employee.
        </p>
        <textarea
          {...register('rationale')}
          rows={5}
          placeholder="Summarise highlights, gaps, and direction for the next cycle…"
          className="mt-3 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-brand-blue focus:ring-1 focus:ring-brand-blue"
        />
        <div className="mt-1 flex items-center justify-between text-xs">
          <span className={rationaleOk ? 'text-brand-green' : 'text-brand-medium'}>
            {rationale.trim().length} / {MIN_RATIONALE}+ chars
          </span>
          {errors.rationale && <span className="text-brand-red">{errors.rationale.message}</span>}
        </div>

        <CompositePreview assessment={assessment} managerScore={weightedAvg} />

        <label className="mt-4 flex items-center gap-2 text-xs text-brand-medium">
          <input
            type="checkbox"
            {...register('overrodeAiSuggestion')}
            onChange={(e) => setValue('overrodeAiSuggestion', e.target.checked)}
            className="h-3.5 w-3.5 accent-brand-blue"
          />
          I consciously overrode the AI suggestion (Phase 2 — safe to leave unchecked now)
        </label>

        <div className="mt-5 flex items-center justify-end">
          <button
            type="submit"
            disabled={!canSubmit || isSubmitting}
            title={
              !rubric.length
                ? 'No rubric available'
                : !allScored
                  ? 'Score every dimension before submitting'
                  : !rationaleOk
                    ? `Rationale needs at least ${MIN_RATIONALE} characters`
                    : undefined
            }
            className="inline-flex items-center gap-2 rounded-md bg-brand-navy px-4 py-2 text-sm font-semibold text-white hover:bg-brand-blue disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmitting ? <Loader2 className="animate-spin" size={14} /> : <CheckCircle2 size={14} />}
            Submit manager score
          </button>
        </div>
      </div>
    </form>
  );
}

function resolveRubric(a: AssessmentDetail, roleFamily: string): Rubric {
  const mapping = a.cycle.framework.roleMappings.find((m) => m.roleFamily === roleFamily);
  return mapping?.assessmentCriteriaJson.rubric ?? [];
}

function computeWeightedAverage(
  responses: ReadonlyArray<{ score?: number } | undefined>,
  rubric: Rubric,
): number {
  if (rubric.length === 0) return 0;
  const totalWeight = rubric.reduce((s, r) => s + (r.weight ?? 0), 0);
  if (totalWeight <= 0) {
    const scored = responses.map((r) => r?.score ?? 0);
    if (scored.length === 0) return 0;
    return +(scored.reduce((s, x) => s + x, 0) / scored.length).toFixed(2);
  }
  let weighted = 0;
  for (let i = 0; i < rubric.length; i++) {
    const score = responses[i]?.score ?? 0;
    weighted += score * (rubric[i]?.weight ?? 0);
  }
  return +(weighted / totalWeight).toFixed(2);
}

function CompositePreview({
  assessment,
  managerScore,
}: {
  assessment: AssessmentDetail;
  managerScore: number;
}) {
  const weights = resolveWeights(assessment);
  const components: Array<{ score: number; weight: number }> = [
    { score: managerScore, weight: weights.manager },
  ];
  if (assessment.selfScore != null)
    components.push({ score: +assessment.selfScore, weight: weights.self });
  if (assessment.peerScore != null)
    components.push({ score: +assessment.peerScore, weight: weights.peer });
  if (assessment.aiScore != null)
    components.push({ score: +assessment.aiScore, weight: weights.ai });

  const totalWeight = components.reduce((s, c) => s + c.weight, 0);
  const composite =
    totalWeight === 0
      ? 0
      : +(components.reduce((s, c) => s + c.score * c.weight, 0) / totalWeight).toFixed(2);

  return (
    <div className="mt-4 rounded-md border border-brand-blue/30 bg-blue-50 p-3 text-xs text-brand-dark">
      <div className="font-medium">
        If you submit, composite ={' '}
        <span className="font-mono text-brand-navy">{composite.toFixed(2)}</span>
      </div>
      <div className="mt-1 text-brand-medium">
        Self {fmt(assessment.selfScore)} × {(weights.self * 100).toFixed(0)}% · Manager{' '}
        {managerScore.toFixed(2)} × {(weights.manager * 100).toFixed(0)}% · Peer{' '}
        {fmt(assessment.peerScore)} × {(weights.peer * 100).toFixed(0)}% · AI{' '}
        {fmt(assessment.aiScore)} × {(weights.ai * 100).toFixed(0)}%
      </div>
    </div>
  );
}

function fmt(v: number | null | undefined): string {
  return v == null ? '—' : (+v).toFixed(2);
}

function resolveWeights(a: AssessmentDetail): {
  self: number;
  manager: number;
  peer: number;
  ai: number;
} {
  const raw = a.cycle.org?.settingsJson?.assessmentWeights;
  if (!raw) return DEFAULT_WEIGHTS;
  const candidate = {
    self: Number(raw.self),
    manager: Number(raw.manager),
    peer: Number(raw.peer),
    ai: Number(raw.ai),
  };
  const sum = candidate.self + candidate.manager + candidate.peer + candidate.ai;
  if (!Number.isFinite(sum) || Math.abs(sum - 1) > 0.01) return DEFAULT_WEIGHTS;
  return candidate;
}
