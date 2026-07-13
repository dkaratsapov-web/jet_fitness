import { useEffect, useState } from 'react';
import { api, type ProgressEntry, type ProgressInput } from '../api';

// Body measurement fields (JSON keys → Russian labels), cm.
const MEASURES: Array<{ key: string; label: string }> = [
  { key: 'chest', label: 'Грудь' },
  { key: 'waist', label: 'Талия' },
  { key: 'hips', label: 'Бёдра' },
  { key: 'thigh', label: 'Бедро' },
  { key: 'arm', label: 'Рука' },
];

// Client progress (Phase 1): log weight / body-fat / measurements + history.
export function ProgressScreen({ onBack }: { onBack: () => void }) {
  const [entries, setEntries] = useState<ProgressEntry[] | null>(null);
  const [weight, setWeight] = useState('');
  const [bodyFat, setBodyFat] = useState('');
  const [measures, setMeasures] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function load() {
    api.clientProgress().then(setEntries).catch(() => setEntries([]));
  }
  useEffect(load, []);

  async function save() {
    setError(null);
    const measurements: Record<string, number> = {};
    for (const m of MEASURES) {
      const raw = measures[m.key];
      if (raw && !Number.isNaN(Number(raw))) measurements[m.key] = Number(raw);
    }
    const body: ProgressInput = {
      weightKg: weight ? Number(weight) : null,
      bodyFatPct: bodyFat ? Number(bodyFat) : null,
      measurements: Object.keys(measurements).length ? measurements : null,
    };
    if (!body.weightKg && !body.bodyFatPct && !body.measurements) {
      setError('Заполните хотя бы одно поле');
      return;
    }
    setSaving(true);
    try {
      await api.addProgress(body);
      setWeight('');
      setBodyFat('');
      setMeasures({});
      setEntries(null);
      load();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  const weights = (entries ?? []).filter((e) => e.weightKg != null);
  const latest = weights[0]?.weightKg ?? null;
  const prev = weights[1]?.weightKg ?? null;
  const delta = latest != null && prev != null ? +(latest - prev).toFixed(1) : null;

  return (
    <div className="flex flex-col gap-4 p-4">
      <header className="flex items-center justify-between">
        <button className="text-tg-link text-sm" onClick={onBack}>
          ← Назад
        </button>
        <h1 className="text-lg font-semibold">Прогресс</h1>
        <span className="w-12" />
      </header>

      {latest != null && (
        <div className="rounded-2xl bg-tg-secondaryBg p-4 flex items-baseline gap-2">
          <span className="text-3xl font-semibold">{latest}</span>
          <span className="text-tg-hint">кг</span>
          {delta != null && delta !== 0 && (
            <span className={`text-sm ml-2 ${delta < 0 ? 'text-green-500' : 'text-red-400'}`}>
              {delta > 0 ? '+' : ''}
              {delta} кг
            </span>
          )}
        </div>
      )}

      <section className="rounded-2xl bg-tg-secondaryBg p-3 flex flex-col gap-3">
        <div className="font-medium">Новый замер</div>
        <div className="grid grid-cols-2 gap-2">
          <NumField label="Вес, кг" value={weight} onChange={setWeight} />
          <NumField label="Жир, %" value={bodyFat} onChange={setBodyFat} />
        </div>
        <div className="grid grid-cols-3 gap-2">
          {MEASURES.map((m) => (
            <NumField
              key={m.key}
              label={`${m.label}, см`}
              value={measures[m.key] ?? ''}
              onChange={(v) => setMeasures((s) => ({ ...s, [m.key]: v }))}
            />
          ))}
        </div>
        {error && <p className="text-red-500 text-sm">{error}</p>}
        <button
          className="rounded-xl bg-tg-button text-tg-buttonText p-3 font-medium disabled:opacity-60"
          onClick={save}
          disabled={saving}
        >
          {saving ? 'Сохраняем…' : 'Сохранить замер'}
        </button>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-2">История</h2>
        {entries === null ? (
          <p className="text-tg-hint text-sm">Загрузка…</p>
        ) : entries.length === 0 ? (
          <p className="text-tg-hint text-sm">
            Пока нет замеров. Внесите первый — так тренер увидит вашу динамику.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {entries.map((e) => (
              <li key={e.id} className="rounded-2xl bg-tg-secondaryBg p-3">
                <div className="flex items-center justify-between">
                  <span className="text-tg-hint text-xs">{formatDate(e.date)}</span>
                  <span className="font-medium">
                    {e.weightKg != null ? `${e.weightKg} кг` : ''}
                    {e.bodyFatPct != null ? ` · ${e.bodyFatPct}% жира` : ''}
                  </span>
                </div>
                {e.measurements && Object.keys(e.measurements).length > 0 && (
                  <div className="text-tg-hint text-xs mt-1">
                    {MEASURES.filter((m) => e.measurements?.[m.key] != null)
                      .map((m) => `${m.label} ${e.measurements![m.key]}`)
                      .join(' · ')}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function NumField({
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
        className="rounded-lg bg-tg-bg p-2 text-sm outline-none w-full"
        inputMode="decimal"
        placeholder="—"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}
