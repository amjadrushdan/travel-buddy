import { TabBar } from "@/components/TabBar";
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
      <div className="pb-[110px]">{children}</div>
      <TabBar tripId={id} />
      {/* Save the trip's other tabs (and the trip list) so the whole trip works offline. */}
      <WarmOffline paths={["/", ...TABS.map((t) => `/trips/${id}${t}`)]} />
    </>
  );
}
