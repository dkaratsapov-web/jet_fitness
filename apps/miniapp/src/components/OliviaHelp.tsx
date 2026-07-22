// "Спроси Оливию" — scripted help sheet. Branches → questions → answers.
// Works with no backend/AI. When the AI tier is enabled (ANTHROPIC_API_KEY),
// the same entry point can host free-form commands (see plan in OliviaHelp v2).

import { useState } from 'react';
import { Sheet } from './ui';
import { OliviaAvatar } from './Olivia';
import { CLIENT_HELP, COACH_HELP, type HelpBranch } from '../data/oliviaHelp';

export function OliviaHelp({
  role,
  initialBranch,
  onClose,
  onAskCoach,
}: {
  role: 'client' | 'coach';
  initialBranch?: string;
  onClose: () => void;
  /** Escalate to the real coach chat (client only). */
  onAskCoach?: () => void;
}) {
  const branches = role === 'coach' ? COACH_HELP : CLIENT_HELP;
  const [branchId, setBranchId] = useState<string | null>(initialBranch ?? null);
  const [openQ, setOpenQ] = useState<number | null>(null);
  const branch = branches.find((b) => b.id === branchId) ?? null;

  return (
    <Sheet
      eyebrow="Оливия"
      title={branch ? branch.title : 'Чем помочь?'}
      onClose={onClose}
      footer={
        role === 'client' && onAskCoach ? (
          <button
            className="w-full rounded-2xl bg-brand-surface brand-line p-3 text-sm font-medium jf-press"
            onClick={onAskCoach}
          >
            Не нашла ответ? Написать тренеру
          </button>
        ) : undefined
      }
    >
      {!branch ? (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3 pb-1">
            <OliviaAvatar size={44} />
            <p className="text-sm text-brand-muted leading-snug">
              Привет! Выбери тему — подскажу, где что находится и как всё работает.
            </p>
          </div>
          {branches.map((b) => (
            <BranchRow key={b.id} branch={b} onOpen={() => { setBranchId(b.id); setOpenQ(null); }} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <button
            className="self-start text-brand-accent text-sm font-medium mb-1"
            onClick={() => { setBranchId(null); setOpenQ(null); }}
          >
            ← Все темы
          </button>
          {branch.items.map((it, i) => (
            <div key={i} className="jf-tile overflow-hidden">
              <button
                className="w-full text-left p-3 flex items-center justify-between gap-2"
                onClick={() => setOpenQ(openQ === i ? null : i)}
              >
                <span className="text-sm font-semibold">{it.q}</span>
                <span className="text-brand-accent text-lg leading-none shrink-0">
                  {openQ === i ? '–' : '+'}
                </span>
              </button>
              {openQ === i && (
                <div className="px-3 pb-3 -mt-1 flex gap-2.5">
                  <OliviaAvatar size={26} ring={false} />
                  <p className="text-[13px] text-brand-text leading-relaxed">{it.a}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Sheet>
  );
}

function BranchRow({ branch, onOpen }: { branch: HelpBranch; onOpen: () => void }) {
  return (
    <button className="jf-tile p-3 flex items-center gap-3 text-left jf-press" onClick={onOpen}>
      <span className="w-10 h-10 rounded-xl shrink-0 grid place-items-center text-lg bg-brand-surface2 brand-line">
        {branch.icon}
      </span>
      <span className="flex-1 font-semibold text-sm">{branch.title}</span>
      <span className="text-brand-muted text-xs">{branch.items.length}</span>
      <span className="text-brand-accent">›</span>
    </button>
  );
}
