import { useEffect, useState } from 'react';
import { api, ApiError, type AppRole, type SessionResponse } from './api';
import { getInitData } from './telegram';
import { CoachHome } from './screens/CoachHome';
import { ClientHome } from './screens/ClientHome';
import { OwnerHome } from './screens/OwnerHome';
import { RolePicker } from './screens/RolePicker';
import { Logo } from './components/Logo';

type State =
  | { phase: 'loading' }
  | { phase: 'no-telegram' }
  | { phase: 'suspended' }
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
        if (err instanceof ApiError && err.reason === 'account_suspended') {
          setState({ phase: 'suspended' });
          return;
        }
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

  async function becomeClient() {
    setBusy(true);
    try {
      await api.registerClient();
      const session = await loadSession(false);
      if (session) setActiveRole('client');
    } finally {
      setBusy(false);
    }
  }

  // Owner test-mode: enter the coach/client interface (registers the profile
  // once so the real APIs work), then switch context. Idempotent.
  async function enterRole(role: AppRole) {
    setBusy(true);
    try {
      if (role === 'coach') await api.registerCoach();
      else if (role === 'client') await api.registerClient();
      const session = await loadSession(false);
      if (session) setActiveRole(role);
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

  if (state.phase === 'suspended') {
    return (
      <Centered>
        <div className="text-center max-w-xs">
          <div className="text-4xl mb-2">⛔️</div>
          <h1 className="text-xl font-semibold mb-2">Доступ приостановлен</h1>
          <p className="text-tg-hint text-sm">
            Ваш аккаунт заблокирован администратором платформы. Если это ошибка,
            свяжитесь со своим тренером или поддержкой.
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
        <div className="text-center max-w-xs flex flex-col gap-5">
          <div className="flex flex-col items-center gap-3">
            <Logo height={64} />
            <p className="text-brand-muted text-sm">
              Твой тренер и весь прогресс — в одном приложении. Тренер ведёт
              подопечных, ты тренируешься, следишь за питанием и результатом.
            </p>
          </div>
          <div className="flex flex-col gap-3">
            <button
              className="rounded-2xl bg-brand-accent text-brand-onAccent p-4 font-semibold disabled:opacity-60"
              onClick={becomeCoach}
              disabled={busy}
            >
              {busy ? 'Создаём кабинет…' : 'Я тренер — создать кабинет'}
            </button>
            <button
              className="rounded-2xl bg-brand-surface brand-line p-4 font-medium disabled:opacity-60"
              onClick={becomeClient}
              disabled={busy}
            >
              {busy ? 'Входим…' : 'Я клиент — войти'}
            </button>
          </div>
          <p className="text-brand-muted text-xs">
            Получил ссылку-приглашение от тренера? Просто открой её — попадёшь
            сразу к своему тренеру.
          </p>
        </div>
      </Centered>
    );
  }

  // Multi-role account: let the user choose which context to enter.
  if (!activeRole) {
    return <RolePicker roles={session.roles} onPick={setActiveRole} />;
  }

  const home =
    activeRole === 'owner' ? (
      <OwnerHome session={session} onEnterRole={enterRole} busy={busy} />
    ) : activeRole === 'coach' ? (
      <CoachHome session={session} />
    ) : (
      <ClientHome session={session} />
    );

  return (
    <>
      {home}
      {session.roles.length > 1 && (
        <button
          className="fixed bottom-3 right-3 z-20 rounded-full bg-tg-secondaryBg/90 backdrop-blur px-3 py-1.5 text-xs text-tg-hint shadow"
          onClick={() => setActiveRole(null)}
          aria-label="Сменить роль"
        >
          ⇄ сменить роль
        </button>
      )}
    </>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-center min-h-full p-6">{children}</div>
  );
}
