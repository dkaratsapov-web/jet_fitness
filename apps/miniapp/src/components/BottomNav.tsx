// Client bottom tab-bar (Дом · Питание · Прогресс · Профиль). Fixed to the
// bottom, blurred graphite bar with a gold active tab.

export type ClientTab = 'home' | 'nutrition' | 'progress' | 'profile';

const TABS: Array<{ key: ClientTab; label: string; icon: JSX.Element }> = [
  {
    key: 'home',
    label: 'Дом',
    icon: (
      <svg viewBox="0 0 24 24">
        <path d="M3 10.5 12 3l9 7.5" />
        <path d="M5 9.5V21h14V9.5" />
      </svg>
    ),
  },
  {
    key: 'nutrition',
    label: 'Питание',
    icon: (
      <svg viewBox="0 0 24 24">
        <path d="M12 21c4-3 7-6.5 7-10a7 7 0 0 0-14 0c0 3.5 3 7 7 10Z" />
        <path d="M12 8v5" />
      </svg>
    ),
  },
  {
    key: 'progress',
    label: 'Прогресс',
    icon: (
      <svg viewBox="0 0 24 24">
        <path d="M4 19V5" />
        <path d="M4 15l5-4 4 3 7-7" />
      </svg>
    ),
  },
  {
    key: 'profile',
    label: 'Профиль',
    icon: (
      <svg viewBox="0 0 24 24">
        <circle cx="12" cy="8" r="3.5" />
        <path d="M5 20c1.5-4 12.5-4 14 0" />
      </svg>
    ),
  },
];

export function BottomNav({
  tab,
  onTab,
  unread,
}: {
  tab: ClientTab;
  onTab: (t: ClientTab) => void;
  unread?: number;
}) {
  return (
    <nav className="fixed bottom-0 inset-x-0 z-30 grid grid-cols-4 bg-[rgba(10,11,13,0.82)] backdrop-blur-md border-t border-line px-2 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))]">
      {TABS.map((t) => {
        const on = t.key === tab;
        return (
          <button
            key={t.key}
            onClick={() => onTab(t.key)}
            className={`relative flex flex-col items-center gap-1 py-1 text-[10.5px] font-semibold transition-colors ${
              on ? 'text-brand-accent' : 'text-brand-muted'
            }`}
          >
            <span className="w-6 h-6 [&_svg]:w-6 [&_svg]:h-6 [&_svg]:fill-none [&_svg]:stroke-current [&_svg]:[stroke-width:1.7] [&_svg]:[stroke-linecap:round] [&_svg]:[stroke-linejoin:round]">
              {t.icon}
            </span>
            {t.label}
            {t.key === 'home' && unread ? (
              <span className="absolute top-0 right-[26%] min-w-4 h-4 px-1 rounded-full bg-brand-accent text-brand-onAccent text-[9px] font-bold flex items-center justify-center">
                {unread}
              </span>
            ) : null}
          </button>
        );
      })}
    </nav>
  );
}
