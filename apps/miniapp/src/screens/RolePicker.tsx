import type { AppRole } from '../api';
import { Logo } from '../components/Logo';

const ROLE: Record<AppRole, { label: string; sub: string; icon: string }> = {
  owner: { label: 'Владелец платформы', sub: 'аналитика · тренеры · выручка', icon: '⚙️' },
  coach: { label: 'Тренер', sub: 'клиенты · программы · оплаты', icon: '🏋️' },
  client: { label: 'Подопечный', sub: 'тренировки · питание · здоровье', icon: '🔥' },
};

// Multi-role accounts (e.g. the owner) reach this only via the ⇄ switch — a
// user's role otherwise comes from their Telegram id and they enter directly.
export function RolePicker({
  roles,
  onPick,
}: {
  roles: AppRole[];
  onPick: (role: AppRole) => void;
}) {
  return (
    <div className="flex flex-col gap-5 p-6 min-h-full justify-center max-w-md mx-auto w-full">
      <div className="flex flex-col items-center gap-3 jf-rise">
        <Logo height={30} />
        <div className="text-center">
          <p className="jf-eyebrow mb-1">Режим входа</p>
          <h1 className="text-2xl font-bold">Куда заходим?</h1>
          <p className="text-brand-muted text-sm mt-1">
            У твоего аккаунта несколько ролей — выбери режим.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {roles.map((role, i) => {
          const r = ROLE[role];
          return (
            <button
              key={role}
              className={`jf-card p-4 flex items-center gap-3 text-left jf-press jf-rise jf-rise-${Math.min(i + 1, 4)}`}
              onClick={() => onPick(role)}
            >
              <span className="w-11 h-11 rounded-2xl shrink-0 grid place-items-center text-xl bg-brand-surface2 brand-line">
                {r.icon}
              </span>
              <span className="flex-1 min-w-0">
                <span className="block font-semibold">{r.label}</span>
                <span className="block text-brand-muted text-xs mt-0.5">{r.sub}</span>
              </span>
              <span className="text-brand-accent text-lg">›</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
