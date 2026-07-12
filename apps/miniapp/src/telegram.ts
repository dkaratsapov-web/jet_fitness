// Thin typed wrapper around the Telegram Mini Apps runtime
// (window.Telegram.WebApp, loaded via telegram-web-app.js in index.html).
//
// This is the source of the signed `initData` string that every API request
// carries (spec §6). When the app is opened outside Telegram (e.g. a plain
// browser during development), initData is empty — callers handle that case.

interface TelegramThemeParams {
  bg_color?: string;
  text_color?: string;
  hint_color?: string;
  link_color?: string;
  button_color?: string;
  button_text_color?: string;
  secondary_bg_color?: string;
}

interface TelegramWebApp {
  initData: string;
  colorScheme: 'light' | 'dark';
  themeParams: TelegramThemeParams;
  ready: () => void;
  expand: () => void;
  onEvent: (event: string, handler: () => void) => void;
  BackButton: { show: () => void; hide: () => void; onClick: (cb: () => void) => void };
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

export function getWebApp(): TelegramWebApp | null {
  return window.Telegram?.WebApp ?? null;
}

/** The signed initData string, or '' when opened outside Telegram. */
export function getInitData(): string {
  return getWebApp()?.initData ?? '';
}

/** Push Telegram theme params into CSS variables consumed by Tailwind. */
function applyTheme(wa: TelegramWebApp): void {
  const p = wa.themeParams;
  const root = document.documentElement.style;
  const set = (name: string, value: string | undefined) => {
    if (value) root.setProperty(name, value);
  };
  set('--tg-bg', p.bg_color);
  set('--tg-text', p.text_color);
  set('--tg-hint', p.hint_color);
  set('--tg-link', p.link_color);
  set('--tg-button', p.button_color);
  set('--tg-button-text', p.button_text_color);
  set('--tg-secondary-bg', p.secondary_bg_color);
}

/** Call once at startup: mark ready, expand, apply theme, wire theme changes. */
export function initTelegram(): void {
  const wa = getWebApp();
  if (!wa) return;
  wa.ready();
  wa.expand();
  applyTheme(wa);
  wa.onEvent('themeChanged', () => applyTheme(wa));
}
