// Jet Fitness — shared UI kit.
// Designed primitives so screens compose from a common visual vocabulary
// (cards, tiles, segmented controls, chips, sheets…) instead of ad-hoc
// `rounded-2xl bg-secondary` boxes. Brand: Graphite + Champagne Gold, with an
// electric-aqua "energy" accent for live / active / progress states.

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';

/* ── Card ──────────────────────────────────────────────────────────────── */

export function Card({
  children,
  className = '',
  onClick,
  rise,
}: {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  /** stagger index 1–4 for entrance animation */
  rise?: 1 | 2 | 3 | 4 | true;
}) {
  const riseCls = rise ? `jf-rise${rise !== true ? ` jf-rise-${rise}` : ''}` : '';
  const press = onClick ? 'jf-press cursor-pointer' : '';
  return (
    <div
      className={`jf-card p-4 ${riseCls} ${press} ${className}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => (e.key === 'Enter' || e.key === ' ') && onClick() : undefined}
    >
      {children}
    </div>
  );
}

/* ── Eyebrow / SectionTitle ────────────────────────────────────────────── */

export function Eyebrow({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`jf-eyebrow ${className}`}>{children}</div>;
}

export function SectionTitle({
  eyebrow,
  title,
  action,
}: {
  eyebrow?: string;
  title: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-end justify-between gap-3 mb-3">
      <div className="min-w-0">
        {eyebrow && <Eyebrow className="mb-1">{eyebrow}</Eyebrow>}
        <h2 className="text-lg font-bold leading-tight truncate">{title}</h2>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

/* ── Stat tile ─────────────────────────────────────────────────────────── */

export function StatTile({
  label,
  value,
  unit,
  delta,
  tone = 'gold',
  className = '',
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  /** signed number; colored by direction. `deltaGood` flips which sign is green. */
  delta?: { value: number; good?: 'up' | 'down'; unit?: string };
  tone?: 'gold' | 'energy' | 'plain';
  className?: string;
}) {
  const valColor =
    tone === 'energy' ? 'var(--energy)' : tone === 'gold' ? 'var(--accent-strong)' : 'var(--text)';
  let deltaColor = 'var(--muted)';
  if (delta && delta.value !== 0) {
    const up = delta.value > 0;
    const good = delta.good ?? 'up';
    const isGood = (good === 'up' && up) || (good === 'down' && !up);
    deltaColor = isGood ? 'var(--pos)' : 'var(--neg)';
  }
  return (
    <div className={`jf-tile p-3 ${className}`}>
      <div className="jf-eyebrow mb-1.5 truncate" style={{ color: 'var(--muted)' }}>
        {label}
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-2xl font-extrabold tabular leading-none" style={{ color: valColor }}>
          {value}
        </span>
        {unit && <span className="text-xs text-brand-muted font-medium">{unit}</span>}
      </div>
      {delta && (
        <div className="text-[11px] font-semibold mt-1 tabular" style={{ color: deltaColor }}>
          {delta.value > 0 ? '↑ +' : delta.value < 0 ? '↓ ' : ''}
          {delta.value === 0 ? 'без изменений' : `${Math.abs(delta.value)}${delta.unit ?? ''}`}
        </div>
      )}
    </div>
  );
}

/* ── Segmented control ─────────────────────────────────────────────────── */

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pill, setPill] = useState<{ left: number; width: number } | null>(null);

  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    const idx = options.findIndex((o) => o.value === value);
    const btn = root.querySelectorAll<HTMLButtonElement>('button')[idx];
    if (btn) setPill({ left: btn.offsetLeft, width: btn.offsetWidth });
  }, [value, options]);

  return (
    <div className="jf-seg" ref={ref}>
      {pill && (
        <span
          className="jf-seg-pill"
          style={{ transform: `translateX(${pill.left - 3}px)`, width: pill.width }}
        />
      )}
      {options.map((o) => (
        <button key={o.value} data-active={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ── Chip ──────────────────────────────────────────────────────────────── */

export function Chip({
  children,
  tone,
  onClick,
  className = '',
}: {
  children: ReactNode;
  tone?: 'gold' | 'energy';
  onClick?: () => void;
  className?: string;
}) {
  return (
    <span
      className={`jf-chip ${onClick ? 'jf-press cursor-pointer' : ''} ${className}`}
      data-tone={tone}
      onClick={onClick}
    >
      {children}
    </span>
  );
}

/* ── Avatar ────────────────────────────────────────────────────────────── */

export function Avatar({ name, size = 40 }: { name?: string | null; size?: number }) {
  const initials = (name ?? '?')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('') || '?';
  return (
    <div className="jf-avatar" style={{ width: size, height: size, fontSize: size * 0.4 }}>
      {initials}
    </div>
  );
}

/* ── Progress bar ──────────────────────────────────────────────────────── */

export function ProgressBar({ pct, tone }: { pct: number; tone?: 'energy' }) {
  const w = Math.max(0, Math.min(100, pct));
  return (
    <div className="jf-bar" data-tone={tone}>
      <span style={{ width: `${w}%` }} />
    </div>
  );
}

/* ── Live dot ──────────────────────────────────────────────────────────── */

export function LiveDot() {
  return <span className="jf-live inline-block" />;
}

/* ── Button ────────────────────────────────────────────────────────────── */

export function Button({
  children,
  onClick,
  variant = 'primary',
  disabled,
  className = '',
  type = 'button',
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'energy' | 'ghost' | 'danger';
  disabled?: boolean;
  className?: string;
  type?: 'button' | 'submit';
}) {
  const base = 'rounded-2xl p-3.5 font-semibold text-center jf-press disabled:opacity-60 disabled:pointer-events-none';
  const styles: Record<string, string> = {
    primary: 'bg-brand-accent text-brand-onAccent shadow-[0_8px_20px_-8px_rgba(201,169,106,0.6)]',
    energy: 'bg-brand-energy text-brand-onEnergy shadow-[0_8px_20px_-8px_rgba(63,224,197,0.55)]',
    ghost: 'bg-brand-surface brand-line text-brand-text',
    danger: 'bg-transparent brand-line text-brand-neg',
  };
  return (
    <button type={type} className={`${base} ${styles[variant]} ${className}`} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}

/* ── Sparkline ─────────────────────────────────────────────────────────── */

export function Sparkline({
  values,
  width = 88,
  height = 30,
  tone = 'gold',
}: {
  values: number[];
  width?: number;
  height?: number;
  tone?: 'gold' | 'energy';
}) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const x = (i: number) => (i * width) / (values.length - 1);
  const y = (v: number) => 3 + (1 - (v - min) / span) * (height - 6);
  const line = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const stroke = tone === 'energy' ? 'var(--energy)' : 'var(--accent)';
  const lastX = x(values.length - 1);
  const lastY = y(values[values.length - 1]);
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden>
      <polyline
        points={line}
        fill="none"
        stroke={stroke}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={lastX} cy={lastY} r="2.6" fill={stroke} />
    </svg>
  );
}

/* ── Bottom sheet ──────────────────────────────────────────────────────── */

export function Sheet({
  title,
  eyebrow,
  onClose,
  children,
  footer,
}: {
  title?: string;
  eyebrow?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  // Lock body scroll while open.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-brand-bg rounded-t-4xl w-full max-w-md flex flex-col max-h-[92vh] jf-rise"
        style={{ boxShadow: '0 -10px 40px -12px rgba(0,0,0,0.7)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col items-center pt-2.5 pb-1">
          <span className="w-10 h-1 rounded-full bg-brand-surface2" />
        </div>
        {(title || eyebrow) && (
          <div className="flex items-start justify-between gap-3 px-5 pt-2 pb-3">
            <div className="min-w-0">
              {eyebrow && <Eyebrow className="mb-1">{eyebrow}</Eyebrow>}
              {title && <h2 className="text-lg font-bold leading-tight">{title}</h2>}
            </div>
            <button className="text-brand-muted text-xl leading-none -mt-0.5" onClick={onClose}>
              ✕
            </button>
          </div>
        )}
        <div className="px-5 pb-4 overflow-y-auto flex-1">{children}</div>
        {footer && (
          <div className="px-5 pt-3 pb-5 border-t border-line bg-brand-bg">{footer}</div>
        )}
      </div>
    </div>
  );
}

/* ── Empty state ───────────────────────────────────────────────────────── */

export function EmptyState({
  icon,
  title,
  hint,
  action,
}: {
  icon?: ReactNode;
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center text-center gap-2 py-10 px-6">
      {icon && <div className="text-4xl opacity-80 mb-1">{icon}</div>}
      <div className="font-semibold">{title}</div>
      {hint && <p className="text-brand-muted text-sm max-w-[15rem] leading-relaxed">{hint}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

/* ── Divider ───────────────────────────────────────────────────────────── */

export function Divider() {
  return <hr className="jf-rule my-1" />;
}
