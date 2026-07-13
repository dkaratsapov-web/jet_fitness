import { useEffect, useState } from 'react';
import {
  api,
  type CoachChallenge,
  type ChallengeType,
  type CoachClient,
} from '../api';

const TYPE_LABELS: Record<ChallengeType, string> = {
  workouts: 'Тренировки',
  weight: 'Снижение веса',
  steps: 'Шаги',
  custom: 'Свой',
};

// Coach challenges (Phase 2): create, leaderboard, manual scoring.
export function CoachChallenges() {
  const [items, setItems] = useState<CoachChallenge[] | null>(null);
  const [clients, setClients] = useState<CoachClient[]>([]);
  const [creating, setCreating] = useState(false);

  async function reload() {
    const [ch, cl] = await Promise.all([api.coachChallenges(), api.coachClients()]);
    setItems(ch);
    setClients(cl);
  }
  useEffect(() => {
    reload().catch(() => setItems([]));
  }, []);

  async function del(id: string) {
    await api.deleteChallenge(id).catch(() => undefined);
    reload();
  }

  return (
    <div className="flex flex-col gap-4">
      <button
        className="rounded-2xl bg-tg-button text-tg-buttonText p-4 font-medium"
        onClick={() => setCreating(true)}
      >
        ➕ Создать челлендж
      </button>

      {items === null ? (
        <p className="text-tg-hint text-sm">Загрузка…</p>
      ) : items.length === 0 ? (
        <p className="text-tg-hint text-sm">
          Челленджей пока нет. Создайте первый — например «Больше всего тренировок
          за месяц» — и соревнование замотивирует клиентов.
        </p>
      ) : (
        items.map((ch) => (
          <ChallengeCard key={ch.id} challenge={ch} onChanged={reload} onDelete={() => del(ch.id)} />
        ))
      )}

      {creating && (
        <CreateModal
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

function ChallengeCard({
  challenge,
  onChanged,
  onDelete,
}: {
  challenge: CoachChallenge;
  onChanged: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="rounded-2xl bg-tg-secondaryBg p-3 flex flex-col gap-2">
      <div className="flex items-start justify-between">
        <div>
          <div className="font-medium">{challenge.name}</div>
          <div className="text-tg-hint text-xs">
            {TYPE_LABELS[challenge.type]} · {fmt(challenge.startDate)}–{fmt(challenge.endDate)}
          </div>
        </div>
        <button className="text-tg-hint text-xs px-1" onClick={onDelete}>
          ✕
        </button>
      </div>

      {challenge.leaderboard.length === 0 ? (
        <p className="text-tg-hint text-xs">Нет участников.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {challenge.leaderboard.map((r) => (
            <li key={r.clientId} className="flex items-center justify-between text-sm">
              <span>
                <span className="text-tg-hint">{r.rank}.</span> {r.name}
              </span>
              {challenge.manualScore ? (
                <ScoreEditor
                  challengeId={challenge.id}
                  clientId={r.clientId}
                  value={r.score}
                  unit={challenge.unit}
                  onSaved={onChanged}
                />
              ) : (
                <span className="font-semibold">
                  {r.score} {challenge.unit}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ScoreEditor({
  challengeId,
  clientId,
  value,
  unit,
  onSaved,
}: {
  challengeId: string;
  clientId: string;
  value: number;
  unit: string;
  onSaved: () => void;
}) {
  const [v, setV] = useState(String(value));
  const [busy, setBusy] = useState(false);

  async function save() {
    if (v === String(value)) return;
    setBusy(true);
    try {
      await api.setChallengeScore(challengeId, clientId, Number(v) || 0);
      onSaved();
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="flex items-center gap-1">
      <input
        className="w-16 rounded-md bg-tg-bg p-1 text-sm text-right outline-none"
        inputMode="numeric"
        value={v}
        onChange={(e) => setV(e.target.value)}
        onBlur={save}
        disabled={busy}
      />
      <span className="text-tg-hint text-xs">{unit}</span>
    </span>
  );
}

function CreateModal({
  clients,
  onClose,
  onCreated,
}: {
  clients: CoachClient[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState('');
  const [type, setType] = useState<ChallengeType>('workouts');
  const [start, setStart] = useState(today());
  const [end, setEnd] = useState(inDays(30));
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(id: string) {
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  async function create() {
    setError(null);
    if (!name.trim()) return setError('Введите название');
    if (picked.size === 0) return setError('Выберите участников');
    setBusy(true);
    try {
      await api.createChallenge({
        name: name.trim(),
        type,
        startDate: start,
        endDate: end,
        clientIds: [...picked],
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
        className="bg-tg-bg rounded-t-3xl w-full max-w-md p-4 flex flex-col gap-3 max-h-[88vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Новый челлендж</h2>
          <button className="text-tg-hint" onClick={onClose}>
            ✕
          </button>
        </div>

        <input
          className="rounded-xl bg-tg-secondaryBg p-3 outline-none"
          placeholder="Название (напр. «Марафон тренировок»)"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

        <div className="grid grid-cols-2 gap-1">
          {(Object.keys(TYPE_LABELS) as ChallengeType[]).map((t) => (
            <button
              key={t}
              className={`rounded-lg py-2 text-sm ${
                type === t ? 'bg-tg-button text-tg-buttonText' : 'bg-tg-secondaryBg text-tg-hint'
              }`}
              onClick={() => setType(t)}
            >
              {TYPE_LABELS[t]}
            </button>
          ))}
        </div>
        <p className="text-tg-hint text-xs">
          {type === 'workouts' && 'Очки — число выполненных тренировок за период.'}
          {type === 'weight' && 'Очки — сколько кг сброшено за период (по замерам).'}
          {type === 'steps' && 'Шаги вносятся вручную (интеграция с трекерами — в планах).'}
          {type === 'custom' && 'Очки выставляете вручную.'}
        </p>

        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-tg-hint text-xs">Старт</span>
            <input
              type="date"
              className="rounded-xl bg-tg-secondaryBg p-3 outline-none"
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-tg-hint text-xs">Финиш</span>
            <input
              type="date"
              className="rounded-xl bg-tg-secondaryBg p-3 outline-none"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
            />
          </label>
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-tg-hint text-xs">Участники</span>
          {clients.length === 0 ? (
            <p className="text-tg-hint text-sm">Нет клиентов — сначала пригласите.</p>
          ) : (
            clients.map((c) => (
              <button
                key={c.id}
                className={`rounded-xl p-3 text-left text-sm ${
                  picked.has(c.id) ? 'bg-tg-button text-tg-buttonText' : 'bg-tg-secondaryBg'
                }`}
                onClick={() => toggle(c.id)}
              >
                {picked.has(c.id) ? '✓ ' : ''}
                {c.firstName ?? 'Клиент'}
                {c.username ? ` @${c.username}` : ''}
              </button>
            ))
          )}
        </div>

        {error && <p className="text-red-500 text-sm">{error}</p>}
        <button
          className="rounded-xl bg-tg-button text-tg-buttonText p-3 font-medium disabled:opacity-60"
          onClick={create}
          disabled={busy}
        >
          {busy ? 'Создаём…' : 'Создать'}
        </button>
      </div>
    </div>
  );
}

function fmt(iso: string): string {
  return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}
function today(): string {
  return new Date().toISOString().slice(0, 10);
}
function inDays(n: number): string {
  return new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
}
