import { useEffect, useRef, useState } from 'react';
import type { ChatMessage, ChatContext } from '../api';

// Reusable chat thread used by both the client (talks to their coach) and the
// coach (talks to one client). Optionally opens pre-scoped to a context — a
// program or a nutrition day — so the first message is sent as a comment.
export function ChatScreen({
  title,
  subtitle,
  presetContext,
  load,
  send,
  onBack,
}: {
  title: string;
  subtitle?: string;
  presetContext?: (ChatContext & { hint?: string }) | null;
  load: () => Promise<ChatMessage[]>;
  send: (body: string, ctx?: ChatContext) => Promise<ChatMessage>;
  onBack: () => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[] | null>(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  // Context stays attached until the first message with it is sent, then clears.
  const [ctx, setCtx] = useState<ChatContext | null>(presetContext ?? null);
  const endRef = useRef<HTMLDivElement>(null);

  function reload() {
    load()
      .then((m) => setMessages(m))
      .catch(() => setMessages([]));
  }
  useEffect(reload, []);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages]);

  async function submit() {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      const sent = await send(body, ctx ?? undefined);
      setMessages((prev) => [...(prev ?? []), sent]);
      setText('');
      setCtx(null); // context consumed
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex flex-col h-screen">
      <header className="flex items-center gap-3 p-4 brand-line border-b">
        <button className="text-brand-accent text-sm" onClick={onBack}>
          ←
        </button>
        <div>
          <h1 className="text-base font-semibold leading-tight">{title}</h1>
          {subtitle && <p className="text-brand-muted text-xs">{subtitle}</p>}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-2">
        {messages === null ? (
          <p className="text-brand-muted text-sm">Загрузка…</p>
        ) : messages.length === 0 ? (
          <p className="text-brand-muted text-sm text-center mt-8">
            Здесь пока пусто. Напишите первое сообщение — оно придёт собеседнику в Telegram.
          </p>
        ) : (
          messages.map((m) => <Bubble key={m.id} m={m} />)
        )}
        <div ref={endRef} />
      </div>

      <div className="p-3 brand-line border-t flex flex-col gap-2">
        {ctx?.contextLabel && (
          <div className="flex items-center justify-between rounded-xl bg-brand-surface brand-line px-3 py-1.5 text-xs">
            <span className="text-brand-accent truncate">📎 {ctx.contextLabel}</span>
            <button className="text-brand-muted ml-2 shrink-0" onClick={() => setCtx(null)}>
              ✕
            </button>
          </div>
        )}
        {presetContext?.hint && !ctx && (
          <div className="text-brand-muted text-[11px]">{presetContext.hint}</div>
        )}
        <div className="flex gap-2 items-end">
          <textarea
            className="flex-1 rounded-2xl bg-brand-surface brand-line px-3 py-2 text-sm outline-none resize-none max-h-32"
            rows={1}
            placeholder="Сообщение…"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
          />
          <button
            className="rounded-2xl bg-tg-button text-tg-buttonText px-4 py-2 text-sm font-medium disabled:opacity-50"
            onClick={submit}
            disabled={sending || !text.trim()}
          >
            {sending ? '…' : '↑'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Bubble({ m }: { m: ChatMessage }) {
  const time = new Date(m.createdAt).toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  });
  return (
    <div className={`flex ${m.mine ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[80%] rounded-2xl px-3 py-2 ${
          m.mine
            ? 'bg-tg-button text-tg-buttonText rounded-br-md'
            : 'bg-brand-surface brand-line rounded-bl-md'
        }`}
      >
        {m.contextLabel && (
          <div
            className={`text-[11px] mb-1 ${m.mine ? 'opacity-80' : 'text-brand-accent'}`}
          >
            📎 {m.contextLabel}
          </div>
        )}
        <p className="text-sm whitespace-pre-line break-words">{m.body}</p>
        <div className={`text-[10px] mt-0.5 text-right ${m.mine ? 'opacity-70' : 'text-brand-muted'}`}>
          {time}
        </div>
      </div>
    </div>
  );
}
