'use client';

/**
 * HR cycle detail — Sprint 3 feature #17.
 * Lifecycle transitions, progress donut + status table, and full roster
 * with clickable rows routing to the manager-scoring page.
 * Confirmation uses native `confirm()` per Sprint 3 spec.
 */
import { useMemo } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Download,
  Library,
  Lock,
  PlayCircle,
  ShieldCheck,
} from 'lucide-react';
import type { AssessmentStatus, CycleStatus } from '@skillforge/shared-types';
import { useMe } from '@/hooks/use-me';
import {
  useBulkFinalize,
  useCloseCycle,
  useCycle,
  useCycleProgress,
  useDownloadExport,
  useHrAssessments,
  useTransitionCycle,
  type HrAssessment,
} from '@/hooks/use-cycles';
import { CompletionDonut } from '@/components/CompletionDonut';

const STATUS_ORDER: AssessmentStatus[] = ['not_started', 'self_submitted', 'manager_in_progress', 'peer_submitted', 'ai_analyzed', 'manager_scored', 'composite_computed', 'finalized'];

const STATUS_META: Record<AssessmentStatus, { label: string; cls: string }> = {
  not_started: { label: 'Not started', cls: 'bg-red-50 text-brand-red' },
  self_submitted: { label: 'Self submitted', cls: 'bg-blue-50 text-brand-blue' },
  manager_in_progress: { label: 'In review', cls: 'bg-amber-50 text-brand-orange' },
  peer_submitted: { label: 'In review', cls: 'bg-amber-50 text-brand-orange' },
  ai_analyzed: { label: 'In review', cls: 'bg-amber-50 text-brand-orange' },
  manager_scored: { label: 'Manager scored', cls: 'bg-amber-50 text-brand-orange' },
  composite_computed: { label: 'Composite computed', cls: 'bg-green-50 text-brand-green' },
  finalized: { label: 'Finalized', cls: 'bg-green-100 text-brand-green' },
};

const BTN = 'inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50';

export default function HrCycleDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = typeof params?.id === 'string' ? params.id : '';

  const me = useMe();
  const cycleQ = useCycle(id);
  const progressQ = useCycleProgress(id);
  const rosterQ = useHrAssessments(id);

  const transitionM = useTransitionCycle();
  const closeM = useCloseCycle();
  const finalizeM = useBulkFinalize();
  const download = useDownloadExport();

  const role = me.data?.role;
  const allowed = role === 'hr_admin' || role === 'super_admin';

  const roster = rosterQ.data ?? [];
  const sortedRoster = useMemo(
    () => [...roster].sort((a, b) => a.user.name.localeCompare(b.user.name)),
    [roster],
  );

  if (!me.data) return <div className="text-brand-medium">Loading…</div>;

  if (!allowed) {
    return (
      <div className="rounded-md border border-brand-red/30 bg-red-50 p-4 text-sm text-brand-red">
        <strong className="mr-1">403 —</strong> HR admins only.
      </div>
    );
  }

  if (cycleQ.isLoading) return <div className="text-brand-medium">Loading cycle…</div>;

  if (cycleQ.isError || !cycleQ.data) {
    return (
      <div className="rounded-md border border-brand-red/30 bg-red-50 p-4 text-sm text-brand-red">
        {cycleQ.error instanceof Error ? cycleQ.error.message : 'Cycle not found'}
      </div>
    );
  }

  const cycle = cycleQ.data;
  const progress = progressQ.data;

  const confirmMutate = (msg: string, fn: () => void) => {
    if (typeof window !== 'undefined' && window.confirm(msg)) fn();
  };

  const onActivate = () =>
    confirmMutate(
      `Activate "${cycle.name}"? This materializes an assessment for every active employee.`,
      () => transitionM.mutate({ id: cycle.id, status: 'open' }),
    );
  const onLock = () =>
    confirmMutate(`Lock "${cycle.name}"? Employees will no longer be able to submit or edit.`, () =>
      transitionM.mutate({ id: cycle.id, status: 'locked' }),
    );
  const onFinalizeAndClose = () =>
    confirmMutate(
      `Finalize all eligible assessments and close "${cycle.name}"? This is terminal.`,
      () => closeM.mutate(cycle.id),
    );
  const onFinalizeOnly = () =>
    confirmMutate(`Finalize all composite-computed assessments without closing?`, () =>
      finalizeM.mutate(cycle.id),
    );
  const onExport = () => download(cycle.id, cycle.name.replace(/\s+/g, '_'));

  const lifecycleError = transitionM.error ?? closeM.error ?? finalizeM.error ?? null;
  const pending = transitionM.isPending || closeM.isPending || finalizeM.isPending;

  const statusRows = progress
    ? STATUS_ORDER.map((s) => ({ status: s, count: progress.byStatus[s] ?? 0 })).filter(
        (r) => r.count > 0 || progress.total === 0,
      )
    : [];

  return (
    <div className="max-w-6xl">
      <div className="mb-2">
        <button
          onClick={() => router.push('/hr')}
          className="inline-flex items-center gap-1 text-xs font-medium text-brand-medium hover:text-brand-blue"
        >
          <ArrowLeft size={12} /> Back to HR dashboard
        </button>
      </div>

      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <h1 className="truncate text-3xl font-bold text-brand-navy">{cycle.name}</h1>
            <CycleStatusBadge status={cycle.status} />
          </div>
          <p className="mt-1 flex flex-wrap items-center gap-3 text-sm text-brand-medium">
            <span className="inline-flex items-center gap-1">
              <Library size={13} /> {cycle.framework.name}
            </span>
            <span className="inline-flex items-center gap-1">
              <CalendarDays size={13} />
              {new Date(cycle.startDate).toLocaleDateString()} –{' '}
              {new Date(cycle.endDate).toLocaleDateString()}
            </span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {cycle.status === 'draft' && (
            <button disabled={pending} onClick={onActivate} className={`${BTN} bg-brand-blue text-white hover:bg-brand-navy`}>
              <PlayCircle size={14} /> Activate cycle
            </button>
          )}
          {cycle.status === 'open' && (
            <button disabled={pending} onClick={onLock} className={`${BTN} bg-brand-orange text-white hover:bg-brand-orange/90`}>
              <Lock size={14} /> Lock cycle
            </button>
          )}
          {cycle.status === 'locked' && (
            <>
              <button disabled={pending} onClick={onFinalizeOnly} className={`${BTN} border border-brand-navy/20 bg-white text-brand-navy hover:bg-neutral-50`}>
                <CheckCircle2 size={14} /> Finalize eligible
              </button>
              <button disabled={pending} onClick={onFinalizeAndClose} className={`${BTN} bg-brand-green text-white hover:bg-brand-green/90`}>
                <ShieldCheck size={14} /> Finalize all + Close
              </button>
            </>
          )}
          {cycle.status === 'closed' && (
            <span className="text-xs italic text-brand-medium">Cycle is closed (read-only)</span>
          )}
          <button onClick={onExport} className={`${BTN} border border-brand-navy/20 bg-white font-medium text-brand-navy hover:bg-neutral-50`}>
            <Download size={14} /> Download CSV
          </button>
        </div>
      </header>

      {lifecycleError && (
        <div className="mb-4 rounded-md border border-brand-red/30 bg-red-50 p-3 text-sm text-brand-red">
          {lifecycleError instanceof Error ? lifecycleError.message : 'Lifecycle action failed'}
        </div>
      )}

      {cycle.status === 'closed' && (
        <div className="mb-4 rounded-md border border-brand-green/30 bg-green-50 p-3 text-sm text-brand-green">
          <ShieldCheck size={14} className="mr-1 inline-block" />
          Cycle is closed. Scores are frozen and exported to appraisal.
        </div>
      )}

      <section className="mb-8 rounded-lg border border-neutral-200 bg-white p-6">
        <h2 className="mb-4 text-lg font-semibold text-brand-navy">Progress</h2>
        {progressQ.isLoading ? (
          <div className="text-sm text-brand-medium">Loading progress…</div>
        ) : !progress ? (
          <div className="text-sm text-brand-medium">No data</div>
        ) : (
          <div className="flex flex-wrap items-start gap-8">
            <CompletionDonut
              completed={progress.submitted}
              total={progress.total}
              size={140}
              strokeWidth={14}
            />
            <div className="min-w-[220px] flex-1">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase tracking-wider text-brand-medium">
                  <tr>
                    <th className="py-2">Status</th>
                    <th className="py-2 text-right">Count</th>
                    <th className="py-2 text-right">Share</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {statusRows.map((r) => (
                    <tr key={r.status}>
                      <td className="py-2">
                        <StatusChip status={r.status} />
                      </td>
                      <td className="py-2 text-right font-mono">{r.count}</td>
                      <td className="py-2 text-right font-mono text-brand-medium">
                        {progress.total > 0
                          ? `${Math.round((r.count / progress.total) * 100)}%`
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      <section className="rounded-lg border border-neutral-200 bg-white">
        <div className="flex items-center justify-between border-b border-neutral-100 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-brand-navy">Roster</h2>
            <p className="text-xs text-brand-medium">
              {roster.length} employee{roster.length === 1 ? '' : 's'}. Click a row to open the
              manager-scoring page.
            </p>
          </div>
        </div>

        {rosterQ.isError && (
          <div className="m-4 rounded-md border border-brand-red/30 bg-red-50 p-3 text-sm text-brand-red">
            {rosterQ.error instanceof Error ? rosterQ.error.message : 'Failed to load roster'}
          </div>
        )}

        {rosterQ.isLoading ? (
          <div className="p-6 text-sm text-brand-medium">Loading roster…</div>
        ) : roster.length === 0 ? (
          <div className="p-6 text-sm text-brand-medium">
            No assessments yet. Activate the cycle to materialize one row per active employee.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wider text-brand-medium">
                <tr>
                  <th className="px-4 py-3">Employee</th>
                  <th className="px-4 py-3">Role family</th>
                  <th className="px-4 py-3 text-right">Self</th>
                  <th className="px-4 py-3 text-right">Manager</th>
                  <th className="px-4 py-3 text-right">AI</th>
                  <th className="px-4 py-3 text-right">Composite</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Last activity</th>
                  <th className="px-4 py-3 text-right" />
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {sortedRoster.map((r) => (
                  <RosterRow key={r.id} row={r} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function RosterRow({ row }: { row: HrAssessment }) {
  const href = `/team/${row.user.id}/assessment/${row.id}`;
  const lastActivity = row.submittedAt ?? row.updatedAt;
  return (
    <tr
      className="cursor-pointer hover:bg-neutral-50"
      onClick={() => {
        if (typeof window !== 'undefined') window.location.href = href;
      }}
    >
      <td className="px-4 py-3">
        <div className="font-medium text-brand-dark">{row.user.name}</div>
        <div className="text-xs text-brand-medium">{row.user.email}</div>
      </td>
      <td className="px-4 py-3 text-brand-dark">
        <div>{row.user.roleFamily}</div>
        <div className="text-xs text-brand-medium">{row.user.designation}</div>
      </td>
      <td className="px-4 py-3 text-right font-mono">{fmt(row.selfScore)}</td>
      <td className="px-4 py-3 text-right font-mono">{fmt(row.managerScore)}</td>
      <td className="px-4 py-3 text-right font-mono">{fmt(row.aiSuggestedScore)}</td>
      <td className="px-4 py-3 text-right font-mono font-semibold text-brand-navy">
        {fmt(row.compositeScore)}
      </td>
      <td className="px-4 py-3">
        <StatusChip status={row.status} />
      </td>
      <td className="px-4 py-3 text-xs text-brand-medium">
        {new Date(lastActivity).toLocaleDateString()}
      </td>
      <td className="px-4 py-3 text-right">
        <Link
          href={href}
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center gap-1 text-xs font-medium text-brand-blue hover:underline"
        >
          Open <ArrowRight size={12} />
        </Link>
      </td>
    </tr>
  );
}

function StatusChip({ status }: { status: AssessmentStatus }) {
  const meta = STATUS_META[status] ?? { label: status, cls: 'bg-neutral-100 text-brand-medium' };
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${meta.cls}`}
    >
      {meta.label}
    </span>
  );
}

function CycleStatusBadge({ status }: { status: CycleStatus }) {
  const meta = {
    draft: { label: 'draft', cls: 'bg-neutral-100 text-brand-medium' },
    open: { label: 'open', cls: 'bg-blue-50 text-brand-blue' },
    locked: { label: 'locked', cls: 'bg-amber-50 text-brand-orange' },
    closed: { label: 'closed', cls: 'bg-green-50 text-brand-green' },
  }[status];
  return (
    <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${meta.cls}`}>
      ● {meta.label}
    </span>
  );
}

function fmt(n: number | null): string {
  return n == null ? '—' : n.toFixed(2);
}
