// Telegram Mini App `initData` validation (spec §6) — SECURITY CRITICAL.
//
// The Mini App receives a signed `initData` string from Telegram on launch and
// sends it with every API request. The server MUST validate it on each request:
//   - secret key = HMAC_SHA256("WebAppData", BOT_TOKEN)
//   - computed hash = HMAC_SHA256(secret, data_check_string)
//   - compare (constant-time) against the `hash` field
//   - reject if `auth_date` is older than the configured TTL
//
// NEVER trust a user id supplied in the request body — only the one parsed here
// from validated initData.

import { createHmac, timingSafeEqual } from 'node:crypto';

export interface TelegramUser {
  id: number;
  is_bot?: boolean;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: boolean;
  photo_url?: string;
}

export interface ValidatedInitData {
  user: TelegramUser;
  authDate: number;
  queryId?: string;
  startParam?: string;
  chatType?: string;
  raw: URLSearchParams;
}

export type InitDataResult =
  | { ok: true; data: ValidatedInitData }
  | { ok: false; error: InitDataError };

export type InitDataError =
  | 'missing'
  | 'malformed'
  | 'missing_hash'
  | 'bad_signature'
  | 'expired'
  | 'missing_user';

export interface ValidateOptions {
  botToken: string;
  /** Max age of the signature in seconds before it is rejected. */
  ttlSeconds: number;
  /** Injectable clock (seconds since epoch) for testing. Defaults to Date.now(). */
  now?: () => number;
}

/**
 * Validate a raw Telegram `initData` query string.
 * Returns a discriminated result so callers can map errors to HTTP codes.
 */
export function validateInitData(
  initData: string,
  opts: ValidateOptions,
): InitDataResult {
  if (!initData || typeof initData !== 'string') {
    return { ok: false, error: 'missing' };
  }

  let params: URLSearchParams;
  try {
    params = new URLSearchParams(initData);
  } catch {
    return { ok: false, error: 'malformed' };
  }

  const hash = params.get('hash');
  if (!hash) {
    return { ok: false, error: 'missing_hash' };
  }

  // Build the data-check-string: all fields except `hash`, sorted, joined by \n.
  const pairs: string[] = [];
  for (const [key, value] of params.entries()) {
    if (key === 'hash') continue;
    pairs.push(`${key}=${value}`);
  }
  pairs.sort();
  const dataCheckString = pairs.join('\n');

  const secretKey = createHmac('sha256', 'WebAppData').update(opts.botToken).digest();
  const computedHash = createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  if (!constantTimeEqualHex(computedHash, hash)) {
    return { ok: false, error: 'bad_signature' };
  }

  // Signature is valid — now check freshness.
  const authDate = Number(params.get('auth_date'));
  if (!Number.isFinite(authDate)) {
    return { ok: false, error: 'malformed' };
  }
  const nowSec = opts.now ? opts.now() : Math.floor(Date.now() / 1000);
  if (nowSec - authDate > opts.ttlSeconds) {
    return { ok: false, error: 'expired' };
  }

  const userRaw = params.get('user');
  if (!userRaw) {
    return { ok: false, error: 'missing_user' };
  }
  let user: TelegramUser;
  try {
    user = JSON.parse(userRaw) as TelegramUser;
  } catch {
    return { ok: false, error: 'malformed' };
  }
  if (typeof user.id !== 'number') {
    return { ok: false, error: 'missing_user' };
  }

  return {
    ok: true,
    data: {
      user,
      authDate,
      queryId: params.get('query_id') ?? undefined,
      startParam: params.get('start_param') ?? undefined,
      chatType: params.get('chat_type') ?? undefined,
      raw: params,
    },
  };
}

/** Constant-time comparison of two hex strings of equal expected length. */
function constantTimeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const bufA = Buffer.from(a, 'hex');
  const bufB = Buffer.from(b, 'hex');
  if (bufA.length !== bufB.length || bufA.length === 0) return false;
  return timingSafeEqual(bufA, bufB);
}
