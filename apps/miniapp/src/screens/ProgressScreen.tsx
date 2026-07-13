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
        <div className="rounded-2xl bg-tg-secondaryBg p-4 flex flex-col gap-3">
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-semibold">{latest}</span>
            <span className="text-tg-hint">кг</span>
            {delta != null && delta !== 0 && (
              <span className={`text-sm ml-2 ${delta < 0 ? 'text-green-500' : 'text-red-400'}`}>
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
    <section className="rounded-2xl bg-tg-secondaryBg p-3 flex flex-col gap-3">
      <div className="font-medium">Фото прогресса</div>
      <div className="flex gap-2">
        {(Object.keys(PHOTO_LABELS) as PhotoType[]).map((t) => (
          <button
            key={t}
            className={`flex-1 rounded-xl py-2 text-sm ${
              type === t ? 'bg-tg-button text-tg-buttonText' : 'bg-tg-bg text-tg-hint'
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
        className="rounded-xl bg-tg-button text-tg-buttonText p-3 font-medium disabled:opacity-60"
        onClick={() => fileRef.current?.click()}
        disabled={uploading}
      >
        {uploading ? 'Загружаем…' : `📷 Добавить фото (${PHOTO_LABELS[type].toLowerCase()})`}
      </button>
      {error && <p className="text-red-500 text-sm">{error}</p>}

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
