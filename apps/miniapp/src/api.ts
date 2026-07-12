// API client. Every request carries the Telegram initData in the
// Authorization header ("tma <initData>") so the server can validate it (§6).

import { getInitData } from './telegram';

const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? '';

export type AppRole = 'client' | 'coach' | 'admin';

export interface SessionUser {
  id: string;
  telegramId: string;
  username: string | null;
  firstName: string | null;
  timezone: string;
}

export interface SessionResponse {
  user: SessionUser;
  roles: AppRole[];
  isCoach: boolean;
  isClient: boolean;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public reason: string,
  ) {
    super(`API ${status}: ${reason}`);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const initData = getInitData();
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      authorization: `tma ${initData}`,
      ...(init?.headers ?? {}),
    },
  });

  if (!res.ok) {
    let reason = res.statusText;
    try {
      const body = (await res.json()) as { reason?: string; error?: string };
      reason = body.reason ?? body.error ?? reason;
    } catch {
      /* ignore */
    }
    throw new ApiError(res.status, reason);
  }

  return (await res.json()) as T;
}

export const api = {
  session: () => request<SessionResponse>('/api/auth/session', { method: 'POST' }),
  me: () => request<SessionResponse>('/api/me'),
};
