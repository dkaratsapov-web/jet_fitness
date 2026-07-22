import { useEffect, useState } from 'react';
import {
  api,
  type ExerciseLite,
  type ProgramDraft,
  type ProgramDraftDay,
} from '../api';
import { ExerciseDetail } from '../components/ExerciseDetail';

// Local editable rows (superset of what we send to the API).
interface DraftExRow {
  exerciseId: string;
  name: string;
  sets: string;
  reps: string;
  weight: string;
  restSec: string;
  tempo: string;
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
  const [preview, setPreview] = useState<ExerciseLite | null>(null);

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
                  tempo: ex.tempo ?? '',
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
                  tempo: '',
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
  function moveExercise(di: number, ei: number, dir: -1 | 1) {
    setDays((d) =>
      d.map((day, i) => {
        if (i !== di) return day;
        const j = ei + dir;
        if (j < 0 || j >= day.exercises.length) return day;
        const list = [...day.exercises];
        [list[ei], list[j]] = [list[j], list[ei]];
        return { ...day, exercises: list };
      }),
    );
  }
  function duplicateExercise(di: number, ei: number) {
    setDays((d) =>
      d.map((day, i) => {
        if (i !== di) return day;
        const list = [...day.exercises];
        list.splice(ei + 1, 0, { ...day.exercises[ei] });
        return { ...day, exercises: list };
      }),
    );
  }
  function previewExercise(exerciseId: string) {
    const ex = (library ?? []).find((e) => e.id === exerciseId);
    if (ex) setPreview(ex);
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
              tempo: ex.tempo.trim() || null,
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
          : msg.includes('unknown_exercise')
            ? 'Некоторые упражнения устарели. Удалите их и добавьте заново из библиотеки, затем сохраните.'
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
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-sm min-w-0 truncate">
                  <span className="text-tg-hint mr-1">{ei + 1}.</span>{ex.name}
                </span>
                <div className="flex items-center gap-0.5 shrink-0 text-tg-hint">
                  <button className="px-1.5 disabled:opacity-30" onClick={() => moveExercise(di, ei, -1)} disabled={ei === 0} title="Выше">↑</button>
                  <button className="px-1.5 disabled:opacity-30" onClick={() => moveExercise(di, ei, 1)} disabled={ei === day.exercises.length - 1} title="Ниже">↓</button>
                  <button className="px-1.5" onClick={() => duplicateExercise(di, ei)} title="Дублировать">⧉</button>
                  <button className="px-1.5" onClick={() => removeExercise(di, ei)} title="Удалить">✕</button>
                </div>
              </div>
              <div className="grid grid-cols-4 gap-2">
                <Field label="Подх." value={ex.sets} onChange={(v) => updateExercise(di, ei, { sets: v })} inputMode="numeric" />
                <Field label="Повт." value={ex.reps} onChange={(v) => updateExercise(di, ei, { reps: v })} />
                <Field label="Вес" value={ex.weight} onChange={(v) => updateExercise(di, ei, { weight: v })} />
                <Field label="Отдых,с" value={ex.restSec} onChange={(v) => updateExercise(di, ei, { restSec: v })} inputMode="numeric" />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <Field label="Темп" value={ex.tempo} onChange={(v) => updateExercise(di, ei, { tempo: v })} />
                <label className="col-span-2 flex flex-col gap-1">
                  <span className="text-tg-hint text-[10px] uppercase tracking-wide">Заметка тренера</span>
                  <input
                    className="rounded-lg bg-tg-secondaryBg p-1.5 text-sm outline-none w-full"
                    placeholder="напр. «медленно, без рывка»"
                    value={ex.notes}
                    onChange={(e) => updateExercise(di, ei, { notes: e.target.value })}
                  />
                </label>
              </div>
              <button
                className="self-start text-brand-accent text-xs font-medium"
                onClick={() => previewExercise(ex.exerciseId)}
              >
                ▶ Техника
              </button>
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

      {preview && <ExerciseDetail ex={preview} onClose={() => setPreview(null)} />}
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
