// Line icons for guide categories, in the tab bar's style (stroke 1.7, currentColor).
const PATHS: Record<string, React.ReactNode> = {
  // bowl with chopsticks
  food: (
    <>
      <path d="M3.5 12h17a8.5 8.5 0 0 1-17 0Z" />
      <path d="M9 20.5h6" />
      <path d="M13 3.5 9.5 11M18.5 4.5 13.5 11" />
    </>
  ),
  // mosque dome with crescent
  prayer: (
    <>
      <path d="M5 20.5h14" />
      <path d="M6 20.5v-6a6 6 0 0 1 12 0v6" />
      <path d="M12 8.5v-2" />
      <path d="M13.6 3.2A1.9 1.9 0 1 0 13.6 6.6 2.4 2.4 0 0 1 13.6 3.2Z" />
      <path d="M10 20.5v-3.5a2 2 0 0 1 4 0v3.5" />
    </>
  ),
  // train front
  transport: (
    <>
      <rect x="5.5" y="3" width="13" height="14" rx="3" />
      <path d="M5.5 10.5h13" />
      <path d="M9 13.8h.01M15 13.8h.01" />
      <path d="M8 17l-2 3.5M16 17l2 3.5M7 19h10" />
    </>
  ),
  // speech bubble
  phrases: (
    <>
      <path d="M4 5.5h16v10.5H10l-4.5 3.5V16H4Z" />
      <path d="M8 9.5h8M8 12.5h5" />
    </>
  ),
  // info
  other: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5.5M12 7.7h.01" />
    </>
  ),
};

export function CategoryIcon({ category, size = 20, className = "" }: { category: string; size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
    >
      {PATHS[category] ?? PATHS.other}
    </svg>
  );
}
