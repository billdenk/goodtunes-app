// Per-release streaming-link resolver (Task #843).
//
// Apple Music album imports already capture a real per-release
// `appleMusicUrl` (from the iTunes Lookup API). Tidal, Deezer, and
// Pandora used to fall back to a service *search* on the fan-side "How
// to Play" sheet because we had no cross-service mapping. This module
// resolves the real per-release URL for those services from the Apple
// Music release using the free Odesli / song.link API, which maps one
// known release URL/id to its equivalents across every major service.
//
// Qobuz is intentionally not resolved: Odesli does not carry Qobuz, and
// there is no free per-release Qobuz lookup, so it stays null and the
// existing search fallback still applies (matches the task's scope).
//
// Everything here is best-effort: a failure (network, rate-limit, no
// match) returns nulls so the caller stores what it has and the fan
// surface falls back to search for the unresolved services. We never
// throw out of these helpers.

// song.link's public endpoint. Host is fixed (not user-supplied), so no
// SSRF guard is needed — we only feed it our own Apple collection id.
const ODESLI_URL = "https://api.song.link/v1-alpha.1/links";

// Per-call deadline so a slow Odesli upstream can't stall an import.
const LOOKUP_TIMEOUT_MS = 8_000;

export interface ResolvedStreamingLinks {
  tidalUrl: string | null;
  qobuzUrl: string | null;
  deezerUrl: string | null;
  pandoraUrl: string | null;
}

const EMPTY: ResolvedStreamingLinks = {
  tidalUrl: null,
  qobuzUrl: null,
  deezerUrl: null,
  pandoraUrl: null,
};

async function fetchWithTimeout(url: string): Promise<Response | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), LOOKUP_TIMEOUT_MS);
  try {
    return await fetch(url, {
      headers: { Accept: "application/json" },
      signal: ctrl.signal,
    });
  } catch (err) {
    console.warn("[streamingLinks] odesli fetch errored", (err as Error)?.message);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function pickUrl(node: unknown): string | null {
  if (node && typeof node === "object" && typeof (node as any).url === "string") {
    const u = (node as any).url.trim();
    return u.length > 0 ? u : null;
  }
  return null;
}

// Resolve Tidal / Deezer / Pandora per-release URLs for an Apple Music
// album, keyed off its numeric iTunes collection id. Returns nulls on
// any failure (caller keeps the search fallback for the missing
// services). `country` mirrors the storefront the album was imported
// from so the resolved links live in the right region when possible.
export async function resolveStreamingLinksFromAppleCollectionId(
  collectionId: string,
  country = "us",
): Promise<ResolvedStreamingLinks> {
  const id = String(collectionId || "").trim();
  if (!/^\d+$/.test(id)) return { ...EMPTY };

  const params = new URLSearchParams({
    platform: "itunes",
    type: "album",
    id,
    userCountry: (country || "us").toUpperCase(),
  });
  // Optional API key raises Odesli's no-key rate limit (~10 req/min).
  // Inert when unset — the no-key tier still works for low volume.
  const key = process.env.ODESLI_API_KEY;
  if (key) params.set("key", key);

  const res = await fetchWithTimeout(`${ODESLI_URL}?${params.toString()}`);
  if (!res) return { ...EMPTY };
  if (!res.ok) {
    // 429 = rate-limited; 4xx/5xx = no mapping / upstream issue. All are
    // non-fatal: the search fallback covers the missing links.
    if (res.status !== 404) {
      console.warn("[streamingLinks] odesli lookup failed", res.status, "collection", id);
    }
    return { ...EMPTY };
  }

  let json: any;
  try {
    json = await res.json();
  } catch (err) {
    console.warn("[streamingLinks] odesli parse error", (err as Error)?.message);
    return { ...EMPTY };
  }

  const byPlatform = json?.linksByPlatform ?? {};
  return {
    tidalUrl: pickUrl(byPlatform.tidal),
    // Odesli does not carry Qobuz — always null, search fallback applies.
    qobuzUrl: null,
    deezerUrl: pickUrl(byPlatform.deezer),
    pandoraUrl: pickUrl(byPlatform.pandora),
  };
}

// True when at least one per-release link was resolved — lets callers
// skip a no-op DB write when Odesli returned nothing useful.
export function hasAnyResolvedLink(links: ResolvedStreamingLinks): boolean {
  return !!(links.tidalUrl || links.qobuzUrl || links.deezerUrl || links.pandoraUrl);
}

// Pull the numeric iTunes collection id out of a stored Apple Music
// album URL (`https://music.apple.com/<country>/album/<slug>/<id>`).
// Returns null when the URL is missing/malformed or carries no id, so
// the refresh sweep can skip albums that song.link can't map. Mirrors
// the parse used by the from-apple-url import endpoint.
export function appleCollectionIdFromUrl(
  appleMusicUrl: string | null | undefined,
): string | null {
  const raw = String(appleMusicUrl || "").trim();
  if (!raw) return null;
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }
  const m = parsed.pathname.match(/\/album\/[^/]+\/(\d+)/);
  return m?.[1] ?? null;
}

// The storefront country segment of an Apple Music URL (the first path
// part), so a refresh resolves links in the region the album was
// imported from. Defaults to "us".
export function appleCountryFromUrl(
  appleMusicUrl: string | null | undefined,
): string {
  const raw = String(appleMusicUrl || "").trim();
  if (!raw) return "us";
  try {
    const parsed = new URL(raw);
    return (parsed.pathname.split("/").filter(Boolean)[0] || "us").toLowerCase();
  } catch {
    return "us";
  }
}

// Resolve links for many Apple releases with bounded concurrency and a
// total wall-clock budget. Used by the discography import where an
// artist can have dozens of releases — we cap concurrency so we don't
// hammer Odesli, and stop launching new lookups once the budget is
// spent (remaining releases keep the search fallback). Best-effort: an
// individual failure just yields empty links for that id.
export async function resolveStreamingLinksForCollections(
  items: Array<{ collectionId: string; country?: string }>,
  opts: { concurrency?: number; totalBudgetMs?: number } = {},
): Promise<Map<string, ResolvedStreamingLinks>> {
  const concurrency = Math.max(1, opts.concurrency ?? 4);
  const totalBudgetMs = opts.totalBudgetMs ?? 25_000;
  const out = new Map<string, ResolvedStreamingLinks>();
  const deadline = Date.now() + totalBudgetMs;

  const queue = items.filter((it) => /^\d+$/.test(String(it.collectionId || "").trim()));
  let cursor = 0;

  async function worker(): Promise<void> {
    while (cursor < queue.length && Date.now() < deadline) {
      const idx = cursor++;
      const it = queue[idx];
      const links = await resolveStreamingLinksFromAppleCollectionId(
        it.collectionId,
        it.country ?? "us",
      );
      out.set(String(it.collectionId), links);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, queue.length) }, () => worker()),
  );
  return out;
}
