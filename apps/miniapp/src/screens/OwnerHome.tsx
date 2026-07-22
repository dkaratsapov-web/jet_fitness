import { useEffect, useState } from 'react';
import {
  api,
  type SessionResponse,
  type OwnerRevenue,
  type OwnerStats,
  type OwnerCoach,
  type OwnerClientRow,
  type CoachOnboardInvite,
  type FatSecretDiagnostics,
} from '../api';
import { RoleSwitch } from '../components/RoleSwitch';

type Tab = 'overview' | 'coaches' | 'clients';

// Platform owner/operator home (spec §2). Distinct role: oversees the platform.
export function OwnerHome({
  session,
  onEnterRole,
  busy,
  onSwitchRole,
}: {
  session: SessionResponse;
  onEnterRole?: (role: 'coach' | 'client') => void;
  busy?: boolean;
  onSwitchRole?: () => void;
}) {
  const name = session.user.firstName ?? 'владелец';
  const [tab, setTab] = useState<Tab>('overview');

  return (
    <div className="flex flex-col gap-4 p-4">
      <header className="flex items-start justify-between">
        <div>
          <p className="text-tg-hint text-sm">Панель владельца платформы</p>
          <h1 className="text-2xl font-semibold">Привет, {name}!</h1>
        </div>
        <RoleSwitch onClick={onSwitchRole} />
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
            Вернуться — кнопкой «⇄ роль» в шапке.
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
      <FatSecretStatus />
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

// FatSecret integration status + the egress IP to whitelist. Owner-only.
function FatSecretStatus() {
  const [fs, setFs] = useState<FatSecretDiagnostics | null | undefined>(undefined);

  function load() {
    setFs(undefined);
    api
      .ownerDiagnostics()
      .then((d) => setFs(d.fatsecret))
      .catch(() => setFs(null));
  }
  useEffect(load, []);

  const dot = !fs
    ? 'var(--muted)'
    : fs.tokenOk && fs.sampleCount > 0
      ? 'var(--pos)'
      : fs.configured
        ? 'var(--neg)'
        : 'var(--muted)';

  return (
    <div className="jf-card p-3 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: dot }} />
          <span className="text-sm font-semibold">FatSecret</span>
        </div>
        <button className="text-brand-accent text-xs" onClick={load}>
          обновить
        </button>
      </div>
      {fs === undefined ? (
        <p className="text-brand-muted text-xs">Проверяю…</p>
      ) : fs === null ? (
        <p className="text-brand-muted text-xs">Не удалось получить статус.</p>
      ) : (
        <>
          <p className="text-xs text-brand-text">{fs.hint}</p>
          {fs.egressIp && (
            <div className="rounded-lg bg-tg-bg p-2 text-xs">
              <span className="text-brand-muted">Egress-IP для whitelist: </span>
              <span className="font-mono text-brand-accent">{fs.egressIp}</span>
            </div>
          )}
        </>
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
    <div className="flex flex-col gap-3">
      <CoachInvitePanel />
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

// Owner issues one-time coach-onboarding invite links.
function CoachInvitePanel() {
  const [invites, setInvites] = useState<CoachOnboardInvite[] | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  function load() {
    api.ownerCoachInvites().then(setInvites).catch(() => setInvites([]));
  }
  useEffect(load, []);

  async function create() {
    setBusy(true);
    try {
      await api.createCoachInvite(note.trim() || undefined);
      setNote('');
      load();
    } finally {
      setBusy(false);
    }
  }

  async function copy(link: string) {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(link);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="jf-card p-3 flex flex-col gap-2">
      <div className="font-semibold text-sm">Пригласить тренера</div>
      <p className="text-brand-muted text-xs">
        Одноразовая ссылка. Кто откроет — станет тренером на платформе.
      </p>
      <div className="flex gap-2">
        <input
          className="flex-1 rounded-xl bg-tg-secondaryBg p-2.5 text-sm outline-none"
          placeholder="Имя/заметка (необязательно)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <button
          className="rounded-xl bg-brand-accent text-brand-onAccent px-4 text-sm font-semibold disabled:opacity-60"
          onClick={create}
          disabled={busy}
        >
          {busy ? '…' : '+ Ссылка'}
        </button>
      </div>

      {invites && invites.length > 0 && (
        <ul className="flex flex-col gap-1.5 mt-1">
          {invites.slice(0, 8).map((i) => (
            <li key={i.id} className="rounded-xl bg-tg-secondaryBg p-2.5 flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <div className="text-xs font-medium truncate">
                  {i.note || 'Приглашение тренера'}
                </div>
                <div className="text-brand-muted text-[11px]">
                  {i.used ? `✓ принял: ${i.usedBy ?? 'тренер'}` : 'ожидает'}
                </div>
              </div>
              {!i.used && (
                <button
                  className="rounded-lg bg-tg-bg px-3 py-1.5 text-xs text-brand-accent font-medium shrink-0"
                  onClick={() => copy(i.deepLink)}
                >
                  {copied === i.deepLink ? 'Скопировано' : 'Копировать'}
                </button>
              )}
            </li>
          ))}
        </ul>
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
