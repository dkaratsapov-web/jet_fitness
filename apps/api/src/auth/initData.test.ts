// Tests for initData validation (spec §6, §11: auth coverage is mandatory).

import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import { validateInitData } from '@jet/shared';

const BOT_TOKEN = '123456:TEST_BOT_TOKEN';

/** Build a correctly-signed initData string for tests. */
function signInitData(
  fields: Record<string, string>,
  botToken = BOT_TOKEN,
): string {
  const pairs = Object.entries(fields)
    .map(([k, v]) => `${k}=${v}`)
    .sort();
  const dataCheckString = pairs.join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const hash = createHmac('sha256', secret).update(dataCheckString).digest('hex');

  const params = new URLSearchParams(fields);
  params.set('hash', hash);
  return params.toString();
}

const nowSec = 1_700_000_000;
const clock = () => nowSec;

const validUser = JSON.stringify({ id: 42, first_name: 'Alex', username: 'alex' });

describe('validateInitData', () => {
  it('accepts a correctly signed, fresh payload', () => {
    const initData = signInitData({
      user: validUser,
      auth_date: String(nowSec - 10),
    });
    const res = validateInitData(initData, {
      botToken: BOT_TOKEN,
      ttlSeconds: 86400,
      now: clock,
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.user.id).toBe(42);
      expect(res.data.user.username).toBe('alex');
    }
  });

  it('extracts start_param for invite deep-links', () => {
    const initData = signInitData({
      user: validUser,
      auth_date: String(nowSec - 10),
      start_param: 'invite_abc123',
    });
    const res = validateInitData(initData, {
      botToken: BOT_TOKEN,
      ttlSeconds: 86400,
      now: clock,
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.startParam).toBe('invite_abc123');
  });

  it('rejects a tampered payload (bad signature)', () => {
    const initData = signInitData({
      user: validUser,
      auth_date: String(nowSec - 10),
    });
    // Flip the user id after signing.
    const tampered = initData.replace('%22id%22%3A42', '%22id%22%3A99');
    const res = validateInitData(tampered, {
      botToken: BOT_TOKEN,
      ttlSeconds: 86400,
      now: clock,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe('bad_signature');
  });

  it('rejects a payload signed with the wrong bot token', () => {
    const initData = signInitData(
      { user: validUser, auth_date: String(nowSec - 10) },
      'wrong:TOKEN',
    );
    const res = validateInitData(initData, {
      botToken: BOT_TOKEN,
      ttlSeconds: 86400,
      now: clock,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe('bad_signature');
  });

  it('rejects an expired payload', () => {
    const initData = signInitData({
      user: validUser,
      auth_date: String(nowSec - 90_000), // older than TTL
    });
    const res = validateInitData(initData, {
      botToken: BOT_TOKEN,
      ttlSeconds: 86400,
      now: clock,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe('expired');
  });

  it('rejects when hash is missing', () => {
    const params = new URLSearchParams({
      user: validUser,
      auth_date: String(nowSec),
    });
    const res = validateInitData(params.toString(), {
      botToken: BOT_TOKEN,
      ttlSeconds: 86400,
      now: clock,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe('missing_hash');
  });

  it('rejects empty input', () => {
    const res = validateInitData('', {
      botToken: BOT_TOKEN,
      ttlSeconds: 86400,
      now: clock,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe('missing');
  });
});
