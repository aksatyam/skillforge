'use client';

/**
 * Employee "My Assessments" list — Sprint 2 feature #5.
 *
 * One card per assessment the current user owns, grouped by cycle.
 * Status-dependent CTA routes the user into the self-assessment form.
 */
import Link from 'next/link';
import { ClipboardList, CheckCircle2, CircleDot, ArrowRight } from 'lucide-react';
import { useMyAssessments, type AssessmentListItem } from '@/hooks/use-assessments';
import type { AssessmentStatus } from '@skillforge/shared-types';

export default function MyAssessmentsPage() {
  const { data: assessments = [], isLoading, isError, error } = useMyAssessments();

  return (
    <div className="max-w-5xl">
      <header className="mb-6">
        <h1 className="text-3xl font-bold text-brand-navy">My Assessments</h1>
        <p className="mt-1 text-sm text-brand-medium">
          Self-assess your AI capability for each open review cycle. Drafts auto-save every 30
          seconds.
        </p>
      </header>

      {isError && (
        <div className="mb-4 rounded-md border border-brand-red/30 bg-red-50 p-3 text-sm text-brand-red">
          {error instanceof Error ? error.message : 'Failed to load assessments'}
        </div>
      )}

      {isLoading ? (
        <div className="text-brand-medium">Loading…</div>
      ) : assessments.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {assessments.map((a) => (
            <AssessmentCard key={a.id} a={a} />
          ))}
        </div>
      )}
    </div>
  );
}

function AssessmentCard({ a }: { a: AssessmentListItem }) {
  const cta = ctaFor(a.status);
  const deadline = new Date(a.cycle.endDate);
  const daysLeft = Math.ceil((deadline.getTime() - Date.now()) / 86_400_000);
  const progressPct = computeProgress(a);

  return (
    <Link
      href={`/assessments/${a.id}`}
      className="block rounded-lg border border-neutral-200 bg-white p-5 transition hover:border-brand-blue hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-lg font-semibold text-brand-navy">{a.cycle.name}</h3>
          <p className="mt-0.5 text-xs text-brand-medium">{a.cycle.framework.name}</p>
        </div>
        <StatusBadge status={a.status} />
      </div>

      <div className="mt-4">
        <div className="flex items-center justify-between text-xs text-brand-medium">
          <span>Self-assessment progress</span>
          <span className="font-mono">{progressPct}%</span>
        </div>
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-neutral-100">
          <div
            className="h-full bg-brand-blue transition-all"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <p className="text-xs text-brand-medium">
          Deadline {deadline.toLocaleDateString()}
          {a.cycle.status === 'open' && daysLeft >= 0 && (
            <>
              {' · '}
              <span className={daysLeft <= 3 ? 'text-brand-red' : 'text-brand-dark'}>
                {daysLeft === 0 ? 'today' : `${daysLeft} day${daysLeft === 1 ? '' : 's'} left`}
              </span>
            </>
          )}
        </p>
        <span className="inline-flex items-center gap-1 text-sm font-semibold text-brand-blue">
          {cta.label} <ArrowRight size={14} />
        </span>
      </div>
    </Link>
  );
}

function ctaFor(status: AssessmentStatus): { label: string } {
  switch (status) {
    case 'not_started':
      return { label: 'Start self-assessment' };
    case 'self_submitted':
    case 'manager_in_progress':
    case 'peer_submitted':
    case 'ai_analyzed':
      return { label: 'View submission' };
    case 'manager_scored':
    case 'composite_computed':
    case 'finalized':
      return { label: 'View results' };
    default:
      return { label: 'Open' };
  }
}

function computeProgress(a: AssessmentListItem): number {
  if (a.status !== 'not_started') return 100;
  const saved = a.responsesJson?.self?.responses?.length ?? 0;
  // Approximate — full count is known once the detail page loads the rubric.
  // We cap at 80% for drafts so "submitted" clearly reads as 100%.
  return Math.min(80, saved * 20);
}

function StatusBadge({ status }: { status: AssessmentStatus }) {
  const meta = statusMeta(status);
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${meta.className}`}
    >
      {meta.icon}
      {meta.label}
    </span>
  );
}

function statusMeta(status: AssessmentStatus): {
  label: string;
  icon: React.ReactNode;
  className: string;
} {
  switch (status) {
    case 'not_started':
      return {
        label: 'Not started',
        icon: <CircleDot size={12} />,
        className: 'bg-red-50 text-brand-red',
      };
    case 'self_submitted':
      return {
        label: 'Self submitted',
        icon: <CheckCircle2 size={12} />,
        className: 'bg-blue-50 text-brand-blue',
      };
    case 'manager_in_progress':
    case 'peer_submitted':
    case 'ai_analyzed':
      return {
        label: 'In review',
        icon: <CircleDot size={12} />,
        className: 'bg-amber-50 text-brand-orange',
      };
    case 'manager_scored':
      return {
        label: 'Manager scored',
        icon: <CheckCircle2 size={12} />,
        className: 'bg-amber-50 text-brand-orange',
      };
    case 'composite_computed':
    case 'finalized':
      return {
        label: status === 'finalized' ? 'Finalized' : 'Completed',
        icon: <CheckCircle2 size={12} />,
        className: 'bg-green-50 text-brand-green',
      };
    default:
      return {
        label: status,
        icon: <CircleDot size={12} />,
        className: 'bg-neutral-100 text-brand-medium',
      };
  }
}

function EmptyState() {
  return (
    <div className="rounded-lg border-2 border-dashed border-neutral-200 p-12 text-center">
      <ClipboardList className="mx-auto text-brand-medium" size={36} />
      <h3 className="mt-3 text-lg font-semibold text-brand-dark">No assessments yet</h3>
      <p className="mt-1 text-sm text-brand-medium">
        Your HR admin has not opened a review cycle for you. Once a cycle is active you will see
        an assessment here to start.
      </p>
    </div>
  );
}
