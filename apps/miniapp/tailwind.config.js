/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Bound to Telegram theme params (set as CSS vars in telegram.ts).
        tg: {
          bg: 'var(--tg-bg)',
          text: 'var(--tg-text)',
          hint: 'var(--tg-hint)',
          link: 'var(--tg-link)',
          button: 'var(--tg-button)',
          buttonText: 'var(--tg-button-text)',
          secondaryBg: 'var(--tg-secondary-bg)',
        },
      },
    },
  },
  plugins: [],
};
