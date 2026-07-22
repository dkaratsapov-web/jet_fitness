// Coach-side meal-plan builder for one client. Each item is a food × grams;
// kcal/macros are computed automatically. Unsaved edits are cached per
// (client, date) in localStorage, so switching Today/Tomorrow never loses work.

import { useEffect, useRef, useState } from 'react';
import { api, type MealType, type Macros, type FoodSearchItem } from '../api';
import { Button } from './ui';

const MEAL_LABELS: Record<MealType, string> = {
  breakfast: 'Завтрак',
  lunch: 'Обед',
  dinner: 'Ужин',
  snack: 'Перекус',
};
const MEALS: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];

interface Row {
  mealType: MealType;
  title: string;
  grams: string;
  per100: Macros | null; // enables auto recompute on grams change
  kcal: number | null;
  protein: number | null;
  fat: number | null;
  carbs: number | null;
}

function ymd(offset = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 10);
}

const blankRow = (mealType: MealType): Row => ({
  mealType,
  title: '',
  grams: '',
  per100: null,
  kcal: null,
  protein: null,
  fat: null,
  carbs: null,
});

// Recompute kcal/macros for a row from its per100 × grams.
function recompute(r: Row): Row {
  const g = Number(r.grams);
  if (r.per100 && g > 0) {
    const f = g / 100;
    return {
      ...r,
      kcal: Math.round(r.per100.kcal * f),
      protein: Math.round(r.per100.protein * f),
      fat: Math.round(r.per100.fat * f),
      carbs: Math.round(r.per100.carbs * f),
    };
  }
  return r;
}

const WEEKDAYS = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
function dayLabel(offset: number): { wd: string; num: number } {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return { wd: WEEKDAYS[d.getDay()], num: d.getDate() };
}

export function CoachMealPlanEditor({ clientId }: { clientId: string }) {
  const [mode, setMode] = useState<'day' | 'week'>('day');
  const [offset, setOffset] = useState(0);
  const date = ymd(offset);
  const draftKey = `jf.mealplan.${clientId}.${date}`;
  const [copying, setCopying] = useState(false);
  const [copied, setCopied] = useState(false);

  const [rows, setRows] = useState<Row[]>([]);
  const [note, setNote] = useState('');
  const [doneInfo, setDoneInfo] = useState<{ done: number; total: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  function saveDraft(r: Row[], n: string) {
    try {
      if (r.length || n) localStorage.setItem(draftKey, JSON.stringify({ rows: r, note: n }));
      else localStorage.removeItem(draftKey);
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setSaved(false);

    // Prefer an unsaved local draft for this (client, date).
    let draft: { rows: Row[]; note: string } | null = null;
    try {
      const raw = localStorage.getItem(draftKey);
      if (raw) draft = JSON.parse(raw);
    } catch {
      draft = null;
    }

    api
      .coachMealPlan(clientId, date)
      .then((r) => {
        if (!alive) return;
        const p = r.plan;
        setDoneInfo(p ? { done: p.items.filter((i) => i.done).length, total: p.items.length } : null);
        if (draft) {
          setRows(draft.rows);
          setNote(draft.note);
        } else if (p) {
          setRows(
            p.items.map((it) => {
              const g = it.grams ?? 0;
              const per100: Macros | null =
                g > 0
                  ? {
                      kcal: ((it.kcal ?? 0) * 100) / g,
                      protein: ((it.protein ?? 0) * 100) / g,
                      fat: ((it.fat ?? 0) * 100) / g,
                      carbs: ((it.carbs ?? 0) * 100) / g,
                    }
                  : null;
              return {
                mealType: it.mealType,
                title: it.title,
                grams: it.grams != null ? String(it.grams) : '',
                per100,
                kcal: it.kcal,
                protein: it.protein,
                fat: it.fat,
                carbs: it.carbs,
              };
            }),
          );
          setNote(p.note ?? '');
        } else {
          setRows([]);
          setNote('');
        }
      })
      .catch(() => {
        if (!alive) return;
        if (draft) {
          setRows(draft.rows);
          setNote(draft.note);
        }
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, date]);

  function mutate(updater: (prev: Row[]) => Row[]) {
    setRows((prev) => {
      const next = updater(prev);
      saveDraft(next, note);
      return next;
    });
  }
  const addRow = (mealType: MealType) => mutate((r) => [...r, blankRow(mealType)]);
  const remove = (i: number) => mutate((r) => r.filter((_, j) => j !== i));
  const update = (i: number, patch: Partial<Row>) =>
    mutate((r) => r.map((row, j) => (j === i ? recompute({ ...row, ...patch }) : row)));
  const changeNote = (n: string) => {
    setNote(n);
    saveDraft(rows, n);
  };

  async function save() {
    setSaving(true);
    setSaved(false);
    try {
      await api.saveMealPlan(clientId, {
        date,
        note: note.trim() || null,
        items: rows
          .filter((r) => r.title.trim())
          .map((r) => ({
            mealType: r.mealType,
            title: r.title.trim(),
            grams: r.grams ? Number(r.grams) : null,
            kcal: r.kcal,
            protein: r.protein,
            fat: r.fat,
            carbs: r.carbs,
          })),
      });
      try {
        localStorage.removeItem(draftKey);
      } catch {
        /* ignore */
      }
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  // Save the current items/note to all 7 days of the coming week.
  async function copyWeek() {
    setCopying(true);
    setCopied(false);
    try {
      const items = rows
        .filter((r) => r.title.trim())
        .map((r) => ({
          mealType: r.mealType,
          title: r.title.trim(),
          grams: r.grams ? Number(r.grams) : null,
          kcal: r.kcal,
          protein: r.protein,
          fat: r.fat,
          carbs: r.carbs,
        }));
      for (let o = 0; o < 7; o++) {
        const d = ymd(o);
        await api.saveMealPlan(clientId, { date: d, note: note.trim() || null, items });
        try {
          localStorage.removeItem(`jf.mealplan.${clientId}.${d}`);
        } catch {
          /* ignore */
        }
      }
      setCopied(true);
    } finally {
      setCopying(false);
    }
  }

  return (
    <div className="jf-tile p-3 flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <div className="jf-eyebrow" style={{ color: 'var(--accent)' }}>
            План питания {mode === 'week' ? 'на неделю' : 'на день'}
          </div>
          <div className="jf-seg" style={{ width: 150 }}>
            {(['day', 'week'] as const).map((m) => (
              <button
                key={m}
                data-active={mode === m}
                onClick={() => {
                  setMode(m);
                  if (m === 'day' && offset > 1) setOffset(0);
                }}
              >
                {m === 'day' ? 'День' : 'Неделя'}
              </button>
            ))}
          </div>
        </div>

        {mode === 'day' ? (
          <div className="jf-seg">
            {[0, 1].map((o) => (
              <button key={o} data-active={offset === o} onClick={() => setOffset(o)}>
                {o === 0 ? 'Сегодня' : 'Завтра'}
              </button>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: 7 }, (_, o) => {
              const l = dayLabel(o);
              return (
                <button
                  key={o}
                  onClick={() => setOffset(o)}
                  className="rounded-lg py-1.5 flex flex-col items-center gap-0.5 jf-press"
                  style={
                    offset === o
                      ? { background: 'var(--accent)', color: 'var(--on-accent)' }
                      : { background: 'var(--surface)', border: '1px solid var(--line)' }
                  }
                >
                  <span className="text-[9px] uppercase">{l.wd}</span>
                  <span className="text-xs font-bold tabular">{l.num}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {doneInfo && doneInfo.total > 0 && (
        <div className="text-[11px] text-brand-energy font-semibold">
          Клиент выполнил {doneInfo.done} из {doneInfo.total}
        </div>
      )}

      {loading ? (
        <p className="text-brand-muted text-xs">Загрузка…</p>
      ) : (
        <>
          <div className="flex flex-col gap-2.5">
            {rows.map((row, i) => (
              <FoodRow
                key={i}
                row={row}
                onChange={(patch) => update(i, patch)}
                onRemove={() => remove(i)}
              />
            ))}
          </div>

          <button
            className="self-start text-brand-accent text-sm font-medium"
            onClick={() => addRow(rows.length ? rows[rows.length - 1].mealType : 'breakfast')}
          >
            ＋ Добавить пункт
          </button>

          <textarea
            className="rounded-lg bg-brand-bg brand-line p-2 text-sm outline-none resize-none"
            rows={2}
            placeholder="Заметка к плану (необязательно)"
            value={note}
            onChange={(e) => changeNote(e.target.value)}
          />

          <Button variant="primary" onClick={save} disabled={saving} className="p-3">
            {saving ? 'Сохраняем…' : saved ? 'Сохранено ✓' : `Сохранить на ${dayLabel(offset).num}-е`}
          </Button>

          {mode === 'week' && (
            <button
              className="text-brand-accent text-sm font-medium jf-press disabled:opacity-60"
              onClick={copyWeek}
              disabled={copying}
            >
              {copying ? 'Копирую…' : copied ? 'Скопировано на неделю ✓' : '⧉ Скопировать этот план на всю неделю'}
            </button>
          )}
        </>
      )}
    </div>
  );
}

function FoodRow({
  row,
  onChange,
  onRemove,
}: {
  row: Row;
  onChange: (patch: Partial<Row>) => void;
  onRemove: () => void;
}) {
  const [results, setResults] = useState<FoodSearchItem[] | null>(null);
  const [open, setOpen] = useState(false);
  const justPicked = useRef(false);

  // Debounced food search as the coach types (unless they just picked one).
  useEffect(() => {
    if (justPicked.current) {
      justPicked.current = false;
      return;
    }
    const q = row.title.trim();
    if (q.length < 2) {
      setResults(null);
      setOpen(false);
      return;
    }
    const t = setTimeout(() => {
      api
        .coachSearchFoods(q)
        .then((r) => {
          setResults(r.foods.slice(0, 8));
          setOpen(true);
        })
        .catch(() => setResults(null));
    }, 400);
    return () => clearTimeout(t);
  }, [row.title]);

  function pick(food: FoodSearchItem) {
    justPicked.current = true;
    setOpen(false);
    onChange({ title: food.name, per100: food.per100, grams: row.grams || '100' });
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5">
        <select
          className="rounded-lg bg-brand-bg brand-line p-1.5 text-xs outline-none"
          value={row.mealType}
          onChange={(e) => onChange({ mealType: e.target.value as MealType })}
        >
          {MEALS.map((m) => (
            <option key={m} value={m}>
              {MEAL_LABELS[m]}
            </option>
          ))}
        </select>
        <div className="relative flex-1 min-w-0">
          <input
            className="w-full rounded-lg bg-brand-bg brand-line p-1.5 text-sm outline-none"
            placeholder="Продукт (напр. «Овсянка»)"
            value={row.title}
            onChange={(e) => onChange({ title: e.target.value, per100: null })}
            onFocus={() => results && setOpen(true)}
          />
          {open && results && results.length > 0 && (
            <ul className="absolute z-20 left-0 right-0 mt-1 rounded-xl bg-brand-surface2 brand-line max-h-44 overflow-y-auto shadow-lg">
              {results.map((f) => (
                <li key={f.id}>
                  <button
                    className="w-full text-left px-2.5 py-1.5 text-sm hover:bg-brand-bg"
                    onClick={() => pick(f)}
                  >
                    {f.name}
                    <span className="text-brand-muted text-[11px]"> · {Math.round(f.per100.kcal)} ккал/100г</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <input
          className="w-16 rounded-lg bg-brand-bg brand-line p-1.5 text-sm outline-none tabular"
          placeholder="грамм"
          inputMode="numeric"
          value={row.grams}
          onChange={(e) => onChange({ grams: e.target.value.replace(/[^0-9]/g, '') })}
        />
        <button className="text-brand-muted px-1" onClick={onRemove} aria-label="Удалить">
          ✕
        </button>
      </div>
      <div className="text-[10px] pl-1" style={{ color: row.kcal != null ? 'var(--accent-strong)' : 'var(--muted)' }}>
        {row.kcal != null
          ? `${row.kcal} ккал · Б${row.protein} Ж${row.fat} У${row.carbs}`
          : 'выбери продукт из списка — ккал посчитается сама'}
      </div>
    </div>
  );
}
