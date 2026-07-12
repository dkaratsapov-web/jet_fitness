import type { SessionResponse } from '../api';

// Empty client home (Phase 0). Today's workout, nutrition, progress arrive later.
export function ClientHome({ session }: { session: SessionResponse }) {
  const name = session.user.firstName ?? 'спортсмен';
  return (
    <div className="flex flex-col gap-4 p-4">
      <header>
        <p className="text-tg-hint text-sm">Личный кабинет</p>
        <h1 className="text-2xl font-semibold">Привет, {name}!</h1>
      </header>

      <div className="grid grid-cols-2 gap-3">
        {['Тренировка', 'Питание', 'Прогресс', 'Check-in'].map((label) => (
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
        Фаза 0: каркас готов. Здесь появятся тренировка на сегодня, лог питания и прогресс.
      </p>
    </div>
  );
}
