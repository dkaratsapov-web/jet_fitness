import { useEffect, useState } from 'react';
import {
  api,
  type Subscription,
  type CoachRevenue,
  type CoachClient,
} from '../api';
import { Card, ProgressBar, Chip, Avatar } from '../components/ui';

const STATUS_LABEL: Record<Subscription['status'], string> = {
  active: 'активна',
  past_due: 'просрочена',
  canceled: 'отменена',
};

// Coach payments (Phase 1): subscriptions, record payments, revenue summary.
export function CoachPayments() {
  const [subs, setSubs] = useState<Subscription[] | null>(null);
  const [revenue, setRevenue] = useState<CoachRevenue | null>(null);
  const [clients, setClients] = useState<CoachClient[]>([]);
  const [creating, setCreating] = useState(false);

  async function reload() {
    const [s, r, c] = await Promise.all([
      api.coachSubscriptions(),
      api.coachRevenue(),
      api.coachClients(),
    ]);
    setSubs(s);
    setRevenue(r);
    setClients(c);
  }
  useEffect(() => {
    reload().catch(() => setSubs([]));
  }, []);

  return (
    <div className="flex flex-col gap-4">
      {revenue && (
        <div className="grid grid-cols-2 gap-3">
          <Money value={revenue.gross} label="всего собрано" />
          <Money value={revenue.thisMonth} label="в этом месяце" />
        </div>
      )}
      {revenue && (
        <p className="text-brand-muted text-xs -mt-1">
          Оплаты клиентов приходят тебе полностью — без комиссий платформы.
        </p>
      )}

      <button
        className="rounded-2xl bg-tg-button text-tg-buttonText p-4 font-medium"
        onClick={() => setCreating(true)}
      >
        ➕ Оформить подписку
      </button>

      {subs === null ? (
        <p className="text-tg-hint text-sm">Загрузка…</p>
      ) : subs.length === 0 ? (
        <p className="text-tg-hint text-sm">
          Подписок пока нет. Оформите первую — так вы учитываете оплаты клиентов
          и свою выручку.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {subs.map((s) => (
            <SubRow key={s.id} sub={s} onChanged={reload} />
          ))}
        </div>
      )}

      {creating && (
        <NewSubModal
          clients={clients}
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            reload();
          }}
        />
      )}
    </div>
  );
}

function SubRow({ sub, onChanged }: { sub: Subscription; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const remaining = Math.max(0, sub.amount - sub.paidTotal);
  const paidPct = sub.amount > 0 ? (sub.paidTotal / sub.amount) * 100 : 0;
  const [payAmount, setPayAmount] = useState(String(remaining || sub.amount));
  const canceled = sub.status === 'canceled';

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    try {
      await fn();
      onChanged();
    } finally {
      setBusy(false);
    }
  }
  const session = (delta: number) => run(() => api.markSubscriptionSession(sub.id, delta));
  const cancel = () => run(() => api.cancelSubscription(sub.id));
  const renew = () => run(() => api.recordPayment(sub.id, sub.amount, true));
  const contribute = () => {
    const amt = Number(payAmount);
    if (!amt || amt <= 0) return;
    setPayOpen(false);
    return run(() => api.recordPayment(sub.id, amt, false));
  };

  const statusTone = sub.status === 'active' ? 'energy' : undefined;

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <Avatar name={sub.clientName} size={38} />
        <div className="flex-1 min-w-0">
          <div className="font-semibold leading-tight truncate">{sub.clientName}</div>
          <div className="text-brand-muted text-xs leading-snug">
            {sub.planName} · {sub.amount.toLocaleString('ru-RU')} ₽ / {sub.periodDays} дн.
          </div>
        </div>
        <Chip tone={statusTone} className="shrink-0 self-start">
          {STATUS_LABEL[sub.status]}
        </Chip>
      </div>

      {sub.currentPeriodEnd && (
        <div className="text-brand-muted text-[11px] -mt-1">
          действует до{' '}
          {new Date(sub.currentPeriodEnd).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}
        </div>
      )}

      {/* Trainings progress */}
      {sub.workouts ? (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-brand-muted">Тренировки</span>
            <span className="font-semibold tabular">
              {sub.sessionsUsed} / {sub.workouts}
            </span>
          </div>
          <ProgressBar pct={(sub.sessionsUsed / sub.workouts) * 100} tone="energy" />
          {!canceled && (
            <div className="flex items-center gap-2 mt-1">
              <button
                className="w-8 h-8 rounded-lg brand-line bg-brand-surface2 text-brand-text disabled:opacity-40 jf-press"
                onClick={() => session(-1)}
                disabled={busy || sub.sessionsUsed <= 0}
                aria-label="Убрать тренировку"
              >
                −
              </button>
              <button
                className="flex-1 h-8 rounded-lg bg-brand-energy text-brand-onEnergy text-sm font-semibold disabled:opacity-40 jf-press"
                onClick={() => session(1)}
                disabled={busy || sub.sessionsUsed >= sub.workouts}
              >
                ＋ Отметить тренировку
              </button>
            </div>
          )}
        </div>
      ) : null}

      {/* Payment progress */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="text-brand-muted">Оплата</span>
          <span className="font-semibold tabular">
            {sub.paidTotal.toLocaleString('ru-RU')} / {sub.amount.toLocaleString('ru-RU')} ₽
          </span>
        </div>
        <ProgressBar pct={paidPct} />
        {remaining > 0 ? (
          <div className="text-[11px] text-brand-accentStrong font-semibold">
            осталось {remaining.toLocaleString('ru-RU')} ₽
          </div>
        ) : (
          <div className="text-[11px] text-brand-pos font-semibold">оплачено полностью ✓</div>
        )}
      </div>

      {!canceled && (
        <>
          {payOpen && (
            <div className="flex items-center gap-2">
              <input
                className="flex-1 rounded-xl bg-brand-surface2 brand-line p-2.5 text-sm outline-none tabular"
                inputMode="numeric"
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value.replace(/[^0-9]/g, ''))}
                placeholder="Сумма взноса, ₽"
              />
              <button
                className="rounded-xl bg-brand-accent text-brand-onAccent px-4 py-2.5 text-sm font-semibold disabled:opacity-60 jf-press"
                onClick={contribute}
                disabled={busy}
              >
                Внести
              </button>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {remaining > 0 && !payOpen && (
              <button
                className="rounded-xl bg-brand-accent text-brand-onAccent px-3 py-2 text-sm font-semibold jf-press"
                onClick={() => {
                  setPayAmount(String(remaining));
                  setPayOpen(true);
                }}
              >
                ＋ Внести оплату
              </button>
            )}
            <button
              className="rounded-xl bg-brand-surface brand-line px-3 py-2 text-sm text-brand-text jf-press disabled:opacity-60"
              onClick={renew}
              disabled={busy}
            >
              Продлить период
            </button>
            <button
              className="rounded-xl bg-transparent px-3 py-2 text-sm text-brand-muted jf-press disabled:opacity-60"
              onClick={cancel}
              disabled={busy}
            >
              Отменить
            </button>
          </div>
        </>
      )}
    </Card>
  );
}

function NewSubModal({
  clients,
  onClose,
  onCreated,
}: {
  clients: CoachClient[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [clientId, setClientId] = useState('');
  const [planName, setPlanName] = useState('');
  const [amount, setAmount] = useState('');
  const [periodDays, setPeriodDays] = useState('30');
  const [workouts, setWorkouts] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setError(null);
    if (!clientId) return setError('Выберите клиента');
    if (!planName.trim()) return setError('Введите название тарифа');
    if (!amount || Number(amount) <= 0) return setError('Укажите сумму');
    setBusy(true);
    try {
      await api.createSubscription(clientId, {
        planName: planName.trim(),
        amount: Number(amount),
        periodDays: Number(periodDays) || 30,
        workouts: workouts ? Number(workouts) : undefined,
      });
      onCreated();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end justify-center z-10" onClick={onClose}>
      <div
        className="bg-tg-bg rounded-t-3xl w-full max-w-md p-4 flex flex-col gap-3 max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Новая подписка</h2>
          <button className="text-tg-hint" onClick={onClose}>
            ✕
          </button>
        </div>

        <label className="flex flex-col gap-1">
          <span className="text-tg-hint text-xs">Клиент</span>
          <select
            className="rounded-xl bg-tg-secondaryBg p-3 outline-none"
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
          >
            <option value="" disabled>
              Выберите клиента…
            </option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.firstName ?? 'Клиент'}
                {c.username ? ` @${c.username}` : ''}
              </option>
            ))}
          </select>
        </label>

        <input
          className="rounded-xl bg-tg-secondaryBg p-3 outline-none"
          placeholder="Тариф (напр. «Персональное ведение»)"
          value={planName}
          onChange={(e) => setPlanName(e.target.value)}
        />
        <label className="flex flex-col gap-1">
          <span className="text-tg-hint text-xs">Сумма, ₽</span>
          <input
            className="rounded-xl bg-tg-secondaryBg p-3 outline-none"
            inputMode="numeric"
            placeholder="5000"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-tg-hint text-xs">Период, дней</span>
            <input
              className="rounded-xl bg-tg-secondaryBg p-3 outline-none"
              inputMode="numeric"
              value={periodDays}
              onChange={(e) => setPeriodDays(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-tg-hint text-xs">Тренировок</span>
            <input
              className="rounded-xl bg-tg-secondaryBg p-3 outline-none"
              inputMode="numeric"
              placeholder="напр. 12"
              value={workouts}
              onChange={(e) => setWorkouts(e.target.value.replace(/[^0-9]/g, ''))}
            />
          </label>
        </div>

        {error && <p className="text-red-500 text-sm">{error}</p>}
        <button
          className="rounded-xl bg-tg-button text-tg-buttonText p-3 font-medium disabled:opacity-60"
          onClick={create}
          disabled={busy}
        >
          {busy ? 'Создаём…' : 'Оформить'}
        </button>
      </div>
    </div>
  );
}

function Money({ value, label }: { value: number; label: string }) {
  return (
    <div className="jf-tile p-3.5">
      <div className="text-xl font-extrabold tabular text-brand-accentStrong">
        {value.toLocaleString('ru-RU')} ₽
      </div>
      <div className="jf-eyebrow mt-1" style={{ color: 'var(--muted)' }}>{label}</div>
    </div>
  );
}
