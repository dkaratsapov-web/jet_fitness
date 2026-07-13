import type { AppRole } from '../api';

const LABELS: Record<AppRole, string> = {
  owner: 'Я владелец платформы',
  coach: 'Я тренер',
  client: 'Я подопечный',
};

// When an account has more than one role (spec §2), let the user pick the
// context to enter. Role is chosen by login context, not fixed on the user.
export function RolePicker({
  roles,
  onPick,
}: {
  roles: AppRole[];
  onPick: (role: AppRole) => void;
}) {
  return (
    <div className="flex flex-col gap-4 p-6 min-h-full justify-center">
      <h1 className="text-2xl font-semibold text-center">Как войти?</h1>
      <p className="text-tg-hint text-sm text-center">
        У вашего аккаунта несколько ролей. Выберите режим.
      </p>
      {roles.map((role, i) => (
        <button
          key={role}
          className={
            i === 0
              ? 'rounded-2xl bg-tg-button text-tg-buttonText p-4 font-medium'
              : 'rounded-2xl bg-tg-secondaryBg p-4 font-medium'
          }
          onClick={() => onPick(role)}
        >
          {LABELS[role]}
        </button>
      ))}
    </div>
  );
}
