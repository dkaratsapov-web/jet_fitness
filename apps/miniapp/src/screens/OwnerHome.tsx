import { useEffect, useState } from 'react';
import {
  api,
  type SessionResponse,
  type OwnerRevenue,
  type OwnerStats,
  type OwnerCoach,
  type OwnerClientRow,
} from '../api';

type Tab = 'overview' | 'coaches' | 'clients';

// Platform owner/operator home (spec §2). Distinct role: oversees the platform.
export function OwnerHome({
  session,
  onEnterRole,
  busy,
}: {
  session: SessionResponse;
  onEnterRole?: (role: 'coach' | 'client') => void;
  busy?: boolean;
}) {
  const name = session.user.firstName ?? 'владелец';
  const [tab, setTab] = useState<Tab>('overview');

  return (
    <div className="flex flex-col gap-4 p-4">
      <header>
        <p className="text-tg-hint text-sm">Панель владельца платформы</p>
        <h1 className="text-2xl font-semibold">Привет, {name}!</h1>
      </header>

      <nav className="flex gap-2 rounded-2xl bg-tg-secondaryBg p-1">
        <TabBtn active={tab === 'overview'} onClick={() => setTab('overview')}>
          Обзор
        </TabBtn>
        <TabBtn active={tab === 'coaches'} onClick={() => setTab('coaches')}>
          Тренеры
        </TabBtn>
        <TabBtn active={tab === 'clients'} onClick={() => setTab('clients')}>
          Клиенты
        </TabBtn>
      </nav>

      {onEnterRole && (
        <div className="rounded-2xl bg-brand-surface brand-line p-3 flex flex-col gap-2">
          <div className="text-brand-muted text-xs font-medium">
            Тестовый режим — открой приложение от лица роли
          </div>
          <div className="flex gap-2">
            <button
              className="flex-1 rounded-xl bg-brand-accent text-brand-onAccent py-2.5 text-sm font-semibold disabled:opacity-60"
              onClick={() => onEnterRole('coach')}
              disabled={busy}
            >
              Открыть как тренер
            </button>
            <button
              className="flex-1 rounded-xl bg-brand-surface2 py-2.5 text-sm font-semibold disabled:opacity-60"
              onClick={() => onEnterRole('client')}
              disabled={busy}
            >
              Открыть как клиент
            </button>
          </div>
          <p className="text-brand-muted text-[11px]">
            Ты получишь полноценный кабинет роли со своими тестовыми данными.
            Вернуться — кнопкой «⇄ сменить роль» внизу экрана.
          </p>
        </div>
      )}

      {tab === 'overview' && <Overview />}
      {tab === 'coaches' && <Coaches />}
      {tab === 'clients' && <Clients />}

      <p className="text-tg-hint text-xs mt-2">
        Вы вошли как <b>владелец платформы</b> — отдельная роль, не тренер и не клиент.
      </p>
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      className={`flex-1 rounded-xl py-2 text-sm font-medium ${
        active ? 'bg-tg-button text-tg-buttonText' : 'text-tg-hint'
      }`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function Overview() {
  const [stats, setStats] = useState<OwnerStats | null>(null);
  const [revenue, setRevenue] = useState<OwnerRevenue | null>(null);

  useEffect(() => {
    api.ownerStats().then(setStats).catch(() => setStats(null));
    api.ownerRevenue().then(setRevenue).catch(() => setRevenue(null));
  }, []);

  return (
    <div className="flex flex-col gap-4">
      {stats && (
        <div className="grid grid-cols-3 gap-3">
          <Stat value={stats.coaches} label="тренеров" />
          <Stat value={stats.clients} label="клиентов" />
          <Stat value={stats.activeSubscriptions} label="подписок" />
          <Stat value={stats.workoutsLogged} label="тренировок" />
          <Stat value={stats.gmv} label="₽ оборот" />
          <Stat value={stats.suspended} label="заблок." />
        </div>
      )}

      {revenue && (
        <section>
          <h2 className="text-lg font-semibold mb-2">Платежи и комиссия</h2>
          <div className="grid grid-cols-2 gap-3">
            <Money value={revenue.gross} label="оборот платформы" />
            <Money value={revenue.commission} label={`комиссия ${revenue.feePercent}%`} />
          </div>
          {revenue.perCoach.length > 0 && (
            <ul className="flex flex-col gap-2 mt-3">
              {revenue.perCoach.map((c) => (
                <li
                  key={c.coachId}
                  className="rounded-2xl bg-tg-secondaryBg p-3 flex items-center justify-between"
                >
                  <span className="font-medium">{c.coachName}</span>
                  <span className="text-sm">
                    {c.gross.toLocaleString('ru-RU')} ₽
                    <span className="text-tg-hint"> · комиссия {c.commission.toLocaleString('ru-RU')} ₽</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

function Coaches() {
  const [items, setItems] = useState<OwnerCoach[] | null>(null);
  function load() {
    api.ownerCoaches().then(setItems).catch(() => setItems([]));
  }
  useEffect(load, []);

  return (
    <div className="flex flex-col gap-2">
      {items === null ? (
        <p className="text-tg-hint text-sm">Загрузка…</p>
      ) : items.length === 0 ? (
        <p className="text-tg-hint text-sm">Тренеров пока нет.</p>
      ) : (
        items.map((c) => (
          <UserRow
            key={c.id}
            id={c.id}
            name={c.name}
            suspended={c.suspended}
            sub={`${c.clients} клиентов · ${c.revenue.toLocaleString('ru-RU')} ₽`}
            onChanged={load}
          />
        ))
      )}
    </div>
  );
}

function Clients() {
  const [items, setItems] = useState<OwnerClientRow[] | null>(null);
  function load() {
    api.ownerClients().then(setItems).catch(() => setItems([]));
  }
  useEffect(load, []);

  return (
    <div className="flex flex-col gap-2">
      {items === null ? (
        <p className="text-tg-hint text-sm">Загрузка…</p>
      ) : items.length === 0 ? (
        <p className="text-tg-hint text-sm">Клиентов пока нет.</p>
      ) : (
        items.map((c) => (
          <UserRow
            key={c.id}
            id={c.id}
            name={c.name}
            suspended={c.suspended}
            sub={`${c.coaches} тренеров${c.goal ? ` · ${c.goal}` : ''}`}
            onChanged={load}
          />
        ))
      )}
    </div>
  );
}

function UserRow({
  id,
  name,
  suspended,
  sub,
  onChanged,
}: {
  id: string;
  name: string;
  suspended: boolean;
  sub: string;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  async function toggle() {
    setBusy(true);
    try {
      await api.suspendUser(id, !suspended);
      onChanged();
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="rounded-2xl bg-tg-secondaryBg p-3 flex items-center justify-between">
      <div className="min-w-0">
        <div className="font-medium truncate">
          {name}
          {suspended && <span className="text-red-400 text-xs"> · заблокирован</span>}
        </div>
        <div className="text-tg-hint text-xs truncate">{sub}</div>
      </div>
      <button
        className={`rounded-xl px-3 py-2 text-sm shrink-0 disabled:opacity-60 ${
          suspended ? 'bg-tg-button text-tg-buttonText' : 'bg-tg-bg text-red-400'
        }`}
        onClick={toggle}
        disabled={busy}
      >
        {busy ? '…' : suspended ? 'Разблок.' : 'Заблок.'}
      </button>
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
      <div className="text-xl font-semibold">{value.toLocaleString('ru-RU')}</div>
      <div className="text-tg-hint text-xs">{label}</div>
    </div>
  );
}
