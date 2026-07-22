// Coach-side meal-plan builder for one client. Add items per meal for a day
// (today / tomorrow), save; the client then ticks them off with photo reports.

import { useEffect, useState } from 'react';
import { api, type MealType } from '../api';
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
  kcal: string;
}

// Local YYYY-MM-DD, `offset` days from today.
function ymd(offset = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 10);
}

export function CoachMealPlanEditor({ clientId }: { clientId: string }) {
  const [when, setWhen] = useState<0 | 1>(0);
  const date = ymd(when);
  const [rows, setRows] = useState<Row[]>([]);
  const [note, setNote] = useState('');
  const [doneInfo, setDoneInfo] = useState<{ done: number; total: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setSaved(false);
    api
      .coachMealPlan(clientId, date)
      .then((r) => {
        if (!alive) return;
        const p = r.plan;
        setRows(
          p ? p.items.map((it) => ({ mealType: it.mealType, title: it.title, kcal: it.kcal != null ? String(it.kcal) : '' })) : [],
        );
        setNote(p?.note ?? '');
        setDoneInfo(p ? { done: p.items.filter((i) => i.done).length, total: p.items.length } : null);
      })
      .catch(() => alive && setRows([]))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [clientId, date]);

  const addRow = (mealType: MealType) => setRows((r) => [...r, { mealType, title: '', kcal: '' }]);
  const update = (i: number, p: Partial<Row>) =>
    setRows((r) => r.map((row, j) => (j === i ? { ...row, ...p } : row)));
  const remove = (i: number) => setRows((r) => r.filter((_, j) => j !== i));

  async function save() {
    setSaving(true);
    setSaved(false);
    try {
      await api.saveMealPlan(clientId, {
        date,
        note: note.trim() || null,
        items: rows
          .filter((r) => r.title.trim())
          .map((r) => ({ mealType: r.mealType, title: r.title.trim(), kcal: r.kcal ? Number(r.kcal) : null })),
      });
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="jf-tile p-3 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <div className="jf-eyebrow" style={{ color: 'var(--accent)' }}>
          План питания на день
        </div>
        <div className="jf-seg" style={{ width: 150 }}>
          {([0, 1] as const).map((v) => (
            <button key={v} data-active={when === v} onClick={() => setWhen(v)}>
              {v === 0 ? 'Сегодня' : 'Завтра'}
            </button>
          ))}
        </div>
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
          <div className="flex flex-col gap-2">
            {rows.map((row, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <select
                  className="rounded-lg bg-brand-bg brand-line p-1.5 text-xs outline-none"
                  value={row.mealType}
                  onChange={(e) => update(i, { mealType: e.target.value as MealType })}
                >
                  {MEALS.map((m) => (
                    <option key={m} value={m}>
                      {MEAL_LABELS[m]}
                    </option>
                  ))}
                </select>
                <input
                  className="flex-1 min-w-0 rounded-lg bg-brand-bg brand-line p-1.5 text-sm outline-none"
                  placeholder="напр. «Овсянка 60 г + банан»"
                  value={row.title}
                  onChange={(e) => update(i, { title: e.target.value })}
                />
                <input
                  className="w-14 rounded-lg bg-brand-bg brand-line p-1.5 text-sm outline-none tabular"
                  placeholder="ккал"
                  inputMode="numeric"
                  value={row.kcal}
                  onChange={(e) => update(i, { kcal: e.target.value.replace(/[^0-9]/g, '') })}
                />
                <button className="text-brand-muted px-1" onClick={() => remove(i)} aria-label="Удалить">
                  ✕
                </button>
              </div>
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
            onChange={(e) => setNote(e.target.value)}
          />

          <Button variant="primary" onClick={save} disabled={saving} className="p-3">
            {saving ? 'Сохраняем…' : saved ? 'Сохранено ✓' : 'Сохранить план'}
          </Button>
        </>
      )}
    </div>
  );
}
