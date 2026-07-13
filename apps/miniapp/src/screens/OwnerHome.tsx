import type { SessionResponse } from '../api';

// Platform owner/operator home (spec §2 admin). Distinct from coach and client:
// oversees the whole platform. Real panels arrive in Phase 3.
export function OwnerHome({ session }: { session: SessionResponse }) {
  const name = session.user.firstName ?? 'владелец';
  return (
    <div className="flex flex-col gap-4 p-4">
      <header>
        <p className="text-tg-hint text-sm">Панель владельца платформы</p>
        <h1 className="text-2xl font-semibold">Привет, {name}!</h1>
      </header>

      <div className="grid grid-cols-2 gap-3">
        {['Тренеры', 'Клиенты', 'Платежи и комиссия', 'Модерация', 'Аналитика', 'Настройки'].map(
          (label) => (
            <div
              key={label}
              className="rounded-2xl bg-tg-secondaryBg p-4 text-center opacity-60"
            >
              <div className="text-base font-medium">{label}</div>
              <div className="text-tg-hint text-xs mt-1">скоро</div>
            </div>
          ),
        )}
      </div>

      <p className="text-tg-hint text-xs mt-2">
        Вы вошли как <b>владелец платформы</b> — отдельная роль, не тренер и не клиент.
        Здесь появятся управление тренерами, клиентами, платежами и модерация.
      </p>
    </div>
  );
}
