import { useEffect, useState } from 'react';
import {
  api,
  type SessionResponse,
  type CoachClient,
  type CoachDashboard,
  type CoachOverview,
  type Invite,
  type WorkoutSummary,
  type ProgressEntry,
  type Checkin,
  type ProgressPhoto,
  type FormVideo,
  type NutritionDay,
  type FoodSearchItem,
  type MealType,
  type CoachClientDetail,
  type Sex,
} from '../api';
import type { ChatContext } from '../api';
import { LineChart } from '../components/LineChart';
import { StatTile, Chip } from '../components/ui';
import { CoachMealPlanEditor } from '../components/CoachMealPlanEditor';

const MEAL_LABELS: Record<MealType, string> = {
  breakfast: 'Завтрак',
  lunch: 'Обед',
  dinner: 'Ужин',
  snack: 'Перекус',
};
import { CoachPrograms } from './CoachPrograms';
import { CoachPayments } from './CoachPayments';
import { ChatScreen } from '../components/ChatScreen';
import { LogoMark } from '../components/Logo';
import { RoleSwitch } from '../components/RoleSwitch';
import { NotificationsScreen } from './NotificationsScreen';

const STATUS_LABEL: Record<CoachClient['status'], string> = {
  pending: 'ожидает',
  active: 'активен',
  paused: 'на паузе',
  ended: 'завершён',
};

const SEX_LABEL: Record<Sex, string> = { male: 'М', female: 'Ж', other: '—' };
const EXP_LABEL: Record<string, string> = { novice: 'Новичок', intermediate: 'Средний', advanced: 'Опытный' };

function ageFrom(birthDate: string | null): number | null {
  if (!birthDate) return null;
  const b = new Date(birthDate);
  if (Number.isNaN(b.getTime())) return null;
  const now = new Date();
  let a = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) a--;
  return a >= 0 && a < 130 ? a : null;
}

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return Math.max(0, Math.floor((Date.now() - d.getTime()) / 86400000));
}

type Tab = 'clients' | 'programs' | 'nutrition' | 'payments';

// A chat opened with one client, optionally pre-scoped to a context.
export interface CoachChat {
  clientId: string;
  name: string;
  context?: (ChatContext & { hint?: string }) | null;
}

// Coach cabinet (Phase 1): client list + invites + program builder.
export function CoachHome({
  session,
  onSwitchRole,
}: {
  session: SessionResponse;
  onSwitchRole?: () => void;
}) {
  const name = session.user.firstName ?? 'тренер';
  const [tab, setTab] = useState<Tab>('clients');
  const [chat, setChat] = useState<CoachChat | null>(null);
  const [notifications, setNotifications] = useState(false);
  const [notiUnread, setNotiUnread] = useState(0);

  useEffect(() => {
    api.notificationsUnread().then((r) => setNotiUnread(r.count)).catch(() => setNotiUnread(0));
  }, []);

  if (chat) {
    return (
      <ChatScreen
        title={chat.name}
        subtitle="клиент"
        presetContext={chat.context ?? null}
        load={() => api.coachClientMessages(chat.clientId).then((r) => r.messages)}
        send={(body, ctx) => api.coachSendMessage(chat.clientId, body, ctx)}
        onBack={() => setChat(null)}
      />
    );
  }

  if (notifications) {
    return (
      <NotificationsScreen
        onBack={() => {
          setNotifications(false);
          setNotiUnread(0);
        }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-5 p-4">
      <header className="jf-rise flex items-center justify-between">
        <div>
          <p className="jf-shimmer text-[11px] font-bold uppercase tracking-[0.22em]">
            Кабинет тренера
          </p>
          <h1 className="text-2xl font-semibold mt-0.5">Привет, {name}!</h1>
          <hr className="jf-rule mt-2 w-24" />
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            className="relative w-9 h-9 rounded-xl grid place-items-center bg-brand-surface brand-line text-brand-accent"
            onClick={() => setNotifications(true)}
            aria-label="Уведомления"
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.7 21a2 2 0 01-3.4 0" />
            </svg>
            {notiUnread > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-brand-accent text-brand-onAccent text-[10px] font-bold grid place-items-center">
                {notiUnread > 9 ? '9+' : notiUnread}
              </span>
            )}
          </button>
          <RoleSwitch onClick={onSwitchRole} />
          <LogoMark size={30} className="text-brand-accent" />
        </div>
      </header>

      <nav className="jf-rise jf-rise-1 flex gap-1 rounded-2xl bg-brand-surface brand-line p-1">
        <TabButton active={tab === 'clients'} onClick={() => setTab('clients')}>
          Клиенты
        </TabButton>
        <TabButton active={tab === 'programs'} onClick={() => setTab('programs')}>
          Программы
        </TabButton>
        <TabButton active={tab === 'nutrition'} onClick={() => setTab('nutrition')}>
          Питание
        </TabButton>
        <TabButton active={tab === 'payments'} onClick={() => setTab('payments')}>
          Оплаты
        </TabButton>
      </nav>

      {tab === 'clients' && <ClientsTab onOpenChat={setChat} />}
      {tab === 'programs' && <CoachPrograms />}
      {tab === 'nutrition' && <CoachNutrition onOpenChat={setChat} />}
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
      className={`flex-1 rounded-xl py-2 text-[13px] font-semibold transition-all ${
        active
          ? 'bg-brand-accent text-brand-onAccent shadow-[0_4px_16px_-4px_rgba(201,169,106,0.6)]'
          : 'text-brand-muted'
      }`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

// Clients + invites (the original coach home content).
function ClientsTab({ onOpenChat }: { onOpenChat: (c: CoachChat) => void }) {
  const [clients, setClients] = useState<CoachClient[] | null>(null);
  const [dash, setDash] = useState<CoachDashboard | null>(null);
  const [overview, setOverview] = useState<CoachOverview | null>(null);
  const [invite, setInvite] = useState<Invite | null>(null);
  const [inviting, setInviting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [unread, setUnread] = useState<Record<string, number>>({});

  async function reload() {
    const [c, d, o] = await Promise.all([
      api.coachClients(),
      api.coachDashboard(),
      api.coachOverview().catch(() => null),
    ]);
    setClients(c);
    setDash(d);
    setOverview(o);
    api.coachUnread().then((u) => setUnread(u.byClient)).catch(() => setUnread({}));
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
        <div className="jf-rise jf-rise-2 grid grid-cols-3 gap-3">
          <Stat value={dash.totalClients} label="всего" />
          <Stat value={dash.activeClients} label="активных" />
          <Stat value={dash.pendingInvites} label="приглашений" />
        </div>
      )}

      {overview && (
        <>
          <div className="jf-rise jf-rise-3 grid grid-cols-3 gap-3">
            <Stat value={overview.business.monthRevenue} label="₽ за месяц" />
            <Stat value={overview.business.activeSubscriptions} label="подписок" />
            <Stat value={overview.activity.weekWorkouts} label="трен. за 7 дн." />
          </div>
          {overview.activity.unansweredCheckins > 0 && (
            <div className="jf-card p-3 text-sm">
              💬 Check-in без ответа:{' '}
              <span className="font-semibold text-brand-accent">{overview.activity.unansweredCheckins}</span>
            </div>
          )}
          {overview.attention.length > 0 && (
            <div className="jf-card p-3">
              <div className="text-brand-muted text-[11px] font-semibold uppercase tracking-wide mb-2">Требуют внимания</div>
              <ul className="flex flex-col gap-1">
                {overview.attention.map((a) => (
                  <li key={a.id} className="flex items-center justify-between text-sm">
                    <span>{a.name}</span>
                    <span className="text-red-400 text-xs">{a.reason}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      <section className="jf-rise jf-rise-4 flex flex-col gap-2">
        <button
          className="rounded-2xl bg-gradient-to-b from-brand-accentStrong to-brand-accent text-brand-onAccent p-4 font-semibold shadow-[0_8px_24px_-8px_rgba(201,169,106,0.65)] active:scale-[0.99] transition-transform disabled:opacity-60"
          onClick={onInvite}
          disabled={inviting}
        >
          {inviting ? 'Создаём…' : '➕ Пригласить клиента'}
        </button>

        {invite && (
          <div className="jf-card p-3 text-sm break-all">
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
              <ClientRow
                key={c.id}
                client={c}
                unread={unread[c.id] ?? 0}
                onOpenChat={onOpenChat}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

// A client row that expands to show their recent logged workouts.
function ClientRow({
  client,
  unread,
  onOpenChat,
}: {
  client: CoachClient;
  unread: number;
  onOpenChat: (c: CoachChat) => void;
}) {
  const clientName = client.firstName ?? (client.username ? `@${client.username}` : 'Клиент');
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<CoachClientDetail | null>(null);
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
      api.coachClient(client.id).then(setDetail).catch(() => setDetail(null));
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
    <li className="jf-card p-3">
      <div className="flex items-center gap-2">
        <button className="flex-1 flex items-center justify-between text-left" onClick={toggle}>
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
        <button
          className="relative shrink-0 w-9 h-9 rounded-xl bg-tg-bg flex items-center justify-center"
          onClick={() => onOpenChat({ clientId: client.id, name: clientName })}
          aria-label="Чат"
        >
          💬
          {unread > 0 && (
            <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-brand-accent text-brand-onAccent text-[10px] font-bold flex items-center justify-center">
              {unread}
            </span>
          )}
        </button>
      </div>

      {open && (
        <div className="mt-3 border-t border-line pt-3 flex flex-col gap-3">
          {/* Характеристики */}
          {(() => {
            const p = detail?.profile;
            const age = ageFrom(p?.birthDate ?? null);
            const days = daysSince(client.startedAt);
            const chips: string[] = [];
            if (p?.sex) chips.push(`Пол: ${SEX_LABEL[p.sex]}`);
            if (p?.heightCm) chips.push(`Рост: ${p.heightCm} см`);
            if (age != null) chips.push(`${age} лет`);
            if (p?.targetWeightKg) chips.push(`Цель: ${p.targetWeightKg} кг`);
            if (p?.experience) chips.push(`Опыт: ${EXP_LABEL[p.experience] ?? p.experience}`);
            if (days != null) chips.push(`С нами: ${days} дн.`);
            return (
              <>
                {(client.goal || p?.goal) && (
                  <Chip tone="gold">🎯 {client.goal || p?.goal}</Chip>
                )}
                {chips.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {chips.map((c) => (
                      <Chip key={c}>{c}</Chip>
                    ))}
                  </div>
                )}
                {p?.limitations && (
                  <div className="rounded-xl bg-brand-surface2 brand-line p-2 text-xs">
                    <span className="text-brand-neg font-semibold">⚠ Ограничения: </span>
                    <span className="text-brand-text">{p.limitations}</span>
                  </div>
                )}
                {p?.allergies && (
                  <div className="rounded-xl bg-brand-surface2 brand-line p-2 text-xs">
                    <span className="text-brand-accentStrong font-semibold">Аллергии: </span>
                    <span className="text-brand-text">{p.allergies}</span>
                  </div>
                )}
              </>
            );
          })()}

          {/* Динамика */}
          <div className="grid grid-cols-3 gap-2">
            <StatTile
              label="Вес"
              value={latestWeight ?? '—'}
              unit={latestWeight != null ? 'кг' : undefined}
              delta={wDelta != null ? { value: wDelta, good: 'down', unit: ' кг' } : undefined}
            />
            <StatTile label="Тренировок" value={workouts?.length ?? '—'} tone="energy" />
            <StatTile label="Замеров" value={weights.length || '—'} tone="plain" />
          </div>

          {weights.length >= 2 && (
            <div className="jf-tile p-3">
              <div className="jf-eyebrow mb-1.5" style={{ color: 'var(--muted)' }}>
                Динамика веса
              </div>
              <LineChart
                unit=" кг"
                points={[...weights]
                  .reverse()
                  .map((w) => ({
                    value: w.weightKg as number,
                    label: new Date(w.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }),
                  }))}
              />
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

          <CoachClientNutrition
            clientId={client.id}
            onComment={() =>
              onOpenChat({
                clientId: client.id,
                name: clientName,
                context: {
                  contextType: 'nutrition',
                  contextId: new Date().toISOString().slice(0, 10),
                  contextLabel: 'Питание клиента',
                  hint: 'Комментарий прикреплён к дневнику питания клиента.',
                },
              })
            }
          />

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

// Питание-таб тренера: выбрать клиента → цель, дневник и связь по питанию.
function CoachNutrition({ onOpenChat }: { onOpenChat: (c: CoachChat) => void }) {
  const [clients, setClients] = useState<CoachClient[] | null>(null);
  const [sel, setSel] = useState<CoachClient | null>(null);

  useEffect(() => {
    api.coachClients().then(setClients).catch(() => setClients([]));
  }, []);

  const active = (clients ?? []).filter((c) => c.status === 'active' || c.status === 'paused');

  return (
    <div className="flex flex-col gap-3">
      <div>
        <label className="text-tg-hint text-xs">Клиент</label>
        <select
          className="w-full mt-1 rounded-xl bg-tg-secondaryBg p-3 outline-none"
          value={sel?.id ?? ''}
          onChange={(e) => setSel(active.find((c) => c.id === e.target.value) ?? null)}
        >
          <option value="" disabled>
            {clients === null ? 'Загрузка…' : active.length ? 'Выберите клиента…' : 'Нет активных клиентов'}
          </option>
          {active.map((c) => (
            <option key={c.id} value={c.id}>
              {c.firstName ?? 'Клиент'}
              {c.username ? ` @${c.username}` : ''}
            </option>
          ))}
        </select>
      </div>

      {sel ? (
        <CoachClientNutrition
          clientId={sel.id}
          onComment={() =>
            onOpenChat({
              clientId: sel.id,
              name: sel.firstName ?? 'Клиент',
              context: {
                contextType: 'nutrition',
                contextId: new Date().toISOString().slice(0, 10),
                contextLabel: 'Питание клиента',
              },
            })
          }
        />
      ) : (
        <p className="text-tg-hint text-sm">
          Выберите клиента, чтобы задать цель по КБЖУ и видеть его дневник питания.
        </p>
      )}
    </div>
  );
}

// Coach view of a client's nutrition: today's totals vs target + set target.
function CoachClientNutrition({
  clientId,
  onComment,
}: {
  clientId: string;
  onComment?: () => void;
}) {
  const [day, setDay] = useState<NutritionDay | null>(null);
  const [editing, setEditing] = useState(false);
  const [kcal, setKcal] = useState('');
  const [protein, setProtein] = useState('');
  const [fat, setFat] = useState('');
  const [carbs, setCarbs] = useState('');
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);

  function load() {
    api
      .coachClientNutritionDay(clientId)
      .then((d) => {
        setDay(d);
        if (d.target) {
          setKcal(String(d.target.kcal));
          setProtein(String(d.target.protein));
          setFat(String(d.target.fat));
          setCarbs(String(d.target.carbs));
        }
      })
      .catch(() => setDay(null));
  }
  useEffect(load, [clientId]);

  async function saveTarget() {
    if (!kcal || Number(kcal) <= 0) return;
    setBusy(true);
    try {
      await api.setNutritionTarget(clientId, {
        kcal: Number(kcal),
        protein: Number(protein) || 0,
        fat: Number(fat) || 0,
        carbs: Number(carbs) || 0,
      });
      setEditing(false);
      load();
    } finally {
      setBusy(false);
    }
  }

  const t = day?.totals;
  const goal = day?.target;

  return (
    <div className="flex flex-col gap-3">
      <CoachMealPlanEditor clientId={clientId} />

      <div className="flex items-center justify-between">
        <span className="text-tg-hint text-xs font-medium">Питание (сегодня)</span>
        <div className="flex items-center gap-3">
          {onComment && (
            <button className="text-brand-accent text-xs" onClick={onComment}>
              💬 Коммент
            </button>
          )}
          <button className="text-tg-link text-xs" onClick={() => setEditing((v) => !v)}>
            {goal ? 'Изменить цель' : 'Задать цель'}
          </button>
        </div>
      </div>

      {t && (
        <div className="text-sm">
          {t.kcal}
          {goal ? ` / ${goal.kcal}` : ''} ккал
          <span className="text-tg-hint">
            {' '}
            · Б{t.protein} Ж{t.fat} У{t.carbs}
          </span>
        </div>
      )}

      {editing && (
        <div className="rounded-xl bg-tg-bg p-2 flex flex-col gap-2">
          <div className="grid grid-cols-4 gap-1">
            <MiniField label="Ккал" value={kcal} onChange={setKcal} />
            <MiniField label="Б" value={protein} onChange={setProtein} />
            <MiniField label="Ж" value={fat} onChange={setFat} />
            <MiniField label="У" value={carbs} onChange={setCarbs} />
          </div>
          <button
            className="rounded-lg bg-tg-button text-tg-buttonText py-2 text-sm disabled:opacity-60"
            onClick={saveTarget}
            disabled={busy}
          >
            {busy ? '…' : 'Сохранить цель'}
          </button>
        </div>
      )}

      {/* meals in the client's diary — coach can remove */}
      {day && day.meals.length > 0 && (
        <ul className="flex flex-col gap-1">
          {day.meals.map((m) => (
            <li key={m.id} className="flex items-center justify-between text-xs bg-tg-bg rounded-lg px-2 py-1.5">
              <span className="min-w-0 truncate">
                {m.name} <span className="text-tg-hint">· {m.grams} г · {m.kcal} ккал</span>
              </span>
              <button
                className="text-tg-hint px-1 shrink-0"
                onClick={async () => {
                  await api.coachDeleteMeal(clientId, m.id).catch(() => undefined);
                  load();
                }}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}

      <button
        className="rounded-lg bg-tg-secondaryBg text-brand-accent py-2 text-sm font-medium"
        onClick={() => setAdding(true)}
      >
        ➕ Добавить продукт клиенту
      </button>

      {adding && (
        <CoachAddMeal
          clientId={clientId}
          onClose={() => setAdding(false)}
          onAdded={() => {
            setAdding(false);
            load();
          }}
        />
      )}
    </div>
  );
}

// Coach adds a product to a client's diary, with an optional comment sent to chat.
function CoachAddMeal({
  clientId,
  onClose,
  onAdded,
}: {
  clientId: string;
  onClose: () => void;
  onAdded: () => void;
}) {
  const [mealType, setMealType] = useState<MealType>('breakfast');
  const [q, setQ] = useState('');
  const [results, setResults] = useState<FoodSearchItem[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [comment, setComment] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  async function search() {
    if (q.trim().length < 2) return;
    setSearching(true);
    try {
      const r = await api.coachSearchFoods(q.trim());
      setResults(r.foods);
    } finally {
      setSearching(false);
    }
  }

  async function add(food: FoodSearchItem, grams: number) {
    setBusyId(food.id);
    try {
      await api.coachAddMeal(clientId, { mealType, grams, foodItemId: food.id });
      if (comment.trim()) {
        await api
          .coachSendMessage(clientId, `🍽 ${food.name}: ${comment.trim()}`, {
            contextType: 'nutrition',
            contextId: new Date().toISOString().slice(0, 10),
            contextLabel: 'Питание клиента',
          })
          .catch(() => undefined);
      }
      onAdded();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end justify-center z-50" onClick={onClose}>
      <div
        className="bg-tg-bg rounded-t-3xl w-full max-w-md p-4 flex flex-col gap-3 max-h-[88vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Добавить продукт клиенту</h2>
          <button className="text-tg-hint" onClick={onClose}>✕</button>
        </div>

        <div className="grid grid-cols-4 gap-1">
          {(Object.keys(MEAL_LABELS) as MealType[]).map((mt) => (
            <button
              key={mt}
              className={`rounded-lg py-2 text-xs ${
                mealType === mt ? 'bg-tg-button text-tg-buttonText' : 'bg-tg-secondaryBg text-tg-hint'
              }`}
              onClick={() => setMealType(mt)}
            >
              {MEAL_LABELS[mt]}
            </button>
          ))}
        </div>

        <input
          className="rounded-xl bg-tg-secondaryBg p-3 text-sm outline-none"
          placeholder="Комментарий для клиента (по желанию)"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
        />

        <div className="flex gap-2">
          <input
            className="flex-1 rounded-xl bg-tg-secondaryBg p-3 outline-none"
            placeholder="Продукт (напр. «творог 5%»)"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && search()}
          />
          <button
            className="rounded-xl bg-tg-button text-tg-buttonText px-4 text-sm disabled:opacity-60"
            onClick={search}
            disabled={searching}
          >
            {searching ? '…' : 'Найти'}
          </button>
        </div>

        {results && results.length === 0 && (
          <p className="text-tg-hint text-sm">Ничего не найдено.</p>
        )}
        {results?.map((f) => (
          <CoachFoodRow key={f.id} food={f} busy={busyId === f.id} onAdd={(g) => add(f, g)} />
        ))}
      </div>
    </div>
  );
}

function CoachFoodRow({
  food,
  busy,
  onAdd,
}: {
  food: FoodSearchItem;
  busy: boolean;
  onAdd: (grams: number) => void;
}) {
  const [grams, setGrams] = useState('100');
  const kcal = Math.round((food.per100.kcal * (Number(grams) || 0)) / 100);
  return (
    <div className="rounded-2xl bg-tg-secondaryBg p-3 flex flex-col gap-2">
      <div className="text-sm font-medium">{food.name}</div>
      <div className="text-tg-hint text-xs">
        {food.per100.kcal} ккал · Б{food.per100.protein} Ж{food.per100.fat} У{food.per100.carbs} / 100 г
      </div>
      <div className="flex items-center gap-2">
        <input
          className="w-20 rounded-lg bg-tg-bg p-2 text-sm outline-none"
          inputMode="numeric"
          value={grams}
          onChange={(e) => setGrams(e.target.value.replace(/[^0-9]/g, ''))}
        />
        <span className="text-tg-hint text-xs">г · ≈ {kcal} ккал</span>
        <button
          className="ml-auto rounded-lg bg-tg-button text-tg-buttonText px-4 py-2 text-sm disabled:opacity-60"
          onClick={() => onAdd(Number(grams) || 0)}
          disabled={busy || !grams}
        >
          Добавить
        </button>
      </div>
    </div>
  );
}

function MiniField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex flex-col gap-0.5">
      <span className="text-tg-hint text-[10px] text-center">{label}</span>
      <input
        className="rounded-md bg-tg-secondaryBg p-1.5 text-sm outline-none w-full text-center"
        inputMode="numeric"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
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
    <div className="jf-card p-3 text-center">
      <div className="text-2xl font-bold tabular text-brand-accent">{value}</div>
      <div className="text-brand-muted text-[11px] mt-0.5">{label}</div>
    </div>
  );
}
