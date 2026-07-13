import { useEffect, useState } from 'react';
import { api, type SessionResponse, type ClientProgram } from '../api';

// Client home (Phase 1): shows the program the coach assigned, day by day.
export function ClientHome({ session }: { session: SessionResponse }) {
  const name = session.user.firstName ?? 'спортсмен';
  const [program, setProgram] = useState<ClientProgram | null | undefined>(undefined);

  useEffect(() => {
    api
      .clientProgram()
      .then((r) => setProgram(r.program))
      .catch(() => setProgram(null));
  }, []);

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
        <ProgramView program={program} />
      )}

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

function ProgramView({ program }: { program: ClientProgram }) {
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
        </div>
      ))}
    </section>
  );
}
