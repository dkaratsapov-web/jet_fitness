import { useEffect, useState } from 'react';
import { api, type AppNotification, type NotifyPrefs } from '../api';

// In-app notifications center: history + read state + reminder preferences.
// Opening the screen marks everything read (the bell badge clears).

const TYPE_ICON: Record<string, string> = {
  chat: '💬',
  program: '🏋️',
  technique: '🎬',
  checkin: '📝',
  challenge: '🏆',
  payment: '💳',
  client_joined: '🎉',
  supplement_reminder: '💊',
  workout_reminder: '🏋️',
  general: '🔔',
};

function relTime(iso: string): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'только что';
  if (min < 60) return `${min} мин назад`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} ч назад`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days} дн назад`;
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

export function NotificationsScreen({ onBack }: { onBack: () => void }) {
  const [items, setItems] = useState<AppNotification[] | null>(null);
  const [settings, setSettings] = useState(false);

  useEffect(() => {
    api.notifications(60).then(setItems).catch(() => setItems([]));
    // Opening the center clears unread.
    api.markNotificationsRead().catch(() => undefined);
  }, []);

  return (
    <div className="flex flex-col gap-4 p-4 pb-24">
      <header className="flex items-center justify-between">
        <button className="text-tg-link text-sm" onClick={onBack}>
          ← Назад
        </button>
        <h1 className="text-lg font-semibold">Уведомления</h1>
        <button
          className="text-brand-accent text-lg w-12 text-right"
          onClick={() => setSettings((s) => !s)}
          aria-label="Настройки уведомлений"
        >
          ⚙️
        </button>
      </header>

      {settings && <PrefsPanel />}

      {items === null ? (
        <p className="text-brand-muted text-sm">Загрузка…</p>
      ) : items.length === 0 ? (
        <div className="jf-card p-6 text-center">
          <div className="text-3xl mb-2">🔔</div>
          <p className="text-brand-muted text-sm">
            Пока тихо. Здесь появятся напоминания, сообщения тренера и события.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((n) => (
            <li
              key={n.id}
              className={`jf-card p-3 flex gap-3 items-start ${n.read ? '' : 'border-l-2 border-l-brand-accent'}`}
            >
              <span className="text-xl leading-none mt-0.5">
                {TYPE_ICON[n.type] ?? TYPE_ICON.general}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm leading-snug">{n.body}</p>
                <p className="text-brand-muted text-[11px] mt-1">{relTime(n.createdAt)}</p>
              </div>
              {!n.read && <span className="w-2 h-2 rounded-full bg-brand-accent mt-1.5 shrink-0" />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PrefsPanel() {
  const [prefs, setPrefs] = useState<NotifyPrefs | null>(null);

  useEffect(() => {
    api.notifyPrefs().then(setPrefs).catch(() => setPrefs({ workout: true, supplements: true }));
  }, []);

  function toggle(key: keyof NotifyPrefs) {
    if (!prefs) return;
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next);
    api.updateNotifyPrefs({ [key]: next[key] }).catch(() => undefined);
  }

  const rows: Array<{ key: keyof NotifyPrefs; icon: string; title: string; sub: string }> = [
    { key: 'workout', icon: '🏋️', title: 'Напоминания о тренировках', sub: 'вечерний пинг, если не тренировался' },
    { key: 'supplements', icon: '💊', title: 'Напоминания о бадах', sub: 'по расписанию приёма' },
  ];

  return (
    <div className="jf-card p-3 flex flex-col gap-1">
      <div className="text-brand-muted text-[11px] font-semibold uppercase tracking-wide mb-1">
        Что присылать
      </div>
      {rows.map((r) => (
        <button
          key={r.key}
          className="flex items-center gap-3 py-2 text-left"
          onClick={() => toggle(r.key)}
        >
          <span className="text-lg">{r.icon}</span>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium">{r.title}</div>
            <div className="text-brand-muted text-[11px]">{r.sub}</div>
          </div>
          <Switch on={prefs ? prefs[r.key] : true} />
        </button>
      ))}
      <p className="text-brand-muted text-[11px] mt-1">
        Сообщения тренера и важные события приходят всегда.
      </p>
    </div>
  );
}

function Switch({ on }: { on: boolean }) {
  return (
    <span
      className={`w-10 h-6 rounded-full p-0.5 transition-colors shrink-0 ${
        on ? 'bg-brand-accent' : 'bg-brand-surface2'
      }`}
    >
      <span
        className={`block w-5 h-5 rounded-full bg-white transition-transform ${on ? 'translate-x-4' : ''}`}
      />
    </span>
  );
}
