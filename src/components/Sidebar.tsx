"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { TABS } from "./TabBar";

const MORE = [
  {
    key: "food",
    label: "Food check",
    icon: <path d="M4 7V5a1 1 0 0 1 1-1h2M17 4h2a1 1 0 0 1 1 1v2M20 17v2a1 1 0 0 1-1 1h-2M7 20H5a1 1 0 0 1-1-1v-2M8 8v8M11 8v8M14 8v8M17 8v8" />,
  },
  {
    key: "bookings",
    label: "Bookings",
    icon: (
      <>
        <path d="M4 7.5A1.5 1.5 0 0 1 5.5 6h13A1.5 1.5 0 0 1 20 7.5V10a2 2 0 0 0 0 4v2.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 16.5V14a2 2 0 0 0 0-4Z" />
        <path d="M14 6v12" strokeDasharray="2 2" />
      </>
    ),
  },
  {
    key: "members",
    label: "Members",
    icon: (
      <>
        <circle cx="9" cy="8.5" r="3.2" />
        <path d="M3.5 19a5.5 5.5 0 0 1 11 0M15.5 5.6a3.2 3.2 0 0 1 0 5.8M17.5 14.2A5.5 5.5 0 0 1 20.5 19" />
      </>
    ),
  },
];

/** Desktop (≥1024px) navigation: replaces the bottom tab bar with a quiet left column. */
export function Sidebar({ tripId, name, subtitle, cover }: { tripId: string; name: string; subtitle: string; cover: string | null }) {
  const pathname = usePathname();
  const base = `/trips/${tripId}`;

  const item = (t: { key: string; label: string; icon: React.ReactNode }) => {
    const href = t.key ? `${base}/${t.key}` : base;
    const active = t.key ? pathname.startsWith(href) : pathname === base;
    return (
      <li key={t.label}>
        <Link
          href={href}
          aria-current={active ? "page" : undefined}
          className={`flex items-center gap-3 rounded-sm px-3 py-2 text-[14px] transition-colors ${
            active ? "bg-ink/[.07] font-semibold text-ink" : "text-muted hover:bg-ink/[.04] hover:text-ink"
          }`}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            {t.icon}
          </svg>
          {t.label}
        </Link>
      </li>
    );
  };

  return (
    <aside className="sticky top-0 hidden h-dvh flex-col gap-7 overflow-y-auto border-r border-line px-4 py-7 lg:flex">
      <Link href="/" className="px-3 text-[13px] font-semibold text-muted hover:text-ink">
        ‹ Trips
      </Link>

      <div className="flex flex-col gap-3 px-3">
        {cover && (
          // eslint-disable-next-line @next/next/no-img-element -- private, same-origin cover
          <img src={cover} alt="" className="aspect-[16/10] w-full rounded-sm object-cover" />
        )}
        <div className="flex flex-col gap-0.5">
          <span className="text-[17px] leading-snug font-bold [overflow-wrap:anywhere]">{name}</span>
          {subtitle && <span className="text-[13px] text-muted">{subtitle}</span>}
        </div>
      </div>

      <nav aria-label="Trip" className="flex flex-col gap-5">
        <ul className="flex flex-col gap-0.5">{TABS.map(item)}</ul>
        <ul className="flex flex-col gap-0.5 border-t border-line pt-5">{MORE.map(item)}</ul>
      </nav>
    </aside>
  );
}
