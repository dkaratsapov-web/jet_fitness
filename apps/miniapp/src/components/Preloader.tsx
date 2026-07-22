// App preloader — Olivia "living portrait" loop with the logo lockup and a
// thin gold progress ring. The video is fetched onto the deploy runner
// (brand/preloader.mp4); if it is missing we fall back to the still hero image,
// and if that is missing too, to the graphite gradient. Nothing ever breaks.

import { Logo } from './Logo';
import { getFirstName } from '../telegram';

const VIDEO = `${import.meta.env.BASE_URL}brand/preloader.mp4`;
const POSTER = `${import.meta.env.BASE_URL}brand/hero.png`;

export function Preloader() {
  const name = getFirstName();
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

      {/* Greeting + gold ring bottom */}
      <div className="absolute inset-x-0 bottom-0 flex flex-col items-center pb-12 gap-3 px-6 text-center">
        <h2 className="text-2xl font-extrabold tracking-tight jf-rise jf-rise-1">
          {name ? (
            <>
              Привет, <span className="jf-shimmer">{name}</span>!
            </>
          ) : (
            <span className="jf-shimmer">Привет!</span>
          )}
        </h2>
        <span className="text-brand-muted text-sm -mt-1 jf-rise jf-rise-2">
          Оливия готовит твой кабинет…
        </span>
        <span className="jf-spin block w-8 h-8 rounded-full mt-1" aria-label="Загрузка" />
      </div>
    </div>
  );
}
