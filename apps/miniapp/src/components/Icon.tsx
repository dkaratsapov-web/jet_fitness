// Premium thin-line icon set (replaces emoji). Stroke uses currentColor, so
// color via text-* classes; size via the `size` prop. 24×24 grid, rounded.

export type IconName =
  | 'body'
  | 'watch'
  | 'flask'
  | 'pill'
  | 'dumbbell'
  | 'book'
  | 'video'
  | 'chat'
  | 'apple'
  | 'heart'
  | 'bell'
  | 'checkin'
  | 'activity';

const PATHS: Record<IconName, JSX.Element> = {
  // Body / measurements — person with a trend line.
  body: (
    <>
      <circle cx="9" cy="6" r="2.4" />
      <path d="M5 20v-1.5a4 4 0 0 1 4-4 4 4 0 0 1 3.2 1.6" />
      <path d="M14 20l2.5-3 2 1.6L22 14" />
    </>
  ),
  // Wearable watch.
  watch: (
    <>
      <rect x="7" y="6.5" width="10" height="11" rx="3" />
      <path d="M9.2 6.5 10 3.2h4l.8 3.3M9.2 17.5 10 20.8h4l.8-3.3" />
      <path d="M12 10v2.2l1.6 1" />
    </>
  ),
  // Lab flask.
  flask: (
    <>
      <path d="M9.5 3h5M10.5 3v6L5.6 17.4A1.4 1.4 0 0 0 6.8 19.6h10.4a1.4 1.4 0 0 0 1.2-2.2L13.5 9V3" />
      <path d="M8 14.5h8" />
    </>
  ),
  // Supplement capsule.
  pill: (
    <>
      <rect x="4.4" y="9.4" width="15.2" height="7.2" rx="3.6" transform="rotate(-45 12 13)" />
      <path d="M9.5 9.5 14.5 14.5" />
    </>
  ),
  // Dumbbell.
  dumbbell: (
    <>
      <path d="M3 12h18" />
      <path d="M6 8.5v7M8 10v4M16 10v4M18 8.5v7" />
    </>
  ),
  // Book / library.
  book: (
    <>
      <path d="M12 6.5v13" />
      <path d="M12 6.5C10.8 5.6 9.3 5 7.5 5H4v12.5h3.5c1.8 0 3.3.6 4.5 1.5" />
      <path d="M12 6.5C13.2 5.6 14.7 5 16.5 5H20v12.5h-3.5c-1.8 0-3.3.6-4.5 1.5" />
    </>
  ),
  // Video / technique.
  video: (
    <>
      <rect x="3.5" y="6" width="17" height="12" rx="2.5" />
      <path d="M10.5 9.3 15 12l-4.5 2.7z" />
    </>
  ),
  // Chat bubble.
  chat: (
    <>
      <path d="M4.5 6.5A1.5 1.5 0 0 1 6 5h12a1.5 1.5 0 0 1 1.5 1.5v7A1.5 1.5 0 0 1 18 15h-6l-4 3v-3H6a1.5 1.5 0 0 1-1.5-1.5z" />
    </>
  ),
  // Nutrition apple.
  apple: (
    <>
      <path d="M12 8c-1.5-2-5-2-6.2.6-1 2.2 0 6 2 8.4 1.4 1.7 3 1.6 4.2 1 1.2.6 2.8.7 4.2-1 2-2.4 3-6.2 2-8.4C17 6 13.5 6 12 8z" />
      <path d="M12 8c0-1.6.8-3 2.4-3.6" />
    </>
  ),
  // Heart / health.
  heart: (
    <path d="M12 20S4 15 4 9.2A3.8 3.8 0 0 1 12 7a3.8 3.8 0 0 1 8 2.2C20 15 12 20 12 20z" />
  ),
  bell: (
    <>
      <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.7 21a2 2 0 0 1-3.4 0" />
    </>
  ),
  // Check-in / self report.
  checkin: (
    <>
      <rect x="5" y="4.5" width="14" height="16" rx="2.2" />
      <path d="M8.5 9.5h7M8.5 13h7M8.5 16.5h4" />
    </>
  ),
  // Activity pulse.
  activity: <path d="M3 12h4l2.5-6 4 12L16 12h5" />,
};

export function Icon({
  name,
  size = 22,
  className = '',
  strokeWidth = 1.7,
}: {
  name: IconName;
  size?: number;
  className?: string;
  strokeWidth?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {PATHS[name]}
    </svg>
  );
}
