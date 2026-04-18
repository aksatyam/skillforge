'use client';

/**
 * Reusable SVG radar chart — no external chart libs.
 *
 * Supports 3..8 dimensions and 2-3 overlaid series. Falls back to a
 * noop (returns null) for dimensions outside that range — callers are
 * expected to render a table-based view instead in that case.
 *
 * Accessible via `role="img"` + aria-label that summarises each series.
 */

export type RadarSeries = {
  label: string;
  color: string;
  values: number[];
};

export type ScoreRadarChartProps = {
  dimensions: string[];
  series: RadarSeries[];
  maxScore?: number;
  size?: number;
};

const MIN_DIMS = 3;
const MAX_DIMS = 8;
const GRID_RINGS = 5;

export function ScoreRadarChart({
  dimensions,
  series,
  maxScore = 5,
  size = 360,
}: ScoreRadarChartProps) {
  const n = dimensions.length;
  if (n < MIN_DIMS || n > MAX_DIMS) return null;

  const cx = size / 2;
  const cy = size / 2;
  // Reserve ~22% of the half-width for axis labels so they don't clip.
  const radius = size * 0.36;

  // Angle for each axis, starting at the top (−90°) and going clockwise.
  const angles = Array.from({ length: n }, (_, i) => -Math.PI / 2 + (i * 2 * Math.PI) / n);

  const axisPoints = angles.map((a) => ({
    x: cx + radius * Math.cos(a),
    y: cy + radius * Math.sin(a),
  }));

  const rings = Array.from({ length: GRID_RINGS }, (_, i) => (i + 1) / GRID_RINGS);

  // Label positions: push outward beyond the grid radius.
  const labelRadius = radius + size * 0.08;
  const labelPoints = angles.map((a) => ({
    x: cx + labelRadius * Math.cos(a),
    y: cy + labelRadius * Math.sin(a),
    anchor: anchorFor(a),
  }));

  const ariaLabel = buildAriaLabel(dimensions, series, maxScore);

  return (
    <figure className="flex flex-col items-center">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={ariaLabel}
        className="block"
      >
        {/* Grid rings */}
        {rings.map((r, idx) => (
          <polygon
            key={idx}
            points={angles
              .map((a) => {
                const x = cx + radius * r * Math.cos(a);
                const y = cy + radius * r * Math.sin(a);
                return `${x.toFixed(2)},${y.toFixed(2)}`;
              })
              .join(' ')}
            fill="none"
            stroke="#E5E7EB"
            strokeWidth={1}
          />
        ))}

        {/* Axes */}
        {axisPoints.map((p, idx) => (
          <line
            key={idx}
            x1={cx}
            y1={cy}
            x2={p.x}
            y2={p.y}
            stroke="#E5E7EB"
            strokeWidth={1}
          />
        ))}

        {/* Series polygons */}
        {series.map((s, sIdx) => {
          const pts = angles
            .map((a, i) => {
              const raw = s.values[i] ?? 0;
              const clamped = Math.max(0, Math.min(raw, maxScore));
              const r = maxScore === 0 ? 0 : (clamped / maxScore) * radius;
              const x = cx + r * Math.cos(a);
              const y = cy + r * Math.sin(a);
              return `${x.toFixed(2)},${y.toFixed(2)}`;
            })
            .join(' ');
          return (
            <g key={sIdx}>
              <polygon
                points={pts}
                fill={s.color}
                fillOpacity={0.18}
                stroke={s.color}
                strokeWidth={2}
                strokeLinejoin="round"
              />
              {angles.map((a, i) => {
                const raw = s.values[i] ?? 0;
                const clamped = Math.max(0, Math.min(raw, maxScore));
                const r = maxScore === 0 ? 0 : (clamped / maxScore) * radius;
                const x = cx + r * Math.cos(a);
                const y = cy + r * Math.sin(a);
                return (
                  <circle
                    key={i}
                    cx={x}
                    cy={y}
                    r={3}
                    fill={s.color}
                    stroke="#fff"
                    strokeWidth={1}
                  />
                );
              })}
            </g>
          );
        })}

        {/* Axis labels */}
        {labelPoints.map((p, i) => (
          <text
            key={i}
            x={p.x}
            y={p.y}
            textAnchor={p.anchor.h}
            dominantBaseline={p.anchor.v}
            fontFamily="Inter, system-ui, sans-serif"
            fontSize={size * 0.033}
            fill="#2C3E50"
          >
            {dimensions[i]}
          </text>
        ))}
      </svg>

      {/* Legend */}
      <figcaption className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-brand-medium">
        {series.map((s) => (
          <span key={s.label} className="inline-flex items-center gap-1.5">
            <span
              aria-hidden
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ background: s.color }}
            />
            <span className="text-brand-dark">{s.label}</span>
          </span>
        ))}
      </figcaption>
    </figure>
  );
}

function anchorFor(angleRad: number): { h: 'start' | 'middle' | 'end'; v: 'auto' | 'middle' | 'hanging' } {
  // Normalise to [-PI, PI] then bucket into 8 compass sectors.
  const a = Math.atan2(Math.sin(angleRad), Math.cos(angleRad));
  const deg = (a * 180) / Math.PI;
  // -90 is top; 0 is right; 90 is bottom; 180/-180 is left.
  const tolerance = 12;
  let h: 'start' | 'middle' | 'end' = 'middle';
  if (deg > -90 + tolerance && deg < 90 - tolerance) h = 'start';
  else if (deg > 90 + tolerance || deg < -90 - tolerance) h = 'end';

  let v: 'auto' | 'middle' | 'hanging' = 'middle';
  if (deg > tolerance && deg < 180 - tolerance) v = 'hanging';
  else if (deg < -tolerance && deg > -180 + tolerance) v = 'auto';

  return { h, v };
}

function buildAriaLabel(dims: string[], series: RadarSeries[], max: number): string {
  const head = `Radar chart across ${dims.length} dimensions: ${dims.join(', ')}.`;
  const body = series
    .map((s) => {
      const readings = dims
        .map((d, i) => {
          const v = s.values[i];
          return `${d} ${v == null ? 'n/a' : v.toFixed(1)}`;
        })
        .join('; ');
      return `${s.label} (max ${max}): ${readings}.`;
    })
    .join(' ');
  return `${head} ${body}`;
}
