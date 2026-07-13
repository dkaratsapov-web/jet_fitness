import { useState } from 'react';
import { api, type ClientProgramDay, type ClientProgramExercise, type WorkoutSetInput } from '../api';
import { ExerciseDetail } from '../components/ExerciseDetail';

// Per-set editable values, keyed by "exerciseId:setNumber".
interface SetValue {
  reps: string;
  weight: string;
  done: boolean;
}

function parseTargetReps(reps: string | null): string {
  if (!reps) return '';
  // "8-12" → suggest the top of the range as the target to beat.
  const m = reps.match(/(\d+)\s*$/);
  return m ? m[1] : '';
}

function initialSets(day: ClientProgramDay): Record<string, SetValue> {
  const map: Record<string, SetValue> = {};
  for (const ex of day.exercises) {
    const count = ex.sets && ex.sets > 0 ? ex.sets : 1;
    for (let n = 1; n <= count; n += 1) {
      map[`${ex.id}:${n}`] = {
        reps: parseTargetReps(ex.reps),
        weight: '',
        done: false,
      };
    }
  }
  return map;
}

// Workout session (Phase 1): the client performs a program day and logs
// actual reps/weight per set, then marks the workout complete.
export function WorkoutSession({
  day,
  dayIndex,
  onDone,
  onCancel,
}: {
  day: ClientProgramDay;
  dayIndex: number;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [values, setValues] = useState<Record<string, SetValue>>(() => initialSets(day));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<ClientProgramExercise | null>(null);

  function patch(key: string, p: Partial<SetValue>) {
    setValues((v) => ({ ...v, [key]: { ...v[key], ...p } }));
  }

  const doneCount = Object.values(values).filter((v) => v.done).length;

  async function finish() {
    setError(null);
    const sets: WorkoutSetInput[] = [];
    for (const ex of day.exercises) {
      const count = ex.sets && ex.sets > 0 ? ex.sets : 1;
      for (let n = 1; n <= count; n += 1) {
        const v = values[`${ex.id}:${n}`];
        if (!v || (!v.done && !v.reps && !v.weight)) continue;
        sets.push({
          programExerciseId: ex.id,
          setNumber: n,
          actualReps: v.reps ? Number(v.reps) : null,
          actualWeight: v.weight ? Number(v.weight) : null,
        });
      }
    }
    if (sets.length === 0) {
      setError('Отметьте хотя бы один подход');
      return;
    }
    setSaving(true);
    try {
      await api.logWorkout(day.id, sets);
      onDone();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <header className="flex items-center justify-between">
        <button className="text-tg-link text-sm" onClick={onCancel}>
          ← Выйти
        </button>
        <h1 className="text-lg font-semibold">{day.title || `День ${dayIndex + 1}`}</h1>
        <span className="text-tg-hint text-xs">{doneCount} ✓</span>
      </header>

      {day.exercises.map((ex) => {
        const count = ex.sets && ex.sets > 0 ? ex.sets : 1;
        return (
          <div key={ex.id} className="rounded-2xl bg-tg-secondaryBg p-3 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <button
                className="font-medium text-sm text-left text-brand-accent active:opacity-70"
                onClick={() => setDetail(ex)}
              >
                {ex.name} <span className="text-xs">ⓘ</span>
              </button>
              <span className="text-tg-hint text-xs">
                {ex.reps ?? ''} {ex.weight ? `· ${ex.weight}` : ''}
              </span>
            </div>
            <div className="grid grid-cols-[auto_1fr_1fr_auto] gap-2 items-center text-xs text-tg-hint">
              <span>#</span>
              <span>Повт.</span>
              <span>Вес, кг</span>
              <span>✓</span>
            </div>
            {Array.from({ length: count }, (_, i) => i + 1).map((n) => {
              const key = `${ex.id}:${n}`;
              const v = values[key];
              return (
                <div key={n} className="grid grid-cols-[auto_1fr_1fr_auto] gap-2 items-center">
                  <span className="text-tg-hint text-sm w-4">{n}</span>
                  <input
                    className="rounded-lg bg-tg-bg p-2 text-sm outline-none w-full"
                    inputMode="numeric"
                    placeholder="—"
                    value={v?.reps ?? ''}
                    onChange={(e) => patch(key, { reps: e.target.value })}
                  />
                  <input
                    className="rounded-lg bg-tg-bg p-2 text-sm outline-none w-full"
                    inputMode="decimal"
                    placeholder="—"
                    value={v?.weight ?? ''}
                    onChange={(e) => patch(key, { weight: e.target.value })}
                  />
                  <button
                    className={`w-8 h-8 rounded-lg text-sm ${
                      v?.done ? 'bg-tg-button text-tg-buttonText' : 'bg-tg-bg text-tg-hint'
                    }`}
                    onClick={() => patch(key, { done: !v?.done })}
                  >
                    ✓
                  </button>
                </div>
              );
            })}
          </div>
        );
      })}

      {error && <p className="text-red-500 text-sm">{error}</p>}

      <button
        className="rounded-2xl bg-tg-button text-tg-buttonText p-4 font-medium disabled:opacity-60"
        onClick={finish}
        disabled={saving}
      >
        {saving ? 'Сохраняем…' : 'Завершить тренировку'}
      </button>

      {detail && <ExerciseDetail ex={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}
