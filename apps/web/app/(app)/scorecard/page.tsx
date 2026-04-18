'use client';

/**
 * Employee scorecard landing — Sprint 4 Feature #1.
 *
 * Sections: header → current cycle panel (pills + donut) → per-dimension
 * breakdown (radar, or bar table if <3 dims) → historical trend (SVG line).
 * Data comes from `useMyScorecard()`. No fetch-in-component.
 */
import { AlertCircle, Hourglass, Info, TrendingUp } from 'lucide-react';
import { CompletionDonut } from '@/components/CompletionDonut';
import { ScoreRadarChart } from '@/components/ScoreRadarChart';
import {
  useMyScorecard,
  type EmployeeScorecardResponse,
  type ScorecardCurrentCycle,
  type ScorecardDimensionRow,
  type ScorecardHistoryEntry,
  type ScorecardMaturityLevel,
} from '@/hooks/use-scorecard';

const MAX_SCORE = 5;
// Statuses at which a composite score has been computed. Earlier stages
// show an "Awaiting manager review" banner instead of score pills.
const SCORED_STATUSES = new Set(['composite_computed', 'finalized']);

export default function ScorecardPage() {
  const { data, isLoading, isError, error } = useMyScorecard();

  if (isLoading) return <div className="text-brand-medium">Loading…</div>;
  if (isError || !data) {
    return (
      <div className="rounded-md border border-brand-red/30 bg-red-50 p-4 text-sm text-brand-red">
        {error instanceof Error ? error.message : 'Failed to load your scorecard'}
      </div>
    );
  }
  return <ScorecardView data={data} />;
}

// ── View ─────────────────────────────────────────────────────────────

export function ScorecardView({ data }: { data: EmployeeScorecardResponse }) {
  const target = resolveTargetLabel(data.currentCycle);
  return (
    <div className="max-w-5xl">
      <header className="mb-6">
        <h1 className="text-3xl font-bold text-brand-navy">{data.name}</h1>
        <p className="mt-1 text-sm text-brand-medium">
          <span className="font-medium text-brand-dark">{data.designation}</span>
          {' · '}Role family {data.roleFamily}
          {target && (
            <>
              {' · '}
              <span className="inline-flex items-center gap-1 rounded-full bg-brand-navy/10 px-2 py-0.5 text-xs font-semibold text-brand-navy">
                <TrendingUp size={12} /> Target: {target}
              </span>
            </>
          )}
        </p>
      </header>

      {data.currentCycle ? (
        <>
          <CurrentCyclePanel cycle={data.currentCycle} />
          <DimensionBreakdown cycle={data.currentCycle} />
        </>
      ) : (
        <NoActiveCycle />
      )}
      <HistoricalTrend history={data.history} />
    </div>
  );
}

// ── Current cycle panel ──────────────────────────────────────────────

function CurrentCyclePanel({ cycle }: { cycle: ScorecardCurrentCycle }) {
  const scored = SCORED_STATUSES.has(cycle.status);
  const composite = cycle.compositeScore ?? 0;
  const compositePct = Math.round(Math.max(0, Math.min(composite, MAX_SCORE)) * (100 / MAX_SCORE));

  return (
    <section className="mb-6 rounded-lg border border-neutral-200 bg-white p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-brand-navy">{cycle.cycleName}</h2>
          <p className="mt-0.5 text-xs text-brand-medium">
            Status <span className="font-mono text-brand-dark">{cycle.status}</span>
          </p>
        </div>
        {scored && (
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wider text-brand-medium">Composite</div>
            <div className="font-mono text-2xl font-bold text-brand-navy">
              {cycle.compositeScore != null ? cycle.compositeScore.toFixed(2) : '—'}
            </div>
            <div className="text-[10px] text-brand-medium">of {MAX_SCORE.toFixed(1)}</div>
          </div>
        )}
      </div>

      {scored ? (
        <div className="mt-5 grid gap-4 md:grid-cols-[auto_1fr] md:items-center">
          <div className="flex items-center justify-center md:justify-start">
            <CompletionDonut completed={compositePct} total={100} size={128} strokeWidth={12} />
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <ScorePill label="Self" value={cycle.selfScore} />
            <ScorePill label="Manager" value={cycle.managerScore} />
            <ScorePill label="Peer" value={cycle.peerScore} />
            <ScorePill label="AI" value={cycle.aiScore} />
          </div>
        </div>
      ) : (
        <div className="mt-5 flex items-start gap-2 rounded-md border border-brand-orange/30 bg-amber-50 p-3 text-sm text-brand-orange">
          <Hourglass size={16} className="mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold">Awaiting manager review</p>
            <p className="mt-0.5 text-xs">
              Your composite score will appear here once your manager has completed their review.
              Current stage: <span className="font-mono">{cycle.status}</span>.
            </p>
          </div>
        </div>
      )}

      {scored && cycle.maturityLevels.length > 0 && <MaturityContext cycle={cycle} />}
    </section>
  );
}

function ScorePill({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="rounded-md border border-neutral-200 bg-neutral-50 p-3">
      <div className="text-[10px] uppercase tracking-wider text-brand-medium">{label}</div>
      <div className="mt-0.5 font-mono text-xl font-semibold text-brand-navy">
        {value != null ? value.toFixed(2) : '—'}
      </div>
      <div className="text-[10px] text-brand-medium">of {MAX_SCORE.toFixed(1)}</div>
    </div>
  );
}

function MaturityContext({ cycle }: { cycle: ScorecardCurrentCycle }) {
  const current = pickCurrentLevel(cycle.maturityLevels, cycle.compositeScore);
  if (!current) return null;
  return (
    <div className="mt-4 rounded-md border border-neutral-200 bg-neutral-50 p-3 text-xs">
      <div className="flex items-center gap-2 text-brand-navy">
        <Info size={14} />
        <span className="font-semibold">L{current.level} · {current.name}</span>
      </div>
      <p className="mt-1 text-brand-medium">{current.description}</p>
    </div>
  );
}

function pickCurrentLevel(
  levels: ScorecardMaturityLevel[],
  composite: number | null,
): ScorecardMaturityLevel | null {
  if (composite == null || levels.length === 0) return null;
  const sorted = [...levels].sort((a, b) => a.level - b.level);
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.floor((composite / MAX_SCORE) * sorted.length) || 0),
  );
  return sorted[idx] ?? null;
}

// ── Dimension breakdown ──────────────────────────────────────────────

function DimensionBreakdown({ cycle }: { cycle: ScorecardCurrentCycle }) {
  const dims = cycle.perDimension;
  if (dims.length === 0) return null;

  return (
    <section className="mb-6 rounded-lg border border-neutral-200 bg-white p-5">
      <h2 className="text-lg font-semibold text-brand-navy">Per-dimension breakdown</h2>
      <p className="mt-0.5 text-xs text-brand-medium">
        How you scored yourself against your manager and the composite across each dimension.
      </p>
      {dims.length >= 3 ? (
        <div className="mt-4 flex justify-center">
          <ScoreRadarChart
            dimensions={dims.map((d) => d.dimension)}
            series={[
              { label: 'Self', color: '#2E75B6', values: dims.map((d) => d.self ?? 0) },
              { label: 'Manager', color: '#E67E22', values: dims.map((d) => d.manager ?? 0) },
              { label: 'Composite', color: '#1B3A5C', values: dims.map((d) => d.composite ?? 0) },
            ]}
            maxScore={MAX_SCORE}
            size={380}
          />
        </div>
      ) : (
        <DimensionBarTable dims={dims} />
      )}
    </section>
  );
}

function DimensionBarTable({ dims }: { dims: ScorecardDimensionRow[] }) {
  return (
    <ul className="mt-4 space-y-3">
      {dims.map((d) => (
        <li key={d.dimension} className="rounded-md border border-neutral-200 p-3">
          <div className="flex items-center justify-between">
            <span className="font-medium text-brand-dark">{d.dimension}</span>
            <span className="text-xs text-brand-medium">weight {(d.weight * 100).toFixed(0)}%</span>
          </div>
          <div className="mt-2 space-y-1.5">
            <BarRow label="Self" value={d.self} color="#2E75B6" />
            <BarRow label="Manager" value={d.manager} color="#E67E22" />
            <BarRow label="Composite" value={d.composite} color="#1B3A5C" />
          </div>
        </li>
      ))}
    </ul>
  );
}

function BarRow({ label, value, color }: { label: string; value: number | null; color: string }) {
  const pct = value != null ? Math.max(0, Math.min(value, MAX_SCORE)) * (100 / MAX_SCORE) : 0;
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-20 text-brand-medium">{label}</span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-neutral-100">
        {value != null && <div className="h-full" style={{ width: `${pct}%`, background: color }} />}
      </div>
      <span className="w-10 text-right font-mono text-brand-dark">
        {value != null ? value.toFixed(1) : '—'}
      </span>
    </div>
  );
}

// ── Historical trend ─────────────────────────────────────────────────

function HistoricalTrend({ history }: { history: ScorecardHistoryEntry[] }) {
  const points = [...history].sort(
    (a, b) => new Date(a.endDate).getTime() - new Date(b.endDate).getTime(),
  );

  if (points.length < 2) {
    return (
      <section className="rounded-lg border border-neutral-200 bg-white p-5">
        <h2 className="text-lg font-semibold text-brand-navy">Historical trend</h2>
        <div className="mt-3 flex items-start gap-2 rounded-md border border-brand-blue/20 bg-blue-50/50 p-3 text-sm text-brand-blue">
          <Info size={16} className="mt-0.5 shrink-0" />
          <p>Your first cycle — history builds from here.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-neutral-200 bg-white p-5">
      <h2 className="text-lg font-semibold text-brand-navy">Historical trend</h2>
      <p className="mt-0.5 text-xs text-brand-medium">
        Composite score across {points.length} cycles.
      </p>
      <div className="mt-4">
        <TrendLineChart points={points} />
      </div>
      <ul className="mt-4 grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
        {points.map((p) => (
          <li key={p.cycleId} className="rounded-md border border-neutral-200 p-2">
            <div className="truncate font-medium text-brand-dark">{p.cycleName}</div>
            <div className="mt-0.5 text-brand-medium">
              {new Date(p.endDate).toLocaleDateString()}
              {' · '}
              <span className="font-mono text-brand-blue">
                {p.compositeScore != null ? p.compositeScore.toFixed(2) : '—'}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function TrendLineChart({ points }: { points: ScorecardHistoryEntry[] }) {
  const width = 640;
  const height = 180;
  const padX = 36;
  const padY = 24;
  const innerW = width - padX * 2;
  const innerH = height - padY * 2;
  const step = points.length === 1 ? 0 : innerW / (points.length - 1);
  const mono = 'JetBrains Mono, Consolas, monospace';

  const coords = points.map((p, i) => {
    const v = p.compositeScore;
    const clamped = v == null ? null : Math.max(0, Math.min(v, MAX_SCORE));
    return {
      x: padX + step * i,
      y: clamped == null ? null : padY + innerH - (clamped / MAX_SCORE) * innerH,
      value: v,
      label: p.cycleName,
    };
  });

  // Break the polyline on nulls so missing cycles leave a gap.
  const segments: Array<Array<{ x: number; y: number }>> = [];
  let current: Array<{ x: number; y: number }> = [];
  for (const c of coords) {
    if (c.y == null) {
      if (current.length) segments.push(current);
      current = [];
    } else {
      current.push({ x: c.x, y: c.y });
    }
  }
  if (current.length) segments.push(current);

  const ariaLabel = `Composite score trend: ${points
    .map((p) => `${p.cycleName} ${p.compositeScore == null ? 'n/a' : p.compositeScore.toFixed(2)}`)
    .join(', ')}`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={ariaLabel}
      className="block h-auto w-full"
    >
      {[1, 2, 3, 4, 5].map((v) => {
        const y = padY + innerH - (v / MAX_SCORE) * innerH;
        return (
          <g key={v}>
            <line x1={padX} x2={width - padX} y1={y} y2={y} stroke="#E5E7EB" strokeDasharray="3 3" />
            <text x={padX - 6} y={y} textAnchor="end" dominantBaseline="central" fontFamily={mono} fontSize={10} fill="#7F8C8D">
              {v}
            </text>
          </g>
        );
      })}

      {segments.map((seg, i) => (
        <polyline
          key={i}
          points={seg.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ')}
          fill="none"
          stroke="#2E75B6"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      ))}

      {coords.map((c, i) =>
        c.y == null ? null : (
          <g key={i}>
            <circle cx={c.x} cy={c.y} r={4} fill="#2E75B6" stroke="#fff" strokeWidth={1.5} />
            <text x={c.x} y={c.y - 10} textAnchor="middle" fontFamily={mono} fontSize={10} fill="#1B3A5C">
              {c.value != null ? c.value.toFixed(1) : ''}
            </text>
          </g>
        ),
      )}

      {coords.map((c, i) => (
        <text
          key={`x-${i}`}
          x={c.x}
          y={height - 4}
          textAnchor="middle"
          fontFamily="Inter, system-ui, sans-serif"
          fontSize={10}
          fill="#7F8C8D"
        >
          {truncate(c.label, 14)}
        </text>
      ))}
    </svg>
  );
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

// ── Empty / helper states ────────────────────────────────────────────

function NoActiveCycle() {
  return (
    <section className="mb-6 rounded-lg border-2 border-dashed border-neutral-200 p-12 text-center">
      <AlertCircle className="mx-auto text-brand-medium" size={32} />
      <h3 className="mt-3 text-lg font-semibold text-brand-dark">
        You have no active assessment cycle
      </h3>
      <p className="mt-1 text-sm text-brand-medium">
        When your HR admin opens a new cycle, your current scorecard will appear here.
      </p>
    </section>
  );
}

function resolveTargetLabel(cycle: ScorecardCurrentCycle | null): string | null {
  if (!cycle || cycle.targetLevel == null) return null;
  const match = cycle.maturityLevels.find((l) => l.level === cycle.targetLevel);
  return match ? `L${match.level} ${match.name}` : `L${cycle.targetLevel}`;
}
