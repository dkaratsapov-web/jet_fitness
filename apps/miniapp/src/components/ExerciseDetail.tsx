// Exercise detail sheet: demonstration video + technique, recommendations and
// safety precautions. Used from the client's program and the coach's library.

export interface ExerciseInfo {
  name: string;
  muscleGroup?: string | null;
  videoUrl?: string | null;
  technique?: string | null;
  recommendations?: string | null;
  precautions?: string | null;
}

function isVideoUrl(u: string): boolean {
  return /^https?:\/\//i.test(u) && /\.(mp4|webm|mov|m4v)(\?|$)/i.test(u);
}

export function ExerciseDetail({ ex, onClose }: { ex: ExerciseInfo; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-end justify-center z-20"
      onClick={onClose}
    >
      <div
        className="bg-brand-bg rounded-t-3xl w-full max-w-md p-4 flex flex-col gap-4 max-h-[88vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold">{ex.name}</h2>
            {ex.muscleGroup && (
              <div className="text-brand-accent text-xs font-medium mt-0.5">{ex.muscleGroup}</div>
            )}
          </div>
          <button className="text-brand-muted text-xl leading-none" onClick={onClose}>
            ✕
          </button>
        </div>

        {/* Demonstration video */}
        {ex.videoUrl ? (
          isVideoUrl(ex.videoUrl) ? (
            <video src={ex.videoUrl} controls playsInline className="w-full rounded-2xl bg-black" />
          ) : (
            <a
              href={ex.videoUrl}
              target="_blank"
              rel="noreferrer"
              className="rounded-2xl bg-brand-surface brand-line p-3 text-center text-brand-accent text-sm font-medium"
            >
              ▶ Смотреть видео выполнения
            </a>
          )
        ) : (
          <div className="rounded-2xl bg-brand-surface brand-line p-4 text-center text-brand-muted text-sm">
            🎬 Видео выполнения появится здесь
          </div>
        )}

        {ex.technique && <Section title="Техника выполнения" body={ex.technique} />}
        {ex.recommendations && <Section title="Рекомендации" body={ex.recommendations} />}
        {ex.precautions && <Section title="Предосторожности" body={ex.precautions} accent="neg" />}
      </div>
    </div>
  );
}

function Section({
  title,
  body,
  accent,
}: {
  title: string;
  body: string;
  accent?: 'neg';
}) {
  return (
    <section>
      <div
        className="text-xs font-semibold uppercase tracking-wide mb-1.5"
        style={{ color: accent === 'neg' ? 'var(--neg)' : 'var(--accent)' }}
      >
        {title}
      </div>
      <p className="text-sm text-brand-text leading-relaxed whitespace-pre-line">{body}</p>
    </section>
  );
}
