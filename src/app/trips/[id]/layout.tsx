import { TabBar } from "@/components/TabBar";
import { LiveUpdates } from "@/components/LiveUpdates";
import { WarmOffline } from "@/components/ServiceWorker";

const TABS = ["", "/flights", "/plan", "/stay", "/guide", "/members"];

export default async function TripLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <>
      {/* When this page is later served from the offline cache, this is the time it was saved. */}
      <meta name="tb-rendered-at" content={new Date().toISOString()} />
      <div className="pb-[calc(96px+env(safe-area-inset-bottom))]">{children}</div>
      <TabBar tripId={id} />
      {/* Save the trip's other tabs (and the trip list) so the whole trip works offline. */}
      <WarmOffline paths={["/", ...TABS.map((t) => `/trips/${id}${t}`)]} />
      {/* Show other members' edits without a refresh. */}
      <LiveUpdates tripId={id} />
    </>
  );
}
