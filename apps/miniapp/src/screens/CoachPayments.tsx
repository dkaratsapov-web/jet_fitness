import { useEffect, useState } from 'react';
import {
  api,
  type Subscription,
  type CoachRevenue,
  type CoachClient,
} from '../api';

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
          <Money value={revenue.net} label="ваш доход" />
          <Money value={revenue.commission} label={`комиссия ${revenue.feePercent}%`} />
        </div>
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
        <ul className="flex flex-col gap-2">
          {subs.map((s) => (
            <SubRow key={s.id} sub={s} onChanged={reload} />
          ))}
        </ul>
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

  async function pay() {
    setBusy(true);
    try {
      await api.recordPayment(sub.id);
      onChanged();
    } finally {
      setBusy(false);
    }
  }
  async function cancel() {
    setBusy(true);
    try {
      await api.cancelSubscription(sub.id);
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="rounded-2xl bg-tg-secondaryBg p-3 flex flex-col gap-2">
      <div className="flex items-start justify-between">
        <div>
          <div className="font-medium">{sub.clientName}</div>
          <div className="text-tg-hint text-xs">
            {sub.planName} · {sub.amount} ₽ / {sub.periodDays} дн.
            {sub.workouts ? ` · ${sub.workouts} трен.` : ''}
          </div>
          <div className="text-tg-hint text-xs">
            {STATUS_LABEL[sub.status]}
            {sub.currentPeriodEnd &&
              ` · до ${new Date(sub.currentPeriodEnd).toLocaleDateString('ru-RU', {
                day: 'numeric',
                month: 'short',
              })}`}
            {sub.paymentsCount > 0 && ` · оплачено ${sub.paidTotal} ₽`}
          </div>
        </div>
      </div>
      {sub.status !== 'canceled' && (
        <div className="flex gap-2">
          <button
            className="rounded-xl bg-tg-button text-tg-buttonText px-3 py-2 text-sm disabled:opacity-60"
            onClick={pay}
            disabled={busy}
          >
            Отметить оплату
          </button>
          <button
            className="rounded-xl bg-tg-bg text-tg-hint px-3 py-2 text-sm disabled:opacity-60"
            onClick={cancel}
            disabled={busy}
          >
            Отменить
          </button>
        </div>
      )}
    </li>
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
    <div className="rounded-2xl bg-tg-secondaryBg p-3 text-center">
      <div className="text-xl font-semibold">{value.toLocaleString('ru-RU')} ₽</div>
      <div className="text-tg-hint text-xs">{label}</div>
    </div>
  );
}
