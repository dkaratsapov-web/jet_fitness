// Client-side meal-plan tracker: the coach's plan for the day, with per-item
// checkboxes and an optional photo report. Renders nothing if there's no plan.

import { useEffect, useRef, useState } from 'react';
import { api, type MealPlan, type MealPlanItem, type MealType } from '../api';
import { ProgressBar } from './ui';
import { OliviaAvatar } from './Olivia';

const MEAL_LABELS: Record<MealType, string> = {
  breakfast: 'Завтрак',
  lunch: 'Обед',
  dinner: 'Ужин',
  snack: 'Перекус',
};
const MEAL_ORDER: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];

export function MealPlanCard({ date }: { date: string }) {
  const [plan, setPlan] = useState<MealPlan | null | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    setPlan(undefined);
    api
      .clientMealPlan(date)
      .then((r) => alive && setPlan(r.plan))
      .catch(() => alive && setPlan(null));
    return () => {
      alive = false;
    };
  }, [date]);

  if (!plan || plan.items.length === 0) return null;

  const patch = (id: string, p: Partial<MealPlanItem>) =>
    setPlan((cur) =>
      cur ? { ...cur, items: cur.items.map((it) => (it.id === id ? { ...it, ...p } : it)) } : cur,
    );

  const doneCount = plan.items.filter((it) => it.done).length;
  const pct = (doneCount / plan.items.length) * 100;

  return (
    <div
      className="jf-card p-4 flex flex-col gap-3"
      style={{
        background:
          'linear-gradient(180deg, var(--energy-soft), transparent 60%), var(--surface)',
      }}
    >
      <div className="flex items-center gap-2.5">
        <OliviaAvatar size={34} ring={false} />
        <div className="flex-1 min-w-0">
          <div className="jf-eyebrow" style={{ color: 'var(--energy)' }}>
            План на день от тренера
          </div>
          <div className="text-sm font-bold">
            Выполнено {doneCount} из {plan.items.length}
          </div>
        </div>
      </div>
      <ProgressBar pct={pct} tone="energy" />

      {plan.note && (
        <p className="text-[13px] text-brand-muted leading-snug">{plan.note}</p>
      )}

      <div className="flex flex-col gap-3">
        {MEAL_ORDER.map((mt) => {
          const items = plan.items.filter((it) => it.mealType === mt);
          if (items.length === 0) return null;
          return (
            <div key={mt} className="flex flex-col gap-1.5">
              <div className="text-[11px] font-bold uppercase tracking-wide text-brand-muted">
                {MEAL_LABELS[mt]}
              </div>
              {items.map((it) => (
                <PlanRow key={it.id} item={it} onPatch={patch} />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PlanRow({
  item,
  onPatch,
}: {
  item: MealPlanItem;
  onPatch: (id: string, p: Partial<MealPlanItem>) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    onPatch(item.id, { done: !item.done }); // optimistic
    try {
      const r = await api.toggleMealPlanItem(item.id);
      onPatch(item.id, { done: r.done });
    } catch {
      onPatch(item.id, { done: item.done }); // revert
    }
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    try {
      const r = await api.uploadMealPlanPhoto(item.id, file);
      onPatch(item.id, { photoUrl: r.photoUrl, done: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl bg-brand-bg p-2.5 flex items-center gap-2.5">
      <button
        onClick={toggle}
        aria-label={item.done ? 'Снять отметку' : 'Отметить выполнено'}
        className="w-6 h-6 rounded-lg shrink-0 grid place-items-center text-sm font-bold"
        style={
          item.done
            ? { background: 'var(--energy)', color: 'var(--on-energy)' }
            : { border: '1.5px solid var(--line)', color: 'transparent' }
        }
      >
        ✓
      </button>
      <div className={`flex-1 min-w-0 ${item.done ? 'opacity-60' : ''}`}>
        <div className={`text-sm ${item.done ? 'line-through' : 'font-medium'}`}>{item.title}</div>
        {item.kcal != null && <div className="text-brand-muted text-[11px]">{item.kcal} ккал</div>}
      </div>
      {item.photoUrl ? (
        <a href={item.photoUrl} target="_blank" rel="noreferrer" className="shrink-0">
          <img src={item.photoUrl} alt="фото" className="w-10 h-10 rounded-lg object-cover" />
        </a>
      ) : (
        <button
          className="shrink-0 w-9 h-9 rounded-lg bg-brand-surface2 brand-line grid place-items-center text-base disabled:opacity-50"
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          aria-label="Фотоотчёт"
        >
          {busy ? '…' : '📷'}
        </button>
      )}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={onFile}
      />
    </div>
  );
}
