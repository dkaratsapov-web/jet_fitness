// Shared role/context types (spec §2). A single Telegram account may be both a
// coach and a client; the active role is decided by login context, not stored
// as a single fixed attribute on the user.

export type AppRole = 'client' | 'coach' | 'admin';

export interface SessionUser {
  id: string;
  telegramId: string; // BigInt serialized as string for JSON safety
  username: string | null;
  firstName: string | null;
  timezone: string;
}

export interface SessionResponse {
  user: SessionUser;
  roles: AppRole[];
  /** Whether this account has a coach profile. */
  isCoach: boolean;
  /** Whether this account has (or just became) a client of some coach. */
  isClient: boolean;
}

/** Parse a deep-link start param, e.g. "invite_ab12cd" => { kind, token }. */
export function parseStartParam(
  startParam: string | undefined | null,
): { kind: 'invite'; token: string } | null {
  if (!startParam) return null;
  const invitePrefix = 'invite_';
  if (startParam.startsWith(invitePrefix)) {
    const token = startParam.slice(invitePrefix.length);
    if (token) return { kind: 'invite', token };
  }
  return null;
}
