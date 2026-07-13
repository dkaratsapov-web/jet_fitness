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
import { HealthScreen } from './HealthScreen';
import { OnboardingForm } from './OnboardingForm';
import { LineChart } from '../components/LineChart';
import { LogoMark } from '../components/Logo';
import { Ring } from '../components/Ring';
import { ExerciseDetail } from '../components/ExerciseDetail';
import { ChatScreen } from '../components/ChatScreen';
import { BottomNav, type ClientTab } from '../components/BottomNav';
import { RoleSwitch } from '../components/RoleSwitch';
import type { NutritionDay, ProgressEntry, ChatContext } from '../api';

type Overlay = 'chat' | 'checkin' | 'technique' | 'health' | null;

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
  const [tab, setTab] = useState<ClientTab>('home');
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
  const [chatContext, setChatContext] = useState<(ChatContext & { hint?: string }) | null>(null);

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
  if (overlay === 'health') return <HealthScreen onBack={() => setOverlay(null)} />;

  // ── Tabbed shell ───────────────────────────────────────────────
  return (
    <div className="min-h-screen pb-24">
      {tab === 'home' && (
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
          onCheckin={() => setOverlay('checkin')}
          onTechnique={() => setOverlay('technique')}
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
      {tab === 'progress' && <ProgressScreen />}
      {tab === 'profile' && (
        <ProfileTab
          name={name}
          healthEnabled={healthEnabled}
          challenges={challenges}
          onHealth={() => setOverlay('health')}
          onCheckin={() => setOverlay('checkin')}
          onTechnique={() => setOverlay('technique')}
          onSwitchRole={onSwitchRole}
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
  onCheckin,
  onTechnique,
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
  onCheckin: () => void;
  onTechnique: () => void;
  needsOnboarding: boolean;
  onOnboarded: () => void;
}) {
  return (
    <div className="flex flex-col gap-4 p-4">
      <header className="jf-rise flex items-start justify-between">
        <div>
          <p className="jf-shimmer text-[11px] font-bold uppercase tracking-[0.22em]">
            Личный кабинет
          </p>
          <h1 className="text-2xl font-semibold mt-0.5">Привет, {name}!</h1>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <RoleSwitch onClick={onSwitchRole} />
          <LogoMark size={28} className="text-brand-accent" />
        </div>
      </header>

      {needsOnboarding && <OnboardingForm onDone={onOnboarded} />}

      <div className="jf-rise jf-rise-1">
        <Hero program={program} onStart={onStart} />
      </div>

      <div className="jf-rise jf-rise-2">
        <StatCards nutri={nutri} progress={progress} onTab={onTab} />
      </div>

      <button
        className="jf-rise jf-rise-3 jf-card p-4 flex items-center gap-3 text-left"
        onClick={() => openChat(null)}
      >
        <span className="w-11 h-11 rounded-2xl shrink-0 grid place-items-center text-xl bg-gradient-to-b from-brand-accentStrong to-brand-accent text-brand-onAccent shadow-[0_6px_18px_-6px_rgba(201,169,106,0.7)]">
          💬
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
        <Chip icon="📈" name="Прогресс" sub="вес · замеры" onClick={() => onTab('progress')} />
        <Chip icon="📝" name="Check-in" sub="самочувствие" onClick={onCheckin} />
        <Chip icon="🎬" name="Техника" sub="видео-разбор" onClick={onTechnique} />
      </div>

      {program && program.days.length > 0 && (
        <FullProgram program={program} onStart={onStart} />
      )}

      {challenges.length > 0 && <Challenges items={challenges} />}
      {history.length > 0 && <History items={history} />}
    </div>
  );
}

// Hero "workout today" card, or the empty state.
function Hero({
  program,
  onStart,
}: {
  program: ClientProgram | null | undefined;
  onStart: (day: ClientProgramDay, index: number) => void;
}) {
  if (program === undefined) {
    return <div className="jf-card p-4 text-brand-muted text-sm">Загрузка…</div>;
  }
  if (!program || program.days.length === 0) {
    return (
      <div className="jf-card p-4 flex gap-3 items-start">
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
    );
  }
  const day = program.days[0];
  const groups = [...new Set(day.exercises.map((e) => e.muscleGroup).filter(Boolean))]
    .slice(0, 2)
    .join(' · ');
  return (
    <div
      className="jf-card p-4 flex flex-col gap-3"
      style={{
        background:
          'radial-gradient(120% 120% at 100% 0%, rgba(201,169,106,0.12), transparent 55%), linear-gradient(180deg, rgba(255,255,255,0.03), transparent 44%), var(--surface)',
      }}
    >
      <div className="text-brand-accent text-[11px] font-bold uppercase tracking-[0.16em]">
        Тренировка на сегодня
      </div>
      <div>
        <h2 className="text-xl font-bold">{day.title || 'День 1'}</h2>
        <div className="text-brand-muted text-xs mt-0.5">
          {day.exercises.length} упр.{groups ? ` · ${groups}` : ''}
        </div>
      </div>
      <button
        className="rounded-2xl bg-gradient-to-b from-brand-accentStrong to-brand-accent text-brand-onAccent p-3.5 font-semibold shadow-[0_8px_24px_-8px_rgba(201,169,106,0.6)] active:scale-[0.99] transition-transform"
        onClick={() => onStart(day, 0)}
      >
        ▶ Начать тренировку
      </button>
    </div>
  );
}

// Nutrition + weight summary cards.
function StatCards({
  nutri,
  progress,
  onTab,
}: {
  nutri: NutritionDay | null;
  progress: ProgressEntry[];
  onTab: (t: ClientTab) => void;
}) {
  const kcal = nutri?.totals.kcal ?? 0;
  const goal = nutri?.target?.kcal ?? null;
  const weights = progress.filter((e) => e.weightKg != null);
  const latest = weights[0]?.weightKg ?? null;
  const prev = weights[1]?.weightKg ?? null;
  const delta = latest != null && prev != null ? +(latest - prev).toFixed(1) : null;

  return (
    <div className="grid grid-cols-2 gap-3">
      <button className="jf-card p-3.5 flex flex-col gap-2 text-left" onClick={() => onTab('nutrition')}>
        <div className="text-brand-muted text-[10px] font-bold uppercase tracking-wide">Питание</div>
        <div className="flex items-center gap-3">
          <Ring value={kcal} goal={goal} size={44} stroke={6}>
            <span className="text-[10px] font-bold tabular leading-none">{kcal}</span>
          </Ring>
          <div>
            <div className="text-lg font-bold tabular leading-none">
              {kcal}
              {goal ? <span className="text-brand-muted text-xs font-normal"> / {goal}</span> : ''}
            </div>
            <div className="text-brand-muted text-[10px] mt-1">
              {goal ? `осталось ${Math.max(0, goal - kcal)}` : 'цель задаёт тренер'}
            </div>
          </div>
        </div>
      </button>

      <button className="jf-card p-3.5 flex flex-col gap-2 text-left" onClick={() => onTab('progress')}>
        <div className="text-brand-muted text-[10px] font-bold uppercase tracking-wide">Вес</div>
        {latest != null ? (
          <>
            <div className="text-2xl font-bold tabular leading-none">
              {latest}
              <span className="text-brand-muted text-xs font-normal"> кг</span>
              {delta != null && delta !== 0 && (
                <span
                  className="text-xs ml-1.5"
                  style={{ color: delta < 0 ? 'var(--pos)' : 'var(--neg)' }}
                >
                  {delta > 0 ? '+' : ''}
                  {delta}
                </span>
              )}
            </div>
            {weights.length >= 2 && (
              <MiniSpark values={[...weights].reverse().map((w) => w.weightKg as number)} />
            )}
          </>
        ) : (
          <div className="text-brand-muted text-xs">добавь замер</div>
        )}
      </button>
    </div>
  );
}

function MiniSpark({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * 100;
      const y = 24 - ((v - min) / span) * 20 - 2;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  return (
    <svg viewBox="0 0 100 26" preserveAspectRatio="none" className="w-full h-6">
      <polyline points={pts} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function Chip({
  icon,
  name,
  sub,
  onClick,
}: {
  icon: string;
  name: string;
  sub: string;
  onClick: () => void;
}) {
  return (
    <button className="jf-card p-3 flex flex-col gap-1.5 text-center items-center active:scale-[0.98] transition-transform" onClick={onClick}>
      <span className="text-lg">{icon}</span>
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

// ── Profile tab ──────────────────────────────────────────────────
function ProfileTab({
  name,
  healthEnabled,
  challenges,
  onHealth,
  onCheckin,
  onTechnique,
  onSwitchRole,
}: {
  name: string;
  healthEnabled: boolean;
  challenges: ClientChallenge[];
  onHealth: () => void;
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

      <div className="grid grid-cols-2 gap-3">
        {healthEnabled && (
          <Chip icon="🧪" name="Здоровье" sub="анализы · добавки" onClick={onHealth} />
        )}
        <Chip icon="📝" name="Check-in" sub="самочувствие" onClick={onCheckin} />
        <Chip icon="🎬" name="Техника" sub="видео-разбор" onClick={onTechnique} />
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
