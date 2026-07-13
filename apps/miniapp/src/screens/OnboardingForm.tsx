import { useState } from 'react';
import { api, type Sex } from '../api';

const SEX_LABELS: Record<Sex, string> = {
  male: 'М',
  female: 'Ж',
  other: 'Другое',
};

// Client onboarding questionnaire (Phase 1): fills ClientProfile so the coach
// has a card from day one. Shown until the essentials (goal/sex/height) are set.
export function OnboardingForm({ onDone }: { onDone: () => void }) {
  const [goal, setGoal] = useState('');
  const [sex, setSex] = useState<Sex | null>(null);
  const [height, setHeight] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    if (!goal.trim()) return setError('Укажите цель');
    if (!sex) return setError('Выберите пол');
    if (!height || Number(height) <= 0) return setError('Укажите рост');
    setSaving(true);
    try {
      await api.updateProfile({
        goal: goal.trim(),
        sex,
        heightCm: Number(height),
        birthDate: birthDate || undefined,
      });
      onDone();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-2xl bg-tg-secondaryBg p-4 flex flex-col gap-3">
      <div>
        <div className="font-semibold">Пара вопросов для старта</div>
        <p className="text-tg-hint text-sm">
          Это поможет тренеру подобрать программу. Заполняется один раз.
        </p>
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-tg-hint text-xs">Ваша цель</span>
        <input
          className="rounded-xl bg-tg-bg p-3 outline-none"
          placeholder="напр. «Похудеть на 8 кг», «Набрать массу»"
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
        />
      </label>

      <div className="flex flex-col gap-1">
        <span className="text-tg-hint text-xs">Пол</span>
        <div className="flex gap-2">
          {(Object.keys(SEX_LABELS) as Sex[]).map((s) => (
            <button
              key={s}
              className={`flex-1 rounded-xl py-2 text-sm ${
                sex === s ? 'bg-tg-button text-tg-buttonText' : 'bg-tg-bg text-tg-hint'
              }`}
              onClick={() => setSex(s)}
            >
              {SEX_LABELS[s]}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-tg-hint text-xs">Рост, см</span>
          <input
            className="rounded-xl bg-tg-bg p-3 outline-none"
            inputMode="numeric"
            placeholder="175"
            value={height}
            onChange={(e) => setHeight(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-tg-hint text-xs">Дата рождения</span>
          <input
            className="rounded-xl bg-tg-bg p-3 outline-none"
            type="date"
            value={birthDate}
            onChange={(e) => setBirthDate(e.target.value)}
          />
        </label>
      </div>

      {error && <p className="text-red-500 text-sm">{error}</p>}
      <button
        className="rounded-xl bg-tg-button text-tg-buttonText p-3 font-medium disabled:opacity-60"
        onClick={save}
        disabled={saving}
      >
        {saving ? 'Сохраняем…' : 'Начать'}
      </button>
    </div>
  );
}
