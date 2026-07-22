// "Как ты сейчас" — aggregated body/health snapshot with an Olivia readout.
// Pulls BMI, weight trend, 7-day nutrition, workouts and wearable into one card.

import { useEffect, useState } from 'react';
import { api, type BodySummary } from '../api';
import { StatTile, Chip } from './ui';
import { OliviaAvatar } from './Olivia';
import { Icon } from './Icon';

const CAT_TONE: Record<string, 'gold' | 'energy' | undefined> = {
  норма: 'energy',
  недовес: 'gold',
  избыток: 'gold',
  ожирение: undefined,
};

export function BodySummaryCard() {
  const [s, setS] = useState<BodySummary | null | undefined>(undefined);

  useEffect(() => {
    api.bodySummary().then(setS).catch(() => setS(null));
  }, []);

  if (s === undefined) {
    return <div className="jf-card p-4 text-brand-muted text-sm">Собираю сводку…</div>;
  }
  if (!s) return null;

  const sleepH = s.wearable?.sleepMin != null ? (s.wearable.sleepMin / 60).toFixed(1) : null;

  return (
    <div className="jf-card p-4 flex flex-col gap-3">
      <div className="flex items-start gap-2.5">
        <OliviaAvatar size={38} />
        <div className="min-w-0">
          <div className="jf-eyebrow">Как ты сейчас</div>
          <p className="text-[13px] text-brand-text leading-snug mt-0.5">{s.summary}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        {/* BMI */}
        <div className="jf-tile p-3">
          <div className="jf-eyebrow mb-1.5" style={{ color: 'var(--muted)' }}>ИМТ</div>
          {s.bmi != null ? (
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-extrabold tabular leading-none text-brand-accentStrong">{s.bmi}</span>
              {s.bmiCategory && <Chip tone={CAT_TONE[s.bmiCategory]}>{s.bmiCategory}</Chip>}
            </div>
          ) : (
            <div className="text-[11px] text-brand-muted mt-1">укажи рост и вес</div>
          )}
        </div>

        {/* Weight */}
        <StatTile
          label="Вес"
          value={s.weight ?? '—'}
          unit={s.weight != null ? 'кг' : undefined}
          delta={
            s.weightDelta30 != null
              ? { value: s.weightDelta30, good: s.goalType === 'gain' ? 'up' : 'down', unit: ' кг' }
              : undefined
          }
        />

        {/* Calories 7d */}
        <div className="jf-tile p-3">
          <div className="jf-eyebrow mb-1.5" style={{ color: 'var(--muted)' }}>Калории · 7дн</div>
          <div className="flex items-baseline gap-1">
            <span className="text-xl font-extrabold tabular leading-none">{s.kcalAvg7 ?? '—'}</span>
            {s.kcalTarget != null && <span className="text-[11px] text-brand-muted">/ {s.kcalTarget}</span>}
          </div>
          <div className="text-[10px] text-brand-muted mt-1">записано дней: {s.loggedDays7}/7</div>
        </div>

        {/* Workouts 7d */}
        <StatTile label="Тренировки · 7дн" value={s.workouts7} tone="energy" />
      </div>

      {/* Protein */}
      {s.proteinAvg7 != null && s.proteinNeed != null && (
        <div className="text-[12px] text-brand-muted">
          Белок: <span className="text-brand-text font-semibold tabular">{s.proteinAvg7}</span> / {s.proteinNeed} г
          {s.proteinAvg7 < s.proteinNeed * 0.8 && <span className="text-brand-neg"> · подтяни</span>}
        </div>
      )}

      {/* Wearable */}
      {s.wearable && (s.wearable.steps != null || sleepH != null || s.wearable.restingPulse != null) && (
        <div className="flex items-center gap-4 pt-1 border-t border-line text-[12px]">
          {s.wearable.steps != null && (
            <span className="flex items-center gap-1 text-brand-muted">
              <Icon name="activity" size={15} className="text-brand-accent" />
              <span className="text-brand-text font-semibold tabular">{s.wearable.steps}</span> шаг.
            </span>
          )}
          {sleepH != null && (
            <span className="text-brand-muted">
              💤 <span className="text-brand-text font-semibold tabular">{sleepH}</span> ч
            </span>
          )}
          {s.wearable.restingPulse != null && (
            <span className="flex items-center gap-1 text-brand-muted">
              <Icon name="heart" size={15} className="text-brand-accent" />
              <span className="text-brand-text font-semibold tabular">{s.wearable.restingPulse}</span> уд.
            </span>
          )}
        </div>
      )}
    </div>
  );
}
