// Compact "switch role" control for owner test-mode (multi-role accounts).
// Lives inside each home header instead of floating over content.
export function RoleSwitch({ onClick }: { onClick?: () => void }) {
  if (!onClick) return null;
  return (
    <button
      onClick={onClick}
      className="rounded-full bg-brand-surface brand-line px-2.5 py-1 text-[11px] font-medium text-brand-muted active:opacity-70"
      aria-label="Сменить роль"
    >
      ⇄ роль
    </button>
  );
}
