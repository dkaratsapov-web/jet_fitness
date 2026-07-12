import type { SessionResponse } from '../api';

// Empty coach home (Phase 0). Real CRM/programs/payments arrive in Phase 1.
export function CoachHome({ session }: { session: SessionResponse }) {
  const name = session.user.firstName ?? 'тренер';
  return (
    <div className="flex flex-col gap-4 p-4">
      <header>
        <p className="text-tg-hint text-sm">Кабинет тренера</p>
        <h1 className="text-2xl font-semibold">Привет, {name}!</h1>
      </header>

      <div className="grid grid-cols-2 gap-3">
        {['Клиенты', 'Программы', 'Оплаты', 'Дашборд'].map((label) => (
          <div
            key={label}
            className="rounded-2xl bg-tg-secondaryBg p-4 text-center opacity-60"
          >
            <div className="text-base font-medium">{label}</div>
            <div className="text-tg-hint text-xs mt-1">скоро</div>
          </div>
        ))}
      </div>

      <p className="text-tg-hint text-xs mt-2">
        Фаза 0: каркас готов. Здесь появятся CRM клиентов, конструктор программ и оплаты.
      </p>
    </div>
  );
}
