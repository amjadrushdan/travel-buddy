import { TabBar } from "@/components/TabBar";

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
      <div className="pb-[110px]">{children}</div>
      <TabBar tripId={id} />
    </>
  );
}
