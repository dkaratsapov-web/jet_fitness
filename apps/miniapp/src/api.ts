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

export type Sex = 'male' | 'female' | 'other';

export interface ClientProfile {
  goal: string | null;
  sex: Sex | null;
  heightCm: number | null;
  birthDate: string | null;
  filled: boolean;
}

export interface FormVideoComment {
  id: string;
  body: string;
  createdAt: string;
}

export interface FormVideo {
  id: string;
  createdAt: string;
  exerciseName: string | null;
  viewUrl: string | null;
  comments: FormVideoComment[];
}

export type PhotoType = 'front' | 'side' | 'back';

export interface ProgressPhoto {
  id: string;
  date: string;
  type: PhotoType;
  viewUrl: string | null;
}

export interface Checkin {
  id: string;
  date: string;
  weightKg: number | null;
  sleepQuality: number | null;
  energy: number | null;
  adherencePct: number | null;
  mood: number | null;
  comment: string | null;
  coachReply: string | null;
  coachRepliedAt: string | null;
}

export interface CheckinInput {
  weightKg?: number | null;
  sleepQuality?: number | null;
  energy?: number | null;
  adherencePct?: number | null;
  mood?: number | null;
  comment?: string | null;
}

export interface Subscription {
  id: string;
  clientId: string;
  clientName: string;
  planName: string;
  amount: number;
  periodDays: number;
  status: 'active' | 'past_due' | 'canceled';
  currentPeriodEnd: string | null;
  paidTotal: number;
  paymentsCount: number;
}

export interface CoachRevenue {
  gross: number;
  thisMonth: number;
  commission: number;
  net: number;
  paymentsCount: number;
  feePercent: number;
}

export interface OwnerRevenue extends CoachRevenue {
  coachesCount: number;
  perCoach: Array<{ coachId: string; coachName: string; gross: number; commission: number }>;
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
  coachClientPhotos: (clientId: string) =>
    request<ProgressPhoto[]>(`/api/coach/clients/${clientId}/progress-photos`),
  coachClientVideos: (clientId: string) =>
    request<FormVideo[]>(`/api/coach/clients/${clientId}/form-videos`),
  commentVideo: (videoId: string, body: string) =>
    request<{ ok: boolean }>(`/api/coach/form-videos/${videoId}/comments`, {
      method: 'POST',
      body: JSON.stringify({ body }),
    }),
  coachClientCheckins: (clientId: string) =>
    request<Checkin[]>(`/api/coach/clients/${clientId}/checkins`),
  replyCheckin: (checkinId: string, reply: string) =>
    request<{ ok: boolean }>(`/api/coach/checkins/${checkinId}/reply`, {
      method: 'POST',
      body: JSON.stringify({ reply }),
    }),

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
  clientPhotos: () => request<ProgressPhoto[]>('/api/client/progress-photos'),
  clientProfile: () => request<ClientProfile>('/api/client/profile'),
  updateProfile: (body: { goal?: string; sex?: Sex; heightCm?: number; birthDate?: string }) =>
    request<{ ok: boolean }>('/api/client/profile', {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  clientVideos: () => request<FormVideo[]>('/api/client/form-videos'),
  uploadFormVideo: async (file: File) => {
    const ext = (file.name.split('.').pop() ?? 'mp4').toLowerCase();
    const { uploadUrl, fileKey } = await request<{ uploadUrl: string; fileKey: string }>(
      '/api/client/form-videos/presign',
      { method: 'POST', body: JSON.stringify({ ext }) },
    );
    const put = await fetch(uploadUrl, {
      method: 'PUT',
      body: file,
      headers: { 'content-type': file.type || 'application/octet-stream' },
    });
    if (!put.ok) throw new Error(`upload failed: ${put.status}`);
    return request<{ ok: boolean; id: string }>('/api/client/form-videos', {
      method: 'POST',
      body: JSON.stringify({ fileKey }),
    });
  },
  // Upload flow: presign → PUT the file straight to storage → confirm.
  uploadProgressPhoto: async (type: PhotoType, file: File) => {
    const ext = (file.name.split('.').pop() ?? 'jpg').toLowerCase();
    const { uploadUrl, fileKey } = await request<{ uploadUrl: string; fileKey: string }>(
      '/api/client/progress-photos/presign',
      { method: 'POST', body: JSON.stringify({ type, ext }) },
    );
    const put = await fetch(uploadUrl, {
      method: 'PUT',
      body: file,
      headers: { 'content-type': file.type || 'application/octet-stream' },
    });
    if (!put.ok) throw new Error(`upload failed: ${put.status}`);
    return request<{ ok: boolean; id: string }>('/api/client/progress-photos', {
      method: 'POST',
      body: JSON.stringify({ type, fileKey }),
    });
  },
  addCheckin: (body: CheckinInput) =>
    request<{ ok: boolean; id: string }>('/api/client/checkins', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  clientCheckins: () => request<Checkin[]>('/api/client/checkins'),

  // Payments (Phase 1)
  coachSubscriptions: () => request<Subscription[]>('/api/coach/subscriptions'),
  createSubscription: (
    clientId: string,
    body: { planName: string; amount: number; periodDays: number },
  ) =>
    request<{ ok: boolean; id: string }>(`/api/coach/clients/${clientId}/subscriptions`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  recordPayment: (subscriptionId: string, amount?: number) =>
    request<{ ok: boolean; amount: number; commission: number }>(
      `/api/coach/subscriptions/${subscriptionId}/payments`,
      { method: 'POST', body: JSON.stringify(amount != null ? { amount } : {}) },
    ),
  cancelSubscription: (subscriptionId: string) =>
    request<{ ok: boolean }>(`/api/coach/subscriptions/${subscriptionId}/cancel`, {
      method: 'POST',
    }),
  coachRevenue: () => request<CoachRevenue>('/api/coach/revenue'),
  ownerRevenue: () => request<OwnerRevenue>('/api/owner/revenue'),
};
