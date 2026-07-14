import { useEffect, useState } from 'react';
import {
  api,
  type NutritionDay,
  type NutritionStats,
  type NutritionMeal,
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

// Local calendar date (YYYY-MM-DD) — NOT UTC. Keying the day on the user's own
// timezone keeps "Сегодня" aligned with their real day; a UTC-based day made
// entries seem to vanish once midnight UTC passed but local midnight had not.
function localDate(d = new Date()): string {
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}
const TODAY = localDate();

function shiftDate(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
function humanDate(iso: string): string {
  if (iso === TODAY) return 'Сегодня';
  if (iso === shiftDate(TODAY, -1)) return 'Вчера';
  // Noon UTC avoids the displayed date rolling to a neighbouring day.
  return new Date(`${iso}T12:00:00.000Z`).toLocaleDateString('ru-RU', {
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
  const [editing, setEditing] = useState<NutritionMeal | null>(null);

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
                    <MacroBar label="Белки" value={t.protein} goal={goal?.protein} />
                    <MacroBar label="Жиры" value={t.fat} goal={goal?.fat} />
                    <MacroBar label="Углеводы" value={t.carbs} goal={goal?.carbs} />
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
                  <button
                    className="flex-1 min-w-0 text-left active:opacity-70"
                    onClick={() => setEditing(m)}
                  >
                    <div className="font-medium text-sm">
                      {m.name}{' '}
                      <span className="text-brand-muted font-normal">· {MEAL_LABELS[m.mealType]}</span>
                    </div>
                    <div className="text-brand-muted text-xs">
                      {m.grams} г · {m.kcal} ккал · Белки {m.protein} · Жиры {m.fat} · Углеводы{' '}
                      {m.carbs}
                    </div>
                  </button>
                  <button
                    className="text-brand-muted text-xs px-2 py-1 shrink-0"
                    onClick={() => remove(m.id)}
                  >
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

      {editing && (
        <EditMealModal
          meal={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            reload();
          }}
          onDeleted={() => {
            setEditing(null);
            reload();
          }}
        />
      )}
    </div>
  );
}

// Edit a previously-logged meal: change the meal slot or the portion (grams).
// Macros scale from the stored per-portion values, so the preview stays honest.
function EditMealModal({
  meal,
  onClose,
  onSaved,
  onDeleted,
}: {
  meal: NutritionMeal;
  onClose: () => void;
  onSaved: () => void;
  onDeleted: () => void;
}) {
  const [mealType, setMealType] = useState<MealType>(meal.mealType);
  const [grams, setGrams] = useState<number>(meal.grams);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const per100Kcal = meal.grams > 0 ? (meal.kcal / meal.grams) * 100 : 0;
  const piece = PIECE_FOODS.find((p) => p.re.test(meal.name));
  const base = piece ? piece.grams : 100;
  const kcal = Math.round((per100Kcal * grams) / 100);

  async function save() {
    if (!grams || grams <= 0) return setError('Укажите граммы');
    setBusy(true);
    setError(null);
    try {
      await api.updateMeal(meal.id, { grams, mealType });
      onSaved();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function del() {
    setBusy(true);
    try {
      await api.deleteMeal(meal.id).catch(() => undefined);
      onDeleted();
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
          <h2 className="text-lg font-semibold">Изменить приём пищи</h2>
          <button className="text-tg-hint" onClick={onClose}>
            ✕
          </button>
        </div>

        <div>
          <div className="text-sm font-medium">{meal.name}</div>
          <div className="text-brand-muted text-xs">
            {Math.round(per100Kcal)} ккал / 100 г
          </div>
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

        {error && <p className="text-red-500 text-sm">{error}</p>}

        <div className="flex gap-1.5 flex-wrap">
          {FRACTIONS.map((f) => {
            const g = Math.round(base * f.v);
            const on = grams === g;
            return (
              <button
                key={f.label}
                className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${
                  on ? 'bg-brand-accent text-brand-onAccent' : 'bg-brand-surface2 text-brand-muted'
                }`}
                onClick={() => setGrams(g)}
              >
                {f.label}
                {piece ? ' шт' : ''}
              </button>
            );
          })}
        </div>
        <div className="text-brand-muted text-[10px]">
          {piece ? `1 шт ≈ ${piece.grams} г (${piece.unit})` : '1 порция = 100 г'}
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <input
              className="w-16 rounded-lg bg-tg-secondaryBg p-2 text-sm outline-none tabular"
              type="text"
              inputMode="numeric"
              value={String(grams)}
              onChange={(e) => setGrams(Number(numericOnly(e.target.value)) || 0)}
            />
            <span className="text-brand-muted text-xs">г</span>
          </div>
          <span className="text-brand-muted text-xs flex-1">≈ {kcal} ккал</span>
        </div>

        <button
          className="rounded-xl bg-tg-button text-tg-buttonText p-3 font-medium disabled:opacity-60"
          onClick={save}
          disabled={busy}
        >
          {busy ? 'Сохраняем…' : 'Сохранить'}
        </button>
        <button
          className="rounded-xl text-red-500 p-2 text-sm disabled:opacity-60"
          onClick={del}
          disabled={busy}
        >
          Удалить позицию
        </button>
      </div>
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

// Approximate per-piece weights so foods like eggs can be counted by unit.
const PIECE_FOODS: Array<{ re: RegExp; grams: number; unit: string }> = [
  { re: /яйц|яиц/i, grams: 60, unit: 'яйцо' },
  { re: /банан/i, grams: 120, unit: 'банан' },
  { re: /яблок/i, grams: 150, unit: 'яблоко' },
  { re: /(хлеб|тост|ломт|батон)/i, grams: 30, unit: 'ломтик' },
  { re: /огур/i, grams: 100, unit: 'огурец' },
  { re: /(помидор|томат)/i, grams: 90, unit: 'помидор' },
  { re: /мандарин/i, grams: 60, unit: 'мандарин' },
  { re: /(апельсин)/i, grams: 180, unit: 'апельсин' },
];

const FRACTIONS: Array<{ label: string; v: number }> = [
  { label: '¼', v: 0.25 },
  { label: '⅓', v: 1 / 3 },
  { label: '½', v: 0.5 },
  { label: '⅔', v: 2 / 3 },
  { label: '1', v: 1 },
  { label: '1½', v: 1.5 },
  { label: '2', v: 2 },
];

function FoodResult({
  food,
  onAdd,
  busy,
}: {
  food: FoodSearchItem;
  onAdd: (grams: number) => void;
  busy: boolean;
}) {
  const piece = PIECE_FOODS.find((p) => p.re.test(food.name));
  const base = piece ? piece.grams : 100;
  const [grams, setGrams] = useState<number>(piece ? piece.grams : 100);
  const kcal = Math.round((food.per100.kcal * grams) / 100);

  return (
    <div className="jf-card p-3 flex flex-col gap-2">
      <div className="min-w-0">
        <div className="text-sm font-medium">{food.name}</div>
        <div className="text-brand-muted text-xs">
          {food.per100.kcal} ккал · Б{food.per100.protein} Ж{food.per100.fat} У{food.per100.carbs} / 100 г
        </div>
      </div>

      {/* fractions of a base portion (1 piece for piece-foods, else 100 г) */}
      <div className="flex gap-1.5 flex-wrap">
        {FRACTIONS.map((f) => {
          const g = Math.round(base * f.v);
          const on = grams === g;
          return (
            <button
              key={f.label}
              className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${
                on ? 'bg-brand-accent text-brand-onAccent' : 'bg-brand-surface2 text-brand-muted'
              }`}
              onClick={() => setGrams(g)}
            >
              {f.label}
              {piece ? ' шт' : ''}
            </button>
          );
        })}
      </div>
      <div className="text-brand-muted text-[10px]">
        {piece ? `1 шт ≈ ${piece.grams} г (${piece.unit})` : '1 порция = 100 г'}
      </div>

      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1">
          <input
            className="w-16 rounded-lg bg-tg-bg p-2 text-sm outline-none tabular"
            type="text"
            inputMode="numeric"
            value={String(grams)}
            onChange={(e) => setGrams(Number(numericOnly(e.target.value)) || 0)}
          />
          <span className="text-brand-muted text-xs">г</span>
        </div>
        <span className="text-brand-muted text-xs flex-1">≈ {kcal} ккал</span>
        <button
          className="rounded-lg bg-brand-accent text-brand-onAccent px-4 py-2 text-sm font-semibold disabled:opacity-60"
          onClick={() => onAdd(grams)}
          disabled={busy || !grams}
        >
          Добавить
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
