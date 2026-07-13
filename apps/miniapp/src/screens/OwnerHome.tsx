import { useEffect, useState } from 'react';
import { api, type SessionResponse, type OwnerRevenue } from '../api';

// Platform owner/operator home (spec §2 admin). Distinct from coach and client:
// oversees the whole platform. Phase 1 wires up the platform revenue panel.
export function OwnerHome({ session }: { session: SessionResponse }) {
  const name = session.user.firstName ?? 'владелец';
  const [revenue, setRevenue] = useState<OwnerRevenue | null | undefined>(undefined);

  useEffect(() => {
    api
      .ownerRevenue()
      .then(setRevenue)
      .catch(() => setRevenue(null));
  }, []);

  return (
    <div className="flex flex-col gap-4 p-4">
      <header>
        <p className="text-tg-hint text-sm">Панель владельца платформы</p>
        <h1 className="text-2xl font-semibold">Привет, {name}!</h1>
      </header>

      <section>
        <h2 className="text-lg font-semibold mb-2">Платежи и комиссия</h2>
        {revenue === undefined ? (
          <p className="text-tg-hint text-sm">Загрузка…</p>
        ) : revenue === null ? (
          <p className="text-tg-hint text-sm">Не удалось загрузить данные.</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Money value={revenue.gross} label="оборот платформы" />
              <Money value={revenue.commission} label={`комиссия ${revenue.feePercent}%`} />
              <Money value={revenue.thisMonth} label="в этом месяце" />
              <Stat value={revenue.coachesCount} label="тренеров с оплатами" />
            </div>

            {revenue.perCoach.length > 0 && (
              <div className="mt-3">
                <div className="text-tg-hint text-xs font-medium mb-1">По тренерам</div>
                <ul className="flex flex-col gap-2">
                  {revenue.perCoach.map((c) => (
                    <li
                      key={c.coachId}
                      className="rounded-2xl bg-tg-secondaryBg p-3 flex items-center justify-between"
                    >
                      <span className="font-medium">{c.coachName}</span>
                      <span className="text-sm">
                        {c.gross.toLocaleString('ru-RU')} ₽
                        <span className="text-tg-hint">
                          {' '}
                          · комиссия {c.commission.toLocaleString('ru-RU')} ₽
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </section>

      <div className="grid grid-cols-2 gap-3">
        {['Тренеры', 'Клиенты', 'Модерация', 'Аналитика', 'Настройки'].map((label) => (
          <div key={label} className="rounded-2xl bg-tg-secondaryBg p-4 text-center opacity-60">
            <div className="text-base font-medium">{label}</div>
            <div className="text-tg-hint text-xs mt-1">скоро</div>
          </div>
        ))}
      </div>

      <p className="text-tg-hint text-xs mt-2">
        Вы вошли как <b>владелец платформы</b> — отдельная роль, не тренер и не клиент.
      </p>
    </div>
  );
}

function Money({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-2xl bg-tg-secondaryBg p-3 text-center">
      <div className="text-xl font-semibold">{value.toLocaleString('ru-RU')} ₽</div>
      <div className="text-tg-hint text-xs">{label}</div>
    </div>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-2xl bg-tg-secondaryBg p-3 text-center">
      <div className="text-xl font-semibold">{value}</div>
      <div className="text-tg-hint text-xs">{label}</div>
    </div>
  );
}
