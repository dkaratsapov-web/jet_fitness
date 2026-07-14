import { useEffect, useState } from 'react';
import {
  api,
  type ExerciseLite,
  type ProgramDraft,
  type ProgramDraftDay,
} from '../api';

// Local editable rows (superset of what we send to the API).
interface DraftExRow {
  exerciseId: string;
  name: string;
  sets: string;
  reps: string;
  weight: string;
  restSec: string;
  notes: string;
}
interface DraftDay {
  title: string;
  exercises: DraftExRow[];
}

const emptyDay = (): DraftDay => ({ title: '', exercises: [] });

// Program builder (Phase 1): name + days + exercises with sets/reps/weight/rest.
// Pass `editId` to load an existing program and save changes over it (PUT).
export function ProgramBuilder({
  onSaved,
  onCancel,
  editId,
}: {
  onSaved: () => void;
  onCancel: () => void;
  editId?: string;
}) {
  const [library, setLibrary] = useState<ExerciseLite[] | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [days, setDays] = useState<DraftDay[]>([emptyDay()]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(editId));

  useEffect(() => {
    api.exercises().then(setLibrary).catch(() => setLibrary([]));
  }, []);

  // Preload the program when editing.
  useEffect(() => {
    if (!editId) return;
    api
      .programDetail(editId)
      .then((p) => {
        setName(p.name);
        setDescription(p.description ?? '');
        setDays(
          p.days.length
            ? p.days.map((d) => ({
                title: d.title ?? '',
                exercises: d.exercises.map((ex) => ({
                  exerciseId: ex.exerciseId,
                  name: ex.name,
                  sets: ex.sets != null ? String(ex.sets) : '',
                  reps: ex.reps ?? '',
                  weight: ex.weight ?? '',
                  restSec: ex.restSec != null ? String(ex.restSec) : '',
                  notes: ex.notes ?? '',
                })),
              }))
            : [emptyDay()],
        );
      })
      .catch(() => setError('Не удалось загрузить программу'))
      .finally(() => setLoading(false));
  }, [editId]);

  function addDay() {
    setDays((d) => [...d, emptyDay()]);
  }
  function removeDay(di: number) {
    setDays((d) => d.filter((_, i) => i !== di));
  }
  function setDayTitle(di: number, title: string) {
    setDays((d) => d.map((day, i) => (i === di ? { ...day, title } : day)));
  }
  function addExercise(di: number, ex: ExerciseLite) {
    setDays((d) =>
      d.map((day, i) =>
        i === di
          ? {
              ...day,
              exercises: [
                ...day.exercises,
                {
                  exerciseId: ex.id,
                  name: ex.name,
                  sets: '3',
                  reps: '8-12',
                  weight: '',
                  restSec: '90',
                  notes: '',
                },
              ],
            }
          : day,
      ),
    );
  }
  function updateExercise(di: number, ei: number, patch: Partial<DraftExRow>) {
    setDays((d) =>
      d.map((day, i) =>
        i === di
          ? {
              ...day,
              exercises: day.exercises.map((ex, j) => (j === ei ? { ...ex, ...patch } : ex)),
            }
          : day,
      ),
    );
  }
  function removeExercise(di: number, ei: number) {
    setDays((d) =>
      d.map((day, i) =>
        i === di ? { ...day, exercises: day.exercises.filter((_, j) => j !== ei) } : day,
      ),
    );
  }

  const totalExercises = days.reduce((n, d) => n + d.exercises.length, 0);

  async function save() {
    setError(null);
    if (!name.trim()) {
      setError('Введите название программы');
      return;
    }
    if (totalExercises === 0) {
      setError('Добавьте хотя бы одно упражнение');
      return;
    }
    const draft: ProgramDraft = {
      name: name.trim(),
      description: description.trim() || null,
      days: days
        .filter((d) => d.exercises.length > 0)
        .map(
          (d): ProgramDraftDay => ({
            title: d.title.trim() || null,
            exercises: d.exercises.map((ex) => ({
              exerciseId: ex.exerciseId,
              sets: ex.sets ? Number(ex.sets) : null,
              reps: ex.reps.trim() || null,
              weight: ex.weight.trim() || null,
              restSec: ex.restSec ? Number(ex.restSec) : null,
              notes: ex.notes.trim() || null,
            })),
          }),
        ),
    };
    setSaving(true);
    try {
      if (editId) {
        await api.updateProgram(editId, draft);
      } else {
        await api.createProgram(draft);
      }
      onSaved();
    } catch (e) {
      const msg = String(e);
      setError(
        msg.includes('program_has_logs')
          ? 'Программу уже выполняли — структуру нельзя перестроить. Создайте новую версию.'
          : msg,
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="p-4">
        <button className="text-tg-link text-sm" onClick={onCancel}>
          ← Назад
        </button>
        <p className="text-tg-hint text-sm mt-4">Загрузка программы…</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <header className="flex items-center justify-between">
        <button className="text-tg-link text-sm" onClick={onCancel}>
          ← Назад
        </button>
        <h1 className="text-lg font-semibold">{editId ? 'Изменить программу' : 'Новая программа'}</h1>
        <span className="w-12" />
      </header>

      <input
        className="rounded-2xl bg-tg-secondaryBg p-3 outline-none"
        placeholder="Название (напр. «Набор массы, 3 дня»)"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <textarea
        className="rounded-2xl bg-tg-secondaryBg p-3 outline-none resize-none"
        placeholder="Описание (необязательно)"
        rows={2}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />

      {days.map((day, di) => (
        <div key={di} className="rounded-2xl bg-tg-secondaryBg p-3 flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <input
              className="flex-1 rounded-xl bg-tg-bg p-2 outline-none font-medium"
              placeholder={`День ${di + 1}`}
              value={day.title}
              onChange={(e) => setDayTitle(di, e.target.value)}
            />
            {days.length > 1 && (
              <button className="text-tg-hint text-sm px-2" onClick={() => removeDay(di)}>
                Удалить
              </button>
            )}
          </div>

          {day.exercises.map((ex, ei) => (
            <div key={ei} className="rounded-xl bg-tg-bg p-2 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="font-medium text-sm">{ex.name}</span>
                <button
                  className="text-tg-hint text-xs px-1"
                  onClick={() => removeExercise(di, ei)}
                >
                  ✕
                </button>
              </div>
              <div className="grid grid-cols-4 gap-2">
                <Field label="Подх." value={ex.sets} onChange={(v) => updateExercise(di, ei, { sets: v })} inputMode="numeric" />
                <Field label="Повт." value={ex.reps} onChange={(v) => updateExercise(di, ei, { reps: v })} />
                <Field label="Вес" value={ex.weight} onChange={(v) => updateExercise(di, ei, { weight: v })} />
                <Field label="Отдых,с" value={ex.restSec} onChange={(v) => updateExercise(di, ei, { restSec: v })} inputMode="numeric" />
              </div>
            </div>
          ))}

          <ExercisePicker library={library} onPick={(ex) => addExercise(di, ex)} />
        </div>
      ))}

      <button className="rounded-2xl bg-tg-secondaryBg p-3 text-tg-link" onClick={addDay}>
        ＋ Добавить день
      </button>

      {error && <p className="text-red-500 text-sm">{error}</p>}

      <button
        className="rounded-2xl bg-tg-button text-tg-buttonText p-4 font-medium disabled:opacity-60"
        onClick={save}
        disabled={saving}
      >
        {saving ? 'Сохраняем…' : 'Сохранить программу'}
      </button>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  inputMode?: 'numeric' | 'text';
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-tg-hint text-[10px] uppercase tracking-wide">{label}</span>
      <input
        className="rounded-lg bg-tg-secondaryBg p-1.5 text-sm outline-none w-full"
        value={value}
        inputMode={inputMode}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

function ExercisePicker({
  library,
  onPick,
}: {
  library: ExerciseLite[] | null;
  onPick: (ex: ExerciseLite) => void;
}) {
  if (library === null) {
    return <p className="text-tg-hint text-xs">Загрузка упражнений…</p>;
  }
  return (
    <select
      className="rounded-xl bg-tg-bg p-2 text-sm text-tg-link outline-none"
      value=""
      onChange={(e) => {
        const ex = library.find((x) => x.id === e.target.value);
        if (ex) onPick(ex);
        e.target.value = '';
      }}
    >
      <option value="" disabled>
        ＋ Добавить упражнение…
      </option>
      {library.map((ex) => (
        <option key={ex.id} value={ex.id}>
          {ex.name}
          {ex.muscleGroup ? ` · ${ex.muscleGroup}` : ''}
        </option>
      ))}
    </select>
  );
}
