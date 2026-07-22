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
  initDataUnsafe?: { user?: { first_name?: string; username?: string } };
  colorScheme: 'light' | 'dark';
  themeParams: TelegramThemeParams;
  ready: () => void;
  expand: () => void;
  onEvent: (event: string, handler: () => void) => void;
  BackButton: { show: () => void; hide: () => void; onClick: (cb: () => void) => void };
  showScanQrPopup?: (
    params: { text?: string },
    callback?: (text: string) => boolean | void,
  ) => void;
  closeScanQrPopup?: () => void;
  HapticFeedback?: {
    impactOccurred?: (style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft') => void;
    notificationOccurred?: (type: 'error' | 'success' | 'warning') => void;
    selectionChanged?: () => void;
  };
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

/** The user's Telegram first name — available instantly (before our session
 * loads), so the preloader can greet by name. Empty outside Telegram. */
export function getFirstName(): string {
  return getWebApp()?.initDataUnsafe?.user?.first_name?.trim() ?? '';
}

/** Light haptic feedback; no-op outside Telegram. */
export function haptic(type: 'success' | 'error' | 'warning' | 'tap' = 'tap'): void {
  const h = getWebApp()?.HapticFeedback;
  if (!h) return;
  if (type === 'tap') h.impactOccurred?.('light');
  else h.notificationOccurred?.(type);
}

/**
 * Scan a barcode/QR via Telegram's native scanner. Resolves with the decoded
 * string (digits for product barcodes) or null if closed/unsupported. Falls
 * back to a manual prompt when the native scanner isn't available.
 */
export function scanBarcode(): Promise<string | null> {
  const wa = getWebApp();
  if (!wa?.showScanQrPopup) {
    const manual = window.prompt('Введите штрихкод (цифры с упаковки)');
    return Promise.resolve(manual ? manual.replace(/[^0-9]/g, '') : null);
  }
  return new Promise((resolve) => {
    let done = false;
    wa.showScanQrPopup!({ text: 'Наведите на штрихкод продукта' }, (text) => {
      const digits = (text || '').replace(/[^0-9]/g, '');
      // Product barcodes are 8–14 digits; ignore anything else and keep scanning.
      if (digits.length >= 8 && digits.length <= 14) {
        done = true;
        wa.closeScanQrPopup?.();
        resolve(digits);
        return true;
      }
      return false;
    });
    // If the user closes the popup without a valid scan.
    wa.onEvent('scanQrPopupClosed', () => {
      if (!done) resolve(null);
    });
  });
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
