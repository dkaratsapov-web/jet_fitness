import { useState } from 'react';
import { api, type Sex, type GoalType, type ActivityLevel } from '../api';
import { OliviaAvatar } from '../components/Olivia';

const SEX_LABELS: Record<Sex, string> = { male: 'М', female: 'Ж', other: 'Другое' };

const GOALS: { value: GoalType; label: string; emoji: string }[] = [
  { value: 'lose', label: 'Похудеть', emoji: '🔥' },
  { value: 'maintain', label: 'Поддержать', emoji: '⚖️' },
  { value: 'gain', label: 'Набрать', emoji: '💪' },
];

const ACTIVITY: { value: ActivityLevel; label: string; hint: string }[] = [
  { value: 'sedentary', label: 'Минимум', hint: 'сидячий образ' },
  { value: 'light', label: 'Низкая', hint: '1–2 трен/нед' },
  { value: 'moderate', label: 'Средняя', hint: '3–4 трен/нед' },
  { value: 'high', label: 'Высокая', hint: '5–6 трен/нед' },
  { value: 'athlete', label: 'Спорт', hint: 'каждый день' },
];

// Client onboarding: goal direction + body params → the backend auto-computes a
// calorie/macro target for solo clients (no coach). Shown until the essentials
// (goal + sex + height) are set.
export function OnboardingForm({ onDone }: { onDone: () => void }) {
  const [goalType, setGoalType] = useState<GoalType | null>(null);
  const [sex, setSex] = useState<Sex | null>(null);
  const [height, setHeight] = useState('');
  const [weight, setWeight] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [activity, setActivity] = useState<ActivityLevel>('light');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    if (!goalType) return setError('Выбери цель');
    if (!sex) return setError('Укажи пол');
    if (!height || Number(height) <= 0) return setError('Укажи рост');
    setSaving(true);
    try {
      await api.updateProfile({
        goal: GOALS.find((g) => g.value === goalType)?.label,
        goalType,
        sex,
        heightCm: Number(height),
        weightKg: weight ? Number(weight) : undefined,
        birthDate: birthDate || undefined,
        activityLevel: activity,
      });
      onDone();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="jf-card p-4 flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <OliviaAvatar size={44} />
        <div>
          <div className="font-bold">Давай настроим под тебя</div>
          <p className="text-brand-muted text-xs leading-snug">
            Пара вопросов — и я рассчитаю твою норму калорий. Это можно изменить позже.
          </p>
        </div>
      </div>

      {/* Goal */}
      <Field label="Твоя цель">
        <div className="grid grid-cols-3 gap-2">
          {GOALS.map((g) => (
            <button
              key={g.value}
              onClick={() => setGoalType(g.value)}
              className="rounded-xl p-2.5 flex flex-col items-center gap-1 jf-press"
              style={
                goalType === g.value
                  ? { background: 'var(--accent)', color: 'var(--on-accent)' }
                  : { background: 'var(--surface-2)', border: '1px solid var(--line)' }
              }
            >
              <span className="text-lg">{g.emoji}</span>
              <span className="text-xs font-semibold">{g.label}</span>
            </button>
          ))}
        </div>
      </Field>

      {/* Sex */}
      <Field label="Пол">
        <div className="flex gap-2">
          {(Object.keys(SEX_LABELS) as Sex[]).map((s) => (
            <button
              key={s}
              onClick={() => setSex(s)}
              className="flex-1 rounded-xl py-2 text-sm font-semibold jf-press"
              style={
                sex === s
                  ? { background: 'var(--accent)', color: 'var(--on-accent)' }
                  : { background: 'var(--surface-2)', border: '1px solid var(--line)' }
              }
            >
              {SEX_LABELS[s]}
            </button>
          ))}
        </div>
      </Field>

      {/* Body params */}
      <div className="grid grid-cols-3 gap-2">
        <NumField label="Рост, см" value={height} onChange={setHeight} placeholder="175" />
        <NumField label="Вес, кг" value={weight} onChange={setWeight} placeholder="70" />
        <Field label="Дата рожд.">
          <input
            className="rounded-xl bg-brand-surface2 brand-line p-2.5 text-sm outline-none w-full"
            type="date"
            value={birthDate}
            onChange={(e) => setBirthDate(e.target.value)}
          />
        </Field>
      </div>

      {/* Activity */}
      <Field label="Уровень активности">
        <div className="grid grid-cols-5 gap-1.5">
          {ACTIVITY.map((a) => (
            <button
              key={a.value}
              onClick={() => setActivity(a.value)}
              className="rounded-lg py-2 px-1 flex flex-col items-center gap-0.5 jf-press"
              style={
                activity === a.value
                  ? { background: 'var(--energy)', color: 'var(--on-energy)' }
                  : { background: 'var(--surface-2)', border: '1px solid var(--line)' }
              }
            >
              <span className="text-[11px] font-bold leading-tight">{a.label}</span>
            </button>
          ))}
        </div>
        <p className="text-brand-muted text-[10px] mt-1">
          {ACTIVITY.find((a) => a.value === activity)?.hint}
        </p>
      </Field>

      {error && <p className="text-brand-neg text-sm">{error}</p>}
      <button
        className="rounded-2xl bg-brand-accent text-brand-onAccent p-3.5 font-semibold jf-press disabled:opacity-60"
        onClick={save}
        disabled={saving}
      >
        {saving ? 'Считаю…' : 'Рассчитать мою норму'}
      </button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="jf-eyebrow" style={{ color: 'var(--muted)' }}>
        {label}
      </span>
      {children}
    </label>
  );
}

function NumField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <Field label={label}>
      <input
        className="rounded-xl bg-brand-surface2 brand-line p-2.5 text-sm outline-none w-full tabular"
        inputMode="numeric"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^0-9.]/g, ''))}
      />
    </Field>
  );
}
