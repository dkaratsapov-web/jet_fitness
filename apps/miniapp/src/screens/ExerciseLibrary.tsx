import { useEffect, useRef, useState } from 'react';
import { api, type ExerciseLite } from '../api';
import { ExerciseDetail } from '../components/ExerciseDetail';

// Exercise library. In coach mode: browse the full library, preview technique,
// and attach a demonstration video. In client mode: read-only browse of the
// global library (no upload), with an optional "add to workout" picker action.
export function ExerciseLibrary({
  onBack,
  mode = 'coach',
  onPick,
}: {
  onBack: () => void;
  mode?: 'coach' | 'client';
  onPick?: (ex: ExerciseLite) => void;
}) {
  const [items, setItems] = useState<ExerciseLite[] | null>(null);
  const [query, setQuery] = useState('');
  const [detail, setDetail] = useState<ExerciseLite | null>(null);

  function load() {
    const p = mode === 'client' ? api.clientExercises() : api.exercises();
    p.then(setItems).catch(() => setItems([]));
  }
  useEffect(load, []);

  const filtered = (items ?? []).filter((e) =>
    query.trim() ? e.name.toLowerCase().includes(query.trim().toLowerCase()) : true,
  );
  // Group by muscle group, preserving the server's sort.
  const groups = new Map<string, ExerciseLite[]>();
  for (const e of filtered) {
    const key = e.muscleGroup || 'Прочее';
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(e);
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <header className="flex items-center justify-between">
        <button className="text-brand-accent text-sm" onClick={onBack}>
          ← Назад
        </button>
        <h1 className="text-lg font-semibold">Библиотека упражнений</h1>
        <span className="w-12" />
      </header>

      <input
        className="rounded-2xl bg-brand-surface brand-line px-3 py-2 text-sm outline-none"
        placeholder="Поиск упражнения…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      {items === null ? (
        <p className="text-brand-muted text-sm">Загрузка…</p>
      ) : (
        [...groups.entries()].map(([group, list]) => (
          <section key={group} className="flex flex-col gap-2">
            <h2 className="text-brand-accent text-xs font-semibold uppercase tracking-wide">
              {group}
            </h2>
            <ul className="flex flex-col gap-2">
              {list.map((ex) => (
                <ExerciseRow
                  key={ex.id}
                  ex={ex}
                  mode={mode}
                  onPreview={() => setDetail(ex)}
                  onPick={onPick ? () => onPick(ex) : undefined}
                  onChanged={load}
                />
              ))}
            </ul>
          </section>
        ))
      )}

      {detail && <ExerciseDetail ex={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}

function ExerciseRow({
  ex,
  mode,
  onPreview,
  onPick,
  onChanged,
}: {
  ex: ExerciseLite;
  mode: 'coach' | 'client';
  onPreview: () => void;
  onPick?: () => void;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function upload(file: File) {
    setError(null);
    setBusy(true);
    try {
      await api.uploadExerciseVideo(ex.id, file);
      setOpen(false);
      onChanged();
    } catch {
      setError('Не удалось загрузить. Проверьте, что хранилище настроено.');
    } finally {
      setBusy(false);
    }
  }

  async function saveLink() {
    if (!/^https?:\/\/\S+$/i.test(link.trim())) {
      setError('Вставьте корректную ссылку (http…)');
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await api.setExerciseVideoUrl(ex.id, link.trim());
      setLink('');
      setOpen(false);
      onChanged();
    } catch {
      setError('Не удалось сохранить ссылку.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="rounded-2xl bg-brand-surface brand-line p-3 flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <button className="text-left flex-1" onClick={onPreview}>
          <div className="font-medium text-sm">{ex.name}</div>
          <div className="text-brand-muted text-xs">
            {ex.hasVideo ? '🎬 видео есть' : 'видео нет'} · нажмите для разбора
          </div>
        </button>
        {mode === 'coach' ? (
          <button
            className="shrink-0 rounded-xl bg-tg-bg px-3 py-1.5 text-xs text-brand-accent font-medium"
            onClick={() => setOpen((v) => !v)}
          >
            {ex.hasVideo ? 'Заменить видео' : '+ Видео'}
          </button>
        ) : onPick ? (
          <button
            className="shrink-0 rounded-xl bg-brand-accent text-brand-onAccent px-3 py-1.5 text-xs font-semibold"
            onClick={onPick}
          >
            + В тренировку
          </button>
        ) : null}
      </div>

      {mode === 'coach' && open && (
        <div className="flex flex-col gap-2 border-t brand-line pt-2">
          <input
            ref={fileRef}
            type="file"
            accept="video/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) upload(f);
            }}
          />
          <button
            className="rounded-xl bg-tg-button text-tg-buttonText py-2 text-sm disabled:opacity-60"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
          >
            {busy ? 'Загрузка…' : '📤 Загрузить видео с телефона'}
          </button>
          <div className="flex gap-2">
            <input
              className="flex-1 rounded-xl bg-tg-bg px-3 py-2 text-sm outline-none"
              placeholder="…или ссылка на видео"
              value={link}
              onChange={(e) => setLink(e.target.value)}
            />
            <button
              className="rounded-xl bg-tg-bg px-3 text-sm text-brand-accent disabled:opacity-60"
              onClick={saveLink}
              disabled={busy || !link.trim()}
            >
              OK
            </button>
          </div>
          {error && <p className="text-xs" style={{ color: 'var(--neg)' }}>{error}</p>}
        </div>
      )}
    </li>
  );
}
