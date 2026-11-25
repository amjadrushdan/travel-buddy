"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export const TABS = [
  { key: "", label: "Home", icon: <path d="M4 10.5 12 4l8 6.5V20h-5v-6H9v6H4z" /> },
  {
    key: "flights",
    label: "Flights",
    icon: <path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z" />,
  },
  {
    key: "plan",
    label: "Plan",
    icon: (
      <>
        <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
        <path d="M3.5 10h17M8 3v4M16 3v4M8 14h3M8 17h6" />
      </>
    ),
  },
  {
    key: "stay",
    label: "Stay",
    icon: (
      <>
        <path d="M3 19V6M3 15h18v4M21 15v-3a3 3 0 0 0-3-3h-7v6" />
        <circle cx="7" cy="11.5" r="1.8" />
      </>
    ),
  },
  {
    key: "guide",
    label: "Guide",
    icon: (
      <>
        <path d="M5 19.5V5a2 2 0 0 1 2-2h12v14H7a2 2 0 0 0-2 2.5 2 2 0 0 0 2 1.5h12" />
        <path d="M9 7h6M9 10h4" />
      </>
    ),
  },
];

export function TabBar({ tripId }: { tripId: string }) {
  const pathname = usePathname();
  const base = `/trips/${tripId}`;

  return (
    // Sits flush on the screen's bottom edge. The padding grows with the phone's safe area
    // (iPhone home indicator, Android gesture bar), which needs viewport-fit=cover in layout.tsx.
    // Same colour as the page (and theme-color): Android paints its button bar in that colour,
    // so the tab bar and the system bar read as one strip.
    <nav className="fixed inset-x-0 bottom-0 z-10 mx-auto lg:hidden w-full max-w-[480px] border-t border-line bg-bg px-2 pb-[max(18px,calc(env(safe-area-inset-bottom)+6px))]">
      <ul className="grid grid-cols-5">
        {TABS.map((t) => {
          const href = t.key ? `${base}/${t.key}` : base;
          const active = t.key ? pathname.startsWith(href) : pathname === base;
          return (
            <li key={t.label}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex flex-col items-center gap-2 pb-1 ${active ? "text-ink" : "text-muted"}`}
              >
                <span className={`h-[3px] w-7 rounded-b-[3px] ${active ? "bg-ink" : "bg-transparent"}`} />
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  {t.icon}
                </svg>
                <span className={`text-[11px] ${active ? "font-bold" : "font-medium"}`}>{t.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
