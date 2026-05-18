// Spotify Web API — Client Credentials flow.
//
// Server-to-server only. We use this to look up an artist by name and
// pull back their canonical Spotify profile URL + portrait photo so
// newly-created People rows in the Credits Importer can be auto-enriched.
//
// No user-OAuth flow lives here; the redirect URI configured on the
// Spotify dashboard is a placeholder for a possible future "log in with
// Spotify" feature.

const TOKEN_URL = "https://accounts.spotify.com/api/token";
const SEARCH_URL = "https://api.spotify.com/v1/search";

// Per-call deadlines so a slow Spotify upstream can't stall the commit
// endpoint. The credits-commit loop awaits each enrichment serially, so
// a hung request would otherwise hang the whole import.
const TOKEN_TIMEOUT_MS = 4_000;
const SEARCH_TIMEOUT_MS = 5_000;

type CachedToken = { value: string; expiresAt: number };
let cached: CachedToken | null = null;

export function spotifyConfigured(): boolean {
  return !!(process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET);
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function getAccessToken(force = false): Promise<string | null> {
  if (!spotifyConfigured()) return null;
  // 30s safety margin so we don't try to use a token that's about to expire
  // mid-flight on a long lookup loop. `force` bypasses the cache after
  // we see a 401 from search, so a clock-skewed or revoked token gets
  // refreshed once before we give up.
  if (!force && cached && cached.expiresAt > Date.now() + 30_000) return cached.value;

  const id = process.env.SPOTIFY_CLIENT_ID as string;
  const secret = process.env.SPOTIFY_CLIENT_SECRET as string;
  const basic = Buffer.from(`${id}:${secret}`).toString("base64");
  let res: Response;
  try {
    res = await fetchWithTimeout(
      TOKEN_URL,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${basic}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: "grant_type=client_credentials",
      },
      TOKEN_TIMEOUT_MS,
    );
  } catch (err) {
    console.warn("[spotify] token fetch errored", (err as Error)?.message);
    return null;
  }
  if (!res.ok) {
    console.warn("[spotify] token fetch failed", res.status, await res.text().catch(() => ""));
    return null;
  }
  const json = (await res.json()) as { access_token: string; expires_in: number };
  cached = {
    value: json.access_token,
    expiresAt: Date.now() + json.expires_in * 1000,
  };
  return cached.value;
}

export type SpotifyArtistMatch = {
  id: string;
  name: string;
  spotifyUrl: string;
  photoUrl: string | null;
  popularity: number;
  // True when Spotify returned exactly one obvious hit (or the top hit
  // is a strong name match). Used so we can skip ambiguous results
  // rather than guessing the wrong artist.
  confident: boolean;
};

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

// Search Spotify for an artist by name and return the best match.
// Returns null when not configured, on transport error, or when there is
// no plausible hit — callers should treat this as "leave the field
// empty" rather than throwing.
export async function searchArtist(rawName: string): Promise<SpotifyArtistMatch | null> {
  const name = rawName.trim();
  if (!name) return null;
  let token = await getAccessToken();
  if (!token) return null;

  const url = `${SEARCH_URL}?q=${encodeURIComponent(name)}&type=artist&limit=5`;
  let res: Response;
  try {
    res = await fetchWithTimeout(url, { headers: { Authorization: `Bearer ${token}` } }, SEARCH_TIMEOUT_MS);
  } catch (err) {
    console.warn("[spotify] search errored", (err as Error)?.message, name);
    return null;
  }
  // One-shot retry on 401: the cached token may have been revoked
  // upstream. Force-refresh and try once more before giving up.
  if (res.status === 401) {
    token = await getAccessToken(true);
    if (!token) return null;
    try {
      res = await fetchWithTimeout(url, { headers: { Authorization: `Bearer ${token}` } }, SEARCH_TIMEOUT_MS);
    } catch (err) {
      console.warn("[spotify] search retry errored", (err as Error)?.message, name);
      return null;
    }
  }
  if (!res.ok) {
    console.warn("[spotify] search failed", res.status, name);
    return null;
  }
  const json = (await res.json()) as {
    artists?: {
      items?: Array<{
        id: string;
        name: string;
        external_urls?: { spotify?: string };
        images?: Array<{ url: string; width: number; height: number }>;
        popularity?: number;
      }>;
    };
  };
  const items = json.artists?.items ?? [];
  if (items.length === 0) return null;

  const wanted = normalize(name);
  const exact = items.filter((a) => normalize(a.name) === wanted);
  const pool = exact.length > 0 ? exact : items;
  // Within the pool, pick the most popular (Spotify's `popularity` is
  // 0-100; ties are rare). Without an exact match we still return the
  // top hit but flag it as low-confidence so callers can choose to
  // store-and-mark-unverified or skip.
  const best = pool.slice().sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0))[0];
  if (!best?.external_urls?.spotify) return null;

  const photo = (best.images ?? []).slice().sort((a, b) => b.width - a.width)[0]?.url ?? null;

  // Strict confidence: only call a match confident when EXACTLY one
  // Spotify artist normalizes to the requested name. Common names like
  // "John Williams" or "Mike Dean" return several artists who all match
  // the normalized string — auto-saving any of those would corrupt the
  // Person row. Callers treat non-confident matches as "leave empty"
  // today; if we later want to surface them for manual review, the
  // popularity + photo are still on the return value.
  const confident = exact.length === 1;

  return {
    id: best.id,
    name: best.name,
    spotifyUrl: best.external_urls.spotify,
    photoUrl: photo,
    popularity: best.popularity ?? 0,
    confident,
  };
}
