// App preloader — Olivia "living portrait" loop with the logo lockup and a
// thin gold progress ring. The video is fetched onto the deploy runner
// (brand/preloader.mp4); if it is missing we fall back to the still hero image,
// and if that is missing too, to the graphite gradient. Nothing ever breaks.

import { useState } from 'react';
import { Logo } from './Logo';
import { getFirstName } from '../telegram';

// Rotating preloaders: several location clips (gym, women's studio, functional,
// cardio-sunrise, rooftop) shown in turn on each open. Files are fetched onto
// the deploy runner as brand/preloader-{n}.mp4 (+ .png poster). Missing files
// fall back to the poster, then the graphite gradient — nothing breaks.
const PRELOADER_COUNT = 5;

function pickIndex(): number {
  try {
    const n = Number(localStorage.getItem('jf.preloader.i')) || 0;
    localStorage.setItem('jf.preloader.i', String(n + 1));
    return (n % PRELOADER_COUNT) + 1;
  } catch {
    return 1;
  }
}

export function Preloader() {
  const name = getFirstName();
  const [idx] = useState(pickIndex);
  const base = import.meta.env.BASE_URL;
  const VIDEO = `${base}brand/preloader-${idx}.mp4`;
  const POSTER = `${base}brand/preloader-${idx}.png`;
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
