import { useEffect, useState } from 'react';
import {
  api,
  type NutritionDay,
  type MealType,
  type FoodSearchItem,
} from '../api';

const MEAL_LABELS: Record<MealType, string> = {
  breakfast: 'Завтрак',
  lunch: 'Обед',
  dinner: 'Ужин',
  snack: 'Перекус',
};

// Client nutrition (Phase 2): daily calories & macros vs target + food logging.
export function NutritionScreen({ onBack }: { onBack: () => void }) {
  const [day, setDay] = useState<NutritionDay | null>(null);
  const [adding, setAdding] = useState(false);

  function load() {
    api.nutritionDay().then(setDay).catch(() => setDay(null));
  }
  useEffect(load, []);

  async function remove(id: string) {
    await api.deleteMeal(id).catch(() => undefined);
    load();
  }

  const t = day?.totals;
  const goal = day?.target;

  return (
    <div className="flex flex-col gap-4 p-4">
      <header className="flex items-center justify-between">
        <button className="text-tg-link text-sm" onClick={onBack}>
          ← Назад
        </button>
        <h1 className="text-lg font-semibold">Питание</h1>
        <span className="w-12" />
      </header>

      {t && (
        <div className="rounded-2xl bg-tg-secondaryBg p-4 flex flex-col gap-3">
          <div className="flex items-baseline justify-between">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-semibold">{t.kcal}</span>
              <span className="text-tg-hint">
                {goal ? `/ ${goal.kcal} ккал` : 'ккал'}
              </span>
            </div>
            {goal && (
              <span className="text-tg-hint text-sm">
                осталось {Math.max(0, goal.kcal - t.kcal)}
              </span>
            )}
          </div>
          {goal && <Bar value={t.kcal} max={goal.kcal} />}
          <div className="grid grid-cols-3 gap-2">
            <Macro label="Белки" value={t.protein} goal={goal?.protein} />
            <Macro label="Жиры" value={t.fat} goal={goal?.fat} />
            <Macro label="Углеводы" value={t.carbs} goal={goal?.carbs} />
          </div>
          {!goal && (
            <p className="text-tg-hint text-xs">
              Цель по калориям пока не задана — её выставляет тренер.
            </p>
          )}
        </div>
      )}

      <button
        className="rounded-2xl bg-tg-button text-tg-buttonText p-4 font-medium"
        onClick={() => setAdding(true)}
      >
        ➕ Добавить приём пищи
      </button>

      <section className="flex flex-col gap-2">
        {day && day.meals.length === 0 ? (
          <p className="text-tg-hint text-sm">Сегодня записей нет. Добавьте первый приём пищи.</p>
        ) : (
          day?.meals.map((m) => (
            <div
              key={m.id}
              className="rounded-2xl bg-tg-secondaryBg p-3 flex items-center justify-between"
            >
              <div>
                <div className="font-medium text-sm">
                  {m.name}{' '}
                  <span className="text-tg-hint font-normal">· {MEAL_LABELS[m.mealType]}</span>
                </div>
                <div className="text-tg-hint text-xs">
                  {m.grams} г · {m.kcal} ккал · Б{m.protein} Ж{m.fat} У{m.carbs}
                </div>
              </div>
              <button className="text-tg-hint text-xs px-1" onClick={() => remove(m.id)}>
                ✕
              </button>
            </div>
          ))
        )}
      </section>

      {adding && (
        <AddMealModal
          onClose={() => setAdding(false)}
          onAdded={() => {
            setAdding(false);
            load();
          }}
        />
      )}
    </div>
  );
}

function Bar({ value, max }: { value: number; max: number }) {
  const pct = Math.min(100, max > 0 ? (value / max) * 100 : 0);
  const over = value > max;
  return (
    <div className="h-2 rounded-full bg-tg-bg overflow-hidden">
      <div
        className={`h-full ${over ? 'bg-red-400' : 'bg-tg-link'}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function Macro({ label, value, goal }: { label: string; value: number; goal?: number }) {
  return (
    <div className="rounded-xl bg-tg-bg p-2 text-center">
      <div className="text-tg-hint text-[10px]">{label}</div>
      <div className="text-sm font-semibold">
        {value}
        {goal != null && <span className="text-tg-hint font-normal">/{goal}</span>}
      </div>
      <div className="text-tg-hint text-[10px]">г</div>
    </div>
  );
}

function AddMealModal({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
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
      await api.addMeal({ mealType, grams: g, foodItemId: food.id });
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
    <div className="fixed inset-0 bg-black/50 flex items-end justify-center z-10" onClick={onClose}>
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
          className="w-14 rounded-lg bg-tg-bg p-2 text-sm outline-none"
          inputMode="numeric"
          value={grams}
          onChange={(e) => setGrams(e.target.value)}
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
      <span className="text-tg-hint text-[10px] uppercase tracking-wide">{label}</span>
      <input
        className="rounded-lg bg-tg-secondaryBg p-2 text-sm outline-none"
        inputMode="decimal"
        placeholder="—"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
