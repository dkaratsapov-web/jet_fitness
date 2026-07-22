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

export interface CoachClientDetail {
  id: string;
  firstName: string | null;
  username: string | null;
  status: CoachClient['status'];
  startedAt: string | null;
  profile: ClientProfile | null;
}

export interface MealPlanItem {
  id: string;
  mealType: MealType;
  title: string;
  grams: number | null;
  kcal: number | null;
  protein: number | null;
  fat: number | null;
  carbs: number | null;
  done: boolean;
  photoUrl: string | null;
}
export interface MealPlan {
  id: string;
  date: string;
  note: string | null;
  items: MealPlanItem[];
}
export interface MealPlanDraftItem {
  mealType: MealType;
  title: string;
  grams?: number | null;
  kcal?: number | null;
  protein?: number | null;
  fat?: number | null;
  carbs?: number | null;
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

export interface CoachOverview {
  clients: { total: number; active: number; pendingInvites: number };
  business: { monthRevenue: number; activeSubscriptions: number };
  activity: { weekWorkouts: number; unansweredCheckins: number };
  attention: Array<{ id: string; name: string; reason: string }>;
}

export interface ExerciseLite {
  id: string;
  name: string;
  muscleGroup: string | null;
  videoUrl?: string | null;
  hasVideo?: boolean;
  technique?: string | null;
  recommendations?: string | null;
  precautions?: string | null;
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
  tempo?: string | null;
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

// Full program (coach edit view).
export interface ProgramDetail {
  id: string;
  name: string;
  description: string | null;
  isTemplate: boolean;
  days: Array<{
    id: string;
    order: number;
    title: string | null;
    exercises: Array<{
      id: string;
      exerciseId: string;
      name: string;
      muscleGroup: string | null;
      order: number;
      sets: number | null;
      reps: string | null;
      weight: string | null;
      restSec: number | null;
      tempo: string | null;
      notes: string | null;
    }>;
  }>;
}

// Shape returned for a client's active program.
export interface ClientProgramExercise {
  id: string;
  name: string;
  muscleGroup: string | null;
  videoUrl: string | null;
  technique?: string | null;
  recommendations?: string | null;
  precautions?: string | null;
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

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export interface Macros {
  kcal: number;
  protein: number;
  fat: number;
  carbs: number;
  /** present on nutrition targets: 'coach' or 'auto' (self-computed, solo mode) */
  source?: 'coach' | 'auto';
}

export interface NutritionMeal {
  id: string;
  mealType: MealType;
  name: string;
  grams: number;
  kcal: number;
  protein: number;
  fat: number;
  carbs: number;
}

export interface NutritionDay {
  date: string;
  target: Macros | null;
  totals: Macros;
  meals: NutritionMeal[];
}

export interface NutritionWeek {
  target: Macros | null;
  days: Array<{ date: string; kcal: number; protein: number; fat: number; carbs: number }>;
  averages: Macros;
  loggedDays: number;
}

export interface NutritionStats {
  days: Array<{ date: string; kcal: number; protein: number; fat: number; carbs: number }>;
  averages: Macros;
  loggedDays: number;
  totalDays: number;
  adherencePct: number;
  insights: string[];
}

export interface FoodSearchItem {
  id: string;
  name: string;
  barcode: string | null;
  per100: Macros;
}

export interface HealthStatus {
  moduleEnabled: boolean;
  consentGiven: boolean;
}

export interface LabResult {
  id: string;
  date: string;
  marker: string;
  value: number;
  unit: string | null;
  refLow: number | null;
  refHigh: number | null;
}

// A recognized / editable lab marker before saving.
export interface LabMarkerDraft {
  marker: string;
  value: number;
  unit: string | null;
  refLow: number | null;
  refHigh: number | null;
}

export interface Supplement {
  id: string;
  name: string;
  dose: string | null;
  amount: string | null;
  schedule: unknown;
  remindersOn: boolean;
  createdAt: string;
  takenToday: number;
  intakeDays: string[]; // YYYY-MM-DD days (up to 1y) with ≥1 intake
}

export type ActivityType =
  | 'strength'
  | 'cardio'
  | 'run'
  | 'walk'
  | 'cycle'
  | 'swim'
  | 'other';

export interface ActivityExercise {
  name: string;
  sets?: number;
  reps?: string;
  weight?: string;
}

export interface DailyMetric {
  date: string;
  steps: number | null;
  restingPulse: number | null;
  sleepMin: number | null;
  activeKcal: number | null;
}

export interface ActivityLog {
  id: string;
  date: string;
  type: ActivityType;
  title: string;
  durationMin: number | null;
  distanceKm: number | null;
  calories: number | null;
  notes: string | null;
  exercises: ActivityExercise[] | null;
}

export type ChallengeType = 'steps' | 'workouts' | 'weight' | 'custom';

export interface LeaderRow {
  rank: number;
  clientId: string;
  name: string;
  score: number;
}

export interface CoachChallenge {
  id: string;
  name: string;
  type: ChallengeType;
  unit: string;
  startDate: string;
  endDate: string;
  manualScore: boolean;
  leaderboard: LeaderRow[];
}

export interface ClientChallenge {
  id: string;
  name: string;
  type: ChallengeType;
  unit: string;
  startDate: string;
  endDate: string;
  myRank: number | null;
  myScore: number;
  total: number;
  leaderboard: LeaderRow[];
}

export type Sex = 'male' | 'female' | 'other';

export interface BodySummary {
  bmi: number | null;
  bmiCategory: string | null;
  weight: number | null;
  weightDelta30: number | null;
  goalType: 'lose' | 'maintain' | 'gain' | null;
  kcalAvg7: number | null;
  kcalTarget: number | null;
  loggedDays7: number;
  proteinAvg7: number | null;
  proteinNeed: number | null;
  workouts7: number;
  wearable: {
    date: string;
    steps: number | null;
    restingPulse: number | null;
    sleepMin: number | null;
    activeKcal: number | null;
  } | null;
  summary: string;
}

export type GoalType = 'lose' | 'maintain' | 'gain';
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'high' | 'athlete';

export interface ClientProfile {
  goal: string | null;
  sex: Sex | null;
  heightCm: number | null;
  weightKg: number | null;
  birthDate: string | null;
  goalType: GoalType | null;
  activityLevel: ActivityLevel | null;
  solo: boolean;
  targetSource: 'coach' | 'auto' | null;
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
  workouts: number | null;
  sessionsUsed: number;
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

export interface OwnerStats {
  users: number;
  coaches: number;
  clients: number;
  activeRelationships: number;
  activeSubscriptions: number;
  gmv: number;
  workoutsLogged: number;
  suspended: number;
}

export interface FatSecretDiagnostics {
  configured: boolean;
  tokenOk: boolean;
  tokenStatus: number | null;
  sampleCount: number;
  egressIp: string | null;
  hint: string;
}

export interface OwnerCoach {
  id: string;
  name: string;
  suspended: boolean;
  joinedAt: string;
  clients: number;
  revenue: number;
}

export interface CoachOnboardInvite {
  id: string;
  note: string | null;
  deepLink: string;
  expiresAt: string;
  used: boolean;
  usedBy: string | null;
  createdAt: string;
}

export interface OwnerClientRow {
  id: string;
  name: string;
  suspended: boolean;
  joinedAt: string;
  goal: string | null;
  coaches: number;
}

// Coach ↔ client messaging.
export type MessageContext = 'program' | 'nutrition';
export interface AppNotification {
  id: string;
  type: string;
  body: string;
  createdAt: string;
  read: boolean;
}
export interface NotifyPrefs {
  workout: boolean;
  supplements: boolean;
}

export interface ChatMessage {
  id: string;
  body: string;
  mine: boolean;
  fromCoach: boolean;
  contextType: MessageContext | null;
  contextLabel: string | null;
  createdAt: string;
  readAt: string | null;
}
export interface ChatContext {
  contextType?: MessageContext;
  contextId?: string;
  contextLabel?: string;
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
  coachClient: (id: string) => request<CoachClientDetail>(`/api/coach/clients/${id}`),
  coachDashboard: () => request<CoachDashboard>('/api/coach/dashboard'),
  coachOverview: () => request<CoachOverview>('/api/coach/overview'),
  createInvite: () => request<Invite>('/api/coach/invites', { method: 'POST' }),

  // Programs (Phase 1)
  exercises: () => request<ExerciseLite[]>('/api/coach/exercises'),
  createExercise: (body: { name: string; muscleGroup?: string }) =>
    request<ExerciseLite>('/api/coach/exercises', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  // Attach a demonstration video: upload a file to storage, then confirm.
  uploadExerciseVideo: async (exerciseId: string, file: File) => {
    const ext = (file.name.split('.').pop() ?? 'mp4').toLowerCase();
    const { uploadUrl, fileKey } = await request<{ uploadUrl: string; fileKey: string }>(
      `/api/coach/exercises/${exerciseId}/video/presign`,
      { method: 'POST', body: JSON.stringify({ ext }) },
    );
    const put = await fetch(uploadUrl, {
      method: 'PUT',
      body: file,
      headers: { 'content-type': file.type || 'application/octet-stream' },
    });
    if (!put.ok) throw new Error(`upload failed: ${put.status}`);
    return request<{ ok: boolean; videoUrl: string | null }>(
      `/api/coach/exercises/${exerciseId}/video`,
      { method: 'POST', body: JSON.stringify({ fileKey }) },
    );
  },
  // Attach a demonstration video by external link (e.g. YouTube).
  setExerciseVideoUrl: (exerciseId: string, videoUrl: string) =>
    request<{ ok: boolean; videoUrl: string | null }>(
      `/api/coach/exercises/${exerciseId}/video`,
      { method: 'POST', body: JSON.stringify({ videoUrl }) },
    ),
  // Client-facing read-only library (global exercises only).
  clientExercises: () => request<ExerciseLite[]>('/api/client/exercises'),
  programs: () => request<ProgramSummary[]>('/api/coach/programs'),
  createProgram: (draft: ProgramDraft) =>
    request<{ id: string; ok: boolean }>('/api/coach/programs', {
      method: 'POST',
      body: JSON.stringify(draft),
    }),
  programDetail: (id: string) => request<ProgramDetail>(`/api/coach/programs/${id}`),
  updateProgram: (id: string, draft: ProgramDraft) =>
    request<{ ok: boolean; id: string }>(`/api/coach/programs/${id}`, {
      method: 'PUT',
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
  coachClientNutritionDay: (clientId: string) =>
    request<NutritionDay>(`/api/coach/clients/${clientId}/nutrition/day`),
  setNutritionTarget: (clientId: string, body: Macros) =>
    request<{ ok: boolean }>(`/api/coach/clients/${clientId}/nutrition-target`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  coachSearchFoods: (q: string) =>
    request<{ foods: FoodSearchItem[] }>(
      `/api/coach/nutrition/foods/search?q=${encodeURIComponent(q)}`,
    ),
  coachAddMeal: (
    clientId: string,
    body: { mealType: MealType; grams: number; foodItemId?: string; name?: string; per100?: Macros; date?: string },
  ) =>
    request<{ ok: boolean; id: string }>(`/api/coach/clients/${clientId}/nutrition/meals`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  coachDeleteMeal: (clientId: string, mealId: string) =>
    request<{ ok: boolean }>(`/api/coach/clients/${clientId}/nutrition/meals/${mealId}`, {
      method: 'DELETE',
    }),

  // Meal plan (coach authors, client tracks)
  coachMealPlan: (clientId: string, date?: string) =>
    request<{ plan: MealPlan | null }>(
      `/api/coach/clients/${clientId}/meal-plan${date ? `?date=${date}` : ''}`,
    ),
  saveMealPlan: (
    clientId: string,
    body: { date?: string; note?: string | null; items: MealPlanDraftItem[] },
  ) =>
    request<{ ok: boolean; plan: MealPlan | null }>(`/api/coach/clients/${clientId}/meal-plan`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
  clientMealPlan: (date?: string) =>
    request<{ plan: MealPlan | null }>(`/api/client/meal-plan${date ? `?date=${date}` : ''}`),
  toggleMealPlanItem: (itemId: string) =>
    request<{ ok: boolean; done: boolean }>(`/api/client/meal-plan/items/${itemId}/toggle`, {
      method: 'POST',
    }),
  uploadMealPlanPhoto: async (itemId: string, file: File) => {
    const ext = (file.name.split('.').pop() ?? 'jpg').toLowerCase();
    const { uploadUrl, fileKey } = await request<{ uploadUrl: string; fileKey: string }>(
      `/api/client/meal-plan/items/${itemId}/photo/presign`,
      { method: 'POST', body: JSON.stringify({ ext }) },
    );
    const put = await fetch(uploadUrl, {
      method: 'PUT',
      body: file,
      headers: { 'content-type': file.type || 'application/octet-stream' },
    });
    if (!put.ok) throw new Error(`upload failed: ${put.status}`);
    return request<{ ok: boolean; photoUrl: string | null }>(
      `/api/client/meal-plan/items/${itemId}/photo`,
      { method: 'POST', body: JSON.stringify({ fileKey }) },
    );
  },

  // Challenges (Phase 2)
  coachChallenges: () => request<CoachChallenge[]>('/api/coach/challenges'),
  createChallenge: (body: {
    name: string;
    type: ChallengeType;
    startDate: string;
    endDate: string;
    clientIds: string[];
  }) =>
    request<{ ok: boolean; id: string }>('/api/coach/challenges', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  setChallengeScore: (id: string, clientId: string, score: number) =>
    request<{ ok: boolean }>(`/api/coach/challenges/${id}/score`, {
      method: 'POST',
      body: JSON.stringify({ clientId, score }),
    }),
  deleteChallenge: (id: string) =>
    request<{ ok: boolean }>(`/api/coach/challenges/${id}`, { method: 'DELETE' }),
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

  // Messaging — coach side
  coachClientMessages: (clientId: string) =>
    request<{ messages: ChatMessage[] }>(`/api/coach/clients/${clientId}/messages`),
  coachSendMessage: (clientId: string, body: string, ctx?: ChatContext) =>
    request<ChatMessage>(`/api/coach/clients/${clientId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ body, ...ctx }),
    }),
  coachUnread: () =>
    request<{ total: number; byClient: Record<string, number> }>('/api/coach/messages/unread'),

  // Messaging — client side
  clientMessages: () =>
    request<{ coach: { name: string } | null; messages: ChatMessage[] }>('/api/client/messages'),
  clientSendMessage: (body: string, ctx?: ChatContext) =>
    request<ChatMessage>('/api/client/messages', {
      method: 'POST',
      body: JSON.stringify({ body, ...ctx }),
    }),
  clientUnread: () => request<{ count: number }>('/api/client/messages/unread'),

  // In-app notifications center (both roles).
  notifications: (limit = 40) =>
    request<AppNotification[]>(`/api/notifications?limit=${limit}`),
  notificationsUnread: () =>
    request<{ count: number }>('/api/notifications/unread-count'),
  markNotificationsRead: (id?: string) =>
    request<{ ok: boolean }>('/api/notifications/read', {
      method: 'POST',
      body: JSON.stringify(id ? { id } : {}),
    }),
  notifyPrefs: () => request<NotifyPrefs>('/api/notifications/prefs'),
  updateNotifyPrefs: (prefs: Partial<NotifyPrefs>) =>
    request<NotifyPrefs>('/api/notifications/prefs', {
      method: 'PUT',
      body: JSON.stringify(prefs),
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
  bodySummary: () => request<BodySummary>('/api/client/body-summary'),
  clientProgress: () => request<ProgressEntry[]>('/api/client/progress'),
  deleteProgress: (id: string) =>
    request<{ ok: boolean }>(`/api/client/progress/${id}`, { method: 'DELETE' }),
  clientPhotos: () => request<ProgressPhoto[]>('/api/client/progress-photos'),
  deleteProgressPhoto: (id: string) =>
    request<{ ok: boolean }>(`/api/client/progress-photos/${id}`, { method: 'DELETE' }),
  clientProfile: () => request<ClientProfile>('/api/client/profile'),
  updateProfile: (body: {
    goal?: string;
    sex?: Sex;
    heightCm?: number;
    weightKg?: number;
    birthDate?: string;
    goalType?: GoalType;
    activityLevel?: ActivityLevel;
  }) =>
    request<{ ok: boolean }>('/api/client/profile', {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  clientVideos: () => request<FormVideo[]>('/api/client/form-videos'),

  // Nutrition (Phase 2)
  nutritionDay: (date?: string) =>
    request<NutritionDay>(`/api/client/nutrition/day${date ? `?date=${date}` : ''}`),
  nutritionWeek: () => request<NutritionWeek>('/api/client/nutrition/week'),
  nutritionStats: (days = 30) =>
    request<NutritionStats>(`/api/client/nutrition/stats?days=${days}`),
  addMeal: (body: {
    mealType: MealType;
    grams: number;
    name?: string;
    foodItemId?: string;
    per100?: Macros;
    date?: string;
  }) =>
    request<{ ok: boolean; id: string }>('/api/client/nutrition/meals', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updateMeal: (id: string, body: { grams?: number; mealType?: MealType }) =>
    request<{ ok: boolean }>(`/api/client/nutrition/meals/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  deleteMeal: (id: string) =>
    request<{ ok: boolean }>(`/api/client/nutrition/meals/${id}`, { method: 'DELETE' }),
  searchFoods: (q: string) =>
    request<{ foods: FoodSearchItem[] }>(
      `/api/client/nutrition/foods/search?q=${encodeURIComponent(q)}`,
    ),
  lookupBarcode: (code: string) =>
    request<{ food: FoodSearchItem }>(`/api/client/nutrition/foods/barcode/${code}`),
  clientChallenges: () => request<ClientChallenge[]>('/api/client/challenges'),

  // Health module (Phase 3) — gated by HEALTH_MODULE_ENABLED + consent
  healthStatus: () => request<HealthStatus>('/api/client/health/status'),
  giveHealthConsent: () =>
    request<{ ok: boolean }>('/api/client/health/consent', { method: 'POST' }),
  revokeHealthConsent: () =>
    request<{ ok: boolean }>('/api/client/health/consent', { method: 'DELETE' }),
  labs: () => request<LabResult[]>('/api/client/health/labs'),
  addLab: (body: {
    marker: string;
    value: number;
    unit?: string;
    date?: string;
    refLow?: number;
    refHigh?: number;
  }) =>
    request<{ ok: boolean; id: string }>('/api/client/health/labs', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  markerHistory: (marker: string) =>
    request<LabResult[]>(`/api/client/health/labs/${encodeURIComponent(marker)}`),
  deleteLab: (id: string) =>
    request<{ ok: boolean }>(`/api/client/health/labs/${id}`, { method: 'DELETE' }),
  // Lab OCR (Yandex Vision + YandexGPT): upload a PDF/photo, recognize markers.
  labsOcrStatus: () =>
    request<{ available: boolean }>('/api/client/health/labs/ocr-status'),
  recognizeLabScan: async (file: File) => {
    const ext = (file.name.split('.').pop() ?? 'pdf').toLowerCase();
    const { uploadUrl, fileKey } = await request<{ uploadUrl: string; fileKey: string }>(
      '/api/client/health/labs/presign',
      { method: 'POST', body: JSON.stringify({ ext }) },
    );
    const put = await fetch(uploadUrl, {
      method: 'PUT',
      body: file,
      headers: { 'content-type': file.type || 'application/octet-stream' },
    });
    if (!put.ok) throw new Error(`upload failed: ${put.status}`);
    return request<{
      ok: boolean;
      markers: LabMarkerDraft[];
      reason: string | null;
      fileKey: string;
    }>('/api/client/health/labs/recognize', {
      method: 'POST',
      body: JSON.stringify({ fileKey }),
    });
  },
  saveLabsBulk: (body: { date?: string; sourceFileKey?: string; markers: LabMarkerDraft[] }) =>
    request<{ ok: boolean; count: number }>('/api/client/health/labs/bulk', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  supplements: () => request<Supplement[]>('/api/client/health/supplements'),
  addSupplement: (body: {
    name: string;
    dose?: string;
    amount?: string;
    remindersOn?: boolean;
    schedule?: { times: string[] };
  }) =>
    request<{ ok: boolean; id: string }>('/api/client/health/supplements', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  markIntake: (id: string) =>
    request<{ ok: boolean }>(`/api/client/health/supplements/${id}/intake`, { method: 'POST' }),
  unmarkIntake: (id: string) =>
    request<{ ok: boolean }>(`/api/client/health/supplements/${id}/intake`, { method: 'DELETE' }),
  deleteSupplement: (id: string) =>
    request<{ ok: boolean }>(`/api/client/health/supplements/${id}`, { method: 'DELETE' }),
  exportHealth: () => request<unknown>('/api/client/health/export'),
  deleteAllHealth: () => request<{ ok: boolean }>('/api/client/health', { method: 'DELETE' }),

  // Client-logged activity & self-built workouts.
  activity: (days = 60) =>
    request<ActivityLog[]>(`/api/client/activity?days=${days}`),
  addActivity: (body: {
    type: ActivityType;
    title?: string;
    date?: string;
    durationMin?: number;
    distanceKm?: number;
    calories?: number;
    notes?: string;
    exercises?: ActivityExercise[];
  }) =>
    request<{ ok: boolean; id: string }>('/api/client/activity', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  deleteActivity: (id: string) =>
    request<{ ok: boolean }>(`/api/client/activity/${id}`, { method: 'DELETE' }),

  // Daily wearable / fitness-app metrics (manual now; auto-sync later).
  metrics: (days = 30) => request<DailyMetric[]>(`/api/client/metrics?days=${days}`),
  saveMetric: (body: {
    date?: string;
    steps?: number | null;
    restingPulse?: number | null;
    sleepMin?: number | null;
    activeKcal?: number | null;
  }) =>
    request<{ ok: boolean }>('/api/client/metrics', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
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
    body: { planName: string; amount: number; periodDays: number; workouts?: number },
  ) =>
    request<{ ok: boolean; id: string }>(`/api/coach/clients/${clientId}/subscriptions`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  recordPayment: (subscriptionId: string, amount?: number, renew?: boolean) =>
    request<{ ok: boolean; amount: number; commission: number }>(
      `/api/coach/subscriptions/${subscriptionId}/payments`,
      {
        method: 'POST',
        body: JSON.stringify({
          ...(amount != null ? { amount } : {}),
          ...(renew != null ? { renew } : {}),
        }),
      },
    ),
  markSubscriptionSession: (subscriptionId: string, delta: number) =>
    request<{ ok: boolean; sessionsUsed: number }>(
      `/api/coach/subscriptions/${subscriptionId}/sessions`,
      { method: 'POST', body: JSON.stringify({ delta }) },
    ),
  cancelSubscription: (subscriptionId: string) =>
    request<{ ok: boolean }>(`/api/coach/subscriptions/${subscriptionId}/cancel`, {
      method: 'POST',
    }),
  coachRevenue: () => request<CoachRevenue>('/api/coach/revenue'),
  ownerRevenue: () => request<OwnerRevenue>('/api/owner/revenue'),
  ownerStats: () => request<OwnerStats>('/api/owner/stats'),
  ownerDiagnostics: () =>
    request<{ fatsecret: FatSecretDiagnostics }>('/api/owner/diagnostics'),
  ownerCoaches: () => request<OwnerCoach[]>('/api/owner/coaches'),
  ownerClients: () => request<OwnerClientRow[]>('/api/owner/clients'),
  ownerClientInvite: () => request<{ deepLink: string }>('/api/owner/client-invite'),
  ownerCoachInvites: () => request<CoachOnboardInvite[]>('/api/owner/coach-invites'),
  createCoachInvite: (note?: string) =>
    request<{ token: string; deepLink: string; expiresAt: string }>('/api/owner/coach-invites', {
      method: 'POST',
      body: JSON.stringify(note ? { note } : {}),
    }),
  suspendUser: (id: string, suspended: boolean) =>
    request<{ ok: boolean; suspended: boolean }>(`/api/owner/users/${id}/suspend`, {
      method: 'POST',
      body: JSON.stringify({ suspended }),
    }),
};
