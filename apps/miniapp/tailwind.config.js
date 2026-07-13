/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Legacy tokens — remapped to the Jet Fitness brand palette in index.css.
        tg: {
          bg: 'var(--tg-bg)',
          text: 'var(--tg-text)',
          hint: 'var(--tg-hint)',
          link: 'var(--tg-link)',
          button: 'var(--tg-button)',
          buttonText: 'var(--tg-button-text)',
          secondaryBg: 'var(--tg-secondary-bg)',
        },
        // Brand tokens (Graphite + Champagne Gold).
        brand: {
          bg: 'var(--bg)',
          surface: 'var(--surface)',
          surface2: 'var(--surface-2)',
          text: 'var(--text)',
          muted: 'var(--muted)',
          accent: 'var(--accent)',
          accentStrong: 'var(--accent-strong)',
          onAccent: 'var(--on-accent)',
          pos: 'var(--pos)',
          neg: 'var(--neg)',
        },
      },
      borderColor: {
        line: 'var(--line)',
      },
      boxShadow: {
        card: '0 1px 2px rgba(0,0,0,0.4), 0 8px 24px -12px rgba(0,0,0,0.5)',
      },
      borderRadius: {
        '4xl': '1.75rem',
      },
    },
  },
  plugins: [],
};
