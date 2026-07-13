import { useEffect, useState } from 'react';
import { api, type Checkin, type CheckinInput } from '../api';

// Client check-in (Phase 1): weekly self-report + coach replies.
export function CheckinScreen({ onBack }: { onBack: () => void }) {
  const [items, setItems] = useState<Checkin[] | null>(null);
  const [sleep, setSleep] = useState<number | null>(null);
  const [energy, setEnergy] = useState<number | null>(null);
  const [mood, setMood] = useState<number | null>(null);
  const [adherence, setAdherence] = useState('');
  const [weight, setWeight] = useState('');
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function load() {
    api.clientCheckins().then(setItems).catch(() => setItems([]));
  }
  useEffect(load, []);

  async function save() {
    setError(null);
    const body: CheckinInput = {
      sleepQuality: sleep,
      energy,
      mood,
      adherencePct: adherence ? Number(adherence) : null,
      weightKg: weight ? Number(weight) : null,
      comment: comment.trim() || null,
    };
    if (
      !sleep && !energy && !mood && !adherence && !weight && !comment.trim()
    ) {
      setError('Заполните хотя бы одно поле');
      return;
    }
    setSaving(true);
    try {
      await api.addCheckin(body);
      setSleep(null);
      setEnergy(null);
      setMood(null);
      setAdherence('');
      setWeight('');
      setComment('');
      setItems(null);
      load();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <header className="flex items-center justify-between">
        <button className="text-tg-link text-sm" onClick={onBack}>
          ← Назад
        </button>
        <h1 className="text-lg font-semibold">Check-in</h1>
        <span className="w-12" />
      </header>

      <section className="rounded-2xl bg-tg-secondaryBg p-3 flex flex-col gap-3">
        <div className="font-medium">Как прошла неделя?</div>
        <Scale label="Сон" value={sleep} onChange={setSleep} />
        <Scale label="Энергия" value={energy} onChange={setEnergy} />
        <Scale label="Настроение" value={mood} onChange={setMood} />
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-tg-hint text-[10px] uppercase tracking-wide">
              Придерживался плана, %
            </span>
            <input
              className="rounded-lg bg-tg-bg p-2 text-sm outline-none"
              inputMode="numeric"
              placeholder="0–100"
              value={adherence}
              onChange={(e) => setAdherence(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-tg-hint text-[10px] uppercase tracking-wide">Вес, кг</span>
            <input
              className="rounded-lg bg-tg-bg p-2 text-sm outline-none"
              inputMode="decimal"
              placeholder="—"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
            />
          </label>
        </div>
        <textarea
          className="rounded-lg bg-tg-bg p-2 text-sm outline-none resize-none"
          rows={3}
          placeholder="Комментарий тренеру: что получилось, что мешало, вопросы…"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
        />
        {error && <p className="text-red-500 text-sm">{error}</p>}
        <button
          className="rounded-xl bg-tg-button text-tg-buttonText p-3 font-medium disabled:opacity-60"
          onClick={save}
          disabled={saving}
        >
          {saving ? 'Отправляем…' : 'Отправить check-in'}
        </button>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-2">История</h2>
        {items === null ? (
          <p className="text-tg-hint text-sm">Загрузка…</p>
        ) : items.length === 0 ? (
          <p className="text-tg-hint text-sm">
            Пока нет отчётов. Отправьте первый — тренер увидит его и ответит.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {items.map((c) => (
              <li key={c.id} className="rounded-2xl bg-tg-secondaryBg p-3 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-tg-hint text-xs">{formatDate(c.date)}</span>
                  <span className="text-xs">
                    {[
                      c.sleepQuality && `сон ${c.sleepQuality}/5`,
                      c.energy && `энергия ${c.energy}/5`,
                      c.mood && `настрой ${c.mood}/5`,
                      c.adherencePct != null && `план ${c.adherencePct}%`,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </div>
                {c.comment && <p className="text-sm">{c.comment}</p>}
                {c.coachReply && (
                  <div className="rounded-xl bg-tg-bg p-2">
                    <div className="text-tg-hint text-[10px] uppercase tracking-wide mb-1">
                      Ответ тренера
                    </div>
                    <p className="text-sm">{c.coachReply}</p>
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

function Scale({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | null;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm">{label}</span>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            className={`w-8 h-8 rounded-lg text-sm ${
              value === n ? 'bg-tg-button text-tg-buttonText' : 'bg-tg-bg text-tg-hint'
            }`}
            onClick={() => onChange(n)}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}
