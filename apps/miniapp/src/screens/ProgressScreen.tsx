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

const PHOTO_LABELS: Record<PhotoType, string> = {
  front: 'Спереди',
  side: 'Сбоку',
  back: 'Сзади',
};
const PHOTO_TYPES: PhotoType[] = ['front', 'side', 'back'];

// One день of progress = measurement + its photos, grouped and shown as a card.
export function ProgressScreen({ onBack }: { onBack?: () => void }) {
  const [entries, setEntries] = useState<ProgressEntry[] | null>(null);
  const [photos, setPhotos] = useState<ProgressPhoto[]>([]);

  function load() {
    api.clientProgress().then(setEntries).catch(() => setEntries([]));
    api.clientPhotos().then(setPhotos).catch(() => setPhotos([]));
  }
  useEffect(load, []);

  const weights = (entries ?? []).filter((e) => e.weightKg != null);
  const latest = weights[0]?.weightKg ?? null;
  const prev = weights[1]?.weightKg ?? null;
  const delta = latest != null && prev != null ? +(latest - prev).toFixed(1) : null;

  // Group entries + photos by day into "cards".
  const cards = groupByDate(entries ?? [], photos);

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

      <NewEntry onSaved={load} />

      <section>
        <h2 className="text-lg font-semibold mb-2">История</h2>
        {entries === null ? (
          <p className="text-brand-muted text-sm">Загрузка…</p>
        ) : cards.length === 0 ? (
          <p className="text-brand-muted text-sm">
            Пока нет замеров. Внесите первый — так тренер увидит вашу динамику.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {cards.map((c) => (
              <EntryCard key={c.date} card={c} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

// ── New entry: measurement + photos, saved together ──────────────
function NewEntry({ onSaved }: { onSaved: () => void }) {
  const [weight, setWeight] = useState('');
  const [bodyFat, setBodyFat] = useState('');
  const [measures, setMeasures] = useState<Record<string, string>>({});
  const [pics, setPics] = useState<Partial<Record<PhotoType, { file: File; url: string }>>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function pick(type: PhotoType, file: File) {
    setPics((p) => {
      if (p[type]) URL.revokeObjectURL(p[type]!.url);
      return { ...p, [type]: { file, url: URL.createObjectURL(file) } };
    });
  }

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
    const hasMeasure = body.weightKg || body.bodyFatPct || body.measurements;
    const hasPhotos = PHOTO_TYPES.some((t) => pics[t]);
    if (!hasMeasure && !hasPhotos) {
      setError('Заполните замер или добавьте фото');
      return;
    }
    setSaving(true);
    try {
      if (hasMeasure) await api.addProgress(body);
      for (const t of PHOTO_TYPES) {
        const p = pics[t];
        if (p) await api.uploadProgressPhoto(t, p.file);
      }
      // reset
      PHOTO_TYPES.forEach((t) => pics[t] && URL.revokeObjectURL(pics[t]!.url));
      setWeight('');
      setBodyFat('');
      setMeasures({});
      setPics({});
      onSaved();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
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

      <div>
        <div className="text-brand-muted text-[10px] font-semibold uppercase tracking-wide mb-1.5">
          Фото (необязательно)
        </div>
        <div className="grid grid-cols-3 gap-2.5">
          {PHOTO_TYPES.map((t) => (
            <PhotoSlot key={t} type={t} pic={pics[t]} onPick={(f) => pick(t, f)} />
          ))}
        </div>
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
  );
}

function PhotoSlot({
  type,
  pic,
  onPick,
}: {
  type: PhotoType;
  pic?: { file: File; url: string };
  onPick: (f: File) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <button
      className="relative aspect-square rounded-xl bg-brand-surface2 brand-line overflow-hidden flex flex-col items-center justify-center gap-1"
      onClick={() => ref.current?.click()}
      type="button"
    >
      {pic ? (
        <img src={pic.url} alt={PHOTO_LABELS[type]} className="absolute inset-0 w-full h-full object-cover" />
      ) : (
        <>
          <span className="text-lg">📷</span>
          <span className="text-brand-muted text-[10px]">{PHOTO_LABELS[type]}</span>
        </>
      )}
      {pic && (
        <span className="absolute bottom-0 inset-x-0 bg-black/55 text-[9px] text-center py-0.5">
          {PHOTO_LABELS[type]} ✓
        </span>
      )}
      <input
        ref={ref}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) onPick(f);
        }}
      />
    </button>
  );
}

// ── History card: one day's measurement + photos ─────────────────
interface DayCard {
  date: string;
  entry?: ProgressEntry;
  photos: ProgressPhoto[];
}

function groupByDate(entries: ProgressEntry[], photos: ProgressPhoto[]): DayCard[] {
  const map = new Map<string, DayCard>();
  const get = (iso: string) => {
    const key = iso.slice(0, 10);
    let c = map.get(key);
    if (!c) {
      c = { date: key, photos: [] };
      map.set(key, c);
    }
    return c;
  };
  for (const e of entries) {
    const c = get(e.date);
    // keep the most complete entry for the day (first wins, newest first already)
    if (!c.entry) c.entry = e;
  }
  for (const p of photos) get(p.date).photos.push(p);
  return [...map.values()].sort((a, b) => (a.date < b.date ? 1 : -1));
}

function EntryCard({ card }: { card: DayCard }) {
  const e = card.entry;
  const meas =
    e?.measurements && Object.keys(e.measurements).length > 0
      ? MEASURES.filter((m) => e.measurements?.[m.key] != null)
          .map((m) => `${m.label} ${e.measurements![m.key]}`)
          .join(' · ')
      : null;
  const photos = [...card.photos].sort(
    (a, b) => PHOTO_TYPES.indexOf(a.type) - PHOTO_TYPES.indexOf(b.type),
  );
  return (
    <li className="jf-card p-3 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-brand-muted text-xs">{formatDate(card.date)}</span>
        <span className="font-semibold tabular">
          {e?.weightKg != null ? `${e.weightKg} кг` : ''}
          {e?.bodyFatPct != null ? ` · ${e.bodyFatPct}% жира` : ''}
        </span>
      </div>
      {meas && <div className="text-brand-muted text-xs">{meas}</div>}
      {photos.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {photos.map((p) =>
            p.viewUrl ? (
              <a key={p.id} href={p.viewUrl} target="_blank" rel="noreferrer" className="block">
                <img
                  src={p.viewUrl}
                  alt={PHOTO_LABELS[p.type]}
                  className="w-full aspect-square object-cover rounded-lg"
                />
                <div className="text-brand-muted text-[9px] mt-1 text-center">
                  {PHOTO_LABELS[p.type]}
                </div>
              </a>
            ) : null,
          )}
        </div>
      )}
    </li>
  );
}

// ── Numeric field ────────────────────────────────────────────────
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

function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00.000Z`).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}
