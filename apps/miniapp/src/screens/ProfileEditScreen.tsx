// Editable personal profile. Everyone can fill in their body params, goal,
// experience, limitations and allergies. For clients these feed the auto
// calorie target and are visible to their coach.

import { useEffect, useState } from 'react';
import {
  api,
  type Sex,
  type GoalType,
  type ActivityLevel,
  type ExperienceLevel,
} from '../api';

const SEX_LABELS: Record<Sex, string> = { male: 'М', female: 'Ж', other: 'Другое' };
const GOALS: { value: GoalType; label: string }[] = [
  { value: 'lose', label: 'Похудеть' },
  { value: 'maintain', label: 'Поддержать' },
  { value: 'gain', label: 'Набрать' },
];
const ACTIVITY: { value: ActivityLevel; label: string }[] = [
  { value: 'sedentary', label: 'Мин' },
  { value: 'light', label: 'Низк' },
  { value: 'moderate', label: 'Сред' },
  { value: 'high', label: 'Выс' },
  { value: 'athlete', label: 'Спорт' },
];
const EXP: { value: ExperienceLevel; label: string }[] = [
  { value: 'novice', label: 'Новичок' },
  { value: 'intermediate', label: 'Средний' },
  { value: 'advanced', label: 'Опытный' },
];

export function ProfileEditScreen({ onBack }: { onBack: () => void }) {
  const [goalType, setGoalType] = useState<GoalType | null>(null);
  const [sex, setSex] = useState<Sex | null>(null);
  const [height, setHeight] = useState('');
  const [weight, setWeight] = useState('');
  const [targetWeight, setTargetWeight] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [activity, setActivity] = useState<ActivityLevel | null>(null);
  const [experience, setExperience] = useState<ExperienceLevel | null>(null);
  const [limitations, setLimitations] = useState('');
  const [allergies, setAllergies] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api
      .clientProfile()
      .then((p) => {
        setGoalType(p.goalType);
        setSex(p.sex);
        setHeight(p.heightCm != null ? String(p.heightCm) : '');
        setWeight(p.weightKg != null ? String(p.weightKg) : '');
        setTargetWeight(p.targetWeightKg != null ? String(p.targetWeightKg) : '');
        setBirthDate(p.birthDate ? p.birthDate.slice(0, 10) : '');
        setActivity(p.activityLevel);
        setExperience(p.experience);
        setLimitations(p.limitations ?? '');
        setAllergies(p.allergies ?? '');
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, []);

  async function save() {
    setSaving(true);
    setSaved(false);
    try {
      await api.updateProfile({
        goalType: goalType ?? undefined,
        goal: goalType ? GOALS.find((g) => g.value === goalType)?.label : undefined,
        sex: sex ?? undefined,
        heightCm: height ? Number(height) : undefined,
        weightKg: weight ? Number(weight) : undefined,
        targetWeightKg: targetWeight ? Number(targetWeight) : undefined,
        birthDate: birthDate || undefined,
        activityLevel: activity ?? undefined,
        experience: experience ?? undefined,
        limitations: limitations.trim(),
        allergies: allergies.trim(),
      });
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="p-4">
        <button className="text-brand-accent text-sm" onClick={onBack}>← Назад</button>
        <p className="text-brand-muted text-sm mt-4">Загрузка…</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4 pb-10">
      <header className="flex items-center justify-between">
        <button className="text-brand-accent text-sm font-medium" onClick={onBack}>← Назад</button>
        <h1 className="text-lg font-semibold">Личные данные</h1>
        <span className="w-12" />
      </header>

      <Card title="Цель">
        <Segmented options={GOALS} value={goalType} onChange={setGoalType} />
      </Card>

      <Card title="О тебе">
        <Row label="Пол">
          <Segmented options={(Object.keys(SEX_LABELS) as Sex[]).map((s) => ({ value: s, label: SEX_LABELS[s] }))} value={sex} onChange={setSex} />
        </Row>
        <div className="grid grid-cols-3 gap-2">
          <Num label="Рост, см" value={height} onChange={setHeight} placeholder="175" />
          <Num label="Вес, кг" value={weight} onChange={setWeight} placeholder="70" />
          <Num label="Цель, кг" value={targetWeight} onChange={setTargetWeight} placeholder="65" />
        </div>
        <Row label="Дата рождения">
          <input
            className="rounded-xl bg-brand-surface2 brand-line p-2.5 text-sm outline-none w-full"
            type="date"
            value={birthDate}
            onChange={(e) => setBirthDate(e.target.value)}
          />
        </Row>
      </Card>

      <Card title="Тренировки">
        <Row label="Уровень активности">
          <Segmented options={ACTIVITY} value={activity} onChange={setActivity} small />
        </Row>
        <Row label="Опыт тренировок">
          <Segmented options={EXP} value={experience} onChange={setExperience} />
        </Row>
      </Card>

      <Card title="Здоровье и питание">
        <Row label="Ограничения, травмы">
          <textarea
            className="rounded-xl bg-brand-surface2 brand-line p-2.5 text-sm outline-none w-full resize-none"
            rows={2}
            placeholder="напр. «болит колено», «грыжа L4-L5» — тренер учтёт"
            value={limitations}
            onChange={(e) => setLimitations(e.target.value)}
          />
        </Row>
        <Row label="Аллергии, непереносимости">
          <textarea
            className="rounded-xl bg-brand-surface2 brand-line p-2.5 text-sm outline-none w-full resize-none"
            rows={2}
            placeholder="напр. «лактоза», «орехи» — учтём в питании"
            value={allergies}
            onChange={(e) => setAllergies(e.target.value)}
          />
        </Row>
      </Card>

      <button
        className="rounded-2xl bg-brand-accent text-brand-onAccent p-3.5 font-semibold jf-press disabled:opacity-60"
        onClick={save}
        disabled={saving}
      >
        {saving ? 'Сохраняем…' : saved ? 'Сохранено ✓' : 'Сохранить'}
      </button>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="jf-card p-4 flex flex-col gap-3">
      <div className="jf-eyebrow">{title}</div>
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-brand-muted text-[11px] font-semibold">{label}</span>
      {children}
    </label>
  );
}

function Segmented<T extends string>({
  options,
  value,
  onChange,
  small,
}: {
  options: { value: T; label: string }[];
  value: T | null;
  onChange: (v: T) => void;
  small?: boolean;
}) {
  return (
    <div className={`grid gap-1.5`} style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0,1fr))` }}>
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`rounded-xl ${small ? 'py-1.5 text-[11px]' : 'py-2 text-sm'} font-semibold jf-press`}
          style={
            value === o.value
              ? { background: 'var(--accent)', color: 'var(--on-accent)' }
              : { background: 'var(--surface-2)', border: '1px solid var(--line)' }
          }
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Num({
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
    <label className="flex flex-col gap-1">
      <span className="text-brand-muted text-[10px] font-semibold uppercase tracking-wide">{label}</span>
      <input
        className="rounded-xl bg-brand-surface2 brand-line p-2.5 text-sm outline-none w-full tabular"
        inputMode="decimal"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^0-9.]/g, ''))}
      />
    </label>
  );
}
