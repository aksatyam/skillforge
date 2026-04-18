'use client';

/**
 * Pure-SVG bar histogram for score distribution buckets. No external libs.
 *
 * Props accept any labeled bucket ({ bucket, count }); extra fields (min/max)
 * are ignored so callers can pass the full distribution shape unchanged.
 * Tallest bar paints `brand-blue`; others `brand-navy/40`. Count label sits
 * atop each bar; bucket label sits on the x-axis. The whole SVG is marked
 * `role="img"` with a descriptive aria-label for screen readers.
 */
export type ScoreHistogramBucket = {
  bucket: string;
  count: number;
};

export type ScoreHistogramProps = {
  buckets: Array<ScoreHistogramBucket>;
  maxBars?: number;
  height?: number;
};

export function ScoreHistogram({ buckets, maxBars = 10, height = 200 }: ScoreHistogramProps) {
  const data = buckets.slice(0, maxBars);
  const total = data.reduce((sum, b) => sum + b.count, 0);

  // Layout constants (SVG uses an intrinsic coordinate system so the bar
  // chart scales crisply at any rendered size).
  const padLeft = 36;
  const padRight = 12;
  const padTop = 22;
  const padBottom = 36;
  const barGap = 10;
  const minBarWidth = 24;
  const chartHeight = Math.max(120, height);

  const barCount = Math.max(data.length, 1);
  const barWidth = Math.max(
    minBarWidth,
    Math.floor((barCount * minBarWidth + (barCount - 1) * barGap) / barCount),
  );
  const width = padLeft + padRight + barCount * barWidth + (barCount - 1) * barGap;

  const maxCount = data.reduce((m, b) => (b.count > m ? b.count : m), 0);
  const tallestIdx = data.findIndex((b) => b.count === maxCount && maxCount > 0);

  const plotHeight = chartHeight - padTop - padBottom;

  const ariaLabel =
    total === 0
      ? 'Score distribution — no data yet'
      : `Score distribution histogram across ${data.length} buckets; total ${total} scored.`;

  if (data.length === 0) {
    return (
      <div
        role="img"
        aria-label="Score distribution — no data yet"
        className="flex h-40 items-center justify-center rounded-md border border-dashed border-neutral-200 text-sm text-brand-medium"
      >
        No scored reports yet.
      </div>
    );
  }

  return (
    <svg
      width="100%"
      height={chartHeight}
      viewBox={`0 0 ${width} ${chartHeight}`}
      role="img"
      aria-label={ariaLabel}
      className="block"
      preserveAspectRatio="xMidYMid meet"
    >
      {/* y-axis */}
      <line
        x1={padLeft}
        y1={padTop}
        x2={padLeft}
        y2={chartHeight - padBottom}
        stroke="#E5E7EB"
        strokeWidth={1}
      />
      {/* x-axis */}
      <line
        x1={padLeft}
        y1={chartHeight - padBottom}
        x2={width - padRight}
        y2={chartHeight - padBottom}
        stroke="#E5E7EB"
        strokeWidth={1}
      />

      {/* y-axis max tick label */}
      <text
        x={padLeft - 6}
        y={padTop + 4}
        textAnchor="end"
        fontFamily="JetBrains Mono, Consolas, monospace"
        fontSize={10}
        fill="#7F8C8D"
      >
        {maxCount}
      </text>
      <text
        x={padLeft - 6}
        y={chartHeight - padBottom + 3}
        textAnchor="end"
        fontFamily="JetBrains Mono, Consolas, monospace"
        fontSize={10}
        fill="#7F8C8D"
      >
        0
      </text>

      {data.map((bucket, i) => {
        const x = padLeft + i * (barWidth + barGap);
        const normalized = maxCount > 0 ? bucket.count / maxCount : 0;
        const barH = Math.round(normalized * plotHeight);
        const y = chartHeight - padBottom - barH;
        const isTallest = i === tallestIdx && bucket.count > 0;
        const fill = isTallest ? '#2E75B6' : 'rgba(27, 58, 92, 0.4)';
        const labelY = bucket.count > 0 ? y - 6 : chartHeight - padBottom - 6;

        return (
          <g key={`${bucket.bucket}-${i}`}>
            <rect
              x={x}
              y={y}
              width={barWidth}
              height={barH}
              rx={3}
              ry={3}
              fill={fill}
              role="presentation"
            >
              <title>
                {bucket.bucket}: {bucket.count}
              </title>
            </rect>
            <text
              x={x + barWidth / 2}
              y={labelY}
              textAnchor="middle"
              fontFamily="Inter, system-ui, sans-serif"
              fontSize={11}
              fontWeight={600}
              fill="#2C3E50"
            >
              {bucket.count}
            </text>
            <text
              x={x + barWidth / 2}
              y={chartHeight - padBottom + 16}
              textAnchor="middle"
              fontFamily="Inter, system-ui, sans-serif"
              fontSize={10}
              fill="#7F8C8D"
            >
              {bucket.bucket}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
