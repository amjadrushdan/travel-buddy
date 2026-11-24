import { Logo } from "@/components/Logo";

// Shown by the service worker when you're offline and the page you opened was never saved.
export const dynamic = "force-static";

export default function OfflinePage() {
  return (
    <main className="flex min-h-dvh flex-col gap-5 px-5 pt-[calc(24px+env(safe-area-inset-top))]">
      <Logo />
      <div className="flex flex-col gap-2">
        <h1 className="page-title">You&apos;re offline</h1>
        <p className="text-[15px] text-pretty text-muted">
          This page wasn&apos;t saved on this phone yet. Trips you&apos;ve opened while online are still here.
        </p>
      </div>
      {/* A full page load (not <Link>) so the service worker can serve the saved trip list. */}
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
      <a href="/" className="self-start rounded-sm bg-ink px-4 py-3 text-[15px] font-semibold text-white">
        Open my trips
      </a>
    </main>
  );
}
