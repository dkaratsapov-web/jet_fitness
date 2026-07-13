import { useEffect, useState } from 'react';
import {
  api,
  type SessionResponse,
  type ClientProgram,
  type ClientProgramDay,
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

// Client home (Phase 1): assigned program, run a workout, workout history.
export function ClientHome({ session }: { session: SessionResponse }) {
  const name = session.user.firstName ?? 'спортсмен';
  const [program, setProgram] = useState<ClientProgram | null | undefined>(undefined);
  const [history, setHistory] = useState<WorkoutSummary[]>([]);
  const [challenges, setChallenges] = useState<ClientChallenge[]>([]);
  const [active, setActive] = useState<{ day: ClientProgramDay; index: number } | null>(null);
  const [view, setView] = useState<
    'home' | 'progress' | 'checkin' | 'technique' | 'nutrition' | 'health'
  >('home');
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [healthEnabled, setHealthEnabled] = useState(false);

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
    return <NutritionScreen onBack={() => setView('home')} />;
  }

  if (view === 'health') {
    return <HealthScreen onBack={() => setView('home')} />;
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-brand-muted text-sm">Личный кабинет</p>
          <h1 className="text-2xl font-semibold">Привет, {name}!</h1>
        </div>
        <LogoMark size={26} className="text-brand-accent" />
      </header>

      {needsOnboarding && <OnboardingForm onDone={() => setNeedsOnboarding(false)} />}

      {program === undefined ? (
        <p className="text-tg-hint text-sm">Загрузка…</p>
      ) : program === null ? (
        <NoProgram />
      ) : (
        <ProgramView
          program={program}
          onStart={(day, index) => setActive({ day, index })}
        />
      )}

      {challenges.length > 0 && <Challenges items={challenges} />}

      {history.length > 0 && <History items={history} />}

      <div className="grid grid-cols-2 gap-3">
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
}: {
  program: ClientProgram;
  onStart: (day: ClientProgramDay, index: number) => void;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-lg font-semibold">{program.name}</h2>
        {program.description && (
          <p className="text-tg-hint text-sm">{program.description}</p>
        )}
      </div>

      {program.days.map((day, di) => (
        <div key={day.id} className="rounded-2xl bg-tg-secondaryBg p-3 flex flex-col gap-2">
          <div className="font-medium">{day.title || `День ${di + 1}`}</div>
          <ul className="flex flex-col gap-2">
            {day.exercises.map((ex) => (
              <li key={ex.id} className="rounded-xl bg-tg-bg p-2">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-sm">{ex.name}</span>
                  {ex.muscleGroup && (
                    <span className="text-tg-hint text-xs">{ex.muscleGroup}</span>
                  )}
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
