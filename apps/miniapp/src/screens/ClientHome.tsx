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
import { RoleSwitch } from '../components/RoleSwitch';
import type { NutritionDay, ProgressEntry, ChatContext } from '../api';

// Client home (Phase 1): assigned program, run a workout, workout history.
export function ClientHome({
  session,
  onSwitchRole,
}: {
  session: SessionResponse;
  onSwitchRole?: () => void;
}) {
  const name = session.user.firstName ?? 'спортсмен';
  const [program, setProgram] = useState<ClientProgram | null | undefined>(undefined);
  const [history, setHistory] = useState<WorkoutSummary[]>([]);
  const [challenges, setChallenges] = useState<ClientChallenge[]>([]);
  const [active, setActive] = useState<{ day: ClientProgramDay; index: number } | null>(null);
  const [view, setView] = useState<
    'home' | 'progress' | 'checkin' | 'technique' | 'nutrition' | 'health' | 'chat'
  >('home');
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [healthEnabled, setHealthEnabled] = useState(false);
  const [nutriDay, setNutriDay] = useState<NutritionDay | null>(null);
  const [progress, setProgress] = useState<ProgressEntry[]>([]);
  const [unread, setUnread] = useState(0);
  const [chatContext, setChatContext] = useState<(ChatContext & { hint?: string }) | null>(null);

  function openChat(ctx?: (ChatContext & { hint?: string }) | null) {
    setChatContext(ctx ?? null);
    setView('chat');
  }

  function loadHistory() {
    api.clientWorkouts().then(setHistory).catch(() => setHistory([]));
  }

  useEffect(() => {
    api
      .clientProgram()
      .then((r) => setProgram(r.program))
      .catch(() => setProgram(null));
    api
      .clientProfile()
      .then((p) => setNeedsOnboarding(!p.filled))
      .catch(() => setNeedsOnboarding(false));
    api.clientChallenges().then(setChallenges).catch(() => setChallenges([]));
    api.healthStatus().then((s) => setHealthEnabled(s.moduleEnabled)).catch(() => setHealthEnabled(false));
    api.nutritionDay().then(setNutriDay).catch(() => setNutriDay(null));
    api.clientProgress().then(setProgress).catch(() => setProgress([]));
    api.clientUnread().then((r) => setUnread(r.count)).catch(() => setUnread(0));
    loadHistory();
  }, []);

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

  if (view === 'progress') {
    return <ProgressScreen onBack={() => setView('home')} />;
  }

  if (view === 'checkin') {
    return <CheckinScreen onBack={() => setView('home')} />;
  }

  if (view === 'technique') {
    return <TechniqueScreen onBack={() => setView('home')} />;
  }

  if (view === 'nutrition') {
    return (
      <NutritionScreen
        onBack={() => setView('home')}
        onComment={(label) =>
          openChat({
            contextType: 'nutrition',
            contextId: new Date().toISOString().slice(0, 10),
            contextLabel: label,
            hint: 'Сообщение прикреплено к дневнику питания.',
          })
        }
      />
    );
  }

  if (view === 'health') {
    return <HealthScreen onBack={() => setView('home')} />;
  }

  if (view === 'chat') {
    return (
      <ChatScreen
        title="Чат с тренером"
        presetContext={chatContext}
        load={() => api.clientMessages().then((r) => r.messages)}
        send={(body, ctx) => api.clientSendMessage(body, ctx)}
        onBack={() => {
          setChatContext(null);
          setView('home');
          api.clientUnread().then((r) => setUnread(r.count)).catch(() => {});
        }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-brand-muted text-sm">Личный кабинет</p>
          <h1 className="text-2xl font-semibold">Привет, {name}!</h1>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <RoleSwitch onClick={onSwitchRole} />
          <LogoMark size={26} className="text-brand-accent" />
        </div>
      </header>

      {needsOnboarding && <OnboardingForm onDone={() => setNeedsOnboarding(false)} />}

      <QuickGlance
        nutri={nutriDay}
        progress={progress}
        onNutrition={() => setView('nutrition')}
        onProgress={() => setView('progress')}
      />

      {program === undefined ? (
        <p className="text-tg-hint text-sm">Загрузка…</p>
      ) : program === null ? (
        <NoProgram />
      ) : (
        <ProgramView
          program={program}
          onStart={(day, index) => setActive({ day, index })}
          onComment={() =>
            openChat({
              contextType: 'program',
              contextId: program.id,
              contextLabel: `Программа «${program.name}»`,
              hint: 'Вопрос прикреплён к вашей программе.',
            })
          }
        />
      )}

      {challenges.length > 0 && <Challenges items={challenges} />}

      {history.length > 0 && <History items={history} />}

      <div className="grid grid-cols-2 gap-3">
        <button
          className="relative rounded-2xl bg-tg-secondaryBg p-4 text-center col-span-2"
          onClick={() => openChat(null)}
        >
          <div className="text-base font-medium">💬 Чат с тренером</div>
          <div className="text-tg-hint text-xs mt-1">вопросы · разбор · поддержка</div>
          {unread > 0 && (
            <span className="absolute top-3 right-3 min-w-5 h-5 px-1.5 rounded-full bg-brand-accent text-brand-onAccent text-xs font-bold flex items-center justify-center">
              {unread}
            </span>
          )}
        </button>
        <button
          className="rounded-2xl bg-tg-secondaryBg p-4 text-center"
          onClick={() => setView('progress')}
        >
          <div className="text-base font-medium">Прогресс</div>
          <div className="text-tg-hint text-xs mt-1">вес · замеры</div>
        </button>
        <button
          className="rounded-2xl bg-tg-secondaryBg p-4 text-center"
          onClick={() => setView('checkin')}
        >
          <div className="text-base font-medium">Check-in</div>
          <div className="text-tg-hint text-xs mt-1">самочувствие</div>
        </button>
        <button
          className="rounded-2xl bg-tg-secondaryBg p-4 text-center"
          onClick={() => setView('technique')}
        >
          <div className="text-base font-medium">Техника</div>
          <div className="text-tg-hint text-xs mt-1">видео-разбор</div>
        </button>
        <button
          className="rounded-2xl bg-tg-secondaryBg p-4 text-center"
          onClick={() => setView('nutrition')}
        >
          <div className="text-base font-medium">Питание</div>
          <div className="text-tg-hint text-xs mt-1">калории · КБЖУ</div>
        </button>
        {healthEnabled && (
          <button
            className="rounded-2xl bg-tg-secondaryBg p-4 text-center"
            onClick={() => setView('health')}
          >
            <div className="text-base font-medium">Здоровье</div>
            <div className="text-tg-hint text-xs mt-1">анализы · добавки</div>
          </button>
        )}
      </div>
    </div>
  );
}

function QuickGlance({
  nutri,
  progress,
  onNutrition,
  onProgress,
}: {
  nutri: NutritionDay | null;
  progress: ProgressEntry[];
  onNutrition: () => void;
  onProgress: () => void;
}) {
  const kcal = nutri?.totals.kcal ?? 0;
  const goal = nutri?.target?.kcal ?? null;
  const weights = progress.filter((e) => e.weightKg != null);
  const latest = weights[0]?.weightKg ?? null;
  const prev = weights[1]?.weightKg ?? null;
  const delta = latest != null && prev != null ? +(latest - prev).toFixed(1) : null;

  return (
    <div className="grid grid-cols-2 gap-3">
      <button
        className="rounded-2xl bg-brand-surface brand-line p-3 flex items-center gap-3 text-left"
        onClick={onNutrition}
      >
        <Ring value={kcal} goal={goal} size={52} stroke={6}>
          <span className="text-[11px] font-bold tabular leading-none">{kcal}</span>
        </Ring>
        <div>
          <div className="text-brand-muted text-[11px]">Питание</div>
          <div className="text-sm font-semibold tabular">
            {kcal}
            {goal ? <span className="text-brand-muted font-normal"> / {goal}</span> : ''}
          </div>
          <div className="text-brand-muted text-[10px]">ккал сегодня</div>
        </div>
      </button>

      <button
        className="rounded-2xl bg-brand-surface brand-line p-3 flex flex-col justify-center text-left"
        onClick={onProgress}
      >
        <div className="text-brand-muted text-[11px]">Вес</div>
        {latest != null ? (
          <>
            <div className="text-lg font-bold tabular">
              {latest}
              <span className="text-brand-muted text-xs font-normal"> кг</span>
              {delta != null && delta !== 0 && (
                <span
                  className="text-xs ml-1"
                  style={{ color: delta < 0 ? 'var(--pos)' : 'var(--neg)' }}
                >
                  {delta > 0 ? '+' : ''}
                  {delta}
                </span>
              )}
            </div>
            <div className="text-brand-muted text-[10px]">
              {weights.length >= 2 ? 'динамика в разделе' : 'текущий вес'}
            </div>
          </>
        ) : (
          <div className="text-brand-muted text-xs mt-1">добавь замер</div>
        )}
      </button>
    </div>
  );
}

function NoProgram() {
  return (
    <div className="rounded-2xl bg-tg-secondaryBg p-4">
      <div className="font-medium mb-1">Программы пока нет</div>
      <p className="text-tg-hint text-sm">
        Как только тренер выдаст вам программу, она появится здесь — с днями,
        упражнениями и подходами.
      </p>
    </div>
  );
}

function ProgramView({
  program,
  onStart,
  onComment,
}: {
  program: ClientProgram;
  onStart: (day: ClientProgramDay, index: number) => void;
  onComment?: () => void;
}) {
  const [detail, setDetail] = useState<ClientProgramExercise | null>(null);
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{program.name}</h2>
          {program.description && (
            <p className="text-tg-hint text-sm">{program.description}</p>
          )}
        </div>
        {onComment && (
          <button
            className="shrink-0 rounded-xl bg-brand-surface brand-line px-3 py-1.5 text-xs text-brand-accent font-medium"
            onClick={onComment}
          >
            💬 Вопрос по программе
          </button>
        )}
      </div>

      {program.days.map((day, di) => (
        <div key={day.id} className="rounded-2xl bg-tg-secondaryBg p-3 flex flex-col gap-2">
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
                      ex.restSec != null && `отдых ${ex.restSec}с`,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </div>
                  {ex.notes && <div className="text-tg-hint text-xs mt-1">{ex.notes}</div>}
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

function History({ items }: { items: WorkoutSummary[] }) {
  // Oldest→newest volume series for the trend chart.
  const volumePoints = [...items]
    .filter((w) => w.totalVolume > 0)
    .reverse()
    .map((w) => ({ value: w.totalVolume, label: formatShort(w.date) }));

  return (
    <section>
      <h2 className="text-lg font-semibold mb-2">История тренировок</h2>
      {volumePoints.length >= 2 && (
        <div className="rounded-2xl bg-tg-secondaryBg p-3 mb-2">
          <div className="text-tg-hint text-xs mb-1">Динамика объёма</div>
          <LineChart points={volumePoints} unit=" кг" />
        </div>
      )}
      <ul className="flex flex-col gap-2">
        {items.map((w) => (
          <li
            key={w.id}
            className="rounded-2xl bg-tg-secondaryBg p-3 flex items-center justify-between"
          >
            <div>
              <div className="font-medium text-sm">
                {w.dayTitle || 'Тренировка'}
              </div>
              <div className="text-tg-hint text-xs">
                {formatDate(w.date)} · {w.exerciseCount} упр. · {w.setCount} подх.
              </div>
            </div>
            {w.totalVolume > 0 && (
              <div className="text-right">
                <div className="text-sm font-semibold">{w.totalVolume}</div>
                <div className="text-tg-hint text-[10px]">объём, кг</div>
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
          <div key={ch.id} className="rounded-2xl bg-tg-secondaryBg p-3 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <div className="font-medium">{ch.name}</div>
              {ch.myRank && (
                <div className="text-sm">
                  <span className="text-tg-hint">место</span>{' '}
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
                    <span className="text-tg-hint">{medal(r.rank)}</span> {r.name}
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
