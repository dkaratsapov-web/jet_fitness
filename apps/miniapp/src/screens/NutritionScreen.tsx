import { useEffect, useState } from 'react';
import {
  api,
  type NutritionDay,
  type NutritionStats,
  type MealType,
  type FoodSearchItem,
} from '../api';
import { LineChart } from '../components/LineChart';
import { Ring } from '../components/Ring';

const MEAL_LABELS: Record<MealType, string> = {
  breakfast: 'Завтрак',
  lunch: 'Обед',
  dinner: 'Ужин',
  snack: 'Перекус',
};

const TODAY = new Date().toISOString().slice(0, 10);

function shiftDate(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
function humanDate(iso: string): string {
  if (iso === TODAY) return 'Сегодня';
  if (iso === shiftDate(TODAY, -1)) return 'Вчера';
  return new Date(`${iso}T00:00:00.000Z`).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
  });
}

// Client nutrition (Phase 2): per-day calories & macros vs target, any date,
// with 30-day statistics and auto-insights.
export function NutritionScreen({
  onBack,
  onComment,
}: {
  onBack?: () => void;
  onComment?: (label: string) => void;
}) {
  const [date, setDate] = useState(TODAY);
  const [view, setView] = useState<'day' | 'stats'>('day');
  const [day, setDay] = useState<NutritionDay | null>(null);
  const [stats, setStats] = useState<NutritionStats | null>(null);
  const [adding, setAdding] = useState(false);

  function loadDay(d = date) {
    api.nutritionDay(d).then(setDay).catch(() => setDay(null));
  }
  useEffect(() => {
    loadDay(date);
  }, [date]);
  useEffect(() => {
    api.nutritionStats(30).then(setStats).catch(() => setStats(null));
  }, []);

  function reload() {
    loadDay(date);
    api.nutritionStats(30).then(setStats).catch(() => setStats(null));
  }

  async function remove(id: string) {
    await api.deleteMeal(id).catch(() => undefined);
    reload();
  }

  const t = day?.totals;
  const goal = day?.target;
  const isToday = date === TODAY;

  return (
    <div className="flex flex-col gap-4 p-4">
      <header className="flex items-center justify-between">
        {onBack ? (
          <button className="text-tg-link text-sm" onClick={onBack}>
            ← Назад
          </button>
        ) : (
          <span className="w-12" />
        )}
        <h1 className="text-lg font-semibold">Питание</h1>
        {onComment ? (
          <button
            className="text-brand-accent text-xs font-medium"
            onClick={() => onComment(`Питание · ${humanDate(date)}`)}
          >
            💬 Тренеру
          </button>
        ) : (
          <span className="w-12" />
        )}
      </header>

      {/* День / Статистика */}
      <div className="flex gap-1 rounded-2xl bg-brand-surface brand-line p-1">
        {(['day', 'stats'] as const).map((v) => (
          <button
            key={v}
            className={`flex-1 rounded-xl py-2 text-[13px] font-semibold transition-all ${
              view === v
                ? 'bg-brand-accent text-brand-onAccent shadow-[0_4px_16px_-4px_rgba(201,169,106,0.6)]'
                : 'text-brand-muted'
            }`}
            onClick={() => setView(v)}
          >
            {v === 'day' ? 'Дневник' : 'Статистика'}
          </button>
        ))}
      </div>

      {view === 'day' ? (
        <>
          {/* date picker */}
          <div className="jf-card p-2 flex items-center justify-between">
            <button
              className="w-9 h-9 rounded-xl bg-tg-bg text-brand-accent text-lg"
              onClick={() => setDate((d) => shiftDate(d, -1))}
            >
              ‹
            </button>
            <div className="text-sm font-semibold">{humanDate(date)}</div>
            <button
              className="w-9 h-9 rounded-xl bg-tg-bg text-brand-accent text-lg disabled:opacity-30"
              onClick={() => setDate((d) => shiftDate(d, 1))}
              disabled={isToday}
            >
              ›
            </button>
          </div>

          {t && (
            <div className="jf-card p-4 flex flex-col gap-3">
              <div className="flex items-center gap-4">
                <Ring value={t.kcal} goal={goal?.kcal ?? null} size={84} stroke={9}>
                  <span className="text-lg font-bold leading-none tabular">{t.kcal}</span>
                  <span className="text-brand-muted text-[10px] mt-0.5">ккал</span>
                </Ring>
                <div className="flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-bold tabular">{t.kcal}</span>
                    <span className="text-brand-muted text-sm">{goal ? `/ ${goal.kcal}` : ''}</span>
                  </div>
                  {goal ? (
                    <div className="text-brand-muted text-xs mb-2">
                      осталось {Math.max(0, goal.kcal - t.kcal)} ккал
                    </div>
                  ) : (
                    <div className="text-brand-muted text-xs mb-2">цель задаёт тренер</div>
                  )}
                  <div className="flex gap-2">
                    <MacroBar label="Б" value={t.protein} goal={goal?.protein} />
                    <MacroBar label="Ж" value={t.fat} goal={goal?.fat} />
                    <MacroBar label="У" value={t.carbs} goal={goal?.carbs} />
                  </div>
                </div>
              </div>
            </div>
          )}

          <button
            className="rounded-2xl bg-gradient-to-b from-brand-accentStrong to-brand-accent text-brand-onAccent p-4 font-semibold shadow-[0_8px_24px_-8px_rgba(201,169,106,0.6)] active:scale-[0.99] transition-transform"
            onClick={() => setAdding(true)}
          >
            ➕ Добавить приём пищи
          </button>

          <section className="flex flex-col gap-2">
            {day && day.meals.length === 0 ? (
              <p className="text-brand-muted text-sm">
                {isToday ? 'Сегодня' : 'В этот день'} записей нет. Добавьте приём пищи.
              </p>
            ) : (
              day?.meals.map((m) => (
                <div key={m.id} className="jf-card p-3 flex items-center justify-between">
                  <div>
                    <div className="font-medium text-sm">
                      {m.name}{' '}
                      <span className="text-brand-muted font-normal">· {MEAL_LABELS[m.mealType]}</span>
                    </div>
                    <div className="text-brand-muted text-xs">
                      {m.grams} г · {m.kcal} ккал · Б{m.protein} Ж{m.fat} У{m.carbs}
                    </div>
                  </div>
                  <button className="text-brand-muted text-xs px-1" onClick={() => remove(m.id)}>
                    ✕
                  </button>
                </div>
              ))
            )}
          </section>
        </>
      ) : (
        <StatsView stats={stats} />
      )}

      {adding && (
        <AddMealModal
          date={date}
          onClose={() => setAdding(false)}
          onAdded={() => {
            setAdding(false);
            reload();
          }}
        />
      )}
    </div>
  );
}

// 30-day statistics + auto-insights.
function StatsView({ stats }: { stats: NutritionStats | null }) {
  if (!stats) return <p className="text-brand-muted text-sm">Загрузка…</p>;
  if (stats.loggedDays === 0) {
    return (
      <p className="text-brand-muted text-sm">
        Пока нет данных. Веди дневник несколько дней — появится статистика и выводы.
      </p>
    );
  }
  const a = stats.averages;
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="jf-card p-3">
          <div className="text-brand-muted text-[10px] font-bold uppercase tracking-wide">
            Средние калории
          </div>
          <div className="text-2xl font-bold tabular mt-1">{a.kcal}</div>
          <div className="text-brand-muted text-[11px]">за {stats.loggedDays} дн.</div>
        </div>
        <div className="jf-card p-3">
          <div className="text-brand-muted text-[10px] font-bold uppercase tracking-wide">
            В пределах цели
          </div>
          <div className="text-2xl font-bold tabular mt-1 text-brand-accent">
            {stats.adherencePct}%
          </div>
          <div className="text-brand-muted text-[11px]">дней в норме</div>
        </div>
      </div>

      <div className="jf-card p-3 flex flex-col gap-2">
        <div className="text-brand-muted text-xs font-medium">Калории по дням</div>
        <LineChart
          unit=" ккал"
          points={stats.days
            .filter((d) => d.kcal > 0)
            .map((d) => ({
              value: d.kcal,
              label: new Date(`${d.date}T00:00:00.000Z`).toLocaleDateString('ru-RU', {
                day: 'numeric',
                month: 'short',
              }),
            }))}
        />
        <div className="text-brand-muted text-xs">
          Среднее БЖУ: Б{a.protein} · Ж{a.fat} · У{a.carbs}
        </div>
      </div>

      {stats.insights.length > 0 && (
        <div className="jf-card p-3 flex flex-col gap-2">
          <div className="text-brand-accent text-[11px] font-bold uppercase tracking-[0.16em]">
            Выводы
          </div>
          <ul className="flex flex-col gap-1.5">
            {stats.insights.map((s, i) => (
              <li key={i} className="text-sm flex gap-2">
                <span className="text-brand-accent">•</span>
                <span>{s}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function MacroBar({ label, value, goal }: { label: string; value: number; goal?: number }) {
  const pct = goal && goal > 0 ? Math.min(100, (value / goal) * 100) : 0;
  return (
    <div className="flex-1">
      <div className="text-brand-muted text-[10px] mb-1">
        {label} {value}
        {goal != null && <span className="opacity-70">/{goal}</span>}
      </div>
      <div className="h-1.5 rounded-full bg-brand-surface2 overflow-hidden">
        <div className="h-full rounded-full bg-brand-accent" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function AddMealModal({
  date,
  onClose,
  onAdded,
}: {
  date: string;
  onClose: () => void;
  onAdded: () => void;
}) {
  const [mealType, setMealType] = useState<MealType>('breakfast');
  const [q, setQ] = useState('');
  const [results, setResults] = useState<FoodSearchItem[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [manual, setManual] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Manual fields.
  const [name, setName] = useState('');
  const [grams, setGrams] = useState('100');
  const [kcal, setKcal] = useState('');
  const [protein, setProtein] = useState('');
  const [fat, setFat] = useState('');
  const [carbs, setCarbs] = useState('');

  async function search() {
    if (q.trim().length < 2) return;
    setSearching(true);
    setError(null);
    try {
      const r = await api.searchFoods(q.trim());
      setResults(r.foods);
    } catch (e) {
      setError(String(e));
    } finally {
      setSearching(false);
    }
  }

  async function addFromFood(food: FoodSearchItem, g: number) {
    setBusy(true);
    try {
      await api.addMeal({ mealType, grams: g, foodItemId: food.id, date });
      onAdded();
    } finally {
      setBusy(false);
    }
  }

  async function addManual() {
    setError(null);
    if (!name.trim()) return setError('Введите название');
    if (!kcal) return setError('Укажите калорийность на 100 г');
    if (!grams || Number(grams) <= 0) return setError('Укажите граммы');
    setBusy(true);
    try {
      await api.addMeal({
        mealType,
        grams: Number(grams),
        name: name.trim(),
        date,
        per100: {
          kcal: Number(kcal) || 0,
          protein: Number(protein) || 0,
          fat: Number(fat) || 0,
          carbs: Number(carbs) || 0,
        },
      });
      onAdded();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end justify-center z-50" onClick={onClose}>
      <div
        className="bg-tg-bg rounded-t-3xl w-full max-w-md p-4 flex flex-col gap-3 max-h-[88vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Добавить приём пищи</h2>
          <button className="text-tg-hint" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="grid grid-cols-4 gap-1">
          {(Object.keys(MEAL_LABELS) as MealType[]).map((mt) => (
            <button
              key={mt}
              className={`rounded-lg py-2 text-xs ${
                mealType === mt ? 'bg-tg-button text-tg-buttonText' : 'bg-tg-secondaryBg text-tg-hint'
              }`}
              onClick={() => setMealType(mt)}
            >
              {MEAL_LABELS[mt]}
            </button>
          ))}
        </div>

        <div className="flex gap-2">
          <button
            className={`flex-1 rounded-lg py-2 text-sm ${!manual ? 'bg-tg-secondaryBg font-medium' : 'text-tg-hint'}`}
            onClick={() => setManual(false)}
          >
            Поиск
          </button>
          <button
            className={`flex-1 rounded-lg py-2 text-sm ${manual ? 'bg-tg-secondaryBg font-medium' : 'text-tg-hint'}`}
            onClick={() => setManual(true)}
          >
            Вручную
          </button>
        </div>

        {error && <p className="text-red-500 text-sm">{error}</p>}

        {!manual ? (
          <>
            <div className="flex gap-2">
              <input
                className="flex-1 rounded-xl bg-tg-secondaryBg p-3 outline-none"
                placeholder="Продукт (напр. «творог 5%»)"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && search()}
              />
              <button
                className="rounded-xl bg-tg-button text-tg-buttonText px-4 text-sm disabled:opacity-60"
                onClick={search}
                disabled={searching}
              >
                {searching ? '…' : 'Найти'}
              </button>
            </div>
            {results && results.length === 0 && (
              <p className="text-tg-hint text-sm">
                Ничего не найдено. Попробуйте другое название или добавьте вручную.
              </p>
            )}
            {results?.map((f) => (
              <FoodResult key={f.id} food={f} busy={busy} onAdd={(g) => addFromFood(f, g)} />
            ))}
          </>
        ) : (
          <>
            <input
              className="rounded-xl bg-tg-secondaryBg p-3 outline-none"
              placeholder="Название"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <div className="grid grid-cols-2 gap-2">
              <Field label="Граммы" value={grams} onChange={setGrams} />
              <Field label="Ккал / 100 г" value={kcal} onChange={setKcal} />
              <Field label="Белки / 100 г" value={protein} onChange={setProtein} />
              <Field label="Жиры / 100 г" value={fat} onChange={setFat} />
              <Field label="Углев. / 100 г" value={carbs} onChange={setCarbs} />
            </div>
            <button
              className="rounded-xl bg-tg-button text-tg-buttonText p-3 font-medium disabled:opacity-60"
              onClick={addManual}
              disabled={busy}
            >
              {busy ? 'Добавляем…' : 'Добавить'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function FoodResult({
  food,
  onAdd,
  busy,
}: {
  food: FoodSearchItem;
  onAdd: (grams: number) => void;
  busy: boolean;
}) {
  const [grams, setGrams] = useState('100');
  return (
    <div className="rounded-xl bg-tg-secondaryBg p-3 flex items-center justify-between gap-2">
      <div className="min-w-0">
        <div className="text-sm font-medium truncate">{food.name}</div>
        <div className="text-tg-hint text-xs">
          {food.per100.kcal} ккал · Б{food.per100.protein} Ж{food.per100.fat} У{food.per100.carbs} / 100 г
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <input
          className="w-14 rounded-lg bg-tg-bg p-2 text-sm outline-none tabular"
          type="text"
          inputMode="numeric"
          value={grams}
          onChange={(e) => setGrams(numericOnly(e.target.value))}
        />
        <span className="text-tg-hint text-xs">г</span>
        <button
          className="rounded-lg bg-tg-button text-tg-buttonText px-3 py-2 text-sm disabled:opacity-60"
          onClick={() => onAdd(Number(grams) || 0)}
          disabled={busy || !grams}
        >
          +
        </button>
      </div>
    </div>
  );
}

// Digits + a single decimal separator only.
function numericOnly(raw: string): string {
  let s = raw.replace(',', '.').replace(/[^0-9.]/g, '');
  const dot = s.indexOf('.');
  if (dot !== -1) s = s.slice(0, dot + 1) + s.slice(dot + 1).replace(/\./g, '');
  return s;
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
        className="rounded-lg bg-brand-surface2 brand-line p-2 text-sm outline-none tabular focus:border-brand-accent"
        type="text"
        inputMode="decimal"
        placeholder="—"
        value={value}
        onChange={(e) => onChange(numericOnly(e.target.value))}
      />
    </label>
  );
}
