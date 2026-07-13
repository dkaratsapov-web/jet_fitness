// API client. Every request carries the Telegram initData in the
// Authorization header ("tma <initData>") so the server can validate it (§6).

import { getInitData } from './telegram';

const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? '';

export type AppRole = 'client' | 'coach' | 'owner';

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
  isOwner: boolean;
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

export interface CoachClient {
  id: string;
  firstName: string | null;
  username: string | null;
  status: 'pending' | 'active' | 'paused' | 'ended';
  startedAt: string | null;
  goal: string | null;
}

export interface Invite {
  token: string;
  deepLink: string | null;
  expiresAt: string;
}

export interface CoachDashboard {
  totalClients: number;
  activeClients: number;
  pendingInvites: number;
}

export interface ExerciseLite {
  id: string;
  name: string;
  muscleGroup: string | null;
  videoUrl?: string | null;
  custom: boolean;
}

export interface ProgramSummary {
  id: string;
  name: string;
  description: string | null;
  isTemplate: boolean;
  dayCount: number;
  assignmentCount: number;
  updatedAt: string;
}

// Shape sent to POST /coach/programs.
export interface ProgramDraftExercise {
  exerciseId: string;
  sets?: number | null;
  reps?: string | null;
  weight?: string | null;
  restSec?: number | null;
  notes?: string | null;
}
export interface ProgramDraftDay {
  title?: string | null;
  exercises: ProgramDraftExercise[];
}
export interface ProgramDraft {
  name: string;
  description?: string | null;
  days: ProgramDraftDay[];
}

// Shape returned for a client's active program.
export interface ClientProgramExercise {
  id: string;
  name: string;
  muscleGroup: string | null;
  videoUrl: string | null;
  sets: number | null;
  reps: string | null;
  weight: string | null;
  restSec: number | null;
  tempo: string | null;
  notes: string | null;
}
export interface ClientProgramDay {
  id: string;
  order: number;
  title: string | null;
  exercises: ClientProgramExercise[];
}
export interface ClientProgram {
  id: string;
  name: string;
  description: string | null;
  startDate: string;
  days: ClientProgramDay[];
}

// One logged set sent to POST /client/workouts.
export interface WorkoutSetInput {
  programExerciseId: string;
  setNumber: number;
  actualReps?: number | null;
  actualWeight?: number | null;
  rpe?: number | null;
}

export interface WorkoutSummary {
  id: string;
  date: string;
  completedAt: string | null;
  dayTitle: string | null;
  setCount: number;
  exerciseCount: number;
  totalVolume: number;
}

export interface ProgressEntry {
  id: string;
  date: string;
  weightKg: number | null;
  bodyFatPct: number | null;
  measurements: Record<string, number> | null;
}

export interface ProgressInput {
  weightKg?: number | null;
  bodyFatPct?: number | null;
  measurements?: Record<string, number> | null;
}

export const api = {
  session: () => request<SessionResponse>('/api/auth/session', { method: 'POST' }),
  me: () => request<SessionResponse>('/api/me'),

  // Client (Phase 1) — self sign-up without an invite.
  registerClient: () =>
    request<{ ok: boolean }>('/api/client/register', { method: 'POST' }),

  // Coach (Phase 1)
  registerCoach: () =>
    request<{ ok: boolean }>('/api/coach/register', { method: 'POST' }),
  coachClients: () => request<CoachClient[]>('/api/coach/clients'),
  coachDashboard: () => request<CoachDashboard>('/api/coach/dashboard'),
  createInvite: () => request<Invite>('/api/coach/invites', { method: 'POST' }),

  // Programs (Phase 1)
  exercises: () => request<ExerciseLite[]>('/api/coach/exercises'),
  createExercise: (body: { name: string; muscleGroup?: string }) =>
    request<ExerciseLite>('/api/coach/exercises', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  programs: () => request<ProgramSummary[]>('/api/coach/programs'),
  createProgram: (draft: ProgramDraft) =>
    request<{ id: string; ok: boolean }>('/api/coach/programs', {
      method: 'POST',
      body: JSON.stringify(draft),
    }),
  deleteProgram: (id: string) =>
    request<{ ok: boolean }>(`/api/coach/programs/${id}`, { method: 'DELETE' }),
  assignProgram: (id: string, clientId: string) =>
    request<{ ok: boolean; assignmentId: string }>(`/api/coach/programs/${id}/assign`, {
      method: 'POST',
      body: JSON.stringify({ clientId }),
    }),
  coachClientWorkouts: (clientId: string) =>
    request<WorkoutSummary[]>(`/api/coach/clients/${clientId}/workouts`),
  coachClientProgress: (clientId: string) =>
    request<ProgressEntry[]>(`/api/coach/clients/${clientId}/progress`),

  // Client (Phase 1)
  clientProgram: () => request<{ program: ClientProgram | null }>('/api/client/program'),
  logWorkout: (programDayId: string, sets: WorkoutSetInput[]) =>
    request<{ ok: boolean; workoutId: string; date: string }>('/api/client/workouts', {
      method: 'POST',
      body: JSON.stringify({ programDayId, sets }),
    }),
  clientWorkouts: () => request<WorkoutSummary[]>('/api/client/workouts'),
  addProgress: (body: ProgressInput) =>
    request<{ ok: boolean; id: string }>('/api/client/progress', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  clientProgress: () => request<ProgressEntry[]>('/api/client/progress'),
};
