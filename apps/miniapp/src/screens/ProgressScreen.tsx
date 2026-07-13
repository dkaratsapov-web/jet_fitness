import { useEffect, useRef, useState } from 'react';
import {
  api,
  type ProgressEntry,
  type ProgressInput,
  type ProgressPhoto,
  type PhotoType,
} from '../api';
import { LineChart } from '../components/LineChart';

// Body measurement fields (JSON keys → Russian labels), cm.
const MEASURES: Array<{ key: string; label: string }> = [
  { key: 'chest', label: 'Грудь' },
  { key: 'waist', label: 'Талия' },
  { key: 'hips', label: 'Бёдра' },
  { key: 'thigh', label: 'Бедро' },
  { key: 'arm', label: 'Рука' },
];

// Client progress (Phase 1): log weight / body-fat / measurements + history.
export function ProgressScreen({ onBack }: { onBack?: () => void }) {
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
      <header className="jf-rise flex items-center justify-between">
        {onBack ? (
          <button className="text-brand-accent text-sm font-medium" onClick={onBack}>
            ← Назад
          </button>
        ) : (
          <span className="w-12" />
        )}
        <h1 className="text-lg font-semibold">Прогресс</h1>
        <span className="w-12" />
      </header>

      {latest != null && (
        <div className="jf-card jf-rise jf-rise-1 p-4 flex flex-col gap-3">
          <div className="text-brand-muted text-[11px] font-semibold uppercase tracking-wide">
            Текущий вес
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-bold tabular text-brand-accent">{latest}</span>
            <span className="text-brand-muted">кг</span>
            {delta != null && delta !== 0 && (
              <span
                className="text-sm ml-2 font-semibold"
                style={{ color: delta < 0 ? 'var(--pos)' : 'var(--neg)' }}
              >
                {delta > 0 ? '+' : ''}
                {delta} кг
              </span>
            )}
          </div>
          {weights.length >= 2 && (
            <LineChart
              unit=" кг"
              points={[...weights]
                .reverse()
                .map((e) => ({ value: e.weightKg as number, label: shortDate(e.date) }))}
            />
          )}
        </div>
      )}

      <section className="jf-card jf-rise jf-rise-2 p-4 flex flex-col gap-3">
        <div className="text-brand-accent text-[11px] font-semibold uppercase tracking-[0.16em]">
          Новый замер
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <NumField label="Вес, кг" value={weight} onChange={setWeight} />
          <NumField label="Жир, %" value={bodyFat} onChange={setBodyFat} />
        </div>
        <div className="grid grid-cols-3 gap-2.5">
          {MEASURES.map((m) => (
            <NumField
              key={m.key}
              label={`${m.label}, см`}
              value={measures[m.key] ?? ''}
              onChange={(v) => setMeasures((s) => ({ ...s, [m.key]: v }))}
            />
          ))}
        </div>
        {error && <p className="text-sm" style={{ color: 'var(--neg)' }}>{error}</p>}
        <button
          className="rounded-2xl bg-gradient-to-b from-brand-accentStrong to-brand-accent text-brand-onAccent p-3.5 font-semibold shadow-[0_8px_24px_-8px_rgba(201,169,106,0.6)] active:scale-[0.99] transition-transform disabled:opacity-60"
          onClick={save}
          disabled={saving}
        >
          {saving ? 'Сохраняем…' : 'Сохранить замер'}
        </button>
      </section>

      <PhotoSection />

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
              <li key={e.id} className="jf-card p-3">
                <div className="flex items-center justify-between">
                  <span className="text-brand-muted text-xs">{formatDate(e.date)}</span>
                  <span className="font-semibold tabular">
                    {e.weightKg != null ? `${e.weightKg} кг` : ''}
                    {e.bodyFatPct != null ? ` · ${e.bodyFatPct}% жира` : ''}
                  </span>
                </div>
                {e.measurements && Object.keys(e.measurements).length > 0 && (
                  <div className="text-brand-muted text-xs mt-1">
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

// Keep only digits and a single decimal separator (accepts comma → dot).
function numericOnly(raw: string): string {
  let s = raw.replace(',', '.').replace(/[^0-9.]/g, '');
  const dot = s.indexOf('.');
  if (dot !== -1) s = s.slice(0, dot + 1) + s.slice(dot + 1).replace(/\./g, '');
  return s;
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
      <span className="text-brand-muted text-[10px] font-semibold uppercase tracking-wide">
        {label}
      </span>
      <input
        className="rounded-xl bg-brand-surface2 brand-line px-3 py-2.5 text-sm outline-none w-full tabular focus:border-brand-accent"
        type="text"
        inputMode="decimal"
        placeholder="—"
        value={value}
        onChange={(e) => onChange(numericOnly(e.target.value))}
      />
    </label>
  );
}

const PHOTO_LABELS: Record<PhotoType, string> = {
  front: 'Спереди',
  side: 'Сбоку',
  back: 'Сзади',
};

function PhotoSection() {
  const [photos, setPhotos] = useState<ProgressPhoto[] | null>(null);
  const [type, setType] = useState<PhotoType>('front');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function load() {
    api.clientPhotos().then(setPhotos).catch(() => setPhotos([]));
  }
  useEffect(load, []);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      await api.uploadProgressPhoto(type, file);
      setPhotos(null);
      load();
    } catch (err) {
      setError(String(err));
    } finally {
      setUploading(false);
    }
  }

  return (
    <section className="jf-card p-4 flex flex-col gap-3">
      <div className="text-brand-accent text-[11px] font-semibold uppercase tracking-[0.16em]">
        Фото прогресса
      </div>
      <div className="flex gap-2 rounded-2xl bg-brand-surface brand-line p-1">
        {(Object.keys(PHOTO_LABELS) as PhotoType[]).map((t) => (
          <button
            key={t}
            className={`flex-1 rounded-xl py-2 text-sm font-semibold transition-all ${
              type === t
                ? 'bg-brand-accent text-brand-onAccent shadow-[0_4px_16px_-4px_rgba(201,169,106,0.6)]'
                : 'text-brand-muted'
            }`}
            onClick={() => setType(t)}
          >
            {PHOTO_LABELS[t]}
          </button>
        ))}
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={onFile}
      />
      <button
        className="rounded-2xl bg-gradient-to-b from-brand-accentStrong to-brand-accent text-brand-onAccent p-3.5 font-semibold shadow-[0_8px_24px_-8px_rgba(201,169,106,0.6)] active:scale-[0.99] transition-transform disabled:opacity-60"
        onClick={() => fileRef.current?.click()}
        disabled={uploading}
      >
        {uploading ? 'Загружаем…' : `📷 Добавить фото (${PHOTO_LABELS[type].toLowerCase()})`}
      </button>
      {error && <p className="text-sm" style={{ color: 'var(--neg)' }}>{error}</p>}

      {photos && photos.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {photos.map((p) =>
            p.viewUrl ? (
              <a
                key={p.id}
                href={p.viewUrl}
                target="_blank"
                rel="noreferrer"
                className="block"
              >
                <img
                  src={p.viewUrl}
                  alt={PHOTO_LABELS[p.type]}
                  className="w-full aspect-square object-cover rounded-xl"
                />
                <div className="text-tg-hint text-[10px] mt-1 text-center">
                  {PHOTO_LABELS[p.type]} · {formatDate(p.date)}
                </div>
              </a>
            ) : null,
          )}
        </div>
      )}
    </section>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}
