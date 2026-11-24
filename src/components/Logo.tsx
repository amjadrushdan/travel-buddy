export function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex size-8 items-center justify-center rounded-sm bg-ink text-white">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
          <path d="M6 16.5C8 8 16 8 18 16.5" strokeDasharray="2.2 2.6" />
          <circle cx="6" cy="16.5" r="2.4" fill="currentColor" stroke="none" />
          <circle cx="18" cy="16.5" r="2.4" fill="currentColor" stroke="none" />
        </svg>
      </span>
      <span className="font-mono text-xs font-semibold tracking-[0.08em]">TRAVEL BUDDY</span>
    </div>
  );
}
