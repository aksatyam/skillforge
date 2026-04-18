'use client';

/**
 * Manager roster — Sprint 2 feature #11 (BUILD_PLAN §5).
 *
 * Lists direct reports with their current-cycle assessment status.
 * The manager-scoring page itself ships in Sprint 3; this page only
 * links to it.
 */
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Users, Filter, CheckCircle2, CircleDot, ArrowRight } from 'lucide-react';
import type { AssessmentStatus } from '@skillforge/shared-types';
import { useTeamAssessments, type TeamAssessment } from '@/hooks/use-assessments';
import { useMe } from '@/hooks/use-me';

type FilterMode = 'pending' | 'all';

const PENDING_STATUSES: AssessmentStatus[] = [
  'self_submitted',
  'manager_in_progress',
  'ai_analyzed',
  'peer_submitted',
];

export default function TeamPage() {
  const me = useMe();
  const { data: rows = [], isLoading, isError, error } = useTeamAssessments();
  const [mode, setMode] = useState<FilterMode>('pending');

  const filtered = useMemo(() => {
    if (mode === 'all') return rows;
    return rows.filter((r) => PENDING_STATUSES.includes(r.status));
  }, [rows, mode]);

  if (
    me.data &&
    me.data.role !== 'manager' &&
    me.data.role !== 'hr_admin' &&
    me.data.role !== 'super_admin'
  ) {
    return (
      <div className="rounded-md bg-amber-50 p-4 text-amber-900">
        This page is for managers. If you have direct reports, ask HR to set you as their
        manager in the user admin UI.
      </div>
    );
  }

  return (
    <div className="max-w-6xl">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-brand-navy">Team</h1>
          <p className="mt-1 text-sm text-brand-medium">
            Review your direct reports' assessments for the active cycle.
          </p>
        </div>
        <FilterToggle mode={mode} onChange={setMode} count={filtered.length} />
      </header>

      {isError && (
        <div className="mb-4 rounded-md border border-brand-red/30 bg-red-50 p-3 text-sm text-brand-red">
          {error instanceof Error ? error.message : 'Failed to load team'}
        </div>
      )}

      {isLoading ? (
        <div className="text-brand-medium">Loading…</div>
      ) : rows.length === 0 ? (
        <EmptyState />
      ) : filtered.length === 0 ? (
        <div className="rounded-md border border-neutral-200 bg-white p-6 text-center text-sm text-brand-medium">
          No reports match this filter. Try "All" to see everyone.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border border-neutral-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wider text-brand-medium">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Role family</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Last activity</th>
                <th className="px-4 py-3">Days to deadline</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {filtered.map((row) => (
                <TeamRow key={row.id} row={row} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function TeamRow({ row }: { row: TeamAssessment }) {
  const deadline = new Date(row.cycle.endDate);
  const days = Math.ceil((deadline.getTime() - Date.now()) / 86_400_000);
  const lastActivity = row.submittedAt ?? row.updatedAt;
  const href = `/team/${row.user.id}/assessment/${row.id}`;

  return (
    <tr className="hover:bg-neutral-50">
      <td className="px-4 py-3">
        <Link href={href} className="block">
          <div className="font-medium text-brand-dark">{row.user.name}</div>
          <div className="text-xs text-brand-medium">{row.user.email}</div>
        </Link>
      </td>
      <td className="px-4 py-3 text-brand-dark">
        <div>{row.user.roleFamily}</div>
        <div className="text-xs text-brand-medium">{row.user.designation}</div>
      </td>
      <td className="px-4 py-3">
        <StatusBadge status={row.status} />
      </td>
      <td className="px-4 py-3 text-brand-medium">
        {new Date(lastActivity).toLocaleDateString()}
      </td>
      <td className="px-4 py-3 font-mono">
        <span className={days <= 3 && row.cycle.status === 'open' ? 'text-brand-red' : 'text-brand-dark'}>
          {days < 0 ? 'past due' : days === 0 ? 'today' : `${days}d`}
        </span>
      </td>
      <td className="px-4 py-3 text-right">
        <Link
          href={href}
          className="inline-flex items-center gap-1 text-sm font-medium text-brand-blue hover:underline"
        >
          Review <ArrowRight size={14} />
        </Link>
      </td>
    </tr>
  );
}

function FilterToggle({
  mode,
  onChange,
  count,
}: {
  mode: FilterMode;
  onChange: (m: FilterMode) => void;
  count: number;
}) {
  return (
    <div className="inline-flex items-center gap-2 rounded-md border border-neutral-200 bg-white p-1 text-xs">
      <Filter size={14} className="ml-1 text-brand-medium" />
      <button
        onClick={() => onChange('pending')}
        className={`rounded px-2 py-1 font-medium ${
          mode === 'pending' ? 'bg-brand-navy text-white' : 'text-brand-dark hover:bg-neutral-100'
        }`}
      >
        Pending my review
      </button>
      <button
        onClick={() => onChange('all')}
        className={`rounded px-2 py-1 font-medium ${
          mode === 'all' ? 'bg-brand-navy text-white' : 'text-brand-dark hover:bg-neutral-100'
        }`}
      >
        All
      </button>
      <span className="mr-1 rounded-full bg-neutral-100 px-2 py-0.5 font-mono text-brand-medium">
        {count}
      </span>
    </div>
  );
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
    case 'ai_analyzed':
    case 'peer_submitted':
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
      return {
        label: 'Composite computed',
        icon: <CheckCircle2 size={12} />,
        className: 'bg-green-50 text-brand-green',
      };
    case 'finalized':
      return {
        label: 'Finalized',
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
      <Users className="mx-auto text-brand-medium" size={36} />
      <h3 className="mt-3 text-lg font-semibold text-brand-dark">No reports yet</h3>
      <p className="mt-1 text-sm text-brand-medium">
        Ask HR to assign team members in the user admin UI.
      </p>
    </div>
  );
}
