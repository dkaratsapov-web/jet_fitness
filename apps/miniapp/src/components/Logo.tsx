// Jet Fitness logo — clean vector reproduction of the approved mark for in-app
// use (crisp at any size, themes via currentColor: off-white on dark, ink on
// light). The 2K raster (see brand/BRAND.md) stays the reference for stores.

// Just the barbell-that-becomes-a-jet symbol (plates left → bar → jet nose).
export function LogoMark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={(size * 64) / 28}
      height={size}
      viewBox="0 0 64 28"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      {/* left plates */}
      <rect x="2" y="7" width="4" height="14" rx="1.5" fill="currentColor" />
      <rect x="8" y="4" width="5" height="20" rx="2" fill="currentColor" />
      {/* bar */}
      <rect x="13" y="12" width="30" height="4" rx="2" fill="currentColor" />
      {/* jet nose / arrowhead */}
      <path d="M40 6 L62 14 L40 22 L46 14 Z" fill="currentColor" />
      {/* speed line */}
      <rect x="0" y="12.5" width="2.5" height="3" rx="1.25" fill="currentColor" opacity="0.5" />
    </svg>
  );
}

// Full stacked lockup: JET / barbell-jet mark / FITNESS.
export function Logo({ height = 56, className }: { height?: number; className?: string }) {
  return (
    <svg
      height={height}
      viewBox="0 0 200 104"
      fill="none"
      className={className}
      role="img"
      aria-label="Jet Fitness"
    >
      <text
        x="100"
        y="34"
        textAnchor="middle"
        fill="currentColor"
        fontFamily="-apple-system, 'SF Pro Display', Inter, system-ui, sans-serif"
        fontSize="38"
        fontWeight="800"
        letterSpacing="1"
      >
        JET
      </text>

      {/* barbell → jet mark, centered ~y=56 */}
      <g transform="translate(28,44)">
        <rect x="2" y="7" width="4" height="14" rx="1.5" fill="currentColor" />
        <rect x="8" y="4" width="5" height="20" rx="2" fill="currentColor" />
        <rect x="13" y="12" width="98" height="4" rx="2" fill="currentColor" />
        <path d="M108 6 L146 14 L108 22 L114 14 Z" fill="currentColor" />
        <rect x="0" y="12.5" width="2.5" height="3" rx="1.25" fill="currentColor" opacity="0.5" />
      </g>

      <text
        x="100"
        y="96"
        textAnchor="middle"
        fill="currentColor"
        fontFamily="-apple-system, 'SF Pro Display', Inter, system-ui, sans-serif"
        fontSize="17"
        fontWeight="500"
        letterSpacing="7"
      >
        FITNESS
      </text>
    </svg>
  );
}
