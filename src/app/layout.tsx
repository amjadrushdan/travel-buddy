import type { Metadata, Viewport } from "next";
// Self-hosted fonts (bundled, so they also work offline once the PWA lands)
import "@fontsource/josefin-sans/latin-400.css";
import "@fontsource/josefin-sans/latin-500.css";
import "@fontsource/josefin-sans/latin-600.css";
import "@fontsource/josefin-sans/latin-700.css";
import "@fontsource/roboto-mono/latin-400.css";
import "@fontsource/roboto-mono/latin-500.css";
import "@fontsource/roboto-mono/latin-600.css";
import "./globals.css";
import { OfflineBanner } from "@/components/OfflineBanner";
import { ServiceWorker } from "@/components/ServiceWorker";

export const metadata: Metadata = {
  title: "Travel Buddy",
  description: "One place for the whole trip.",
  appleWebApp: { capable: true, title: "Travel Buddy", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#F4F3EF",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <div className="mx-auto min-h-dvh w-full max-w-[480px]">
          <OfflineBanner />
          {children}
        </div>
        <ServiceWorker />
      </body>
    </html>
  );
}
