// First-run welcome / registration screen for brand-new users.
// Full-bleed cinematic hero (generated with Higgsfield) with the logo locked up
// top, a value proposition and the two entry CTAs over a graphite scrim.
// The hero asset is fetched onto the deploy runner (brand/hero.png); if it is
// missing, the graphite gradient stands in and nothing breaks.

import { Logo } from '../components/Logo';

const HERO = `${import.meta.env.BASE_URL}brand/hero.png`;

export function WelcomeScreen({
  onCoach,
  onClient,
  busy,
}: {
  onCoach: () => void;
  onClient: () => void;
  busy: boolean;
}) {
  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden">
      {/* Hero image */}
      <div
        aria-hidden
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: `url("${HERO}")` }}
      />
      {/* Legibility scrim: dark top band for the logo, deep fade at the bottom for text */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(180deg, rgba(8,9,11,0.72) 0%, rgba(8,9,11,0.05) 26%, rgba(8,9,11,0.15) 52%, rgba(8,9,11,0.82) 78%, #08090b 100%)',
        }}
      />
      {/* Warm champagne glow bleeding from the top, tying the photo to the brand */}
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-1/3"
        style={{
          background:
            'radial-gradient(120% 90% at 50% 0%, rgba(201,169,106,0.22), transparent 70%)',
        }}
      />

      {/* Top: logo lockup */}
      <header className="relative z-10 flex flex-col items-center pt-10 gap-2 jf-rise">
        <Logo height={38} />
        <span className="jf-eyebrow" style={{ color: 'rgba(224,197,141,0.9)' }}>
          Персональный фитнес в Telegram
        </span>
      </header>

      <div className="flex-1" />

      {/* Bottom: pitch + CTAs */}
      <div className="relative z-10 px-6 pb-9 flex flex-col gap-5">
        <div className="flex flex-col gap-2.5 jf-rise jf-rise-1">
          <h1 className="text-[30px] leading-[1.08] font-extrabold tracking-tight text-brand-text">
            Тренер, питание и
            <br />
            прогресс — <span className="jf-shimmer">в одном</span>
            <br />
            приложении
          </h1>
          <p className="text-brand-muted text-[15px] leading-relaxed max-w-[19rem]">
            Персональные программы, дневник питания, аналитика тела и живая связь
            с тренером. Всё для результата — без сотни разных приложений.
          </p>
        </div>

        <div className="flex flex-col gap-2.5 jf-rise jf-rise-2">
          <button
            className="rounded-2xl bg-brand-accent text-brand-onAccent p-4 font-semibold jf-press shadow-[0_10px_30px_-10px_rgba(201,169,106,0.7)] disabled:opacity-60"
            onClick={onCoach}
            disabled={busy}
          >
            {busy ? 'Создаём кабинет…' : 'Я тренер — создать кабинет'}
          </button>
          <button
            className="rounded-2xl bg-white/8 backdrop-blur-md border border-white/15 text-brand-text p-4 font-medium jf-press disabled:opacity-60"
            onClick={onClient}
            disabled={busy}
          >
            {busy ? 'Входим…' : 'Я клиент — войти'}
          </button>
          <p className="text-center text-brand-muted text-xs mt-1">
            Есть ссылка-приглашение от тренера? Просто открой её — попадёшь сразу
            в свой кабинет.
          </p>
        </div>
      </div>
    </div>
  );
}
