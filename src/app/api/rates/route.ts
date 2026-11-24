// GET /api/rates — exchange rates against MYR (free, no key: open.er-api.com, updated daily).
// Fetched on the server and cached 12 hours; the converter also keeps the last rates on the
// phone so it works offline.

const CURRENCIES = ["JPY", "THB", "SGD", "USD", "KRW", "EUR", "GBP", "CNY", "IDR", "AUD"];

export async function GET() {
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/MYR", { next: { revalidate: 12 * 3600 }, signal: AbortSignal.timeout(5000) });
    const j = (await res.json()) as { result?: string; time_last_update_unix?: number; rates?: Record<string, number> };
    if (j.result !== "success" || !j.rates) throw new Error("rates unavailable");
    const rates = Object.fromEntries(CURRENCIES.filter((c) => j.rates![c]).map((c) => [c, j.rates![c]]));
    return Response.json(
      { base: "MYR", updated: (j.time_last_update_unix ?? 0) * 1000, rates, source: "ExchangeRate-API" },
      { headers: { "Cache-Control": "private, max-age=3600" } },
    );
  } catch {
    return Response.json({ error: "Rates unavailable right now." }, { status: 503 });
  }
}
