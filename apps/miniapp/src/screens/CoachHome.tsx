import { useEffect, useState } from 'react';
import {
  api,
  type SessionResponse,
  type CoachClient,
  type CoachDashboard,
  type Invite,
  type WorkoutSummary,
  type ProgressEntry,
  type Checkin,
  type ProgressPhoto,
  type FormVideo,
} from '../api';
import { CoachPrograms } from './CoachPrograms';
import { CoachPayments } from './CoachPayments';

const STATUS_LABEL: Record<CoachClient['status'], string> = {
  pending: 'ожидает',
  active: 'активен',
  paused: 'на паузе',
  ended: 'завершён',
};

type Tab = 'clients' | 'programs' | 'payments';

// Coach cabinet (Phase 1): client list + invites + program builder.
export function CoachHome({ session }: { session: SessionResponse }) {
  const name = session.user.firstName ?? 'тренер';
  const [tab, setTab] = useState<Tab>('clients');

  return (
    <div className="flex flex-col gap-4 p-4">
      <header>
        <p className="text-tg-hint text-sm">Кабинет тренера</p>
        <h1 className="text-2xl font-semibold">Привет, {name}!</h1>
      </header>

      <nav className="flex gap-2 rounded-2xl bg-tg-secondaryBg p-1">
        <TabButton active={tab === 'clients'} onClick={() => setTab('clients')}>
          Клиенты
        </TabButton>
        <TabButton active={tab === 'programs'} onClick={() => setTab('programs')}>
          Программы
        </TabButton>
        <TabButton active={tab === 'payments'} onClick={() => setTab('payments')}>
          Оплаты
        </TabButton>
      </nav>

      {tab === 'clients' && <ClientsTab />}
      {tab === 'programs' && <CoachPrograms />}
      {tab === 'payments' && <CoachPayments />}
    </div>
  );
}

function TabButton({
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

// Clients + invites (the original coach home content).
function ClientsTab() {
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
    <div className="flex flex-col gap-4">
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
              <ClientRow key={c.id} client={c} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

// A client row that expands to show their recent logged workouts.
function ClientRow({ client }: { client: CoachClient }) {
  const [open, setOpen] = useState(false);
  const [workouts, setWorkouts] = useState<WorkoutSummary[] | null>(null);
  const [progress, setProgress] = useState<ProgressEntry[] | null>(null);
  const [checkins, setCheckins] = useState<Checkin[] | null>(null);
  const [photos, setPhotos] = useState<ProgressPhoto[] | null>(null);
  const [videos, setVideos] = useState<FormVideo[] | null>(null);

  function loadCheckins() {
    api
      .coachClientCheckins(client.id)
      .then(setCheckins)
      .catch(() => setCheckins([]));
  }
  function loadVideos() {
    api
      .coachClientVideos(client.id)
      .then(setVideos)
      .catch(() => setVideos([]));
  }

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && workouts === null) {
      api
        .coachClientWorkouts(client.id)
        .then(setWorkouts)
        .catch(() => setWorkouts([]));
      api
        .coachClientProgress(client.id)
        .then(setProgress)
        .catch(() => setProgress([]));
      api
        .coachClientPhotos(client.id)
        .then(setPhotos)
        .catch(() => setPhotos([]));
      loadVideos();
      loadCheckins();
    }
  }

  const weights = (progress ?? []).filter((e) => e.weightKg != null);
  const latestWeight = weights[0]?.weightKg ?? null;
  const prevWeight = weights[1]?.weightKg ?? null;
  const wDelta =
    latestWeight != null && prevWeight != null
      ? +(latestWeight - prevWeight).toFixed(1)
      : null;

  return (
    <li className="rounded-2xl bg-tg-secondaryBg p-3">
      <button className="w-full flex items-center justify-between text-left" onClick={toggle}>
        <div>
          <div className="font-medium">
            {client.firstName ?? 'Клиент'}
            {client.username && (
              <span className="text-tg-hint font-normal"> @{client.username}</span>
            )}
          </div>
          {client.goal && <div className="text-tg-hint text-xs">{client.goal}</div>}
        </div>
        <span className="text-tg-hint text-xs">
          {STATUS_LABEL[client.status]} {open ? '▲' : '▾'}
        </span>
      </button>

      {open && (
        <div className="mt-3 border-t border-tg-bg pt-3 flex flex-col gap-3">
          {latestWeight != null && (
            <div className="flex items-baseline gap-2">
              <span className="text-tg-hint text-xs">Вес:</span>
              <span className="font-semibold">{latestWeight} кг</span>
              {wDelta != null && wDelta !== 0 && (
                <span className={`text-xs ${wDelta < 0 ? 'text-green-500' : 'text-red-400'}`}>
                  {wDelta > 0 ? '+' : ''}
                  {wDelta}
                </span>
              )}
            </div>
          )}
          {photos && photos.length > 0 && (
            <div className="flex flex-col gap-1">
              <div className="text-tg-hint text-xs font-medium">Фото прогресса</div>
              <div className="grid grid-cols-4 gap-2">
                {photos.map((p) =>
                  p.viewUrl ? (
                    <a key={p.id} href={p.viewUrl} target="_blank" rel="noreferrer">
                      <img
                        src={p.viewUrl}
                        alt="фото"
                        className="w-full aspect-square object-cover rounded-lg"
                      />
                    </a>
                  ) : null,
                )}
              </div>
            </div>
          )}

          <div className="text-tg-hint text-xs font-medium">Тренировки</div>
          {workouts === null ? (
            <p className="text-tg-hint text-xs">Загрузка…</p>
          ) : workouts.length === 0 ? (
            <p className="text-tg-hint text-xs">Пока нет выполненных тренировок.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {workouts.map((w) => (
                <li key={w.id} className="rounded-xl bg-tg-bg p-2 flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium">{w.dayTitle || 'Тренировка'}</div>
                    <div className="text-tg-hint text-xs">
                      {new Date(w.date).toLocaleDateString('ru-RU', {
                        day: 'numeric',
                        month: 'short',
                      })}{' '}
                      · {w.exerciseCount} упр. · {w.setCount} подх.
                    </div>
                  </div>
                  {w.totalVolume > 0 && (
                    <div className="text-right">
                      <div className="text-sm font-semibold">{w.totalVolume}</div>
                      <div className="text-tg-hint text-[10px]">объём, кг</div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}

          {videos && videos.length > 0 && (
            <>
              <div className="text-tg-hint text-xs font-medium mt-1">Техника</div>
              <ul className="flex flex-col gap-2">
                {videos.map((v) => (
                  <VideoCard key={v.id} video={v} onCommented={loadVideos} />
                ))}
              </ul>
            </>
          )}

          <div className="text-tg-hint text-xs font-medium mt-1">Check-in</div>
          {checkins === null ? (
            <p className="text-tg-hint text-xs">Загрузка…</p>
          ) : checkins.length === 0 ? (
            <p className="text-tg-hint text-xs">Пока нет отчётов.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {checkins.map((c) => (
                <CheckinCard key={c.id} checkin={c} onReplied={loadCheckins} />
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  );
}

function VideoCard({ video, onCommented }: { video: FormVideo; onCommented: () => void }) {
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);

  async function send() {
    if (!body.trim()) return;
    setBusy(true);
    try {
      await api.commentVideo(video.id, body.trim());
      onCommented();
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="rounded-xl bg-tg-bg p-2 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{video.exerciseName ?? 'Видео техники'}</span>
        <span className="text-tg-hint text-xs">
          {new Date(video.createdAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}
        </span>
      </div>
      {video.viewUrl && (
        <video src={video.viewUrl} controls className="w-full rounded-lg bg-black" />
      )}
      {video.comments.map((c) => (
        <div key={c.id} className="rounded-lg bg-tg-secondaryBg p-2 text-sm">
          {c.body}
        </div>
      ))}
      <div className="flex gap-2">
        <input
          className="flex-1 rounded-lg bg-tg-secondaryBg p-2 text-sm outline-none"
          placeholder="Комментарий по технике…"
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        <button
          className="rounded-lg bg-tg-button text-tg-buttonText px-3 text-sm disabled:opacity-60"
          onClick={send}
          disabled={busy || !body.trim()}
        >
          {busy ? '…' : 'OK'}
        </button>
      </div>
    </li>
  );
}

function CheckinCard({ checkin, onReplied }: { checkin: Checkin; onReplied: () => void }) {
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);

  async function send() {
    if (!reply.trim()) return;
    setBusy(true);
    try {
      await api.replyCheckin(checkin.id, reply.trim());
      onReplied();
    } finally {
      setBusy(false);
    }
  }

  const stats = [
    checkin.sleepQuality && `сон ${checkin.sleepQuality}/5`,
    checkin.energy && `энергия ${checkin.energy}/5`,
    checkin.mood && `настрой ${checkin.mood}/5`,
    checkin.adherencePct != null && `план ${checkin.adherencePct}%`,
    checkin.weightKg != null && `${checkin.weightKg} кг`,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <li className="rounded-xl bg-tg-bg p-2 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-tg-hint text-xs">
          {new Date(checkin.date).toLocaleDateString('ru-RU', {
            day: 'numeric',
            month: 'short',
          })}
        </span>
        <span className="text-tg-hint text-[11px]">{stats}</span>
      </div>
      {checkin.comment && <p className="text-sm">{checkin.comment}</p>}
      {checkin.coachReply ? (
        <div className="rounded-lg bg-tg-secondaryBg p-2">
          <div className="text-tg-hint text-[10px] uppercase tracking-wide mb-1">Ваш ответ</div>
          <p className="text-sm">{checkin.coachReply}</p>
        </div>
      ) : (
        <div className="flex gap-2">
          <input
            className="flex-1 rounded-lg bg-tg-secondaryBg p-2 text-sm outline-none"
            placeholder="Ответить клиенту…"
            value={reply}
            onChange={(e) => setReply(e.target.value)}
          />
          <button
            className="rounded-lg bg-tg-button text-tg-buttonText px-3 text-sm disabled:opacity-60"
            onClick={send}
            disabled={busy || !reply.trim()}
          >
            {busy ? '…' : 'OK'}
          </button>
        </div>
      )}
    </li>
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
