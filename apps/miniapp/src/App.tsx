import { useEffect, useState } from 'react';
import { api, ApiError, type AppRole, type SessionResponse } from './api';
import { getInitData } from './telegram';
import { CoachHome } from './screens/CoachHome';
import { ClientHome } from './screens/ClientHome';
import { OwnerHome } from './screens/OwnerHome';
import { RolePicker } from './screens/RolePicker';

type State =
  | { phase: 'loading' }
  | { phase: 'no-telegram' }
  | { phase: 'error'; message: string }
  | { phase: 'ready'; session: SessionResponse };

export function App() {
  const [state, setState] = useState<State>({ phase: 'loading' });
  const [activeRole, setActiveRole] = useState<AppRole | null>(null);
  const [busy, setBusy] = useState(false);

  function loadSession(autoSelect = true) {
    return api
      .session()
      .then((session) => {
        setState({ phase: 'ready', session });
        if (autoSelect && session.roles.length === 1) setActiveRole(session.roles[0]);
        return session;
      })
      .catch((err: unknown) => {
        const message =
          err instanceof ApiError ? `${err.status}: ${err.reason}` : String(err);
        setState({ phase: 'error', message });
      });
  }

  useEffect(() => {
    // No initData => opened outside Telegram (dev in a plain browser).
    if (!getInitData()) {
      setState({ phase: 'no-telegram' });
      return;
    }
    void loadSession();
  }, []);

  async function becomeCoach() {
    setBusy(true);
    try {
      await api.registerCoach();
      const session = await loadSession(false);
      if (session) setActiveRole('coach');
    } finally {
      setBusy(false);
    }
  }

  if (state.phase === 'loading') {
    return <Centered>Загрузка…</Centered>;
  }

  if (state.phase === 'no-telegram') {
    return (
      <Centered>
        <div className="text-center max-w-xs">
          <h1 className="text-xl font-semibold mb-2">Откройте в Telegram</h1>
          <p className="text-tg-hint text-sm">
            Это приложение запускается внутри Telegram. Откройте его через бота
            командой /app.
          </p>
        </div>
      </Centered>
    );
  }

  if (state.phase === 'error') {
    return (
      <Centered>
        <div className="text-center max-w-xs">
          <h1 className="text-xl font-semibold mb-2">Ошибка входа</h1>
          <p className="text-tg-hint text-sm">{state.message}</p>
        </div>
      </Centered>
    );
  }

  const { session } = state;

  // Account has no role yet: offer to become a coach, or explain client invites.
  if (session.roles.length === 0) {
    return (
      <Centered>
        <div className="text-center max-w-xs flex flex-col gap-4">
          <div>
            <h1 className="text-xl font-semibold mb-2">Добро пожаловать!</h1>
            <p className="text-tg-hint text-sm">
              Вы тренер? Заведите кабинет и приглашайте клиентов. Клиенты
              попадают сюда по ссылке-приглашению от своего тренера.
            </p>
          </div>
          <button
            className="rounded-2xl bg-tg-button text-tg-buttonText p-4 font-medium disabled:opacity-60"
            onClick={becomeCoach}
            disabled={busy}
          >
            {busy ? 'Создаём кабинет…' : 'Я тренер — создать кабинет'}
          </button>
          <p className="text-tg-hint text-xs">
            Клиент? Попросите тренера прислать ссылку-приглашение.
          </p>
        </div>
      </Centered>
    );
  }

  // Multi-role account: let the user choose which context to enter.
  if (!activeRole) {
    return <RolePicker roles={session.roles} onPick={setActiveRole} />;
  }

  switch (activeRole) {
    case 'owner':
      return <OwnerHome session={session} />;
    case 'coach':
      return <CoachHome session={session} />;
    default:
      return <ClientHome session={session} />;
  }
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-center min-h-full p-6">{children}</div>
  );
}
