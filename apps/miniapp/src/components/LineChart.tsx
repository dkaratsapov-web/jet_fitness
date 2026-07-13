// Minimal, dependency-free line chart for progress trends.
// Theme-aware: line uses the Telegram accent (tg-link), labels use tg-hint.

interface Point {
  value: number;
  label?: string;
}

export function LineChart({
  points,
  height = 120,
  unit = '',
}: {
  points: Point[];
  height?: number;
  unit?: string;
}) {
  if (points.length < 2) {
    return (
      <div className="text-tg-hint text-xs">
        Недостаточно данных для графика (нужно ≥2 замера).
      </div>
    );
  }

  const width = 320;
  const padX = 8;
  const padY = 12;
  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;

  const x = (i: number) => padX + (i * (width - 2 * padX)) / (points.length - 1);
  const y = (v: number) => padY + (1 - (v - min) / span) * (height - 2 * padY);

  const line = points.map((p, i) => `${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const area = `${padX},${height - padY} ${line} ${width - padX},${height - padY}`;

  const first = points[0];
  const last = points[points.length - 1];
  const delta = +(last.value - first.value).toFixed(1);

  return (
    <div className="w-full">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        preserveAspectRatio="none"
        role="img"
        aria-label="График динамики"
      >
        <polygon points={area} fill="var(--tg-theme-link-color, #3390ec)" opacity="0.12" />
        <polyline
          points={line}
          fill="none"
          stroke="var(--tg-theme-link-color, #3390ec)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
        {points.map((p, i) => (
          <circle
            key={i}
            cx={x(i)}
            cy={y(p.value)}
            r="2.5"
            fill="var(--tg-theme-link-color, #3390ec)"
          />
        ))}
      </svg>
      <div className="flex justify-between text-tg-hint text-[10px] mt-1">
        <span>
          {first.label ? `${first.label}: ` : ''}
          {first.value}
          {unit}
        </span>
        <span className={delta < 0 ? 'text-green-500' : delta > 0 ? 'text-red-400' : ''}>
          {delta > 0 ? '+' : ''}
          {delta}
          {unit}
        </span>
        <span>
          {last.label ? `${last.label}: ` : ''}
          {last.value}
          {unit}
        </span>
      </div>
    </div>
  );
}
