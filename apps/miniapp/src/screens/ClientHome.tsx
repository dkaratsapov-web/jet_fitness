import { useEffect, useState } from 'react';
import {
  api,
  type SessionResponse,
  type ClientProgram,
  type ClientProgramDay,
  type WorkoutSummary,
} from '../api';
import { WorkoutSession } from './WorkoutSession';

// Client home (Phase 1): assigned program, run a workout, workout history.
export function ClientHome({ session }: { session: SessionResponse }) {
  const name = session.user.firstName ?? 'спортсмен';
  const [program, setProgram] = useState<ClientProgram | null | undefined>(undefined);
  const [history, setHistory] = useState<WorkoutSummary[]>([]);
  const [active, setActive] = useState<{ day: ClientProgramDay; index: number } | null>(null);

  function loadHistory() {
    api.clientWorkouts().then(setHistory).catch(() => setHistory([]));
  }

  useEffect(() => {
    api
      .clientProgram()
      .then((r) => setProgram(r.program))
      .catch(() => setProgram(null));
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

  return (
    <div className="flex flex-col gap-4 p-4">
      <header>
        <p className="text-tg-hint text-sm">Личный кабинет</p>
        <h1 className="text-2xl font-semibold">Привет, {name}!</h1>
      </header>

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

      {history.length > 0 && <History items={history} />}

      <div className="grid grid-cols-2 gap-3">
        {['Питание', 'Прогресс', 'Check-in', 'Техника'].map((label) => (
          <div
            key={label}
            className="rounded-2xl bg-tg-secondaryBg p-4 text-center opacity-60"
          >
            <div className="text-base font-medium">{label}</div>
            <div className="text-tg-hint text-xs mt-1">скоро</div>
          </div>
        ))}
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
  return (
    <section>
      <h2 className="text-lg font-semibold mb-2">История тренировок</h2>
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

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}
