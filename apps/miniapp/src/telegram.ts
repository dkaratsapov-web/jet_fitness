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

/*
 * Jet Fitness uses its own fixed premium palette (Graphite + Champagne Gold),
 * so we do NOT adopt Telegram's theme colors. We only follow the light/dark
 * *scheme* — dark is the primary brand look, so we default to dark and switch
 * to the light variant only when Telegram reports a light scheme.
 */
function applyScheme(wa: TelegramWebApp): void {
  const scheme = wa.colorScheme === 'light' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', scheme);
}

/** Call once at startup: mark ready, expand, set brand scheme, wire changes. */
export function initTelegram(): void {
  document.documentElement.setAttribute('data-theme', 'dark');
  const wa = getWebApp();
  if (!wa) return;
  wa.ready();
  wa.expand();
  applyScheme(wa);
  wa.onEvent('themeChanged', () => applyScheme(wa));
}
