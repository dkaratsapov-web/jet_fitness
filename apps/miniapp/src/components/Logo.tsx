// Jet Fitness logo — the approved master asset (brand/logo). Shipped as a
// trimmed transparent PNG; on the dark theme it's inverted to white via CSS
// (.jf-logo rules in index.css), shown as-is (black) on the light theme.

const SRC = `${import.meta.env.BASE_URL}brand/logo.png`;

export function Logo({ height = 56, className = '' }: { height?: number; className?: string }) {
  return (
    <img
      src={SRC}
      alt="Jet Fitness"
      className={`jf-logo ${className}`}
      style={{ height, width: 'auto' }}
    />
  );
}

// Compact usage (headers) — same lockup, smaller.
export function LogoMark({ size = 22, className = '' }: { size?: number; className?: string }) {
  return (
    <img
      src={SRC}
      alt="Jet Fitness"
      className={`jf-logo ${className}`}
      style={{ height: size, width: 'auto' }}
    />
  );
}
