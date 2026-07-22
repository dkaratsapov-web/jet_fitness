import { useEffect, useState } from 'react';
import {
  api,
  type SessionResponse,
  type ClientProgram,
  type ClientProgramDay,
  type ClientProgramExercise,
  type WorkoutSummary,
  type ClientChallenge,
} from '../api';
import { WorkoutSession } from './WorkoutSession';
import { ProgressScreen } from './ProgressScreen';
import { CheckinScreen } from './CheckinScreen';
import { TechniqueScreen } from './TechniqueScreen';
import { NutritionScreen } from './NutritionScreen';
import { LabsScreen, SupplementsScreen } from './HealthScreen';
import { ExerciseLibrary } from './ExerciseLibrary';
import { ActivityScreen } from './ActivityScreen';
import { NotificationsScreen } from './NotificationsScreen';
import { WearableScreen } from './WearableScreen';
import { OnboardingForm } from './OnboardingForm';
import { ProfileEditScreen } from './ProfileEditScreen';
import { LineChart } from '../components/LineChart';
import { LogoMark } from '../components/Logo';
import { Ring } from '../components/Ring';
import { ExerciseDetail } from '../components/ExerciseDetail';
import { ChatScreen } from '../components/ChatScreen';
import { BottomNav, type ClientTab } from '../components/BottomNav';
import { RoleSwitch } from '../components/RoleSwitch';
import { LiveDot, Sparkline } from '../components/ui';
import { OliviaTip, OliviaAvatar, OliviaFab } from '../components/Olivia';
import { OliviaHelp } from '../components/OliviaHelp';
import { Icon, type IconName } from '../components/Icon';
import { BodySummaryCard } from '../components/BodySummary';

// Which Olivia help branch matches each client tab (for the floating assistant).
const TAB_BRANCH: Record<ClientTab, string> = {
  workouts: 'workouts',
  nutrition: 'nutrition',
  health: 'health',
  profile: 'about',
};
import type { NutritionDay, ProgressEntry, ChatContext } from '../api';

// Time-of-day greeting (client is in the user's local tz).
function greeting(): string {
  const h = new Date().getHours();
  if (h < 6) return 'Доброй ночи';
  if (h < 12) return 'Доброе утро';
  if (h < 18) return 'Добрый день';
  return 'Добрый вечер';
}

type Overlay =
  | 'chat'
  | 'checkin'
  | 'technique'
  | 'labs'
  | 'supplements'
  | 'library'
  | 'activity'
  | 'notifications'
  | 'progress'
  | 'wearable'
  | 'profile-edit'
  | null;

// Client cabinet: bottom-tab shell (Дом · Питание · Прогресс · Профиль) with a
// premium home, full-screen overlays for workouts/chat/sub-sections.
export function ClientHome({
  session,
  onSwitchRole,
}: {
  session: SessionResponse;
  onSwitchRole?: () => void;
}) {
  const name = session.user.firstName ?? 'спортсмен';
  const [tab, setTab] = useState<ClientTab>('workouts');
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [program, setProgram] = useState<ClientProgram | null | undefined>(undefined);
  const [history, setHistory] = useState<WorkoutSummary[]>([]);
  const [challenges, setChallenges] = useState<ClientChallenge[]>([]);
  const [active, setActive] = useState<{ day: ClientProgramDay; index: number } | null>(null);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [healthEnabled, setHealthEnabled] = useState(false);
  const [nutriDay, setNutriDay] = useState<NutritionDay | null>(null);
  const [progress, setProgress] = useState<ProgressEntry[]>([]);
  const [unread, setUnread] = useState(0);
  const [notiUnread, setNotiUnread] = useState(0);
  const [chatContext, setChatContext] = useState<(ChatContext & { hint?: string }) | null>(null);
  const [oliviaOpen, setOliviaOpen] = useState(false);

  function loadHistory() {
    api.clientWorkouts().then(setHistory).catch(() => setHistory([]));
  }

  useEffect(() => {
    api.clientProgram().then((r) => setProgram(r.program)).catch(() => setProgram(null));
    api.clientProfile().then((p) => setNeedsOnboarding(!p.filled)).catch(() => setNeedsOnboarding(false));
    api.clientChallenges().then(setChallenges).catch(() => setChallenges([]));
    api.healthStatus().then((s) => setHealthEnabled(s.moduleEnabled)).catch(() => setHealthEnabled(false));
    api.nutritionDay().then(setNutriDay).catch(() => setNutriDay(null));
    api.clientProgress().then(setProgress).catch(() => setProgress([]));
    api.clientUnread().then((r) => setUnread(r.count)).catch(() => setUnread(0));
    api.notificationsUnread().then((r) => setNotiUnread(r.count)).catch(() => setNotiUnread(0));
    loadHistory();
  }, []);

  function openChat(ctx?: (ChatContext & { hint?: string }) | null) {
    setChatContext(ctx ?? null);
    setOverlay('chat');
  }

  // ── Full-screen overlays (no tab bar) ──────────────────────────
  if (active) {
    return (
      <WorkoutSession
        day={active.day}
        dayIndex={active.index}
        onCancel={() => setActive(null)}
        onDone={() => {
          setActive(null);
          loadHistory();
        }}
      />
    );
  }
  if (overlay === 'chat') {
    return (
      <ChatScreen
        title="Чат с тренером"
        presetContext={chatContext}
        load={() => api.clientMessages().then((r) => r.messages)}
        send={(body, ctx) => api.clientSendMessage(body, ctx)}
        onBack={() => {
          setChatContext(null);
          setOverlay(null);
          api.clientUnread().then((r) => setUnread(r.count)).catch(() => {});
        }}
      />
    );
  }
  if (overlay === 'checkin') return <CheckinScreen onBack={() => setOverlay(null)} />;
  if (overlay === 'technique') return <TechniqueScreen onBack={() => setOverlay(null)} />;
  if (overlay === 'labs') return <LabsScreen onBack={() => setOverlay(null)} />;
  if (overlay === 'supplements') return <SupplementsScreen onBack={() => setOverlay(null)} />;
  if (overlay === 'progress') return <ProgressScreen onBack={() => setOverlay(null)} />;
  if (overlay === 'wearable') return <WearableScreen onBack={() => setOverlay(null)} />;
  if (overlay === 'profile-edit') return <ProfileEditScreen onBack={() => setOverlay(null)} />;
  if (overlay === 'library') return <ExerciseLibrary mode="client" onBack={() => setOverlay(null)} />;
  if (overlay === 'activity') return <ActivityScreen onBack={() => setOverlay(null)} />;
  if (overlay === 'notifications')
    return (
      <NotificationsScreen
        onBack={() => {
          setOverlay(null);
          setNotiUnread(0);
        }}
      />
    );

  // ── Tabbed shell ───────────────────────────────────────────────
  return (
    <div className="min-h-screen pb-24">
      {tab === 'workouts' && (
        <HomeTab
          name={name}
          program={program}
          nutri={nutriDay}
          progress={progress}
          challenges={challenges}
          history={history}
          unread={unread}
          onStart={(day, index) => setActive({ day, index })}
          onSwitchRole={onSwitchRole}
          onTab={setTab}
          openChat={openChat}
          onTechnique={() => setOverlay('technique')}
          onLibrary={() => setOverlay('library')}
          onActivity={() => setOverlay('activity')}
          onNotifications={() => setOverlay('notifications')}
          notiUnread={notiUnread}
          needsOnboarding={needsOnboarding}
          onOnboarded={() => setNeedsOnboarding(false)}
        />
      )}
      {tab === 'nutrition' && (
        <NutritionScreen
          onComment={(label) =>
            openChat({
              contextType: 'nutrition',
              contextId: new Date().toISOString().slice(0, 10),
              contextLabel: label,
              hint: 'Сообщение прикреплено к дневнику питания.',
            })
          }
        />
      )}
      {tab === 'health' && (
        <HealthTab
          healthEnabled={healthEnabled}
          onProgress={() => setOverlay('progress')}
          onWearable={() => setOverlay('wearable')}
          onLabs={() => setOverlay('labs')}
          onSupplements={() => setOverlay('supplements')}
        />
      )}
      {tab === 'profile' && (
        <ProfileTab
          name={name}
          challenges={challenges}
          onEditProfile={() => setOverlay('profile-edit')}
          onLibrary={() => setOverlay('library')}
          onActivity={() => setOverlay('activity')}
          onCheckin={() => setOverlay('checkin')}
          onTechnique={() => setOverlay('technique')}
          onSwitchRole={onSwitchRole}
        />
      )}

      <OliviaFab onClick={() => setOliviaOpen(true)} />
      {oliviaOpen && (
        <OliviaHelp
          role="client"
          initialBranch={TAB_BRANCH[tab]}
          onClose={() => setOliviaOpen(false)}
          onAskCoach={() => {
            setOliviaOpen(false);
            openChat(null);
          }}
        />
      )}

      <BottomNav tab={tab} onTab={setTab} unread={unread} />
    </div>
  );
}

// ── Home tab ─────────────────────────────────────────────────────
function HomeTab({
  name,
  program,
  nutri,
  progress,
  challenges,
  history,
  unread,
  onStart,
  onSwitchRole,
  onTab,
  openChat,
  onTechnique,
  onLibrary,
  onActivity,
  onNotifications,
  notiUnread,
  needsOnboarding,
  onOnboarded,
}: {
  name: string;
  program: ClientProgram | null | undefined;
  nutri: NutritionDay | null;
  progress: ProgressEntry[];
  challenges: ClientChallenge[];
  history: WorkoutSummary[];
  unread: number;
  onStart: (day: ClientProgramDay, index: number) => void;
  onSwitchRole?: () => void;
  onTab: (t: ClientTab) => void;
  openChat: (ctx?: (ChatContext & { hint?: string }) | null) => void;
  onTechnique: () => void;
  onLibrary: () => void;
  onActivity: () => void;
  onNotifications: () => void;
  notiUnread: number;
  needsOnboarding: boolean;
  onOnboarded: () => void;
}) {
  const [helpOpen, setHelpOpen] = useState(false);
  return (
    <div className="flex flex-col gap-4 p-4">
      <header className="jf-rise flex items-start justify-between">
        <div>
          <p className="jf-shimmer text-[11px] font-bold uppercase tracking-[0.22em]">
            {greeting()}
          </p>
          <h1 className="text-2xl font-bold mt-0.5">{name}</h1>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            className="w-9 h-9 rounded-xl grid place-items-center bg-brand-surface brand-line overflow-hidden"
            onClick={() => setHelpOpen(true)}
            aria-label="Спросить Оливию"
          >
            <OliviaAvatar size={30} ring={false} />
          </button>
          <button
            className="relative w-9 h-9 rounded-xl grid place-items-center bg-brand-surface brand-line text-brand-accent"
            onClick={onNotifications}
            aria-label="Уведомления"
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.7 21a2 2 0 01-3.4 0" />
            </svg>
            {notiUnread > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-brand-accent text-brand-onAccent text-[10px] font-bold grid place-items-center">
                {notiUnread > 9 ? '9+' : notiUnread}
              </span>
            )}
          </button>
          <RoleSwitch onClick={onSwitchRole} />
          <LogoMark size={28} className="text-brand-accent" />
        </div>
      </header>

      {needsOnboarding && <OnboardingForm onDone={onOnboarded} />}

      <OliviaTip id="home-intro" cta="Открыть питание" onCta={() => onTab('nutrition')}>
        Привет! Я Оливия — твой гид по Jet&nbsp;Fitness. Здесь собрано всё: тренировки,
        питание и здоровье. Начни с приёма пищи — так тренеру виднее твой прогресс.
      </OliviaTip>

      <div className="jf-rise jf-rise-1">
        <Hero program={program} history={history} onStart={onStart} />
      </div>

      <div className="jf-rise jf-rise-2">
        <StatCards nutri={nutri} progress={progress} history={history} onTab={onTab} />
      </div>

      <button
        className="jf-rise jf-rise-3 jf-card p-4 flex items-center gap-3 text-left"
        onClick={() => openChat(null)}
      >
        <span className="w-11 h-11 rounded-2xl shrink-0 grid place-items-center bg-gradient-to-b from-brand-accentStrong to-brand-accent text-brand-onAccent shadow-[0_6px_18px_-6px_rgba(201,169,106,0.7)]">
          <Icon name="chat" size={22} />
        </span>
        <span className="flex-1">
          <span className="block font-semibold">Чат с тренером</span>
          <span className="block text-brand-muted text-xs mt-0.5">вопросы · разбор · поддержка</span>
        </span>
        {unread > 0 && (
          <span className="min-w-6 h-6 px-1.5 rounded-full bg-brand-accent text-brand-onAccent text-xs font-bold grid place-items-center">
            {unread}
          </span>
        )}
      </button>

      <div className="jf-rise jf-rise-4 grid grid-cols-3 gap-3">
        <Chip icon="dumbbell" name="Тренировка" sub="своя · активность" onClick={onActivity} />
        <Chip icon="book" name="Библиотека" sub="упражнения" onClick={onLibrary} />
        <Chip icon="video" name="Техника" sub="видео-разбор" onClick={onTechnique} />
      </div>

      {program && program.days.length > 0 && (
        <FullProgram program={program} onStart={onStart} />
      )}

      {challenges.length > 0 && <Challenges items={challenges} />}
      {history.length > 0 && <History items={history} />}

      {helpOpen && (
        <OliviaHelp
          role="client"
          onClose={() => setHelpOpen(false)}
          onAskCoach={() => {
            setHelpOpen(false);
            openChat(null);
          }}
        />
      )}
    </div>
  );
}

// Monday-based current-week activity strip: filled gold = trained, pulsing aqua
// ring = today (not yet trained), muted = rest/empty.
function WeekStrip({ history }: { history: WorkoutSummary[] }) {
  const today = new Date();
  const dow = (today.getDay() + 6) % 7; // 0 = Monday
  const monday = new Date(today);
  monday.setDate(today.getDate() - dow);
  monday.setHours(0, 0, 0, 0);
  const done = new Set(history.map((w) => new Date(w.date).toDateString()));
  const labels = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
  const days = labels.map((label, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return {
      label,
      done: done.has(d.toDateString()),
      isToday: d.toDateString() === today.toDateString(),
    };
  });
  return (
    <div className="flex items-center justify-between gap-1 pt-1">
      {days.map((d, i) => (
        <div key={i} className="flex flex-col items-center gap-1.5">
          <span
            className="w-6 h-6 rounded-full grid place-items-center text-[10px] font-bold"
            style={
              d.done
                ? { background: 'linear-gradient(180deg,var(--accent-strong),var(--accent))', color: 'var(--on-accent)' }
                : d.isToday
                  ? { border: '2px solid var(--energy)', color: 'var(--energy)' }
                  : { background: 'var(--surface-2)', color: 'var(--muted)' }
            }
          >
            {d.done ? '✓' : ''}
          </span>
          <span
            className="text-[9px] font-semibold"
            style={{ color: d.isToday ? 'var(--energy)' : 'var(--muted)' }}
          >
            {d.label}
          </span>
        </div>
      ))}
    </div>
  );
}

// Hero "workout today" card, or the empty state.
function Hero({
  program,
  history,
  onStart,
}: {
  program: ClientProgram | null | undefined;
  history: WorkoutSummary[];
  onStart: (day: ClientProgramDay, index: number) => void;
}) {
  if (program === undefined) {
    return <div className="jf-card p-4 text-brand-muted text-sm">Загрузка…</div>;
  }
  if (!program || program.days.length === 0) {
    return (
      <div className="jf-card p-4 flex flex-col gap-3">
        <div className="flex gap-3 items-start">
          <span className="w-10 h-10 rounded-xl bg-brand-surface2 brand-line grid place-items-center text-xl shrink-0">
            🏋️
          </span>
          <div>
            <div className="font-semibold mb-0.5">Программы пока нет</div>
            <p className="text-brand-muted text-xs leading-relaxed">
              Как только тренер выдаст программу, она появится здесь — с днями,
              упражнениями и подходами.
            </p>
          </div>
        </div>
        <WeekStrip history={history} />
      </div>
    );
  }
  const day = program.days[0];
  const groups = [...new Set(day.exercises.map((e) => e.muscleGroup).filter(Boolean))]
    .slice(0, 2)
    .join(' · ');
  return (
    <div
      className="jf-card p-4 flex flex-col gap-3.5"
      style={{
        background:
          'radial-gradient(120% 120% at 100% 0%, rgba(201,169,106,0.12), transparent 55%), linear-gradient(180deg, rgba(255,255,255,0.03), transparent 44%), var(--surface)',
      }}
    >
      <div className="flex items-center gap-2">
        <LiveDot />
        <span className="text-brand-energy text-[11px] font-bold uppercase tracking-[0.16em]">
          Тренировка на сегодня
        </span>
      </div>
      <div>
        <h2 className="text-xl font-bold">{day.title || 'День 1'}</h2>
        <div className="text-brand-muted text-xs mt-0.5">
          {day.exercises.length} упр.{groups ? ` · ${groups}` : ''}
        </div>
      </div>
      <button
        className="rounded-2xl bg-gradient-to-b from-brand-accentStrong to-brand-accent text-brand-onAccent p-3.5 font-semibold shadow-[0_8px_24px_-8px_rgba(201,169,106,0.6)] jf-press"
        onClick={() => onStart(day, 0)}
      >
        ▶ Начать тренировку
      </button>
      <WeekStrip history={history} />
    </div>
  );
}

// Calories · weight · activity summary tiles.
function StatCards({
  nutri,
  progress,
  history,
  onTab,
}: {
  nutri: NutritionDay | null;
  progress: ProgressEntry[];
  history: WorkoutSummary[];
  onTab: (t: ClientTab) => void;
}) {
  const kcal = nutri?.totals.kcal ?? 0;
  const goal = nutri?.target?.kcal ?? null;
  const weights = progress.filter((e) => e.weightKg != null);
  const latest = weights[0]?.weightKg ?? null;
  const prev = weights[1]?.weightKg ?? null;
  const delta = latest != null && prev != null ? +(latest - prev).toFixed(1) : null;

  // Workouts in the current Monday-based week.
  const today = new Date();
  const dow = (today.getDay() + 6) % 7;
  const monday = new Date(today);
  monday.setDate(today.getDate() - dow);
  monday.setHours(0, 0, 0, 0);
  const weekWorkouts = history.filter((w) => new Date(w.date) >= monday).length;

  return (
    <div className="grid grid-cols-3 gap-3">
      {/* Calories — ring tile */}
      <button className="jf-tile p-3 flex flex-col gap-2 text-left" onClick={() => onTab('nutrition')}>
        <div className="jf-eyebrow" style={{ color: 'var(--muted)' }}>Калории</div>
        <div className="flex items-center gap-2">
          <Ring value={kcal} goal={goal} size={38} stroke={5}>
            <span className="text-[9px] font-bold tabular leading-none">{kcal}</span>
          </Ring>
          <div className="min-w-0">
            <div className="text-[11px] text-brand-muted leading-tight">
              {goal ? `из ${goal}` : 'цель —'}
            </div>
            {goal && (
              <div className="text-[11px] font-semibold text-brand-energy leading-tight mt-0.5">
                −{Math.max(0, goal - kcal)}
              </div>
            )}
          </div>
        </div>
      </button>

      {/* Weight — value + spark */}
      <button className="jf-tile p-3 flex flex-col gap-1.5 text-left" onClick={() => onTab('health')}>
        <div className="jf-eyebrow" style={{ color: 'var(--muted)' }}>Вес</div>
        {latest != null ? (
          <>
            <div className="flex items-baseline gap-1">
              <span className="text-xl font-extrabold tabular leading-none text-brand-accentStrong">{latest}</span>
              <span className="text-[10px] text-brand-muted">кг</span>
              {delta != null && delta !== 0 && (
                <span className="text-[10px] font-semibold ml-0.5" style={{ color: delta < 0 ? 'var(--pos)' : 'var(--neg)' }}>
                  {delta > 0 ? '+' : ''}{delta}
                </span>
              )}
            </div>
            {weights.length >= 2 ? (
              <Sparkline values={[...weights].reverse().map((w) => w.weightKg as number)} width={72} height={22} />
            ) : (
              <div className="text-[10px] text-brand-muted">нужен ещё замер</div>
            )}
          </>
        ) : (
          <div className="text-[11px] text-brand-muted mt-1">добавь замер</div>
        )}
      </button>

      {/* Activity — workouts this week */}
      <button className="jf-tile p-3 flex flex-col gap-1.5 text-left" onClick={() => onTab('health')}>
        <div className="jf-eyebrow" style={{ color: 'var(--muted)' }}>За неделю</div>
        <div className="flex items-baseline gap-1">
          <span className="text-xl font-extrabold tabular leading-none text-brand-energy">{weekWorkouts}</span>
          <span className="text-[10px] text-brand-muted">трен.</span>
        </div>
        <div className="text-[10px] text-brand-muted leading-tight">
          {weekWorkouts === 0 ? 'начни неделю' : weekWorkouts >= 4 ? 'отличный темп 🔥' : 'так держать'}
        </div>
      </button>
    </div>
  );
}

function Chip({
  icon,
  name,
  sub,
  onClick,
}: {
  icon: IconName;
  name: string;
  sub: string;
  onClick: () => void;
}) {
  return (
    <button className="jf-card p-3 flex flex-col gap-1.5 text-center items-center jf-press" onClick={onClick}>
      <span className="w-9 h-9 rounded-xl grid place-items-center bg-brand-surface2 brand-line text-brand-accent">
        <Icon name={icon} size={20} />
      </span>
      <span className="text-xs font-bold">{name}</span>
      <span className="text-brand-muted text-[9.5px]">{sub}</span>
    </button>
  );
}

// Full program (all days) with tappable exercises → detail.
function FullProgram({
  program,
  onStart,
}: {
  program: ClientProgram;
  onStart: (day: ClientProgramDay, index: number) => void;
}) {
  const [detail, setDetail] = useState<ClientProgramExercise | null>(null);
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">Твоя программа: {program.name}</h2>
      {program.days.map((day, di) => (
        <div key={day.id} className="jf-card p-3 flex flex-col gap-2">
          <div className="font-medium">{day.title || `День ${di + 1}`}</div>
          <ul className="flex flex-col gap-2">
            {day.exercises.map((ex) => (
              <li key={ex.id}>
                <button
                  className="w-full text-left rounded-xl bg-tg-bg p-2 active:opacity-70"
                  onClick={() => setDetail(ex)}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm">{ex.name}</span>
                    <span className="text-brand-accent text-xs shrink-0 ml-2">
                      {ex.muscleGroup ? `${ex.muscleGroup} ›` : '›'}
                    </span>
                  </div>
                  <div className="text-tg-hint text-xs mt-1">
                    {[
                      ex.sets != null && `${ex.sets} подх.`,
                      ex.reps && `${ex.reps} повт.`,
                      ex.weight && ex.weight,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </div>
                </button>
              </li>
            ))}
          </ul>
          {day.exercises.length > 0 && (
            <button
              className="rounded-xl bg-tg-button text-tg-buttonText px-3 py-2 text-sm self-start"
              onClick={() => onStart(day, di)}
            >
              ▶ Начать тренировку
            </button>
          )}
        </div>
      ))}
      {detail && <ExerciseDetail ex={detail} onClose={() => setDetail(null)} />}
    </section>
  );
}

// ── Health tab (Здоровье): тело, браслет, анализы, бады ──────────
function HealthTab({
  healthEnabled,
  onProgress,
  onWearable,
  onLabs,
  onSupplements,
}: {
  healthEnabled: boolean;
  onProgress: () => void;
  onWearable: () => void;
  onLabs: () => void;
  onSupplements: () => void;
}) {
  return (
    <div className="flex flex-col gap-4 p-4">
      <header>
        <p className="text-brand-accent text-[11px] font-bold uppercase tracking-[0.16em]">Здоровье</p>
        <h1 className="text-2xl font-semibold mt-0.5">Твои показатели</h1>
      </header>

      <BodySummaryCard />

      <HealthRow
        icon="body"
        name="Показатели тела"
        sub="вес · замеры · фото прогресса"
        onClick={onProgress}
      />
      <HealthRow
        icon="watch"
        name="Фитнес-браслет"
        sub="шаги · пульс · сон · калории"
        onClick={onWearable}
      />
      {healthEnabled ? (
        <>
          <HealthRow icon="flask" name="Анализы" sub="динамика · нормы · распознавание" onClick={onLabs} />
          <HealthRow icon="pill" name="Бады и добавки" sub="приём · расписание · напоминания" onClick={onSupplements} />
        </>
      ) : (
        <p className="text-brand-muted text-sm">
          Раздел анализов и добавок включает тренер.
        </p>
      )}
    </div>
  );
}

function HealthRow({
  icon,
  name,
  sub,
  onClick,
}: {
  icon: IconName;
  name: string;
  sub: string;
  onClick: () => void;
}) {
  return (
    <button className="jf-card p-4 flex items-center gap-3 text-left jf-press" onClick={onClick}>
      <span className="w-11 h-11 rounded-2xl shrink-0 grid place-items-center bg-brand-surface2 brand-line text-brand-accent">
        <Icon name={icon} size={22} />
      </span>
      <span className="flex-1 min-w-0">
        <span className="block font-semibold">{name}</span>
        <span className="block text-brand-muted text-xs mt-0.5">{sub}</span>
      </span>
      <span className="text-brand-accent text-lg">›</span>
    </button>
  );
}

// ── Profile tab ──────────────────────────────────────────────────
function ProfileTab({
  name,
  challenges,
  onEditProfile,
  onLibrary,
  onActivity,
  onCheckin,
  onTechnique,
  onSwitchRole,
}: {
  name: string;
  challenges: ClientChallenge[];
  onEditProfile: () => void;
  onLibrary: () => void;
  onActivity: () => void;
  onCheckin: () => void;
  onTechnique: () => void;
  onSwitchRole?: () => void;
}) {
  return (
    <div className="flex flex-col gap-4 p-4">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-brand-accent text-[11px] font-bold uppercase tracking-[0.16em]">Профиль</p>
          <h1 className="text-2xl font-semibold mt-0.5">{name}</h1>
        </div>
        <LogoMark size={28} className="text-brand-accent" />
      </header>

      <button className="jf-card p-4 flex items-center gap-3 text-left jf-press" onClick={onEditProfile}>
        <OliviaAvatar size={40} ring={false} />
        <span className="flex-1 min-w-0">
          <span className="block font-semibold">Личные данные</span>
          <span className="block text-brand-muted text-xs mt-0.5">
            рост · вес · цель · опыт · ограничения · аллергии
          </span>
        </span>
        <span className="text-brand-accent text-lg">›</span>
      </button>

      <div className="grid grid-cols-2 gap-3">
        <Chip icon="dumbbell" name="Тренировки" sub="свои · активность" onClick={onActivity} />
        <Chip icon="book" name="Библиотека" sub="упражнения" onClick={onLibrary} />
        <Chip icon="checkin" name="Check-in" sub="самочувствие" onClick={onCheckin} />
        <Chip icon="video" name="Техника" sub="видео-разбор" onClick={onTechnique} />
      </div>

      {challenges.length > 0 && <Challenges items={challenges} />}

      {onSwitchRole && (
        <button
          className="jf-card p-3 text-sm text-brand-muted"
          onClick={onSwitchRole}
        >
          ⇄ Сменить роль
        </button>
      )}
    </div>
  );
}

// ── Shared blocks ────────────────────────────────────────────────
function History({ items }: { items: WorkoutSummary[] }) {
  const volumePoints = [...items]
    .filter((w) => w.totalVolume > 0)
    .reverse()
    .map((w) => ({ value: w.totalVolume, label: formatShort(w.date) }));

  return (
    <section>
      <h2 className="text-lg font-semibold mb-2">История тренировок</h2>
      {volumePoints.length >= 2 && (
        <div className="jf-card p-3 mb-2">
          <div className="text-brand-muted text-xs mb-1">Динамика объёма</div>
          <LineChart points={volumePoints} unit=" кг" />
        </div>
      )}
      <ul className="flex flex-col gap-2">
        {items.map((w) => (
          <li key={w.id} className="jf-card p-3 flex items-center justify-between">
            <div>
              <div className="font-medium text-sm">{w.dayTitle || 'Тренировка'}</div>
              <div className="text-brand-muted text-xs">
                {formatDate(w.date)} · {w.exerciseCount} упр. · {w.setCount} подх.
              </div>
            </div>
            {w.totalVolume > 0 && (
              <div className="text-right">
                <div className="text-sm font-semibold tabular">{w.totalVolume}</div>
                <div className="text-brand-muted text-[10px]">объём, кг</div>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function Challenges({ items }: { items: ClientChallenge[] }) {
  return (
    <section>
      <h2 className="text-lg font-semibold mb-2">Челленджи</h2>
      <div className="flex flex-col gap-2">
        {items.map((ch) => (
          <div key={ch.id} className="jf-card p-3 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <div className="font-medium">{ch.name}</div>
              {ch.myRank && (
                <div className="text-sm">
                  <span className="text-brand-muted">место</span>{' '}
                  <span className="font-semibold">
                    {ch.myRank}/{ch.total}
                  </span>
                </div>
              )}
            </div>
            <ul className="flex flex-col gap-1">
              {ch.leaderboard.slice(0, 5).map((r) => (
                <li
                  key={r.clientId}
                  className={`flex items-center justify-between text-sm ${
                    r.rank <= 3 ? 'font-medium' : ''
                  }`}
                >
                  <span>
                    <span className="text-brand-muted">{medal(r.rank)}</span> {r.name}
                  </span>
                  <span>
                    {r.score} {ch.unit}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

function medal(rank: number): string {
  return rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `${rank}.`;
}

function formatShort(iso: string): string {
  return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}
