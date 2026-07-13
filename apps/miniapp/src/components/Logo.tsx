// Jet Fitness logo — vector reproduction of the approved mark for in-app use
// (crisp at any size, themes via currentColor). The approved 2K raster lives in
// brand/BRAND.md and is the master for stores/social; this SVG rebuilds it so
// the app stays self-contained. Mark = bold plates (left) → bar → jet dart.

const MARK_PLATES = (
  <>
    <rect x="2" y="8" width="3" height="12" rx="1" fill="currentColor" />
    <rect x="6.5" y="4" width="4" height="20" rx="1.5" fill="currentColor" />
    <rect x="10.5" y="11.75" width="30" height="4.5" rx="2" fill="currentColor" />
    <path d="M38 6 L63 14 L38 22 L45.5 14 Z" fill="currentColor" />
  </>
);

// Just the barbell-that-becomes-a-jet symbol.
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
      {MARK_PLATES}
    </svg>
  );
}

// Full stacked lockup: JET / barbell-jet mark / FITNESS.
export function Logo({ height = 56, className }: { height?: number; className?: string }) {
  return (
    <svg
      height={height}
      viewBox="0 0 200 108"
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
        fontFamily="ui-rounded, 'SF Pro Rounded', 'Avenir Next', -apple-system, system-ui, sans-serif"
        fontSize="40"
        fontWeight="800"
        letterSpacing="1"
      >
        JET
      </text>

      {/* barbell → jet mark, centered ~y=60 */}
      <g transform="translate(24,46)">
        <rect x="0" y="10" width="5" height="22" rx="2" fill="currentColor" />
        <rect x="8" y="4" width="6" height="34" rx="2.5" fill="currentColor" />
        <rect x="14" y="16" width="104" height="7" rx="3.5" fill="currentColor" />
        <path d="M112 8 L152 19.5 L112 31 L124 19.5 Z" fill="currentColor" />
      </g>

      <text
        x="100"
        y="100"
        textAnchor="middle"
        fill="currentColor"
        fontFamily="ui-rounded, 'SF Pro Rounded', 'Avenir Next', -apple-system, system-ui, sans-serif"
        fontSize="17"
        fontWeight="500"
        letterSpacing="7"
      >
        FITNESS
      </text>
    </svg>
  );
}
