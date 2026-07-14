import { useEffect, useState } from 'react';
import { api, type DailyMetric } from '../api';

// Fitness-band / health-app metrics. Manual entry today (steps, resting pulse,
// sleep, active calories); auto-sync from Apple Health / Google Fit is planned.

function localDate(d = new Date()): string {
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}
function intOnly(raw: string): string {
  return raw.replace(/[^0-9]/g, '');
}
function fmtSleep(min: number | null): string {
  if (!min) return '—';
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} ч ${m} мин` : `${h} ч`;
}
function humanDate(iso: string): string {
  if (iso === localDate()) return 'Сегодня';
  return new Date(`${iso}T12:00:00.000Z`).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
}

export function WearableScreen({ onBack }: { onBack: () => void }) {
  const [rows, setRows] = useState<DailyMetric[] | null>(null);
  const [steps, setSteps] = useState('');
  const [pulse, setPulse] = useState('');
  const [sleepH, setSleepH] = useState('');
  const [sleepM, setSleepM] = useState('');
  const [kcal, setKcal] = useState('');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  function load() {
    api.metrics(60).then(setRows).catch(() => setRows([]));
  }
  useEffect(load, []);

  // Prefill today's values if already logged.
  useEffect(() => {
    if (!rows) return;
    const today = rows.find((r) => r.date === localDate());
    if (today) {
      setSteps(today.steps != null ? String(today.steps) : '');
      setPulse(today.restingPulse != null ? String(today.restingPulse) : '');
      setKcal(today.activeKcal != null ? String(today.activeKcal) : '');
      if (today.sleepMin != null) {
        setSleepH(String(Math.floor(today.sleepMin / 60)));
        setSleepM(String(today.sleepMin % 60));
      }
    }
  }, [rows]);

  async function save() {
    setBusy(true);
    setSaved(false);
    try {
      const sleepMin =
        sleepH || sleepM ? (Number(sleepH) || 0) * 60 + (Number(sleepM) || 0) : null;
      await api.saveMetric({
        date: localDate(),
        steps: steps ? Number(steps) : null,
        restingPulse: pulse ? Number(pulse) : null,
        sleepMin,
        activeKcal: kcal ? Number(kcal) : null,
      });
      setSaved(true);
      load();
    } finally {
      setBusy(false);
    }
  }

  const history = (rows ?? []).filter((r) => r.date !== localDate());

  return (
    <div className="flex flex-col gap-4 p-4 pb-24">
      <header className="flex items-center justify-between">
        <button className="text-tg-link text-sm" onClick={onBack}>
          ← Назад
        </button>
        <h1 className="text-lg font-semibold">Фитнес-браслет</h1>
        <span className="w-12" />
      </header>

      {/* auto-sync roadmap */}
      <div className="jf-card p-3 flex items-start gap-3">
        <span className="text-xl">⌚</span>
        <p className="text-brand-muted text-xs leading-relaxed">
          Автосинхронизация с Apple Health, Google Fit и Mi Band — в разработке. Пока внеси
          показатели за день вручную: они попадут в статистику и будут видны тренеру.
        </p>
      </div>

      {/* today's entry */}
      <div className="jf-card p-4 flex flex-col gap-3">
        <div className="text-brand-muted text-[11px] font-bold uppercase tracking-wide">
          Сегодня
        </div>
        <div className="grid grid-cols-2 gap-3">
          <MetricField label="👟 Шаги" value={steps} onChange={(v) => setSteps(intOnly(v))} placeholder="8000" />
          <MetricField label="❤️ Пульс покоя" value={pulse} onChange={(v) => setPulse(intOnly(v))} placeholder="60" unit="уд/мин" />
          <MetricField label="🔥 Активные ккал" value={kcal} onChange={(v) => setKcal(intOnly(v))} placeholder="450" />
          <div>
            <div className="text-brand-muted text-[10px] uppercase tracking-wide mb-1">😴 Сон</div>
            <div className="flex items-center gap-1">
              <input
                className="w-12 rounded-lg bg-brand-surface2 p-2 text-sm outline-none tabular text-center"
                inputMode="numeric"
                placeholder="7"
                value={sleepH}
                onChange={(e) => setSleepH(intOnly(e.target.value))}
              />
              <span className="text-brand-muted text-xs">ч</span>
              <input
                className="w-12 rounded-lg bg-brand-surface2 p-2 text-sm outline-none tabular text-center"
                inputMode="numeric"
                placeholder="30"
                value={sleepM}
                onChange={(e) => setSleepM(intOnly(e.target.value))}
              />
              <span className="text-brand-muted text-xs">мин</span>
            </div>
          </div>
        </div>
        <button
          className="rounded-xl bg-brand-accent text-brand-onAccent p-3 font-semibold disabled:opacity-60"
          onClick={save}
          disabled={busy}
        >
          {busy ? 'Сохраняем…' : saved ? 'Сохранено ✓' : 'Сохранить за сегодня'}
        </button>
      </div>

      {/* history */}
      {history.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-brand-accent text-xs font-semibold uppercase tracking-wide">История</h2>
          {history.map((r) => (
            <div key={r.date} className="jf-card p-3">
              <div className="text-sm font-medium mb-1">{humanDate(r.date)}</div>
              <div className="text-brand-muted text-xs flex flex-wrap gap-x-3 gap-y-0.5">
                <span>👟 {r.steps ?? '—'}</span>
                <span>❤️ {r.restingPulse ?? '—'}</span>
                <span>😴 {fmtSleep(r.sleepMin)}</span>
                <span>🔥 {r.activeKcal ?? '—'}</span>
              </div>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

function MetricField({
  label,
  value,
  onChange,
  placeholder,
  unit,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  unit?: string;
}) {
  return (
    <div>
      <div className="text-brand-muted text-[10px] uppercase tracking-wide mb-1">{label}</div>
      <div className="flex items-center gap-1">
        <input
          className="w-full rounded-lg bg-brand-surface2 p-2 text-sm outline-none tabular"
          inputMode="numeric"
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        {unit && <span className="text-brand-muted text-[10px] shrink-0">{unit}</span>}
      </div>
    </div>
  );
}
