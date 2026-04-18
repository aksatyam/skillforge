'use client';

/**
 * Manager scoring page — Sprint 3 Feature #13.
 *
 * URL:  /team/:userId/assessment/:assessmentId
 *
 * Access: manager-of-record, hr_admin, or super_admin.
 * Status-gated rendering:
 *   not_started                                       → "waiting" banner
 *   self_submitted | manager_in_progress | ai_analyzed → form enabled
 *   manager_scored | composite_computed | finalized    → read-only summary
 */
import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  FileText,
  Lock,
  ShieldAlert,
  Sparkles,
  UserCircle2,
} from 'lucide-react';
import type { AssessmentStatus } from '@skillforge/shared-types';
import {
  useAssessment,
  type AssessmentDetail,
  type RoleMapping,
  type ArtifactSummary,
} from '@/hooks/use-assessments';
import { useMe } from '@/hooks/use-me';
import { useArtifactsForAssessment } from '@/hooks/use-manager-scoring';
import { ManagerScoringForm } from '@/components/ManagerScoringForm';

type Rubric = RoleMapping['assessmentCriteriaJson']['rubric'];

const EDITABLE_STATUSES: readonly AssessmentStatus[] = [
  'self_submitted',
  'manager_in_progress',
  'ai_analyzed',
];
const READ_ONLY_STATUSES: readonly AssessmentStatus[] = [
  'manager_scored',
  'composite_computed',
  'finalized',
];

export default function ManagerAssessmentPage() {
  const { assessmentId } = useParams<{ userId: string; assessmentId: string }>();
  const router = useRouter();

  const me = useMe();
  const { data: a, isLoading, isError, error } = useAssessment(assessmentId);
  const artifactsQuery = useArtifactsForAssessment(assessmentId);

  const [toast, setToast] = useState<string | null>(null);

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

  const isAuthorized =
    me.data.id === a.user.managerId ||
    me.data.role === 'hr_admin' ||
    me.data.role === 'super_admin';

  if (!isAuthorized) return <ForbiddenBanner />;

  const rubric: Rubric = resolveRubric(a, a.user.roleFamily);
  const status = a.status;
  const artifacts = artifactsQuery.data ?? a.artifacts ?? [];

  function onSubmitted() {
    setToast('Manager score submitted. Composite updated.');
    setTimeout(() => router.push('/team'), 900);
  }

  return (
    <div className="max-w-6xl">
      <Link
        href="/team"
        className="mb-4 inline-flex items-center gap-1 text-sm text-brand-blue hover:underline"
      >
        <ArrowLeft size={14} /> Back to team
      </Link>

      {toast && (
        <div className="mb-4 flex items-center gap-2 rounded-md border border-brand-green/30 bg-green-50 p-3 text-sm text-brand-green">
          <CheckCircle2 size={14} /> {toast}
        </div>
      )}

      <header className="mb-6">
        <h1 className="text-3xl font-bold text-brand-navy">Review · {a.user.name}</h1>
        <p className="mt-1 text-sm text-brand-medium">
          {a.cycle.name} · {a.cycle.framework.name}
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-4">
          <EmployeeContextCard assessment={a} />
          <SelfSubmissionCard assessment={a} rubric={rubric} />
          <MaturityLegend assessment={a} />
        </div>
        <aside className="space-y-4">
          <ArtifactsPanel artifacts={artifacts} loading={artifactsQuery.isLoading} />
        </aside>
      </div>

      <section className="mt-8">
        {status === 'not_started' ? (
          <WaitingBanner employeeName={a.user.name} />
        ) : READ_ONLY_STATUSES.includes(status) ? (
          <ReadOnlyManagerSummary assessment={a} rubric={rubric} />
        ) : EDITABLE_STATUSES.includes(status) ? (
          <ManagerScoringForm assessment={a} onSubmitted={onSubmitted} />
        ) : (
          <UnknownStatusBanner status={status} />
        )}
      </section>
    </div>
  );
}

function EmployeeContextCard({ assessment }: { assessment: AssessmentDetail }) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-5">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-navy text-white">
          <UserCircle2 size={22} />
        </span>
        <div>
          <div className="font-semibold text-brand-navy">{assessment.user.name}</div>
          <div className="text-xs text-brand-medium">{assessment.user.email}</div>
        </div>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-3 text-xs">
        <div>
          <dt className="uppercase tracking-wider text-brand-medium">Role family</dt>
          <dd className="mt-0.5 font-medium text-brand-dark">{assessment.user.roleFamily}</dd>
        </div>
        <div>
          <dt className="uppercase tracking-wider text-brand-medium">Designation</dt>
          <dd className="mt-0.5 font-medium text-brand-dark">{assessment.user.designation}</dd>
        </div>
      </dl>
    </div>
  );
}

function SelfSubmissionCard({
  assessment,
  rubric,
}: {
  assessment: AssessmentDetail;
  rubric: Rubric;
}) {
  const selfResponses = assessment.responsesJson?.self?.responses ?? [];
  const byDim = new Map(selfResponses.map((r) => [r.dimension, r]));
  const submittedAt = assessment.responsesJson?.self?.submittedAt;

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-semibold text-brand-navy">Employee self-assessment</h2>
          <p className="text-xs text-brand-medium">
            {submittedAt ? (
              <>Submitted {new Date(submittedAt).toLocaleString()}</>
            ) : (
              <>Not yet submitted</>
            )}
          </p>
        </div>
        <div className="rounded-md bg-neutral-50 px-3 py-2 text-right">
          <div className="text-[10px] uppercase tracking-wider text-brand-medium">Self score</div>
          <div className="font-mono text-xl font-semibold text-brand-navy">
            {assessment.selfScore != null ? (+assessment.selfScore).toFixed(2) : '—'}
          </div>
        </div>
      </div>

      {rubric.length === 0 ? (
        <p className="mt-4 text-sm text-brand-medium">
          No rubric mapped to {assessment.user.roleFamily}.
        </p>
      ) : (
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
                <div className="mt-0.5 text-[11px] uppercase tracking-wider text-brand-medium">
                  weight {(r.weight * 100).toFixed(0)}%
                </div>
                {resp?.comment ? (
                  <p className="mt-2 whitespace-pre-line text-sm text-brand-medium">
                    {resp.comment}
                  </p>
                ) : (
                  <p className="mt-2 text-xs italic text-brand-medium">No comment provided.</p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function ArtifactsPanel({ artifacts, loading }: { artifacts: ArtifactSummary[]; loading: boolean }) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-5">
      <h3 className="font-semibold text-brand-navy">Evidence artifacts</h3>
      <p className="mt-0.5 text-xs text-brand-medium">
        Read-only — files the employee attached.
      </p>

      {loading ? (
        <p className="mt-3 text-xs text-brand-medium">Loading…</p>
      ) : artifacts.length === 0 ? (
        <p className="mt-3 text-xs text-brand-medium">No artifacts attached.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {artifacts.map((a) => (
            <li
              key={a.id}
              className="flex items-start gap-2 rounded-md border border-neutral-200 p-2 text-xs"
            >
              <FileText size={14} className="mt-0.5 text-brand-medium" />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium text-brand-dark">{a.fileName}</div>
                <div className="mt-0.5 flex flex-wrap items-center gap-2 text-brand-medium">
                  <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] uppercase tracking-wider">
                    {a.artifactType}
                  </span>
                  {a.fileSizeBytes && <span>{formatSize(a.fileSizeBytes)}</span>}
                  <span>{new Date(a.createdAt).toLocaleDateString()}</span>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function MaturityLegend({ assessment }: { assessment: AssessmentDetail }) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-5">
      <h3 className="font-semibold text-brand-navy">Maturity levels</h3>
      <p className="mt-0.5 text-xs text-brand-medium">
        Use these descriptors as anchors when scoring 0–5.
      </p>
      <ul className="mt-3 space-y-2 text-xs">
        {assessment.cycle.framework.maturityLevelsJson.map((l) => (
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

function ForbiddenBanner() {
  return (
    <div className="max-w-2xl rounded-md border border-brand-red/30 bg-red-50 p-5 text-sm text-brand-red">
      <div className="flex items-center gap-2 font-semibold">
        <ShieldAlert size={16} /> 403 — Not your report
      </div>
      <p className="mt-1 text-brand-dark">
        You can only score direct reports you manage. If you expected access, ask HR to update
        the manager assignment.
      </p>
      <Link
        href="/team"
        className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-brand-blue hover:underline"
      >
        <ArrowLeft size={14} /> Back to team
      </Link>
    </div>
  );
}

function WaitingBanner({ employeeName }: { employeeName: string }) {
  return (
    <div className="rounded-md border border-brand-orange/30 bg-amber-50 p-5 text-sm text-brand-orange">
      <div className="flex items-center gap-2 font-semibold">
        <Clock size={16} /> Waiting for self-submission
      </div>
      <p className="mt-1 text-brand-dark">
        {employeeName} hasn't submitted their self-assessment yet. You can score them once they
        submit.
      </p>
    </div>
  );
}

function UnknownStatusBanner({ status }: { status: AssessmentStatus }) {
  return (
    <div className="rounded-md border border-neutral-300 bg-neutral-50 p-5 text-sm text-brand-medium">
      <div className="flex items-center gap-2 font-semibold">
        <Lock size={16} /> Status not scorable
      </div>
      <p className="mt-1 text-brand-dark">
        Current status <span className="font-mono">{status}</span> does not allow manager scoring.
      </p>
    </div>
  );
}

function ReadOnlyManagerSummary({
  assessment,
  rubric,
}: {
  assessment: AssessmentDetail;
  rubric: Rubric;
}) {
  const managerResponses =
    (
      assessment.responsesJson as {
        manager?: { responses?: Array<{ dimension: string; score: number; comment?: string }> };
      } | null
    )?.manager?.responses ?? [];
  const byDim = new Map(managerResponses.map((r) => [r.dimension, r]));

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-neutral-200 bg-white p-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-brand-navy">Manager score submitted</h2>
            <p className="text-xs text-brand-medium">
              Scoring is locked. Composite reflects all available components.
            </p>
          </div>
          <Sparkles className="text-brand-blue" size={20} />
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <ScorePill label="Self" value={assessment.selfScore} />
          <ScorePill label="Manager" value={assessment.managerScore} highlight />
          <ScorePill label="Peer" value={assessment.peerScore} />
          <ScorePill label="Composite" value={assessment.compositeScore} highlight />
        </div>
      </div>

      {rubric.length > 0 && (
        <div className="rounded-lg border border-neutral-200 bg-white p-5">
          <h3 className="font-semibold text-brand-navy">Per-dimension manager scores</h3>
          <ul className="mt-3 space-y-3">
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
                    <p className="mt-1 whitespace-pre-line text-sm text-brand-medium">
                      {resp.comment}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {assessment.managerRationale && (
        <div className="rounded-lg border border-neutral-200 bg-white p-5">
          <h3 className="font-semibold text-brand-navy">Rationale</h3>
          <p className="mt-2 whitespace-pre-line text-sm text-brand-dark">
            {assessment.managerRationale}
          </p>
        </div>
      )}
    </div>
  );
}

function ScorePill({
  label,
  value,
  highlight,
}: {
  label: string;
  value: number | null | undefined;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-md p-3 text-center ${
        highlight ? 'bg-brand-navy text-white' : 'bg-neutral-50 text-brand-dark'
      }`}
    >
      <div
        className={`text-[10px] uppercase tracking-wider ${
          highlight ? 'text-blue-100' : 'text-brand-medium'
        }`}
      >
        {label}
      </div>
      <div className="mt-1 font-mono text-xl font-semibold">
        {value != null ? (+value).toFixed(2) : '—'}
      </div>
    </div>
  );
}

function resolveRubric(a: AssessmentDetail, roleFamily: string): Rubric {
  const mapping = a.cycle.framework.roleMappings.find((m) => m.roleFamily === roleFamily);
  return mapping?.assessmentCriteriaJson.rubric ?? [];
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
