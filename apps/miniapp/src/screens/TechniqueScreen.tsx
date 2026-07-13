import { useEffect, useRef, useState } from 'react';
import { api, type FormVideo } from '../api';

// Client technique videos (Phase 1→2): upload a lift for the coach to review;
// coach comments appear inline.
export function TechniqueScreen({ onBack }: { onBack: () => void }) {
  const [videos, setVideos] = useState<FormVideo[] | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function load() {
    api.clientVideos().then(setVideos).catch(() => setVideos([]));
  }
  useEffect(load, []);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      await api.uploadFormVideo(file);
      setVideos(null);
      load();
    } catch (err) {
      setError(String(err));
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <header className="flex items-center justify-between">
        <button className="text-tg-link text-sm" onClick={onBack}>
          ← Назад
        </button>
        <h1 className="text-lg font-semibold">Техника</h1>
        <span className="w-12" />
      </header>

      <input ref={fileRef} type="file" accept="video/*" className="hidden" onChange={onFile} />
      <button
        className="rounded-2xl bg-tg-button text-tg-buttonText p-4 font-medium disabled:opacity-60"
        onClick={() => fileRef.current?.click()}
        disabled={uploading}
      >
        {uploading ? 'Загружаем видео…' : '🎥 Загрузить видео на разбор'}
      </button>
      <p className="text-tg-hint text-xs">
        Снимите упражнение сбоку целиком. Тренер посмотрит и оставит комментарии.
      </p>
      {error && <p className="text-red-500 text-sm">{error}</p>}

      {videos === null ? (
        <p className="text-tg-hint text-sm">Загрузка…</p>
      ) : videos.length === 0 ? (
        <p className="text-tg-hint text-sm">Пока нет видео. Загрузите первое.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {videos.map((v) => (
            <li key={v.id} className="rounded-2xl bg-tg-secondaryBg p-3 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{v.exerciseName ?? 'Видео техники'}</span>
                <span className="text-tg-hint text-xs">{formatDate(v.createdAt)}</span>
              </div>
              {v.viewUrl && (
                <video src={v.viewUrl} controls className="w-full rounded-xl bg-black" />
              )}
              {v.comments.length > 0 && (
                <div className="flex flex-col gap-1">
                  {v.comments.map((c) => (
                    <div key={c.id} className="rounded-xl bg-tg-bg p-2">
                      <div className="text-tg-hint text-[10px] uppercase tracking-wide mb-1">
                        Тренер
                      </div>
                      <p className="text-sm">{c.body}</p>
                    </div>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}
