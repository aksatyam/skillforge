'use client';

/**
 * Manager team dashboard — Sprint 4 feature #2 (BUILD_PLAN §6).
 *
 * Sibling view to the existing roster at `/team`. Surfaces aggregate
 * metrics for a manager's direct reports in the active cycle:
 * completion, team averages, score distribution, at-risk list, recent
 * activity. All data is read through `useTeamOverview()` against
 * `/stats/manager/team-overview`.
 */
import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowRight,
  ArrowUpDown,
  BarChart3,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Sparkles,
  Users,
} from 'lucide-react';
import { CompletionDonut } from '@/components/CompletionDonut';
import { ScoreHistogram } from '@/components/ScoreHistogram';
import { useMe } from '@/hooks/use-me';
import { useTeamOverview, type ManagerTeamOverviewResponse } from '@/hooks/use-team-overview';
import { useTeamAssessments, type TeamAssessment } from '@/hooks/use-assessments';

type AtRiskRow = ManagerTeamOverviewResponse['atRiskReports'][number];
type ActivityEvent = ManagerTeamOverviewResponse['recentActivity'][number];

export default function TeamOverviewPage() {
  const me = useMe();
  const overview = useTeamOverview();
  // Roster is used only to resolve a userId to its active assessmentId so
  // at-risk rows can link directly into the scoring page. Cached from the
  // roster view when available.
  const roster = useTeamAssessments();

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
      <header className="mb-6">
        <h1 className="text-3xl font-bold text-brand-navy">Team</h1>
        <p className="mt-1 text-sm text-brand-medium">
          Aggregate view of your direct reports for the active cycle.
        </p>
        <TeamTabs active="overview" />
      </header>

      {overview.isError && (
        <div className="mb-4 rounded-md border border-brand-red/30 bg-red-50 p-3 text-sm text-brand-red">
          {overview.error instanceof Error
            ? overview.error.message
            : 'Failed to load team overview'}
        </div>
      )}

      {overview.isLoading ? (
        <div className="text-brand-medium">Loading…</div>
      ) : !overview.data ? null : overview.data.totalReports === 0 ? (
        <EmptyState />
      ) : (
        <OverviewBody data={overview.data} roster={roster.data ?? []} />
      )}
    </div>
  );
}

// ── Sections ──────────────────────────────────────────────────────────

function OverviewBody({
  data,
  roster,
}: {
  data: ManagerTeamOverviewResponse;
  roster: TeamAssessment[];
}) {
  const completionPct = Math.round(data.completionRate * 100);
  const atRiskCount = data.atRiskReports.length;

  return (
    <div className="space-y-6">
      {/* Top strip — 4 KPI tiles */}
      <section
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
        aria-label="Team key metrics"
      >
        <KpiTile
          icon={<Users size={18} />}
          label="Total reports"
          value={data.totalReports.toString()}
          hint={`${sumByStatus(data.byStatus)} tracked in cycle`}
        />
        <KpiTile
          icon={<CheckCircle2 size={18} />}
          label="Completion rate"
          value={`${completionPct}%`}
          hint={`${data.byStatus.finalized ?? 0} finalized`}
          donut={
            <CompletionDonut
              completed={data.byStatus.finalized ?? 0}
              total={data.totalReports}
              size={72}
              strokeWidth={8}
            />
          }
        />
        <KpiTile
          icon={<ClipboardCheck size={18} />}
          label="Pending my review"
          value={data.pendingReviews.toString()}
          hint={data.pendingReviews > 0 ? 'Self-submitted, awaiting your score' : 'You’re caught up'}
          accent={data.pendingReviews > 0 ? 'blue' : 'neutral'}
        />
        <KpiTile
          icon={<AlertTriangle size={18} />}
          label="At-risk"
          value={atRiskCount.toString()}
          hint={atRiskCount > 0 ? '≤3 days to deadline' : 'No imminent deadlines'}
          accent={atRiskCount > 0 ? 'red' : 'neutral'}
        />
      </section>

      {/* Team averages */}
      <section
        className="rounded-lg border border-neutral-200 bg-white p-5"
        aria-label="Team average scores"
      >
        <div className="mb-4 flex items-center gap-2">
          <Sparkles size={16} className="text-brand-blue" />
          <h2 className="text-sm font-semibold uppercase tracking-wider text-brand-medium">
            Team averages
          </h2>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <AverageTile label="Self" score={data.averageScores.self} />
          <AverageTile label="Manager" score={data.averageScores.manager} />
          <AverageTile label="Composite" score={data.averageScores.composite} emphasis />
        </div>
      </section>

      {/* Score distribution */}
      <section
        className="rounded-lg border border-neutral-200 bg-white p-5"
        aria-label="Composite score distribution"
      >
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BarChart3 size={16} className="text-brand-blue" />
            <h2 className="text-sm font-semibold uppercase tracking-wider text-brand-medium">
              Score distribution (composite)
            </h2>
          </div>
          <div className="text-xs text-brand-medium">
            {data.distribution.reduce((sum, b) => sum + b.count, 0)} scored
          </div>
        </div>
        <ScoreHistogram buckets={data.distribution} />
      </section>

      {/* Two-column: at-risk + recent activity */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <AtRiskList rows={data.atRiskReports} roster={roster} />
        <RecentActivity events={data.recentActivity} />
      </section>
    </div>
  );
}

// ── KPI tile ──────────────────────────────────────────────────────────

type KpiAccent = 'neutral' | 'blue' | 'red';

function KpiTile({
  icon,
  label,
  value,
  hint,
  donut,
  accent = 'neutral',
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
  donut?: React.ReactNode;
  accent?: KpiAccent;
}) {
  const valueColor =
    accent === 'red'
      ? 'text-brand-red'
      : accent === 'blue'
        ? 'text-brand-blue'
        : 'text-brand-navy';
  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border border-neutral-200 bg-white p-5">
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-brand-medium">
          {icon}
          {label}
        </div>
        <div className={`mt-2 text-3xl font-bold ${valueColor}`}>{value}</div>
        {hint && <div className="mt-1 text-xs text-brand-medium">{hint}</div>}
      </div>
      {donut && <div className="shrink-0">{donut}</div>}
    </div>
  );
}

// ── Average tile ──────────────────────────────────────────────────────

function AverageTile({
  label,
  score,
  emphasis = false,
}: {
  label: string;
  score: number | null;
  emphasis?: boolean;
}) {
  const nullState = score === null;
  const display = nullState ? '—' : score.toFixed(2);
  return (
    <div
      className={`rounded-md border p-4 ${
        emphasis ? 'border-brand-blue/30 bg-brand-blue/5' : 'border-neutral-200 bg-neutral-50'
      }`}
    >
      <div className="text-xs font-semibold uppercase tracking-wider text-brand-medium">
        {label}
      </div>
      <div
        className={`mt-1 text-3xl font-bold ${
          nullState ? 'text-brand-medium' : emphasis ? 'text-brand-blue' : 'text-brand-navy'
        }`}
      >
        {display}
      </div>
      <div className="mt-1 text-xs text-brand-medium">
        {nullState ? 'Need 3+ scored' : 'out of 5.0'}
      </div>
    </div>
  );
}

// ── At-risk list ──────────────────────────────────────────────────────

type SortKey = 'days' | 'name';
type SortDir = 'asc' | 'desc';

function AtRiskList({ rows, roster }: { rows: AtRiskRow[]; roster: TeamAssessment[] }) {
  const [sortKey, setSortKey] = useState<SortKey>('days');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const sorted = useMemo(() => {
    const out = [...rows];
    out.sort((a, b) => {
      const cmp =
        sortKey === 'days'
          ? a.daysToDeadline - b.daysToDeadline
          : a.name.localeCompare(b.name);
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return out;
  }, [rows, sortKey, sortDir]);

  // Build a userId → assessmentId lookup from the already-cached roster so
  // we can link rows straight into the scoring page.
  const assessmentByUser = useMemo(() => {
    const map = new Map<string, string>();
    roster.forEach((r) => map.set(r.user.id, r.id));
    return map;
  }, [roster]);

  const toggle = (key: SortKey) => {
    if (key === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir(key === 'days' ? 'asc' : 'asc');
    }
  };

  return (
    <div className="rounded-lg border border-neutral-200 bg-white">
      <div className="flex items-center justify-between border-b border-neutral-100 p-4">
        <div className="flex items-center gap-2">
          <AlertTriangle size={16} className="text-brand-red" />
          <h2 className="text-sm font-semibold uppercase tracking-wider text-brand-medium">
            At-risk reports
          </h2>
        </div>
        <span className="rounded-full bg-red-50 px-2 py-0.5 font-mono text-xs text-brand-red">
          {rows.length}
        </span>
      </div>
      {rows.length === 0 ? (
        <div className="p-6 text-center text-sm text-brand-medium">
          Nothing at risk right now.
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wider text-brand-medium">
            <tr>
              <th className="px-4 py-3">
                <button
                  type="button"
                  onClick={() => toggle('name')}
                  className="inline-flex items-center gap-1 hover:text-brand-dark"
                >
                  Name
                  <ArrowUpDown size={12} />
                </button>
              </th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">
                <button
                  type="button"
                  onClick={() => toggle('days')}
                  className="inline-flex items-center gap-1 hover:text-brand-dark"
                >
                  Days to deadline
                  <ArrowUpDown size={12} />
                </button>
              </th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {sorted.map((row) => {
              const assessmentId = assessmentByUser.get(row.userId);
              const href = assessmentId
                ? `/team/${row.userId}/assessment/${assessmentId}`
                : `/team`;
              return (
                <tr key={row.userId} className="cursor-pointer hover:bg-neutral-50">
                  <td className="px-4 py-3">
                    <Link href={href} className="font-medium text-brand-dark">
                      {row.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-brand-medium">{prettyStatus(row.status)}</td>
                  <td className="px-4 py-3 font-mono">
                    <span
                      className={
                        row.daysToDeadline <= 0
                          ? 'text-brand-red'
                          : row.daysToDeadline <= 3
                            ? 'text-brand-orange'
                            : 'text-brand-dark'
                      }
                    >
                      {row.daysToDeadline < 0
                        ? 'past due'
                        : row.daysToDeadline === 0
                          ? 'today'
                          : `${row.daysToDeadline}d`}
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
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ── Recent activity ───────────────────────────────────────────────────

function RecentActivity({ events }: { events: ActivityEvent[] }) {
  const latest = events.slice(0, 10);
  return (
    <div className="rounded-lg border border-neutral-200 bg-white">
      <div className="flex items-center justify-between border-b border-neutral-100 p-4">
        <div className="flex items-center gap-2">
          <Clock size={16} className="text-brand-blue" />
          <h2 className="text-sm font-semibold uppercase tracking-wider text-brand-medium">
            Recent activity
          </h2>
        </div>
        <span className="rounded-full bg-neutral-100 px-2 py-0.5 font-mono text-xs text-brand-medium">
          {latest.length}
        </span>
      </div>
      {latest.length === 0 ? (
        <div className="p-6 text-center text-sm text-brand-medium">
          No activity yet this cycle.
        </div>
      ) : (
        <ol className="divide-y divide-neutral-100">
          {latest.map((ev, idx) => (
            <li key={`${ev.userId}-${ev.at}-${idx}`} className="flex items-start gap-3 px-4 py-3">
              <div className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-brand-blue" />
              <div className="min-w-0 flex-1">
                <div className="text-sm text-brand-dark">
                  <span className="font-medium">{ev.name}</span>{' '}
                  <span className="text-brand-medium">{prettyEvent(ev.event)}</span>
                </div>
                <div className="mt-0.5 text-xs text-brand-medium">{relativeTime(ev.at)}</div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

// ── Tabs + empty state ───────────────────────────────────────────────

function TeamTabs({ active }: { active: 'overview' | 'roster' }) {
  const base =
    'inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition';
  return (
    <div className="mt-4 flex gap-1 border-b border-neutral-200">
      <Link
        href="/team/overview"
        className={`${base} ${
          active === 'overview'
            ? 'border-brand-blue text-brand-navy'
            : 'border-transparent text-brand-medium hover:text-brand-dark'
        }`}
      >
        <BarChart3 size={14} />
        Overview
      </Link>
      <Link
        href="/team"
        className={`${base} ${
          active === 'roster'
            ? 'border-brand-blue text-brand-navy'
            : 'border-transparent text-brand-medium hover:text-brand-dark'
        }`}
      >
        <Users size={14} />
        Roster
      </Link>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-lg border-2 border-dashed border-neutral-200 p-12 text-center">
      <Users className="mx-auto text-brand-medium" size={36} />
      <h3 className="mt-3 text-lg font-semibold text-brand-dark">No direct reports yet</h3>
      <p className="mt-1 text-sm text-brand-medium">
        Ask HR to assign you direct reports in the user admin UI.
      </p>
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────

function sumByStatus(by: Record<string, number>): number {
  return Object.values(by).reduce((sum, n) => sum + (typeof n === 'number' ? n : 0), 0);
}

function prettyStatus(status: string): string {
  return status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function prettyEvent(event: string): string {
  const map: Record<string, string> = {
    self_submitted: 'submitted self-assessment',
    manager_scored: 'received manager score',
    composite_computed: 'composite computed',
    finalized: 'assessment finalized',
    peer_submitted: 'peer review submitted',
    ai_analyzed: 'AI analysis completed',
  };
  return map[event] ?? event.replace(/_/g, ' ');
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diffMs = Date.now() - then;
  if (diffMs < 0) return 'just now';
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  return new Date(iso).toLocaleDateString();
}
