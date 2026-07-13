import { useEffect, useRef, useState } from 'react';
import { api, type LabResult, type Supplement, type LabMarkerDraft } from '../api';
import { LineChart } from '../components/LineChart';

// Health module (Phase 3, SENSITIVE): consent gate → labs + supplements.
export function HealthScreen({ onBack }: { onBack: () => void }) {
  const [consent, setConsent] = useState<boolean | null>(null);

  useEffect(() => {
    api.healthStatus().then((s) => setConsent(s.consentGiven)).catch(() => setConsent(false));
  }, []);

  return (
    <div className="flex flex-col gap-4 p-4">
      <header className="flex items-center justify-between">
        <button className="text-tg-link text-sm" onClick={onBack}>
          ← Назад
        </button>
        <h1 className="text-lg font-semibold">Здоровье</h1>
        <span className="w-12" />
      </header>

      {consent === null ? (
        <p className="text-tg-hint text-sm">Загрузка…</p>
      ) : !consent ? (
        <ConsentGate onGranted={() => setConsent(true)} />
      ) : (
        <HealthContent onRevoked={() => setConsent(false)} />
      )}
    </div>
  );
}

function ConsentGate({ onGranted }: { onGranted: () => void }) {
  const [busy, setBusy] = useState(false);

  async function grant() {
    setBusy(true);
    try {
      await api.giveHealthConsent();
      onGranted();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl bg-tg-secondaryBg p-4 flex flex-col gap-3">
      <div className="font-semibold">Согласие на обработку данных о здоровье</div>
      <p className="text-tg-hint text-sm">
        Раздел хранит чувствительные данные (результаты анализов, журнал добавок).
        Значения анализов шифруются, данные размещены на серверах в РФ. Доступ —
        только у вас и вашего тренера. Вы можете в любой момент отозвать согласие,
        выгрузить или удалить все данные.
      </p>
      <p className="text-tg-hint text-xs">
        Раздел носит информационный характер и не заменяет консультацию врача.
      </p>
      <button
        className="rounded-xl bg-tg-button text-tg-buttonText p-3 font-medium disabled:opacity-60"
        onClick={grant}
        disabled={busy}
      >
        {busy ? '…' : 'Даю согласие'}
      </button>
    </div>
  );
}

function HealthContent({ onRevoked }: { onRevoked: () => void }) {
  const [labs, setLabs] = useState<LabResult[] | null>(null);
  const [supplements, setSupplements] = useState<Supplement[] | null>(null);

  function load() {
    api.labs().then(setLabs).catch(() => setLabs([]));
    api.supplements().then(setSupplements).catch(() => setSupplements([]));
  }
  useEffect(load, []);

  const [exporting, setExporting] = useState(false);

  async function revoke() {
    await api.revokeHealthConsent().catch(() => undefined);
    onRevoked();
  }
  async function wipe() {
    if (!confirm('Удалить все данные о здоровье безвозвратно?')) return;
    await api.deleteAllHealth().catch(() => undefined);
    onRevoked();
  }
  // Export must go through the authenticated API client (a plain link would
  // not carry the initData auth header), then download as a file.
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

  return (
    <>
      <LabsSection labs={labs} onChanged={load} />
      <SupplementsSection items={supplements} onChanged={load} />

      <section className="rounded-2xl bg-tg-secondaryBg p-3 flex flex-col gap-2">
        <div className="text-tg-hint text-xs">Ваши данные</div>
        <button
          className="rounded-xl bg-tg-bg p-3 text-sm text-tg-link text-center disabled:opacity-60"
          onClick={exportData}
          disabled={exporting}
        >
          {exporting ? 'Готовим файл…' : 'Выгрузить все данные (JSON)'}
        </button>
        <button className="rounded-xl bg-tg-bg p-3 text-sm text-tg-hint" onClick={revoke}>
          Отозвать согласие (данные сохранятся)
        </button>
        <button className="rounded-xl bg-tg-bg p-3 text-sm text-red-400" onClick={wipe}>
          Удалить все данные о здоровье
        </button>
      </section>
    </>
  );
}

function LabsSection({ labs, onChanged }: { labs: LabResult[] | null; onChanged: () => void }) {
  const [marker, setMarker] = useState('');
  const [value, setValue] = useState('');
  const [unit, setUnit] = useState('');
  const [busy, setBusy] = useState(false);

  async function add() {
    if (!marker.trim() || !value) return;
    setBusy(true);
    try {
      await api.addLab({ marker: marker.trim(), value: Number(value), unit: unit.trim() || undefined });
      setMarker('');
      setValue('');
      setUnit('');
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  // Group by marker for compact history + a chart for the most-tracked marker.
  const byMarker = new Map<string, LabResult[]>();
  for (const l of labs ?? []) {
    const arr = byMarker.get(l.marker) ?? [];
    arr.push(l);
    byMarker.set(l.marker, arr);
  }

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-lg font-semibold">Анализы</h2>

      <LabScanUploader onSaved={onChanged} />

      <div className="rounded-2xl bg-tg-secondaryBg p-3 flex flex-col gap-2">
        <div className="grid grid-cols-3 gap-2">
          <input
            className="rounded-lg bg-tg-bg p-2 text-sm outline-none col-span-1"
            placeholder="Маркер"
            value={marker}
            onChange={(e) => setMarker(e.target.value)}
          />
          <input
            className="rounded-lg bg-tg-bg p-2 text-sm outline-none"
            placeholder="Значение"
            inputMode="decimal"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
          <input
            className="rounded-lg bg-tg-bg p-2 text-sm outline-none"
            placeholder="Ед."
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
          />
        </div>
        <button
          className="rounded-lg bg-tg-button text-tg-buttonText py-2 text-sm disabled:opacity-60"
          onClick={add}
          disabled={busy}
        >
          Добавить результат
        </button>
      </div>

      {byMarker.size === 0 ? (
        <p className="text-tg-hint text-sm">Пока нет результатов.</p>
      ) : (
        [...byMarker.entries()].map(([m, rows]) => {
          const asc = [...rows].reverse();
          return (
            <div key={m} className="rounded-2xl bg-tg-secondaryBg p-3 flex flex-col gap-1">
              <div className="font-medium text-sm">
                {m}{' '}
                <span className="text-tg-hint font-normal">
                  · последнее {rows[0].value}
                  {rows[0].unit ? ` ${rows[0].unit}` : ''}
                </span>
              </div>
              {asc.length >= 2 && (
                <LineChart
                  unit={rows[0].unit ? ` ${rows[0].unit}` : ''}
                  points={asc.map((r) => ({
                    value: r.value,
                    label: new Date(r.date).toLocaleDateString('ru-RU', {
                      day: 'numeric',
                      month: 'short',
                    }),
                  }))}
                />
              )}
              <ul className="flex flex-col gap-1">
                {rows.map((r) => (
                  <li key={r.id} className="flex items-center justify-between text-xs text-tg-hint">
                    <span>{new Date(r.date).toLocaleDateString('ru-RU')}</span>
                    <span>
                      {r.value}
                      {r.unit ? ` ${r.unit}` : ''}
                      {r.refLow != null && r.refHigh != null && (
                        <span className="ml-1">
                          (норма {r.refLow}–{r.refHigh})
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })
      )}
    </section>
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
        <p className="text-brand-muted text-sm py-2 text-center">Распознаю… это займёт несколько секунд</p>
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
                    className="rounded-md bg-tg-secondaryBg p-1.5 text-sm outline-none"
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
                    className="rounded-md bg-tg-secondaryBg p-1.5 text-sm outline-none"
                    inputMode="decimal"
                    placeholder="норма от"
                    value={m.refLow ?? ''}
                    onChange={(e) =>
                      patch(i, { refLow: e.target.value ? Number(e.target.value) : null })
                    }
                  />
                  <input
                    className="rounded-md bg-tg-secondaryBg p-1.5 text-sm outline-none"
                    inputMode="decimal"
                    placeholder="норма до"
                    value={m.refHigh ?? ''}
                    onChange={(e) =>
                      patch(i, { refHigh: e.target.value ? Number(e.target.value) : null })
                    }
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

function SupplementsSection({
  items,
  onChanged,
}: {
  items: Supplement[] | null;
  onChanged: () => void;
}) {
  const [name, setName] = useState('');
  const [dose, setDose] = useState('');
  const [busy, setBusy] = useState(false);

  async function add() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await api.addSupplement({ name: name.trim(), dose: dose.trim() || undefined });
      setName('');
      setDose('');
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function taken(id: string) {
    await api.markIntake(id).catch(() => undefined);
    onChanged();
  }
  async function remove(id: string) {
    await api.deleteSupplement(id).catch(() => undefined);
    onChanged();
  }

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-lg font-semibold">Добавки</h2>
      <div className="rounded-2xl bg-tg-secondaryBg p-3 flex flex-col gap-2">
        <div className="grid grid-cols-2 gap-2">
          <input
            className="rounded-lg bg-tg-bg p-2 text-sm outline-none"
            placeholder="Название (напр. «Витамин D»)"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <input
            className="rounded-lg bg-tg-bg p-2 text-sm outline-none"
            placeholder="Дозировка"
            value={dose}
            onChange={(e) => setDose(e.target.value)}
          />
        </div>
        <button
          className="rounded-lg bg-tg-button text-tg-buttonText py-2 text-sm disabled:opacity-60"
          onClick={add}
          disabled={busy}
        >
          Добавить
        </button>
      </div>

      {items && items.length > 0 && (
        <ul className="flex flex-col gap-2">
          {items.map((s) => (
            <li
              key={s.id}
              className="rounded-2xl bg-tg-secondaryBg p-3 flex items-center justify-between"
            >
              <div>
                <div className="font-medium text-sm">
                  {s.name}
                  {s.dose && <span className="text-tg-hint font-normal"> · {s.dose}</span>}
                </div>
                {s.takenToday > 0 && (
                  <div className="text-tg-hint text-xs">сегодня отмечено: {s.takenToday}</div>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  className="rounded-lg bg-tg-button text-tg-buttonText px-3 py-2 text-sm"
                  onClick={() => taken(s.id)}
                >
                  Принял
                </button>
                <button className="text-tg-hint text-xs" onClick={() => remove(s.id)}>
                  ✕
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="text-tg-hint text-xs">
        Журнал носит информационный характер и не является медицинской
        рекомендацией. По приёму добавок и препаратов консультируйтесь с врачом.
      </p>
    </section>
  );
}
