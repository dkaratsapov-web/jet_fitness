import type { AppRole } from '../api';

// When an account is both coach and client (spec §2), let the user pick the
// context to enter. Role is chosen by login context, not fixed on the user.
export function RolePicker({
  onPick,
}: {
  roles: AppRole[];
  onPick: (role: AppRole) => void;
}) {
  return (
    <div className="flex flex-col gap-4 p-6 min-h-full justify-center">
      <h1 className="text-2xl font-semibold text-center">Кто вы сегодня?</h1>
      <p className="text-tg-hint text-sm text-center">
        Ваш аккаунт — и тренер, и подопечный. Выберите режим.
      </p>
      <button
        className="rounded-2xl bg-tg-button text-tg-buttonText p-4 font-medium"
        onClick={() => onPick('coach')}
      >
        Я тренер
      </button>
      <button
        className="rounded-2xl bg-tg-secondaryBg p-4 font-medium"
        onClick={() => onPick('client')}
      >
        Я подопечный
      </button>
    </div>
  );
}
