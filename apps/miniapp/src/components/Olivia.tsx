// Olivia — the Jet Fitness brand mascot & in-app assistant.
// One consistent face across the app: preloader, welcome hero, and these
// contextual tip bubbles. Persona: warm, motivating, speaks on "ты", short.

import { useEffect, useState, type ReactNode } from 'react';

const AVATAR = `${import.meta.env.BASE_URL}brand/olivia.png`;

/** Round avatar. Falls back to a gold "О" disc if the asset is missing. */
export function OliviaAvatar({ size = 40, ring = true }: { size?: number; ring?: boolean }) {
  const [ok, setOk] = useState(true);
  return (
    <span
      className="relative inline-grid place-items-center rounded-full shrink-0 overflow-hidden"
      style={{
        width: size,
        height: size,
        background: 'linear-gradient(140deg,var(--accent-strong),var(--accent))',
        boxShadow: ring ? '0 0 0 2px var(--bg), 0 0 0 3.5px color-mix(in srgb, var(--accent) 55%, transparent)' : undefined,
      }}
    >
      {ok ? (
        <img
          src={AVATAR}
          alt="Оливия"
          className="w-full h-full object-cover"
          style={{ objectPosition: 'center top' }}
          onError={() => setOk(false)}
        />
      ) : (
        <span className="font-extrabold text-brand-onAccent" style={{ fontSize: size * 0.44 }}>
          О
        </span>
      )}
    </span>
  );
}

const seenKey = (id: string) => `jf.olivia.seen.${id}`;

/** True once, then remembers dismissal. */
function useOliviaSeen(id: string): [boolean, () => void] {
  const [dismissed, setDismissed] = useState(true);
  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(seenKey(id)) === '1');
    } catch {
      setDismissed(false);
    }
  }, [id]);
  const dismiss = () => {
    try {
      localStorage.setItem(seenKey(id), '1');
    } catch {
      /* ignore */
    }
    setDismissed(true);
  };
  return [dismissed, dismiss];
}

/**
 * A dismissible tip from Olivia. Renders nothing once dismissed (per `id`).
 * Use for onboarding hints on key screens — one per context, never spammy.
 */
export function OliviaTip({
  id,
  children,
  cta,
  onCta,
}: {
  id: string;
  children: ReactNode;
  cta?: string;
  onCta?: () => void;
}) {
  const [dismissed, dismiss] = useOliviaSeen(id);
  if (dismissed) return null;
  return (
    <div
      className="jf-rise relative rounded-2xl p-3 flex gap-3 items-start"
      style={{
        background:
          'linear-gradient(180deg, var(--energy-soft), transparent 70%), var(--surface)',
        border: '1px solid color-mix(in srgb, var(--energy) 28%, transparent)',
      }}
    >
      <OliviaAvatar size={38} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          <span className="text-[13px] font-bold">Оливия</span>
          <span className="jf-live" />
        </div>
        <p className="text-[13px] text-brand-text leading-snug">{children}</p>
        {cta && (
          <button
            className="mt-2 text-[13px] font-semibold text-brand-energy"
            onClick={() => {
              onCta?.();
              dismiss();
            }}
          >
            {cta} →
          </button>
        )}
      </div>
      <button
        className="text-brand-muted text-base leading-none -mt-0.5 px-1"
        onClick={dismiss}
        aria-label="Скрыть"
      >
        ✕
      </button>
    </div>
  );
}

/**
 * Floating Olivia assistant button — always reachable above the tab bar on
 * every client screen. This is the app's "assistant is always here" anchor.
 */
export function OliviaFab({ onClick }: { onClick: () => void }) {
  const [hidden, setHidden] = useState(false);

  // Auto-hide while scrolling down (so it never sits on top of content the user
  // is reading), reappear when scrolling stops / up.
  useEffect(() => {
    let last = window.scrollY;
    let t: ReturnType<typeof setTimeout>;
    const onScroll = () => {
      const y = window.scrollY;
      if (y > last + 6) setHidden(true);
      else if (y < last - 6) setHidden(false);
      last = y;
      clearTimeout(t);
      t = setTimeout(() => setHidden(false), 700);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      clearTimeout(t);
    };
  }, []);

  return (
    <button
      onClick={onClick}
      aria-label="Оливия — помощник"
      className="fixed right-3.5 bottom-[5.5rem] z-40 rounded-full jf-press transition-all duration-300"
      style={{
        opacity: hidden ? 0 : 1,
        transform: hidden ? 'translateY(12px) scale(0.9)' : 'none',
        pointerEvents: hidden ? 'none' : 'auto',
        boxShadow: '0 8px 22px -8px rgba(0,0,0,0.85)',
      }}
    >
      <span className="relative block">
        <OliviaAvatar size={46} />
        <span className="absolute top-0 right-0 jf-live" />
      </span>
    </button>
  );
}

/**
 * A one-line inline nudge from Olivia (no dismiss) — for empty states etc.
 */
export function OliviaSays({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 text-[13px] text-brand-muted">
      <OliviaAvatar size={30} ring={false} />
      <span className="leading-snug">{children}</span>
    </div>
  );
}
