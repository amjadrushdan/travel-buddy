// Shown instantly while a trip tab loads, so a tap always gets immediate feedback.
// The tab bar stays in place (it lives in the layout); only the page area shows this.
export default function TripLoading() {
  return (
    <main
      aria-busy="true"
      aria-label="Loading"
      className="flex animate-pulse flex-col gap-4 px-5 pt-[calc(26px+env(safe-area-inset-top))]"
    >
      <div className="flex flex-col gap-2">
        <span className="h-3 w-32 rounded bg-line" />
        <span className="h-8 w-40 rounded bg-line" />
      </div>
      <div className="h-36 rounded-card border border-line bg-surface" />
      <div className="h-24 rounded-card border border-line bg-surface" />
      <div className="h-24 rounded-card border border-line bg-surface" />
    </main>
  );
}
