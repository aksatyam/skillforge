'use client';

/**
 * HR admin dashboard landing — Sprint 3 feature #17.
 * Role-gated (hr_admin / super_admin). KPI strip + cycle card grid.
 * Mirrors frameworks/page.tsx for layout + brand tokens.
 */
import { useMemo } from 'react';
import Link from 'next/link';
import { ArrowRight, CalendarDays, CheckCircle2, CircleDot, ClipboardList, Library, Users } from 'lucide-react';
import type { CycleStatus } from '@skillforge/shared-types';
import { useMe } from '@/hooks/use-me';
import { useUsers } from '@/hooks/use-users';
import { countSubmitted, useCycles, useCycleProgress, useHrKpiTotals, type CycleSummary } from '@/hooks/use-cycles';
import { CompletionDonut } from '@/components/CompletionDonut';

export default function HrDashboardPage() {
  const me = useMe();
  const cyclesQ = useCycles();
  const usersQ = useUsers();

  const role = me.data?.role;
  const allowed = role === 'hr_admin' || role === 'super_admin';

  const cycles = cyclesQ.data ?? [];
  const visibleCycles = useMemo(() => {
    const live = cycles.filter((c) => c.status !== 'closed');
    const closed = cycles
      .filter((c) => c.status === 'closed')
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, 6);
    return [...live, ...closed];
  }, [cycles]);

  const openCycleIds = useMemo(
    () => cycles.filter((c) => c.status === 'open').map((c) => c.id),
    [cycles],
  );
  const kpi = useHrKpiTotals(openCycleIds);

  if (!me.data) return <div className="text-brand-medium">Loading…</div>;

  if (!allowed) {
    return (
      <div className="rounded-md border border-brand-red/30 bg-red-50 p-4 text-sm text-brand-red">
        <strong className="mr-1">403 —</strong>
        This dashboard is for HR admins. If you need access, contact your super admin.
      </div>
    );
  }

  const totalUsers = usersQ.data?.length ?? 0;
  const openCount = cycles.filter((c) => c.status === 'open').length;

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-3xl font-bold text-brand-navy">HR dashboard</h1>
        <p className="mt-1 text-sm text-brand-medium">
          Cycle operations, completion progress, and roster exports for{' '}
          <span className="font-semibold text-brand-dark">{me.data.orgName}</span>.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <Kpi
          label="Active users"
          value={totalUsers}
          icon={<Users size={18} className="text-brand-blue" />}
          loading={usersQ.isLoading}
        />
        <Kpi
          label="Open cycles"
          value={openCount}
          icon={<Library size={18} className="text-brand-blue" />}
          loading={cyclesQ.isLoading}
        />
        <Kpi
          label="Not started"
          value={kpi.notStarted}
          icon={<CircleDot size={18} className="text-brand-orange" />}
          loading={kpi.loading}
          hint="Across all open cycles"
        />
        <Kpi
          label="Completed today"
          value={kpi.completedToday}
          icon={<CheckCircle2 size={18} className="text-brand-green" />}
          loading={kpi.loading}
          hint="Submitted since 00:00 UTC"
        />
      </div>

      <section className="mt-8">
        <div className="mb-3 flex items-end justify-between">
          <div>
            <h2 className="text-lg font-semibold text-brand-navy">Cycles</h2>
            <p className="text-xs text-brand-medium">
              Click a card to open its detail view, roster, and actions.
            </p>
          </div>
          <Link href="/cycles/new" className="text-sm font-medium text-brand-blue hover:underline">
            + New cycle
          </Link>
        </div>

        {cyclesQ.isError && (
          <div className="mb-4 rounded-md border border-brand-red/30 bg-red-50 p-3 text-sm text-brand-red">
            {cyclesQ.error instanceof Error ? cyclesQ.error.message : 'Failed to load cycles'}
          </div>
        )}

        {cyclesQ.isLoading ? (
          <div className="text-brand-medium">Loading cycles…</div>
        ) : visibleCycles.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {visibleCycles.map((c) => (
              <CycleCard key={c.id} cycle={c} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Kpi(props: { label: string; value: number; icon: React.ReactNode; loading: boolean; hint?: string }) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-5">
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-brand-medium">
        {props.icon}
        {props.label}
      </div>
      <div className="mt-2 text-3xl font-bold text-brand-navy">
        {props.loading ? '—' : props.value.toLocaleString()}
      </div>
      {props.hint && <div className="mt-1 text-xs text-brand-medium">{props.hint}</div>}
    </div>
  );
}

function CycleCard({ cycle }: { cycle: CycleSummary }) {
  const progressQ = useCycleProgress(cycle.id);
  const { submitted, total } = countSubmitted(progressQ.data);
  const deadline = new Date(cycle.endDate);
  const days = Math.ceil((deadline.getTime() - Date.now()) / 86_400_000);

  const daysCls =
    days < 0
      ? 'text-brand-red'
      : days <= 3 && cycle.status === 'open'
        ? 'text-brand-orange'
        : 'text-brand-dark';
  const daysLabel =
    days < 0 ? `${Math.abs(days)}d past due` : days === 0 ? 'Due today' : `${days}d remaining`;

  return (
    <Link
      href={`/hr/cycles/${cycle.id}`}
      className="block rounded-lg border border-neutral-200 bg-white p-5 transition hover:border-brand-blue hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="truncate text-lg font-semibold text-brand-navy">{cycle.name}</h3>
          <p className="mt-1 truncate text-xs text-brand-medium">
            <Library size={11} className="mr-1 inline-block" />
            {cycle.framework.name}
          </p>
        </div>
        <CycleStatusBadge status={cycle.status} />
      </div>

      <div className="mt-4 flex items-center gap-4">
        <CompletionDonut completed={submitted} total={total} size={84} />
        <div className="flex-1 space-y-2 text-xs">
          <div className="flex items-center gap-1 text-brand-medium">
            <CalendarDays size={12} />
            <span>Deadline {deadline.toLocaleDateString()}</span>
          </div>
          <div className={`font-mono ${daysCls}`}>{daysLabel}</div>
          <div className="flex items-center gap-1 font-medium text-brand-blue">
            Open cycle details <ArrowRight size={12} />
          </div>
        </div>
      </div>
    </Link>
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

function EmptyState() {
  return (
    <div className="rounded-lg border-2 border-dashed border-neutral-200 p-12 text-center">
      <ClipboardList className="mx-auto text-brand-medium" size={36} />
      <h3 className="mt-3 text-lg font-semibold text-brand-dark">No cycles yet</h3>
      <p className="mt-1 text-sm text-brand-medium">
        Create a cycle against an active framework to kick off assessments.
      </p>
      <Link
        href="/cycles/new"
        className="mt-4 inline-flex items-center gap-2 rounded-md bg-brand-navy px-4 py-2 text-sm font-semibold text-white"
      >
        + Create cycle
      </Link>
    </div>
  );
}
