import { useEffect, useState } from 'react';
import { api, type ProgramSummary, type CoachClient } from '../api';
import { ProgramBuilder } from './ProgramBuilder';

// Coach programs (Phase 1): list, create (builder), assign to a client.
export function CoachPrograms() {
  const [programs, setPrograms] = useState<ProgramSummary[] | null>(null);
  const [clients, setClients] = useState<CoachClient[]>([]);
  const [building, setBuilding] = useState(false);
  const [assignFor, setAssignFor] = useState<ProgramSummary | null>(null);

  async function reload() {
    const [p, c] = await Promise.all([api.programs(), api.coachClients()]);
    setPrograms(p);
    setClients(c);
  }

  useEffect(() => {
    reload().catch(() => setPrograms([]));
  }, []);

  if (building) {
    return (
      <ProgramBuilder
        onCancel={() => setBuilding(false)}
        onSaved={() => {
          setBuilding(false);
          setPrograms(null);
          reload().catch(() => setPrograms([]));
        }}
      />
    );
  }

  async function onDelete(p: ProgramSummary) {
    if (p.assignmentCount > 0) return;
    await api.deleteProgram(p.id).catch(() => undefined);
    setPrograms(null);
    reload().catch(() => setPrograms([]));
  }

  return (
    <div className="flex flex-col gap-4">
      <button
        className="rounded-2xl bg-tg-button text-tg-buttonText p-4 font-medium"
        onClick={() => setBuilding(true)}
      >
        ➕ Создать программу
      </button>

      {programs === null ? (
        <p className="text-tg-hint text-sm">Загрузка…</p>
      ) : programs.length === 0 ? (
        <p className="text-tg-hint text-sm">
          Программ пока нет. Нажмите «Создать программу» — соберите дни и
          упражнения, затем выдайте клиенту.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {programs.map((p) => (
            <li key={p.id} className="rounded-2xl bg-tg-secondaryBg p-3 flex flex-col gap-2">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-medium">{p.name}</div>
                  <div className="text-tg-hint text-xs">
                    {p.dayCount} дн. · выдана {p.assignmentCount} раз
                  </div>
                  {p.description && (
                    <div className="text-tg-hint text-xs mt-1">{p.description}</div>
                  )}
                </div>
                {p.assignmentCount === 0 && (
                  <button
                    className="text-tg-hint text-xs px-1"
                    onClick={() => onDelete(p)}
                  >
                    ✕
                  </button>
                )}
              </div>
              <button
                className="rounded-xl bg-tg-button text-tg-buttonText px-3 py-2 text-sm self-start"
                onClick={() => setAssignFor(p)}
              >
                Выдать клиенту
              </button>
            </li>
          ))}
        </ul>
      )}

      {assignFor && (
        <AssignModal
          program={assignFor}
          clients={clients}
          onClose={() => setAssignFor(null)}
          onAssigned={() => {
            setAssignFor(null);
            setPrograms(null);
            reload().catch(() => setPrograms([]));
          }}
        />
      )}
    </div>
  );
}

function AssignModal({
  program,
  clients,
  onClose,
  onAssigned,
}: {
  program: ProgramSummary;
  clients: CoachClient[];
  onClose: () => void;
  onAssigned: () => void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);

  async function assign(clientId: string) {
    setBusyId(clientId);
    try {
      await api.assignProgram(program.id, clientId);
      onAssigned();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-end justify-center z-10"
      onClick={onClose}
    >
      <div
        className="bg-tg-bg rounded-t-3xl w-full max-w-md p-4 flex flex-col gap-3 max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Кому выдать?</h2>
          <button className="text-tg-hint" onClick={onClose}>
            ✕
          </button>
        </div>
        <p className="text-tg-hint text-sm">«{program.name}»</p>
        {clients.length === 0 ? (
          <p className="text-tg-hint text-sm">
            Нет клиентов. Сначала пригласите клиента во вкладке «Клиенты».
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {clients.map((c) => (
              <li key={c.id}>
                <button
                  className="w-full text-left rounded-2xl bg-tg-secondaryBg p-3 flex items-center justify-between disabled:opacity-60"
                  onClick={() => assign(c.id)}
                  disabled={busyId !== null}
                >
                  <span className="font-medium">
                    {c.firstName ?? 'Клиент'}
                    {c.username && (
                      <span className="text-tg-hint font-normal"> @{c.username}</span>
                    )}
                  </span>
                  <span className="text-tg-link text-sm">
                    {busyId === c.id ? '…' : 'Выдать'}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
