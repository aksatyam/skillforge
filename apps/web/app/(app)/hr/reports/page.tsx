'use client';

/**
 * HR reports — Sprint 4 feature #3.
 *
 * Two side-by-side panels driven by a single cycle selector:
 *   1. Completion report — aggregate donut + breakdowns by role family / manager + CSV export
 *   2. Score distribution — summary stats + full-org histogram + per-role-family small multiples
 *
 * Data flows entirely through `useOrgCompletion` and `useScoreDistribution`.
 * No direct fetch() calls; CSV download reuses `useDownloadExport` from use-cycles.
 */
import { useMemo, useState } from 'react';
import { BarChart2, Download, LineChart, Users, Layers } from 'lucide-react';
import { useMe } from '@/hooks/use-me';
import { useCycles, useDownloadExport } from '@/hooks/use-cycles';
import {
  useOrgCompletion,
  useScoreDistribution,
  type OrgCompletionResponse,
  type ScoreBucket,
  type ScoreDistributionResponse,
} from '@/hooks/use-reports';
import { CompletionDonut } from '@/components/CompletionDonut';

export default function HrReportsPage() {
  const me = useMe();
  const cyclesQ = useCycles();
  const [cycleId, setCycleId] = useState<string>('');
  const [compareRoles, setCompareRoles] = useState(false);

  const completionQ = useOrgCompletion(cycleId || undefined);
  const distributionQ = useScoreDistribution(cycleId || undefined);
  const download = useDownloadExport();

  const role = me.data?.role;
  const allowed = role === 'hr_admin' || role === 'super_admin';

  const cycles = cyclesQ.data ?? [];
  const sortedCycles = useMemo(
    () =>
      [...cycles].sort((a, b) => {
        // open/locked before draft/closed, then newest first
        const rank = (s: string) =>
          s === 'open' ? 0 : s === 'locked' ? 1 : s === 'draft' ? 2 : 3;
        const r = rank(a.status) - rank(b.status);
        if (r !== 0) return r;
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      }),
    [cycles],
  );

  if (!me.data) return <div className="text-brand-medium">Loading…</div>;

  if (!allowed) {
    return (
      <div className="rounded-md border border-brand-red/30 bg-red-50 p-4 text-sm text-brand-red">
        <strong className="mr-1">403 —</strong>
        Reports are for HR admins only. If you need access, contact your super admin.
      </div>
    );
  }

  const selectedCycle = cycles.find((c) => c.id === cycleId);
  const onExport = () => {
    if (!selectedCycle) return;
    download(selectedCycle.id, selectedCycle.name.replace(/\s+/g, '_'));
  };

  return (
    <div className="max-w-7xl">
      <header className="mb-6">
        <h1 className="text-3xl font-bold text-brand-navy">Reports</h1>
        <p className="mt-1 text-sm text-brand-medium">
          Completion rates and score distribution across a cycle. Pick a cycle to begin.
        </p>
      </header>

      <section className="mb-6 rounded-lg border border-neutral-200 bg-white p-5">
        <label
          htmlFor="sf-reports-cycle"
          className="mb-1 block text-xs font-medium uppercase tracking-wider text-brand-medium"
        >
          Cycle
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <select
            id="sf-reports-cycle"
            value={cycleId}
            onChange={(e) => setCycleId(e.target.value)}
            disabled={cyclesQ.isLoading}
            className="min-w-[280px] rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-brand-dark focus:border-brand-blue focus:outline-none"
          >
            <option value="">— Select a cycle —</option>
            {sortedCycles.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.status})
              </option>
            ))}
          </select>
          {selectedCycle && (
            <button
              onClick={onExport}
              className="inline-flex items-center gap-2 rounded-md border border-brand-navy/20 bg-white px-3 py-2 text-sm font-semibold text-brand-navy hover:bg-neutral-50"
            >
              <Download size={14} /> Download CSV
            </button>
          )}
        </div>
        {cyclesQ.isError && (
          <div className="mt-3 rounded-md border border-brand-red/30 bg-red-50 p-2 text-xs text-brand-red">
            {cyclesQ.error instanceof Error ? cyclesQ.error.message : 'Failed to load cycles'}
          </div>
        )}
      </section>

      {!cycleId ? (
        <EmptyState />
      ) : (
        <div className="grid gap-6 xl:grid-cols-2">
          <CompletionPanel query={completionQ} />
          <DistributionPanel
            query={distributionQ}
            compareRoles={compareRoles}
            onToggleCompare={() => setCompareRoles((v) => !v)}
          />
        </div>
      )}
    </div>
  );
}

// ── Empty + banners ────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="rounded-lg border-2 border-dashed border-neutral-200 p-12 text-center">
      <BarChart2 className="mx-auto text-brand-medium" size={36} />
      <h3 className="mt-3 text-lg font-semibold text-brand-dark">Select a cycle to see reports</h3>
      <p className="mt-1 text-sm text-brand-medium">
        Pick a cycle from the dropdown above. You&apos;ll get completion rates and a score
        distribution side by side.
      </p>
    </div>
  );
}

function ErrorBanner({ error }: { error: unknown }) {
  const msg = error instanceof Error ? error.message : 'Request failed';
  return (
    <div className="rounded-md border border-brand-red/30 bg-red-50 p-3 text-sm text-brand-red">
      {msg}
    </div>
  );
}

function LoadingText({ label }: { label: string }) {
  return <div className="text-sm text-brand-medium">{label}</div>;
}

// ── Completion panel ───────────────────────────────────────────────

type CompletionQuery = {
  data: OrgCompletionResponse | undefined;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
};

function CompletionPanel({ query }: { query: CompletionQuery }) {
  return (
    <section className="rounded-lg border border-neutral-200 bg-white">
      <div className="flex items-center gap-2 border-b border-neutral-100 px-6 py-4">
        <Users size={16} className="text-brand-blue" />
        <h2 className="text-lg font-semibold text-brand-navy">Completion</h2>
      </div>
      <div className="p-6">
        {query.isError ? (
          <ErrorBanner error={query.error} />
        ) : query.isLoading ? (
          <LoadingText label="Loading completion…" />
        ) : !query.data ? (
          <LoadingText label="No data" />
        ) : (
          <CompletionBody data={query.data} />
        )}
      </div>
    </section>
  );
}

function CompletionBody({ data }: { data: OrgCompletionResponse }) {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-6">
        <CompletionDonut completed={data.submitted} total={data.total} size={128} strokeWidth={12} />
        <div className="flex-1">
          <div className="text-2xl font-bold text-brand-navy">
            {data.submitted.toLocaleString()} / {data.total.toLocaleString()}
          </div>
          <div className="text-xs uppercase tracking-wider text-brand-medium">
            assessments submitted
          </div>
          <div className="mt-3 text-sm text-brand-dark">{data.cycleName}</div>
        </div>
      </div>

      <BreakdownTable
        title="By role family"
        rows={data.byRoleFamily.map((r) => ({
          key: r.roleFamily,
          label: r.roleFamily,
          total: r.total,
          submitted: r.submitted,
          rate: r.rate,
        }))}
      />

      <BreakdownTable
        title="By manager"
        rows={data.byManager.map((r) => ({
          key: r.managerId ?? `__unassigned__${r.managerName}`,
          label: r.managerName,
          total: r.total,
          submitted: r.submitted,
          rate: r.rate,
        }))}
      />
    </div>
  );
}

function BreakdownTable({
  title,
  rows,
}: {
  title: string;
  rows: Array<{ key: string; label: string; total: number; submitted: number; rate: number }>;
}) {
  if (rows.length === 0) {
    return (
      <div>
        <h3 className="mb-2 text-sm font-semibold text-brand-dark">{title}</h3>
        <div className="text-xs text-brand-medium">No data.</div>
      </div>
    );
  }
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold text-brand-dark">{title}</h3>
      <table className="w-full text-sm">
        <thead className="text-left text-xs uppercase tracking-wider text-brand-medium">
          <tr>
            <th className="py-2">Group</th>
            <th className="py-2 text-right">Submitted</th>
            <th className="py-2 text-right">Total</th>
            <th className="py-2 text-right">Rate</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-100">
          {rows.map((r) => (
            <tr key={r.key}>
              <td className="py-2 text-brand-dark">{r.label}</td>
              <td className="py-2 text-right font-mono">{r.submitted.toLocaleString()}</td>
              <td className="py-2 text-right font-mono text-brand-medium">
                {r.total.toLocaleString()}
              </td>
              <td className="py-2 text-right font-mono font-semibold text-brand-navy">
                {formatRate(r.rate)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Distribution panel ─────────────────────────────────────────────

type DistributionQuery = {
  data: ScoreDistributionResponse | undefined;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
};

function DistributionPanel({
  query,
  compareRoles,
  onToggleCompare,
}: {
  query: DistributionQuery;
  compareRoles: boolean;
  onToggleCompare: () => void;
}) {
  return (
    <section className="rounded-lg border border-neutral-200 bg-white">
      <div className="flex items-center justify-between border-b border-neutral-100 px-6 py-4">
        <div className="flex items-center gap-2">
          <LineChart size={16} className="text-brand-blue" />
          <h2 className="text-lg font-semibold text-brand-navy">Score distribution</h2>
        </div>
        <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-brand-dark">
          <input
            type="checkbox"
            checked={compareRoles}
            onChange={onToggleCompare}
            className="h-4 w-4 rounded border-neutral-300 text-brand-blue focus:ring-brand-blue"
          />
          <span className="inline-flex items-center gap-1 font-medium">
            <Layers size={12} /> Compare by role family
          </span>
        </label>
      </div>
      <div className="p-6">
        {query.isError ? (
          <ErrorBanner error={query.error} />
        ) : query.isLoading ? (
          <LoadingText label="Loading distribution…" />
        ) : !query.data ? (
          <LoadingText label="No data" />
        ) : (
          <DistributionBody data={query.data} compareRoles={compareRoles} />
        )}
      </div>
    </section>
  );
}

function DistributionBody({
  data,
  compareRoles,
}: {
  data: ScoreDistributionResponse;
  compareRoles: boolean;
}) {
  if (data.total === 0) {
    return (
      <div className="rounded-md border border-dashed border-neutral-200 p-6 text-center text-sm text-brand-medium">
        No composite scores yet for this cycle.
      </div>
    );
  }
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Count" value={data.total.toLocaleString()} />
        <Stat label="Mean" value={formatScore(data.mean)} />
        <Stat label="Median" value={formatScore(data.median)} />
        <Stat label="Std dev" value={formatScore(data.stdDev)} />
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-brand-dark">Full organisation</h3>
        <Histogram buckets={data.buckets} color="#2E75B6" height={160} />
      </div>

      {compareRoles && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-brand-dark">By role family</h3>
          {data.byRoleFamily.length === 0 ? (
            <div className="text-xs text-brand-medium">No role-family buckets available.</div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {data.byRoleFamily.map((rf) => (
                <div
                  key={rf.roleFamily}
                  className="rounded-md border border-neutral-200 bg-neutral-50 p-3"
                >
                  <div className="mb-1 flex items-baseline justify-between">
                    <div className="text-sm font-semibold text-brand-dark">{rf.roleFamily}</div>
                    <div className="font-mono text-xs text-brand-medium">
                      n={rf.count} · μ={formatScore(rf.mean)}
                    </div>
                  </div>
                  <Histogram buckets={rf.buckets} color="#1B3A5C" height={96} compact />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-neutral-200 bg-neutral-50 p-3">
      <div className="text-[10px] font-medium uppercase tracking-wider text-brand-medium">
        {label}
      </div>
      <div className="mt-1 font-mono text-lg font-bold text-brand-navy">{value}</div>
    </div>
  );
}

// ── Inline histogram (parallel agent hasn't shipped the shared component) ──

function Histogram({
  buckets,
  color,
  height,
  compact = false,
}: {
  buckets: ScoreBucket[];
  color: string;
  height: number;
  compact?: boolean;
}) {
  if (buckets.length === 0) {
    return <div className="text-xs text-brand-medium">No buckets.</div>;
  }
  const max = buckets.reduce((m, b) => Math.max(m, b.count), 0);
  const safeMax = max > 0 ? max : 1;
  return (
    <div
      role="img"
      aria-label={`Histogram across ${buckets.length} buckets, max count ${max}`}
      className="w-full"
    >
      <div
        className="flex items-end gap-1"
        style={{ height: `${height}px` }}
      >
        {buckets.map((b) => {
          const h = (b.count / safeMax) * 100;
          return (
            <div
              key={b.bucket}
              className="flex flex-1 flex-col items-center justify-end"
              title={`${b.bucket}: ${b.count} (min ${b.min}, max ${b.max})`}
            >
              <div
                className="w-full rounded-t transition"
                style={{
                  height: `${h}%`,
                  backgroundColor: color,
                  minHeight: b.count > 0 ? '2px' : '0',
                }}
              />
              {!compact && (
                <div className="mt-1 font-mono text-[10px] text-brand-medium">{b.count}</div>
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex gap-1">
        {buckets.map((b) => (
          <div
            key={`${b.bucket}-lbl`}
            className="flex-1 truncate text-center font-mono text-[10px] text-brand-medium"
            title={b.bucket}
          >
            {b.bucket}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Formatting ─────────────────────────────────────────────────────

function formatRate(rate: number): string {
  if (!Number.isFinite(rate)) return '—';
  const pct = rate <= 1 ? rate * 100 : rate;
  return `${pct.toFixed(1)}%`;
}

function formatScore(n: number | null): string {
  return n == null ? '—' : n.toFixed(2);
}
