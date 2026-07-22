// Shared role/context types (spec §2). A single Telegram account may be both a
// coach and a client; the active role is decided by login context, not stored
// as a single fixed attribute on the user.

// 'owner' is the platform owner/operator (spec §2 admin): sees the whole
// platform, distinct from coaches and clients.
export type AppRole = 'client' | 'coach' | 'owner';

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
  /** Platform owner/operator. */
  isOwner: boolean;
  /** Whether this account has a coach profile. */
  isCoach: boolean;
  /** Whether this account has (or just became) a client of some coach. */
  isClient: boolean;
}

/**
 * Parse a deep-link start param.
 *   "invite_ab12cd" => coach→client invite
 *   "coach_ab12cd"  => owner→coach onboarding invite
 */
export function parseStartParam(
  startParam: string | undefined | null,
): { kind: 'invite' | 'coach_invite'; token: string } | null {
  if (!startParam) return null;
  const invitePrefix = 'invite_';
  if (startParam.startsWith(invitePrefix)) {
    const token = startParam.slice(invitePrefix.length);
    if (token) return { kind: 'invite', token };
  }
  const coachPrefix = 'coach_';
  if (startParam.startsWith(coachPrefix)) {
    const token = startParam.slice(coachPrefix.length);
    if (token) return { kind: 'coach_invite', token };
  }
  return null;
}
