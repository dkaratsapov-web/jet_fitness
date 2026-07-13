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

  useEffect(() => {
    // No initData => opened outside Telegram (dev in a plain browser).
    if (!getInitData()) {
      setState({ phase: 'no-telegram' });
      return;
    }
    api
      .session()
      .then((session) => {
        setState({ phase: 'ready', session });
        // Auto-select the role when the account has exactly one.
        if (session.roles.length === 1) setActiveRole(session.roles[0]);
      })
      .catch((err: unknown) => {
        const message =
          err instanceof ApiError ? `${err.status}: ${err.reason}` : String(err);
        setState({ phase: 'error', message });
      });
  }, []);

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

  // Account has no role yet (fresh user without an invite).
  if (session.roles.length === 0) {
    return (
      <Centered>
        <div className="text-center max-w-xs">
          <h1 className="text-xl font-semibold mb-2">Добро пожаловать!</h1>
          <p className="text-tg-hint text-sm">
            Вы ещё не привязаны к тренеру. Попросите тренера прислать
            ссылку-приглашение, чтобы начать.
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
