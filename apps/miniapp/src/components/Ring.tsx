// Progress ring (calories / any goal). Gold arc on a graphite track; turns to
// the "negative" colour when the value exceeds the goal.

export function Ring({
  value,
  goal,
  size = 72,
  stroke = 8,
  children,
}: {
  value: number;
  goal: number | null;
  size?: number;
  stroke?: number;
  children?: React.ReactNode;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = goal && goal > 0 ? Math.min(value / goal, 1) : 0;
  const over = goal != null && value > goal;
  const offset = c * (1 - pct);

  return (
    <div style={{ position: 'relative', width: size, height: size, flex: 'none' }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--surface-2)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={over ? 'var(--neg)' : 'var(--accent)'}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={goal ? offset : c}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: 'stroke-dashoffset .5s ease' }}
        />
      </svg>
      {children && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}
