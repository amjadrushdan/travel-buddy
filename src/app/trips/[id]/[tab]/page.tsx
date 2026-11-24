import { notFound } from "next/navigation";
import { getTrip } from "@/lib/data/trips";

const TABS: Record<string, { title: string; empty: string }> = {
  flights: { title: "Flights", empty: "No flights added yet." },
  plan: { title: "Plan", empty: "Nothing planned yet." },
  stay: { title: "Stay", empty: "No stays added yet." },
  guide: { title: "Guide", empty: "No guide notes yet." },
};

export default async function TabPage({ params }: { params: Promise<{ id: string; tab: string }> }) {
  const { id, tab } = await params;
  const meta = TABS[tab];
  if (!meta) notFound();
  const { trip } = await getTrip(id);

  return (
    <main className="flex flex-col gap-4 px-5 pt-[calc(26px+env(safe-area-inset-top))]">
      <div className="flex flex-col gap-1">
        <span className="label">{trip.name}</span>
        <h1 className="page-title">{meta.title}</h1>
      </div>
      <div className="rounded-card border-[1.5px] border-dashed border-line p-5 text-center text-sm text-muted">
        {meta.empty}
      </div>
    </main>
  );
}
