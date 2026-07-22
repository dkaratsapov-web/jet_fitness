// App preloader — Olivia "living portrait" loop with the logo lockup and a
// thin gold progress ring. The video is fetched onto the deploy runner
// (brand/preloader.mp4); if it is missing we fall back to the still hero image,
// and if that is missing too, to the graphite gradient. Nothing ever breaks.

import { Logo } from './Logo';

const VIDEO = `${import.meta.env.BASE_URL}brand/preloader.mp4`;
const POSTER = `${import.meta.env.BASE_URL}brand/hero.png`;

export function Preloader() {
  return (
    <div className="fixed inset-0 overflow-hidden bg-brand-bg">
      <video
        className="absolute inset-0 w-full h-full object-cover"
        src={VIDEO}
        poster={POSTER}
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
      />
      {/* Graphite scrim so the logo + ring always read clearly */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(180deg, rgba(8,9,11,0.55) 0%, rgba(8,9,11,0.1) 40%, rgba(8,9,11,0.75) 100%)',
        }}
      />
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-1/3"
        style={{ background: 'radial-gradient(120% 90% at 50% 0%, rgba(201,169,106,0.22), transparent 70%)' }}
      />

      {/* Logo top */}
      <div className="absolute inset-x-0 top-0 flex justify-center pt-12 jf-rise">
        <Logo height={34} />
      </div>

      {/* Gold ring + caption bottom */}
      <div className="absolute inset-x-0 bottom-0 flex flex-col items-center pb-12 gap-3">
        <span className="jf-spin block w-9 h-9 rounded-full" aria-label="Загрузка" />
        <span className="text-brand-muted text-xs tracking-wide">Оливия готовит твой кабинет…</span>
      </div>
    </div>
  );
}
