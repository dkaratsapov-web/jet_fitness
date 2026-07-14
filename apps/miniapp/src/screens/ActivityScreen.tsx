import { useEffect, useState } from 'react';
import {
  api,
  type ActivityLog,
  type ActivityType,
  type ActivityExercise,
  type ExerciseLite,
} from '../api';
import { ExerciseLibrary } from './ExerciseLibrary';

// Client self-logged activity & workouts: build your own strength session from
// the library (or by hand) and log cardio (duration / distance / calories).

const TYPES: Array<{ type: ActivityType; label: string; icon: string; cardio: boolean }> = [
  { type: 'strength', label: 'Своя тренировка', icon: '🏋️', cardio: false },
  { type: 'run', label: 'Бег', icon: '🏃', cardio: true },
  { type: 'walk', label: 'Ходьба', icon: '🚶', cardio: true },
  { type: 'cycle', label: 'Велосипед', icon: '🚴', cardio: true },
  { type: 'swim', label: 'Плавание', icon: '🏊', cardio: true },
  { type: 'cardio', label: 'Кардио', icon: '🔥', cardio: true },
  { type: 'other', label: 'Другое', icon: '⚡', cardio: true },
];

const TYPE_META: Record<ActivityType, { label: string; icon: string }> = Object.fromEntries(
  TYPES.map((t) => [t.type, { label: t.label, icon: t.icon }]),
) as Record<ActivityType, { label: string; icon: string }>;

function localDate(d = new Date()): string {
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}
function numericOnly(raw: string): string {
  let s = raw.replace(',', '.').replace(/[^0-9.]/g, '');
  const dot = s.indexOf('.');
  if (dot !== -1) s = s.slice(0, dot + 1) + s.slice(dot + 1).replace(/\./g, '');
  return s;
}

export function ActivityScreen({ onBack }: { onBack: () => void }) {
  const [items, setItems] = useState<ActivityLog[] | null>(null);
  const [adding, setAdding] = useState(false);

  function load() {
    api.activity(90).then(setItems).catch(() => setItems([]));
  }
  useEffect(load, []);

  async function remove(id: string) {
    await api.deleteActivity(id).catch(() => undefined);
    load();
  }

  // Group history by calendar day.
  const groups = new Map<string, ActivityLog[]>();
  for (const a of items ?? []) {
    const key = a.date.slice(0, 10);
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(a);
  }

  return (
    <div className="flex flex-col gap-4 p-4 pb-24">
      <header className="flex items-center justify-between">
        <button className="text-tg-link text-sm" onClick={onBack}>
          ← Назад
        </button>
        <h1 className="text-lg font-semibold">Активность</h1>
        <span className="w-12" />
      </header>

      <button
        className="rounded-2xl bg-gradient-to-b from-brand-accentStrong to-brand-accent text-brand-onAccent p-4 font-semibold shadow-[0_8px_24px_-8px_rgba(201,169,106,0.6)] active:scale-[0.99] transition-transform"
        onClick={() => setAdding(true)}
      >
        ➕ Записать тренировку / активность
      </button>

      {items === null ? (
        <p className="text-brand-muted text-sm">Загрузка…</p>
      ) : items.length === 0 ? (
        <p className="text-brand-muted text-sm">
          Пока пусто. Собери свою тренировку из библиотеки или запиши пробежку/ходьбу.
        </p>
      ) : (
        [...groups.entries()].map(([day, list]) => (
          <section key={day} className="flex flex-col gap-2">
            <h2 className="text-brand-accent text-xs font-semibold uppercase tracking-wide">
              {new Date(`${day}T12:00:00.000Z`).toLocaleDateString('ru-RU', {
                weekday: 'short',
                day: 'numeric',
                month: 'long',
              })}
            </h2>
            {list.map((a) => (
              <ActivityCard key={a.id} a={a} onDelete={() => remove(a.id)} />
            ))}
          </section>
        ))
      )}

      {adding && (
        <AddActivity
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            load();
          }}
        />
      )}
    </div>
  );
}

function ActivityCard({ a, onDelete }: { a: ActivityLog; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  const meta = TYPE_META[a.type];
  const bits: string[] = [];
  if (a.durationMin) bits.push(`${a.durationMin} мин`);
  if (a.distanceKm) bits.push(`${a.distanceKm} км`);
  if (a.calories) bits.push(`${a.calories} ккал`);
  if (a.exercises?.length) bits.push(`${a.exercises.length} упр.`);

  return (
    <div className="jf-card p-3 flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <button
          className="flex items-center gap-3 text-left flex-1 min-w-0"
          onClick={() => a.exercises?.length && setOpen((o) => !o)}
        >
          <span className="text-xl">{meta.icon}</span>
          <div className="min-w-0">
            <div className="font-medium text-sm truncate">{a.title}</div>
            <div className="text-brand-muted text-xs">{bits.join(' · ') || meta.label}</div>
          </div>
        </button>
        <button className="text-brand-muted text-xs px-2 py-1 shrink-0" onClick={onDelete}>
          ✕
        </button>
      </div>

      {open && a.exercises && (
        <ul className="flex flex-col gap-1 pt-2 border-t border-[var(--line)]">
          {a.exercises.map((e, i) => (
            <li key={i} className="flex items-center justify-between text-xs">
              <span>{e.name}</span>
              <span className="text-brand-muted tabular">
                {[e.sets && `${e.sets}×`, e.reps, e.weight].filter(Boolean).join(' ')}
              </span>
            </li>
          ))}
        </ul>
      )}
      {a.notes && <p className="text-brand-muted text-xs">{a.notes}</p>}
    </div>
  );
}

function AddActivity({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [type, setType] = useState<ActivityType>('strength');
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(localDate());
  const [duration, setDuration] = useState('');
  const [distance, setDistance] = useState('');
  const [calories, setCalories] = useState('');
  const [notes, setNotes] = useState('');
  const [exercises, setExercises] = useState<ActivityExercise[]>([]);
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);

  const isStrength = type === 'strength';

  function addExercise(ex: ExerciseLite) {
    setExercises((cur) => [...cur, { name: ex.name, sets: 3, reps: '10', weight: '' }]);
  }
  function addBlank() {
    setExercises((cur) => [...cur, { name: '', sets: 3, reps: '10', weight: '' }]);
  }
  function patch(i: number, p: Partial<ActivityExercise>) {
    setExercises((cur) => cur.map((e, idx) => (idx === i ? { ...e, ...p } : e)));
  }
  function dropEx(i: number) {
    setExercises((cur) => cur.filter((_, idx) => idx !== i));
  }

  async function save() {
    setBusy(true);
    try {
      const clean = exercises.filter((e) => e.name.trim());
      await api.addActivity({
        type,
        title: title.trim() || undefined,
        date,
        durationMin: duration ? Number(duration) : undefined,
        distanceKm: distance ? Number(distance) : undefined,
        calories: calories ? Number(calories) : undefined,
        notes: notes.trim() || undefined,
        exercises: isStrength && clean.length ? clean : undefined,
      });
      onSaved();
    } finally {
      setBusy(false);
    }
  }

  const canSave = isStrength
    ? exercises.some((e) => e.name.trim()) || title.trim().length > 0
    : Boolean(duration || distance || title.trim());

  // Library picker as a full-screen overlay.
  if (picking) {
    return (
      <div className="fixed inset-0 z-[60] bg-tg-bg overflow-y-auto">
        <ExerciseLibrary
          mode="client"
          onBack={() => setPicking(false)}
          onPick={(ex) => {
            addExercise(ex);
            setPicking(false);
          }}
        />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end justify-center z-50" onClick={onClose}>
      <div
        className="bg-tg-bg rounded-t-3xl w-full max-w-md p-4 flex flex-col gap-3 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Записать активность</h2>
          <button className="text-tg-hint" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="grid grid-cols-3 gap-1.5">
          {TYPES.map((t) => (
            <button
              key={t.type}
              className={`rounded-lg py-2 text-[11px] font-medium flex flex-col items-center gap-0.5 ${
                type === t.type ? 'bg-brand-accent text-brand-onAccent' : 'bg-brand-surface2 text-brand-muted'
              }`}
              onClick={() => setType(t.type)}
            >
              <span className="text-base">{t.icon}</span>
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <input
            className="flex-1 rounded-xl bg-tg-secondaryBg p-3 text-sm outline-none"
            placeholder={isStrength ? 'Название (напр. «Грудь + трицепс»)' : 'Название (по желанию)'}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <input
            type="date"
            className="rounded-xl bg-tg-secondaryBg px-2 py-3 text-xs outline-none"
            value={date}
            max={localDate()}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>

        {isStrength ? (
          <>
            <div className="flex flex-col gap-2">
              {exercises.map((e, i) => (
                <div key={i} className="rounded-xl bg-brand-surface2 p-2 flex flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <input
                      className="flex-1 rounded-md bg-tg-bg p-1.5 text-sm outline-none"
                      placeholder="Упражнение"
                      value={e.name}
                      onChange={(ev) => patch(i, { name: ev.target.value })}
                    />
                    <button className="text-brand-muted text-xs px-1" onClick={() => dropEx(i)}>
                      ✕
                    </button>
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    <LabeledMini
                      label="подходы"
                      value={e.sets != null ? String(e.sets) : ''}
                      onChange={(v) => patch(i, { sets: v ? Number(numericOnly(v)) : undefined })}
                    />
                    <LabeledMini
                      label="повторы"
                      value={e.reps ?? ''}
                      onChange={(v) => patch(i, { reps: v })}
                    />
                    <LabeledMini
                      label="вес"
                      value={e.weight ?? ''}
                      onChange={(v) => patch(i, { weight: v })}
                    />
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <button
                className="flex-1 rounded-xl bg-brand-accent text-brand-onAccent py-2.5 text-sm font-semibold"
                onClick={() => setPicking(true)}
              >
                📚 Из библиотеки
              </button>
              <button
                className="rounded-xl bg-brand-surface2 text-brand-muted px-4 py-2.5 text-sm"
                onClick={addBlank}
              >
                + вручную
              </button>
            </div>
          </>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            <Field label="Длит., мин" value={duration} onChange={setDuration} />
            <Field label="Дист., км" value={distance} onChange={setDistance} />
            <Field label="Ккал" value={calories} onChange={setCalories} />
          </div>
        )}

        <textarea
          className="rounded-xl bg-tg-secondaryBg p-3 text-sm outline-none resize-none"
          rows={2}
          placeholder="Заметка (по желанию)"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />

        <button
          className="rounded-xl bg-brand-accent text-brand-onAccent p-3 font-semibold disabled:opacity-50"
          onClick={save}
          disabled={busy || !canSave}
        >
          {busy ? 'Сохраняем…' : 'Сохранить'}
        </button>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-brand-muted text-[10px] uppercase tracking-wide">{label}</span>
      <input
        className="rounded-lg bg-brand-surface2 p-2 text-sm outline-none tabular"
        type="text"
        inputMode="decimal"
        placeholder="—"
        value={value}
        onChange={(e) => onChange(numericOnly(e.target.value))}
      />
    </label>
  );
}

function LabeledMini({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex flex-col gap-0.5">
      <span className="text-brand-muted text-[9px] uppercase tracking-wide">{label}</span>
      <input
        className="rounded-md bg-tg-bg p-1.5 text-sm outline-none"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
