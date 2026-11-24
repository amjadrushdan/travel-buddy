// GET /airline-logo/:code — an airline's logo by IATA code (e.g. "NH"), fetched from a public
// logo service and served from this app's own address, so:
//   * phones never contact the third party directly,
//   * the service worker can save logos for offline use,
//   * it's cached for 30 days (Vercel + browser), so the upstream is rarely hit.
// Only 2-character codes are accepted, so this can't be used as an open proxy.

const UPSTREAM = (code: string) => `https://pics.avs.io/120/120/${code}.png`;
const MONTH = 60 * 60 * 24 * 30;

export async function GET(_req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const c = code.toUpperCase();
  if (!/^[A-Z0-9]{2}$/.test(c)) return new Response("Not found", { status: 404 });

  try {
    const res = await fetch(UPSTREAM(c), { next: { revalidate: MONTH }, signal: AbortSignal.timeout(5000) });
    const type = res.headers.get("content-type") ?? "";
    if (!res.ok || !type.startsWith("image/")) return new Response("Not found", { status: 404 });
    const body = await res.arrayBuffer();
    // A tiny file means "no logo" from the service; let the app show the code badge instead.
    if (body.byteLength < 200) return new Response("Not found", { status: 404 });
    return new Response(body, {
      headers: {
        "Content-Type": type,
        "Cache-Control": `public, max-age=${MONTH}, stale-while-revalidate=${MONTH}`,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
