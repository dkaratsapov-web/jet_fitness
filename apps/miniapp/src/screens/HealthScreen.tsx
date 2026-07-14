import { useEffect, useRef, useState, type ReactNode } from 'react';
import { api, type LabResult, type Supplement, type LabMarkerDraft } from '../api';
import { LineChart } from '../components/LineChart';

// ───────────────────────────────────────────────────────────────────────────
// Health module (Phase 3, SENSITIVE). Split into two dedicated client screens:
//   • LabsScreen        — анализы (OCR + ручной ввод + история/динамика/нормы)
//   • SupplementsScreen — бады (расписание, напоминания, отметки приёма)
// Both share one consent gate (health data) and a privacy/data footer.
// ───────────────────────────────────────────────────────────────────────────

function ScreenShell({
  title,
  onBack,
  children,
}: {
  title: string;
  onBack: () => void;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 p-4 pb-24">
      <header className="flex items-center justify-between">
        <button className="text-tg-link text-sm" onClick={onBack}>
          ← Назад
        </button>
        <h1 className="text-lg font-semibold">{title}</h1>
        <span className="w-12" />
      </header>
      {children}
    </div>
  );
}

// Shared consent gate. Renders children only once the client has consented to
// storing health data; otherwise shows the consent card.
function ConsentGate({ children }: { children: (revoke: () => void) => ReactNode }) {
  const [consent, setConsent] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.healthStatus().then((s) => setConsent(s.consentGiven)).catch(() => setConsent(false));
  }, []);

  async function grant() {
    setBusy(true);
    try {
      await api.giveHealthConsent();
      setConsent(true);
    } finally {
      setBusy(false);
    }
  }

  if (consent === null) return <p className="text-tg-hint text-sm">Загрузка…</p>;
  if (!consent) {
    return (
      <div className="jf-card p-4 flex flex-col gap-3">
        <div className="font-semibold">Согласие на обработку данных о здоровье</div>
        <p className="text-brand-muted text-sm">
          Раздел хранит чувствительные данные (результаты анализов, журнал добавок). Значения
          шифруются, данные размещены на серверах в РФ. Доступ — только у тебя и твоего тренера. В
          любой момент можно отозвать согласие, выгрузить или удалить все данные.
        </p>
        <p className="text-brand-muted text-xs">
          Раздел носит информационный характер и не заменяет консультацию врача.
        </p>
        <button
          className="rounded-xl bg-brand-accent text-brand-onAccent p-3 font-semibold disabled:opacity-60"
          onClick={grant}
          disabled={busy}
        >
          {busy ? '…' : 'Даю согласие'}
        </button>
      </div>
    );
  }
  return <>{children(() => setConsent(false))}</>;
}

// Privacy / data controls, shown collapsed at the bottom of each health screen.
function HealthDataFooter({ onRevoked }: { onRevoked: () => void }) {
  const [open, setOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  async function exportData() {
    setExporting(true);
    try {
      const data = await api.exportHealth();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'jet-fitness-health.json';
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      /* best-effort */
    } finally {
      setExporting(false);
    }
  }
  async function revoke() {
    await api.revokeHealthConsent().catch(() => undefined);
    onRevoked();
  }
  async function wipe() {
    if (!confirm('Удалить все данные о здоровье безвозвратно?')) return;
    await api.deleteAllHealth().catch(() => undefined);
    onRevoked();
  }

  return (
    <section className="flex flex-col gap-2">
      <button
        className="text-brand-muted text-xs text-left"
        onClick={() => setOpen((o) => !o)}
      >
        {open ? '▾' : '▸'} Приватность и данные
      </button>
      {open && (
        <div className="rounded-2xl bg-brand-surface brand-line p-3 flex flex-col gap-2">
          <button
            className="rounded-xl bg-tg-bg p-3 text-sm text-tg-link text-center disabled:opacity-60"
            onClick={exportData}
            disabled={exporting}
          >
            {exporting ? 'Готовим файл…' : 'Выгрузить все данные (JSON)'}
          </button>
          <button className="rounded-xl bg-tg-bg p-3 text-sm text-brand-muted" onClick={revoke}>
            Отозвать согласие (данные сохранятся)
          </button>
          <button className="rounded-xl bg-tg-bg p-3 text-sm text-red-400" onClick={wipe}>
            Удалить все данные о здоровье
          </button>
        </div>
      )}
    </section>
  );
}

// ── Анализы ─────────────────────────────────────────────────────────────────

export function LabsScreen({ onBack }: { onBack: () => void }) {
  return (
    <ScreenShell title="Анализы" onBack={onBack}>
      <ConsentGate>
        {(revoke) => <LabsContent onRevoked={revoke} />}
      </ConsentGate>
    </ScreenShell>
  );
}

function labStatus(value: number, refLow: number | null, refHigh: number | null) {
  if (refLow != null && value < refLow) return { label: 'ниже нормы', tone: 'low' as const };
  if (refHigh != null && value > refHigh) return { label: 'выше нормы', tone: 'high' as const };
  if (refLow != null || refHigh != null) return { label: 'в норме', tone: 'ok' as const };
  return null;
}

const STATUS_STYLE: Record<'ok' | 'low' | 'high', string> = {
  ok: 'bg-emerald-500/15 text-emerald-400',
  low: 'bg-sky-500/15 text-sky-400',
  high: 'bg-red-500/15 text-red-400',
};

function LabsContent({ onRevoked }: { onRevoked: () => void }) {
  const [labs, setLabs] = useState<LabResult[] | null>(null);
  function load() {
    api.labs().then(setLabs).catch(() => setLabs([]));
  }
  useEffect(load, []);

  // Group by marker, newest first within each group.
  const byMarker = new Map<string, LabResult[]>();
  for (const l of labs ?? []) {
    const arr = byMarker.get(l.marker) ?? [];
    arr.push(l);
    byMarker.set(l.marker, arr);
  }

  return (
    <>
      <LabScanUploader onSaved={load} />
      <ManualLabAdd onAdded={load} />

      {labs === null ? (
        <p className="text-brand-muted text-sm">Загрузка…</p>
      ) : byMarker.size === 0 ? (
        <p className="text-brand-muted text-sm">
          Пока нет результатов. Загрузи PDF/фото анализов или добавь показатель вручную.
        </p>
      ) : (
        [...byMarker.entries()].map(([m, rows]) => (
          <MarkerCard key={m} marker={m} rows={rows} onChanged={load} />
        ))
      )}

      <HealthDataFooter onRevoked={onRevoked} />
    </>
  );
}

function MarkerCard({
  marker,
  rows,
  onChanged,
}: {
  marker: string;
  rows: LabResult[];
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const latest = rows[0];
  const prev = rows[1];
  const asc = [...rows].reverse();
  const status = labStatus(latest.value, latest.refLow, latest.refHigh);
  const delta = prev ? latest.value - prev.value : null;

  async function remove(id: string) {
    await api.deleteLab(id).catch(() => undefined);
    onChanged();
  }

  return (
    <div className="jf-card p-3 flex flex-col gap-2">
      <button className="flex items-start justify-between gap-2 text-left" onClick={() => setOpen((o) => !o)}>
        <div className="min-w-0">
          <div className="font-medium text-sm">{marker}</div>
          <div className="flex items-baseline gap-2">
            <span className="text-xl font-bold tabular">
              {latest.value}
              {latest.unit ? <span className="text-brand-muted text-sm font-normal"> {latest.unit}</span> : ''}
            </span>
            {delta != null && delta !== 0 && (
              <span className={`text-xs ${delta > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                {delta > 0 ? '▲' : '▼'} {Math.abs(Number(delta.toFixed(2)))}
              </span>
            )}
          </div>
          {(latest.refLow != null || latest.refHigh != null) && (
            <div className="text-brand-muted text-[11px]">
              норма {latest.refLow ?? '…'}–{latest.refHigh ?? '…'}
            </div>
          )}
        </div>
        {status && (
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_STYLE[status.tone]}`}>
            {status.label}
          </span>
        )}
      </button>

      {asc.length >= 2 && (
        <LineChart
          unit={latest.unit ? ` ${latest.unit}` : ''}
          points={asc.map((r) => ({
            value: r.value,
            label: new Date(r.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }),
          }))}
        />
      )}

      {open && (
        <ul className="flex flex-col gap-1 pt-2 border-t border-[var(--line)]">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center justify-between text-xs text-brand-muted">
              <span>{new Date(r.date).toLocaleDateString('ru-RU')}</span>
              <span className="flex items-center gap-2">
                <span className="tabular">
                  {r.value}
                  {r.unit ? ` ${r.unit}` : ''}
                </span>
                <button className="text-brand-muted px-1" onClick={() => remove(r.id)}>
                  ✕
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ManualLabAdd({ onAdded }: { onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [marker, setMarker] = useState('');
  const [value, setValue] = useState('');
  const [unit, setUnit] = useState('');
  const [refLow, setRefLow] = useState('');
  const [refHigh, setRefHigh] = useState('');
  const [busy, setBusy] = useState(false);

  async function add() {
    if (!marker.trim() || !value) return;
    setBusy(true);
    try {
      await api.addLab({
        marker: marker.trim(),
        value: Number(value),
        unit: unit.trim() || undefined,
        refLow: refLow ? Number(refLow) : undefined,
        refHigh: refHigh ? Number(refHigh) : undefined,
      });
      setMarker('');
      setValue('');
      setUnit('');
      setRefLow('');
      setRefHigh('');
      setOpen(false);
      onAdded();
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        className="rounded-xl bg-brand-surface brand-line p-3 text-sm text-brand-muted"
        onClick={() => setOpen(true)}
      >
        ✎ Добавить показатель вручную
      </button>
    );
  }

  return (
    <div className="rounded-2xl bg-brand-surface brand-line p-3 flex flex-col gap-2">
      <input
        className="rounded-lg bg-tg-bg p-2 text-sm outline-none"
        placeholder="Маркер (напр. «Гемоглобин»)"
        value={marker}
        onChange={(e) => setMarker(e.target.value)}
      />
      <div className="grid grid-cols-2 gap-2">
        <input
          className="rounded-lg bg-tg-bg p-2 text-sm outline-none tabular"
          placeholder="Значение"
          inputMode="decimal"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <input
          className="rounded-lg bg-tg-bg p-2 text-sm outline-none"
          placeholder="Ед. (г/л)"
          value={unit}
          onChange={(e) => setUnit(e.target.value)}
        />
        <input
          className="rounded-lg bg-tg-bg p-2 text-sm outline-none tabular"
          placeholder="норма от"
          inputMode="decimal"
          value={refLow}
          onChange={(e) => setRefLow(e.target.value)}
        />
        <input
          className="rounded-lg bg-tg-bg p-2 text-sm outline-none tabular"
          placeholder="норма до"
          inputMode="decimal"
          value={refHigh}
          onChange={(e) => setRefHigh(e.target.value)}
        />
      </div>
      <div className="flex gap-2">
        <button
          className="flex-1 rounded-lg bg-brand-accent text-brand-onAccent py-2 text-sm font-semibold disabled:opacity-60"
          onClick={add}
          disabled={busy}
        >
          Добавить результат
        </button>
        <button className="rounded-lg bg-tg-bg px-3 text-sm text-brand-muted" onClick={() => setOpen(false)}>
          Отмена
        </button>
      </div>
    </div>
  );
}

// Upload a PDF/photo of lab results → recognized in Yandex Cloud (RF) →
// review & edit the extracted markers → save. Data never leaves the country.
function LabScanUploader({ onSaved }: { onSaved: () => void }) {
  const [available, setAvailable] = useState<boolean | null>(null);
  const [phase, setPhase] = useState<'idle' | 'working' | 'review' | 'saving'>('idle');
  const [drafts, setDrafts] = useState<LabMarkerDraft[]>([]);
  const [fileKey, setFileKey] = useState<string | null>(null);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.labsOcrStatus().then((s) => setAvailable(s.available)).catch(() => setAvailable(false));
  }, []);

  if (available === false) return null; // OCR not configured — hide the block

  async function onFile(file: File) {
    setError(null);
    setPhase('working');
    try {
      const r = await api.recognizeLabScan(file);
      if (!r.ok || r.markers.length === 0) {
        setError(
          r.reason === 'ocr_failed'
            ? 'Не удалось распознать. Загрузите файл почётче.'
            : 'Показатели не найдены — попробуйте другой файл или введите вручную.',
        );
        setPhase('idle');
        return;
      }
      setDrafts(r.markers);
      setFileKey(r.fileKey);
      setPhase('review');
    } catch {
      setError('Ошибка загрузки. Проверьте, что файл — PDF или фото.');
      setPhase('idle');
    }
  }

  function patch(i: number, p: Partial<LabMarkerDraft>) {
    setDrafts((d) => d.map((m, idx) => (idx === i ? { ...m, ...p } : m)));
  }
  function drop(i: number) {
    setDrafts((d) => d.filter((_, idx) => idx !== i));
  }

  async function save() {
    setPhase('saving');
    try {
      await api.saveLabsBulk({ date, sourceFileKey: fileKey ?? undefined, markers: drafts });
      setDrafts([]);
      setFileKey(null);
      setPhase('idle');
      onSaved();
    } catch {
      setError('Не удалось сохранить.');
      setPhase('review');
    }
  }

  return (
    <div className="jf-card p-3 flex flex-col gap-2">
      <input
        ref={fileRef}
        type="file"
        accept="application/pdf,image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = '';
        }}
      />

      {phase === 'idle' && (
        <>
          <button
            className="rounded-xl bg-brand-accent text-brand-onAccent py-2.5 text-sm font-semibold"
            onClick={() => fileRef.current?.click()}
          >
            📄 Распознать анализы из PDF / фото
          </button>
          <p className="text-brand-muted text-[11px]">
            Распознавание в Яндекс.Облаке (данные в РФ). Показатели можно поправить перед
            сохранением.
          </p>
        </>
      )}

      {phase === 'working' && (
        <p className="text-brand-muted text-sm py-2 text-center">
          Распознаю… это займёт несколько секунд
        </p>
      )}

      {(phase === 'review' || phase === 'saving') && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold">Найдено: {drafts.length}</span>
            <input
              type="date"
              className="rounded-lg bg-tg-bg px-2 py-1 text-xs outline-none"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <ul className="flex flex-col gap-2 max-h-72 overflow-y-auto">
            {drafts.map((m, i) => (
              <li key={i} className="rounded-xl bg-tg-bg p-2 flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <input
                    className="flex-1 rounded-md bg-tg-secondaryBg p-1.5 text-sm outline-none"
                    value={m.marker}
                    onChange={(e) => patch(i, { marker: e.target.value })}
                  />
                  <button className="text-brand-muted text-xs px-1" onClick={() => drop(i)}>
                    ✕
                  </button>
                </div>
                <div className="grid grid-cols-4 gap-1">
                  <input
                    className="rounded-md bg-tg-secondaryBg p-1.5 text-sm outline-none tabular"
                    inputMode="decimal"
                    placeholder="знач."
                    value={String(m.value)}
                    onChange={(e) => patch(i, { value: Number(e.target.value) })}
                  />
                  <input
                    className="rounded-md bg-tg-secondaryBg p-1.5 text-sm outline-none"
                    placeholder="ед."
                    value={m.unit ?? ''}
                    onChange={(e) => patch(i, { unit: e.target.value || null })}
                  />
                  <input
                    className="rounded-md bg-tg-secondaryBg p-1.5 text-sm outline-none tabular"
                    inputMode="decimal"
                    placeholder="норма от"
                    value={m.refLow ?? ''}
                    onChange={(e) => patch(i, { refLow: e.target.value ? Number(e.target.value) : null })}
                  />
                  <input
                    className="rounded-md bg-tg-secondaryBg p-1.5 text-sm outline-none tabular"
                    inputMode="decimal"
                    placeholder="норма до"
                    value={m.refHigh ?? ''}
                    onChange={(e) => patch(i, { refHigh: e.target.value ? Number(e.target.value) : null })}
                  />
                </div>
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <button
              className="flex-1 rounded-xl bg-brand-accent text-brand-onAccent py-2.5 text-sm font-semibold disabled:opacity-60"
              onClick={save}
              disabled={phase === 'saving' || drafts.length === 0}
            >
              {phase === 'saving' ? 'Сохраняю…' : `Сохранить ${drafts.length}`}
            </button>
            <button
              className="rounded-xl bg-tg-bg px-3 text-sm text-brand-muted"
              onClick={() => {
                setDrafts([]);
                setPhase('idle');
              }}
            >
              Отмена
            </button>
          </div>
        </div>
      )}

      {error && <p className="text-xs" style={{ color: 'var(--neg)' }}>{error}</p>}
    </div>
  );
}

// ── Бады ──────────────────────────────────────────────────────────────────

export function SupplementsScreen({ onBack }: { onBack: () => void }) {
  return (
    <ScreenShell title="Бады и добавки" onBack={onBack}>
      <ConsentGate>
        {(revoke) => <SupplementsContent onRevoked={revoke} />}
      </ConsentGate>
    </ScreenShell>
  );
}

// Preset reminder slots + arbitrary custom times, stored as schedule.times.
const TIME_PRESETS: Array<{ label: string; time: string }> = [
  { label: 'Утро', time: '09:00' },
  { label: 'День', time: '14:00' },
  { label: 'Вечер', time: '19:00' },
  { label: 'Ночь', time: '22:00' },
];

function scheduleTimes(schedule: unknown): string[] {
  if (schedule && typeof schedule === 'object' && Array.isArray((schedule as { times?: unknown }).times)) {
    return ((schedule as { times: unknown[] }).times).filter((t): t is string => typeof t === 'string');
  }
  return [];
}

function SupplementsContent({ onRevoked }: { onRevoked: () => void }) {
  const [items, setItems] = useState<Supplement[] | null>(null);
  function load() {
    api.supplements().then(setItems).catch(() => setItems([]));
  }
  useEffect(load, []);

  async function taken(id: string) {
    await api.markIntake(id).catch(() => undefined);
    load();
  }
  async function remove(id: string) {
    await api.deleteSupplement(id).catch(() => undefined);
    load();
  }

  return (
    <>
      <AddSupplement onAdded={load} />

      {items === null ? (
        <p className="text-brand-muted text-sm">Загрузка…</p>
      ) : items.length === 0 ? (
        <p className="text-brand-muted text-sm">
          Пока пусто. Добавь витамины или добавки — можно настроить напоминания по времени.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((s) => {
            const times = scheduleTimes(s.schedule);
            const goal = times.length || 1;
            const done = Math.min(s.takenToday, goal);
            return (
              <li key={s.id} className="jf-card p-3 flex flex-col gap-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium text-sm">
                      {s.name}
                      {s.dose && <span className="text-brand-muted font-normal"> · {s.dose}</span>}
                    </div>
                    {times.length > 0 ? (
                      <div className="flex gap-1 flex-wrap mt-1">
                        {times.map((t) => (
                          <span
                            key={t}
                            className="rounded-md bg-brand-surface2 px-1.5 py-0.5 text-[10px] text-brand-muted tabular"
                          >
                            {s.remindersOn ? '🔔 ' : ''}
                            {t}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <div className="text-brand-muted text-[11px] mt-0.5">без расписания</div>
                    )}
                  </div>
                  <button className="text-brand-muted text-xs px-1" onClick={() => remove(s.id)}>
                    ✕
                  </button>
                </div>

                {/* today's progress */}
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 rounded-full bg-brand-surface2 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-brand-accent transition-all"
                      style={{ width: `${(done / goal) * 100}%` }}
                    />
                  </div>
                  <span className="text-brand-muted text-[11px] tabular">
                    {done}/{goal} сегодня
                  </span>
                  <button
                    className="rounded-lg bg-brand-accent text-brand-onAccent px-3 py-1.5 text-sm font-semibold"
                    onClick={() => taken(s.id)}
                  >
                    Принял
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <p className="text-brand-muted text-xs">
        Журнал носит информационный характер и не является медицинской рекомендацией. По приёму
        добавок и препаратов консультируйся с врачом.
      </p>

      <HealthDataFooter onRevoked={onRevoked} />
    </>
  );
}

function AddSupplement({ onAdded }: { onAdded: () => void }) {
  const [name, setName] = useState('');
  const [dose, setDose] = useState('');
  const [times, setTimes] = useState<string[]>([]);
  const [custom, setCustom] = useState('');
  const [busy, setBusy] = useState(false);

  function toggleTime(t: string) {
    setTimes((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t].sort()));
  }
  function addCustom() {
    if (/^\d{2}:\d{2}$/.test(custom) && !times.includes(custom)) {
      setTimes((cur) => [...cur, custom].sort());
      setCustom('');
    }
  }

  async function add() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await api.addSupplement({
        name: name.trim(),
        dose: dose.trim() || undefined,
        remindersOn: times.length > 0,
        schedule: times.length > 0 ? { times } : undefined,
      });
      setName('');
      setDose('');
      setTimes([]);
      onAdded();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="jf-card p-3 flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-2">
        <input
          className="rounded-lg bg-tg-bg p-2 text-sm outline-none"
          placeholder="Название (напр. «Витамин D»)"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          className="rounded-lg bg-tg-bg p-2 text-sm outline-none"
          placeholder="Дозировка (2000 МЕ)"
          value={dose}
          onChange={(e) => setDose(e.target.value)}
        />
      </div>

      <div className="text-brand-muted text-[11px]">Напоминания (по желанию)</div>
      <div className="flex gap-1.5 flex-wrap">
        {TIME_PRESETS.map((p) => {
          const on = times.includes(p.time);
          return (
            <button
              key={p.time}
              className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${
                on ? 'bg-brand-accent text-brand-onAccent' : 'bg-brand-surface2 text-brand-muted'
              }`}
              onClick={() => toggleTime(p.time)}
            >
              {p.label} {p.time}
            </button>
          );
        })}
      </div>
      <div className="flex gap-2 items-center">
        <input
          type="time"
          className="rounded-lg bg-tg-bg p-2 text-sm outline-none tabular"
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
        />
        <button
          className="rounded-lg bg-brand-surface2 text-brand-muted px-3 py-2 text-xs"
          onClick={addCustom}
        >
          + время
        </button>
        {times.length > 0 && (
          <span className="text-brand-muted text-[11px] flex-1 text-right tabular">
            {times.join(' · ')}
          </span>
        )}
      </div>

      <button
        className="rounded-lg bg-brand-accent text-brand-onAccent py-2.5 text-sm font-semibold disabled:opacity-60"
        onClick={add}
        disabled={busy}
      >
        {busy ? 'Добавляем…' : 'Добавить'}
      </button>
    </div>
  );
}
