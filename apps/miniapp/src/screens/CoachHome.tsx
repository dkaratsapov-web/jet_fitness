import { useEffect, useState } from 'react';
import {
  api,
  type SessionResponse,
  type CoachClient,
  type CoachDashboard,
  type Invite,
} from '../api';

const STATUS_LABEL: Record<CoachClient['status'], string> = {
  pending: 'ожидает',
  active: 'активен',
  paused: 'на паузе',
  ended: 'завершён',
};

// Coach cabinet (Phase 1): client list + invite generation.
export function CoachHome({ session }: { session: SessionResponse }) {
  const name = session.user.firstName ?? 'тренер';
  const [clients, setClients] = useState<CoachClient[] | null>(null);
  const [dash, setDash] = useState<CoachDashboard | null>(null);
  const [invite, setInvite] = useState<Invite | null>(null);
  const [inviting, setInviting] = useState(false);
  const [copied, setCopied] = useState(false);

  async function reload() {
    const [c, d] = await Promise.all([api.coachClients(), api.coachDashboard()]);
    setClients(c);
    setDash(d);
  }

  useEffect(() => {
    reload().catch(() => setClients([]));
  }, []);

  async function onInvite() {
    setInviting(true);
    setCopied(false);
    try {
      setInvite(await api.createInvite());
    } finally {
      setInviting(false);
    }
  }

  async function copyLink() {
    if (!invite?.deepLink) return;
    try {
      await navigator.clipboard.writeText(invite.deepLink);
      setCopied(true);
    } catch {
      /* clipboard may be unavailable */
    }
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <header>
        <p className="text-tg-hint text-sm">Кабинет тренера</p>
        <h1 className="text-2xl font-semibold">Привет, {name}!</h1>
      </header>

      {dash && (
        <div className="grid grid-cols-3 gap-3">
          <Stat value={dash.totalClients} label="всего" />
          <Stat value={dash.activeClients} label="активных" />
          <Stat value={dash.pendingInvites} label="приглашений" />
        </div>
      )}

      <section className="flex flex-col gap-2">
        <button
          className="rounded-2xl bg-tg-button text-tg-buttonText p-4 font-medium disabled:opacity-60"
          onClick={onInvite}
          disabled={inviting}
        >
          {inviting ? 'Создаём…' : '➕ Пригласить клиента'}
        </button>

        {invite && (
          <div className="rounded-2xl bg-tg-secondaryBg p-3 text-sm break-all">
            <p className="text-tg-hint mb-1">
              Ссылка-приглашение (одноразовая, действует 7 дней):
            </p>
            <p className="font-mono text-tg-link">{invite.deepLink ?? invite.token}</p>
            {invite.deepLink && (
              <button
                className="mt-2 rounded-xl bg-tg-button text-tg-buttonText px-3 py-2 text-sm"
                onClick={copyLink}
              >
                {copied ? '✓ Скопировано' : 'Скопировать ссылку'}
              </button>
            )}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-2">Клиенты</h2>
        {clients === null ? (
          <p className="text-tg-hint text-sm">Загрузка…</p>
        ) : clients.length === 0 ? (
          <p className="text-tg-hint text-sm">
            Клиентов пока нет. Нажмите «Пригласить клиента» и отправьте ссылку.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {clients.map((c) => (
              <li
                key={c.id}
                className="rounded-2xl bg-tg-secondaryBg p-3 flex items-center justify-between"
              >
                <div>
                  <div className="font-medium">
                    {c.firstName ?? 'Клиент'}
                    {c.username && (
                      <span className="text-tg-hint font-normal"> @{c.username}</span>
                    )}
                  </div>
                  {c.goal && <div className="text-tg-hint text-xs">{c.goal}</div>}
                </div>
                <span className="text-tg-hint text-xs">{STATUS_LABEL[c.status]}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-2xl bg-tg-secondaryBg p-3 text-center">
      <div className="text-2xl font-semibold">{value}</div>
      <div className="text-tg-hint text-xs">{label}</div>
    </div>
  );
}
