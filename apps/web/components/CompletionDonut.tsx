'use client';

/**
 * Pure-SVG donut gauge for cycle completion. No external chart libs.
 * Color: grey at 0, brand-blue 1–99%, brand-green at 100%.
 * Accessible via `role="img"` + aria-label.
 */
export type CompletionDonutProps = {
  completed: number;
  total: number;
  size?: number;
  strokeWidth?: number;
};

export function CompletionDonut({
  completed,
  total,
  size = 96,
  strokeWidth = 10,
}: CompletionDonutProps) {
  const safeTotal = total > 0 ? total : 0;
  const safeCompleted = Math.max(0, Math.min(completed, safeTotal));
  const pct = safeTotal === 0 ? 0 : Math.round((safeCompleted / safeTotal) * 100);
  const color = pct === 0 ? '#7F8C8D' : pct >= 100 ? '#27AE60' : '#2E75B6';

  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - pct / 100);
  const cx = size / 2;
  const cy = size / 2;

  const label =
    safeTotal === 0 ? 'No assessments yet' : `${pct}% complete, ${safeCompleted} of ${safeTotal}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={label}
      className="block"
    >
      <circle cx={cx} cy={cy} r={radius} fill="none" stroke="#E5E7EB" strokeWidth={strokeWidth} />
      {safeTotal > 0 && pct > 0 && (
        <circle
          cx={cx}
          cy={cy}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
          transform={`rotate(-90 ${cx} ${cy})`}
        />
      )}
      <text
        x="50%"
        y="50%"
        dominantBaseline="central"
        textAnchor="middle"
        fontFamily="Inter, system-ui, sans-serif"
        fontSize={size * 0.22}
        fontWeight={700}
        fill={color}
      >
        {pct}%
      </text>
      <text
        x="50%"
        y={cy + size * 0.18}
        dominantBaseline="central"
        textAnchor="middle"
        fontFamily="JetBrains Mono, Consolas, monospace"
        fontSize={size * 0.1}
        fill="#7F8C8D"
      >
        {safeCompleted}/{safeTotal}
      </text>
    </svg>
  );
}
