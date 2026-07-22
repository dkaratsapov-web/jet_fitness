import { useEffect, useState } from 'react';
import { api, ApiError, type AppRole, type SessionResponse } from './api';
import { getInitData } from './telegram';
import { CoachHome } from './screens/CoachHome';
import { ClientHome } from './screens/ClientHome';
import { OwnerHome } from './screens/OwnerHome';
import { RolePicker } from './screens/RolePicker';
import { WelcomeScreen } from './screens/WelcomeScreen';
import { Preloader } from './components/Preloader';

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
    return <Preloader />;
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

  // Account has no role yet: cinematic welcome + the two entry CTAs.
  if (session.roles.length === 0) {
    return <WelcomeScreen onCoach={becomeCoach} onClient={becomeClient} busy={busy} />;
  }

  // Multi-role account: let the user choose which context to enter.
  if (!activeRole) {
    return <RolePicker roles={session.roles} onPick={setActiveRole} />;
  }

  const onSwitchRole = session.roles.length > 1 ? () => setActiveRole(null) : undefined;

  const home =
    activeRole === 'owner' ? (
      <OwnerHome session={session} onEnterRole={enterRole} busy={busy} onSwitchRole={onSwitchRole} />
    ) : activeRole === 'coach' ? (
      <CoachHome session={session} onSwitchRole={onSwitchRole} />
    ) : (
      <ClientHome session={session} onSwitchRole={onSwitchRole} />
    );

  return (
    <>
      <BgTexture />
      {home}
    </>
  );
}

// Subtle premium ambient texture (generated with Higgsfield). The asset is
// fetched onto the deploy runner; if it is missing the dark veil renders alone
// and nothing breaks. Sits behind all content.
function BgTexture() {
  const url = import.meta.env.BASE_URL + 'brand/app-bg.png';
  return (
    <div
      aria-hidden
      className="fixed inset-0 -z-10 pointer-events-none bg-cover bg-center bg-no-repeat"
      style={{
        backgroundImage: `linear-gradient(180deg, rgba(8,9,11,0.74), rgba(8,9,11,0.9)), url("${url}")`,
      }}
    />
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-center min-h-full p-6">{children}</div>
  );
}
