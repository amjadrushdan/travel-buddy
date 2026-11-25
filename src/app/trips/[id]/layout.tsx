import { TabBar } from "@/components/TabBar";
import { Sidebar } from "@/components/Sidebar";
import { LiveUpdates } from "@/components/LiveUpdates";
import { WarmOffline } from "@/components/ServiceWorker";
import { getTrip } from "@/lib/data/trips";
import { coverSrc } from "@/lib/cover";
import { formatDateRange } from "@/lib/format";

const TABS = ["", "/flights", "/plan", "/stay", "/guide", "/members"];

export default async function TripLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { trip } = await getTrip(id);
  const subtitle = [trip.destination, formatDateRange(trip.start_date, trip.end_date)].filter(Boolean).join(" · ");

  return (
    // data-wide lets the root container grow past the phone width on desktop (see app/layout.tsx).
    <div data-wide className="lg:grid lg:grid-cols-[256px_minmax(0,1fr)]">
      {/* When this page is later served from the offline cache, this is the time it was saved. */}
      <meta name="tb-rendered-at" content={new Date().toISOString()} />
      <Sidebar tripId={id} name={trip.name} subtitle={subtitle} cover={coverSrc(trip.id, trip.cover_url)} />
      <div className="pb-[calc(96px+env(safe-area-inset-bottom))] lg:pt-6 lg:pb-16">
        {/* Reading column by default; pages that use two columns on desktop mark themselves data-two-col. */}
        <div className="lg:mx-auto lg:max-w-[640px] lg:has-[[data-two-col]]:max-w-[1080px]">{children}</div>
      </div>
      <TabBar tripId={id} />
      {/* Save the trip's other tabs (and the trip list) so the whole trip works offline. */}
      <WarmOffline paths={["/", ...TABS.map((t) => `/trips/${id}${t}`)]} />
      {/* Show other members' edits without a refresh. */}
      <LiveUpdates tripId={id} />
    </div>
  );
}
