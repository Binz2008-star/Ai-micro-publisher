export default function SafeAdPlaceholder({ enabled }: { enabled: boolean }) {
  if (!enabled) return null;

  return (
    <aside
      aria-label="Sponsored placement"
      data-testid="safe-ad-placeholder"
      className="my-10 rounded-2xl border border-amber-200 bg-amber-50/70 p-5"
    >
      <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-amber-700">
        Sponsored
      </div>
      <div className="mt-2 text-base font-semibold text-slate-900">
        Ad slot reserved for eligible public sessions
      </div>
      <p className="mt-1 text-sm leading-6 text-slate-600">
        This milestone uses a static placeholder only. No third-party ad script runs here.
      </p>
    </aside>
  );
}
