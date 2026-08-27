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
const TOKEN_TIMEOUT_MS = 8_000;
const SEARCH_TIMEOUT_MS = 8_000;

type CachedToken = { value: string; expiresAt: number };
let cached: CachedToken | null = null;

export function spotifyConfigured(): boolean {
  return !!(process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET);
}

/**
 * Best-effort token pre-warm at server boot. Spotify's accounts edge
 * occasionally returns 503 "overflow" — fetching the token lazily on the
 * admin's first search means the admin pays that cost. Pre-warming at
 * boot moves it off the critical path. Silent on failure: the on-demand
 * retry path inside `getAccessToken` will try again when actually needed.
 */
export async function prewarmSpotifyToken(): Promise<void> {
  if (!spotifyConfigured()) return;
  try {
    const t = await getAccessToken();
    if (t) console.log("[spotify] token pre-warmed");
  } catch {
    /* silent — lazy path will retry on first real call */
  }
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

  // Spotify's accounts service (the OAuth token endpoint, not the API)
  // periodically returns 502/503 with "overflow" — their Google-fronted
  // load balancer throttling. A single 502 here used to surface as a
  // "Spotify lookup failed" banner to the admin even when the credentials
  // are fine. Retry up to 3 times total with exponential-ish backoff
  // (0/400/1000ms) on transport error OR 429/5xx before giving up.
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const tokenAttempt = async (): Promise<Response | null> => {
    try {
      return await fetchWithTimeout(
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
  };
  const isTransient = (s: number) => s === 429 || (s >= 500 && s < 600);
  const backoffs = [0, 400, 1000];
  let res: Response | null = null;
  for (let i = 0; i < backoffs.length; i++) {
    if (backoffs[i] > 0) await sleep(backoffs[i]);
    res = await tokenAttempt();
    if (res && res.ok) break;
    if (res && !isTransient(res.status)) {
      // 4xx (bad creds, etc.) — no point retrying.
      const body = await res.text().catch(() => "");
      console.warn("[spotify] token fetch failed", res.status, body.slice(0, 200));
      return null;
    }
    if (res) {
      const body = await res.text().catch(() => "");
      console.warn(`[spotify] token fetch transient ${res.status} (attempt ${i + 1}/${backoffs.length})`, body.slice(0, 120));
    }
  }
  if (!res || !res.ok) {
    console.warn("[spotify] token fetch failed after retries");
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

// Single candidate row used by the admin "pick a Spotify artist"
// picker. Same shape as a match but without the `confident` field — by
// the time we surface candidates the admin is making the call.
export type SpotifyArtistCandidate = {
  id: string;
  name: string;
  spotifyUrl: string;
  photoUrl: string | null;
  popularity: number;
  followers: number;
  genres: string[];
  // Best-effort disambiguator: the name of the artist's most recent
  // release. Only populated when a caller opts into enrichment (the admin
  // picker), and null when Spotify returns no albums or the per-artist
  // lookup failed.
  //
  // Why a release name and not followers/popularity/top-track: this app's
  // Spotify client-credentials token returns artist objects *stripped* of
  // followers/popularity/genres (all undefined), and /top-tracks answers
  // 403 Forbidden. The /artists/{id}/albums endpoint, however, returns
  // 200 with real release names — so for two obscure same-name artists
  // (e.g. several "Black Angel"s) the latest release is frequently the
  // only field that tells them apart.
  latestRelease: string | null;
};

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

// Strict variant used for the "is this THE artist they asked for?"
// decision. Folds case/diacritics and collapses whitespace but KEEPS
// punctuation and symbols — "How???" and "$how" both loose-normalize to
// "how", which once auto-matched the wrong artist. Loose normalize()
// stays for ranking/pooling only.
function normalizeStrict(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Task #3193 — shared strong-identity check for any server-side site that
// wants to persist something off a name-only Spotify lookup WITHOUT an
// operator confirming the candidate. Mirrors the "exact" rule in
// client/src/lib/appleArtistMatch.ts: case/diacritic-insensitive with
// punctuation PRESERVED, so "How???" never equals "$how".
export function namesMatchStrict(a: string, b: string): boolean {
  return normalizeStrict(a) === normalizeStrict(b);
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
  const wantedStrict = normalizeStrict(name);
  const strictExact = items.filter((a) => normalizeStrict(a.name) === wantedStrict);
  const looseExact = items.filter((a) => normalize(a.name) === wanted);
  const exact = strictExact.length > 0 ? strictExact : looseExact;
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
  const confident = strictExact.length === 1;

  return {
    id: best.id,
    name: best.name,
    spotifyUrl: best.external_urls.spotify,
    photoUrl: photo,
    popularity: best.popularity ?? 0,
    confident,
  };
}

// Re-fetch an artist by Spotify ID/URL and return the largest portrait.
// Powers the admin "Refresh from Spotify" button on a Person's Photo
// tab — we already know which Spotify artist this person is (their
// `spotifyUrl` was saved during the original match), so we go straight
// to /v1/artists/{id} instead of doing a name search that could drift
// to a different artist with the same name.
export async function fetchSpotifyArtistPhotoByUrl(
  spotifyUrl: string,
): Promise<{ photoUrl: string | null; name: string | null } | null> {
  // Accept both the web URL form (https://open.spotify.com/artist/{id})
  // and the URI form (spotify:artist:{id}). Anything else returns null.
  const m =
    /\/artist\/([A-Za-z0-9]+)/.exec(spotifyUrl) ||
    /spotify:artist:([A-Za-z0-9]+)/.exec(spotifyUrl);
  const artistId = m?.[1];
  if (!artistId) return null;

  let token = await getAccessToken();
  if (!token) return null;
  const url = `https://api.spotify.com/v1/artists/${encodeURIComponent(artistId)}`;
  const fetchOnce = async (bearer: string) =>
    fetchWithTimeout(
      url,
      { headers: { Authorization: `Bearer ${bearer}` } },
      SEARCH_TIMEOUT_MS,
    );

  let res: Response;
  try {
    res = await fetchOnce(token);
  } catch (err) {
    console.warn("[spotify] artist fetch errored", (err as Error)?.message, artistId);
    return null;
  }
  if (res.status === 401) {
    token = await getAccessToken(true);
    if (!token) return null;
    try {
      res = await fetchOnce(token);
    } catch {
      return null;
    }
  }
  if (!res.ok) {
    console.warn("[spotify] artist fetch failed", res.status, artistId);
    return null;
  }
  const json = (await res.json()) as {
    name?: string;
    images?: Array<{ url: string; width: number; height: number }>;
  };
  const photo =
    (json.images ?? []).slice().sort((a, b) => b.width - a.width)[0]?.url ?? null;
  return { photoUrl: photo, name: json.name ?? null };
}

// Combined import-flow lookup. One Spotify API call returns both the
// confident-match decision (when exactly one normalized name hit) AND
// the top N candidates for the picker when ambiguous. Used by the
// credits-commit endpoint so we don't double-call the API for every
// new person.
export type SpotifyImportLookup =
  | { status: "matched"; match: SpotifyArtistCandidate; candidates: SpotifyArtistCandidate[] }
  | { status: "ambiguous"; candidates: SpotifyArtistCandidate[] }
  | { status: "none"; candidates: [] };

export async function searchArtistForImport(
  rawName: string,
  candidateLimit = 3,
): Promise<SpotifyImportLookup> {
  // Task #3193 — widen the decision pool to 10 so a second artist whose
  // strict name also equals the query (several "John Williams"es) can't
  // fall off a 5-row pool and fake a confident single hit.
  const all = await searchArtistCandidates(rawName, Math.max(candidateLimit, 10));
  return decideImportMatch(rawName, all, candidateLimit);
}

// Pure decision half of `searchArtistForImport`, split out so it's unit
// testable without a Spotify token. "matched" (safe to auto-write a link)
// requires EXACTLY ONE candidate whose strict — punctuation-preserving —
// name equals the requested name. A loose (punctuation-stripped) collision
// like "$how" for "How???" is never a match: it lands in "ambiguous" and
// the operator picks from candidates.
export function decideImportMatch(
  rawName: string,
  all: SpotifyArtistCandidate[],
  candidateLimit = 3,
): SpotifyImportLookup {
  if (all.length === 0) return { status: "none", candidates: [] };
  const exact = all.filter((a) => namesMatchStrict(a.name, rawName));
  const candidates = all.slice(0, candidateLimit);
  if (exact.length === 1) {
    return { status: "matched", match: exact[0], candidates };
  }
  return { status: "ambiguous", candidates };
}

// Like `searchArtistCandidates` but surfaces *why* a lookup returned no
// rows — empty Spotify results vs. token failure vs. upstream timeout —
// so a UI surface can show an honest error state instead of pretending
// "no results." The admin "Who's the artist?" dialog uses this; older
// callers stick with the simple shape below.
export type SpotifyCandidatesResult =
  | { ok: true; candidates: SpotifyArtistCandidate[] }
  | { ok: false; reason: SpotifyFailureReason; status?: number; detail?: string };

// Task #3439 — every way a detailed Spotify lookup can fail. `premium_required`
// is its own reason (not a generic `upstream_error`) because it has a specific
// operator action: Spotify suspends ALL Web API access for an app when the
// app owner's Spotify Premium subscription lapses — the API keeps minting
// tokens (200 on the token endpoint) but answers every call with
// 403 "Active premium subscription required for the owner of the app".
// Retrying is pointless; renewing Premium on the owning account fixes it.
export type SpotifyFailureReason =
  | "no_token"
  | "fetch_error"
  | "upstream_error"
  | "premium_required"
  | "parse_error";

// Human-facing copy for the premium-required suspension. Shared by the admin
// artist-search route, the ops health probe, and the client dialogs so the
// operator sees the same actionable message everywhere.
export const SPOTIFY_PREMIUM_REQUIRED_MESSAGE =
  "Spotify has suspended this app's API access — the app owner's Spotify Premium subscription must be active.";

// Pure classifier for a non-OK Spotify Web API response, unit-testable
// without a network. The premium-suspension 403's body reads
// {"error":{"status":403,"message":"Active premium subscription required
// for the owner of the app"}} — match on the phrase, not just the status,
// so ordinary endpoint-level 403s (e.g. /top-tracks for this token tier)
// keep reading as upstream_error.
export function classifySpotifyApiError(
  status: number,
  bodyText: string,
): "premium_required" | "upstream_error" {
  if (status === 403 && /premium\s+subscription/i.test(bodyText)) return "premium_required";
  return "upstream_error";
}

// Message the lookup routes put in the JSON error body. Generic reasons keep
// the legacy copy; the premium suspension names the actual operator action.
export function spotifyLookupFailureMessage(reason: SpotifyFailureReason): string {
  return reason === "premium_required" ? SPOTIFY_PREMIUM_REQUIRED_MESSAGE : "Spotify lookup failed.";
}

// Largest per-request page size this app's token accepts. Spotify
// rejects `limit=20` for our client-credentials token with a
// 400 "Invalid limit", but `limit=10` succeeds — so we never request
// more than this in a single call and widen the pool with `offset`
// paging instead.
const SPOTIFY_SEARCH_PAGE_SIZE = 10;
// How many pages to pull. 3 × 10 = a 30-candidate pool, deep enough to
// catch obscure exact-name artists (e.g. "Black Canoe" at ~position 8-9)
// that rank just past the first page and that Spotify's unstable
// ordering floats in and out of a single fetch.
const SPOTIFY_SEARCH_PAGES = 3;

type SpotifyRawArtist = {
  id: string;
  name: string;
  external_urls?: { spotify?: string };
  images?: Array<{ url: string; width: number; height: number }>;
  popularity?: number;
  followers?: { total?: number };
  genres?: string[];
};

type SpotifyPageResult =
  | { ok: true; items: SpotifyRawArtist[] }
  | { ok: false; reason: SpotifyFailureReason; status?: number; detail?: string };

export async function searchArtistCandidatesDetailed(
  rawName: string,
  limit = 5,
  // `withReleases` opts into a best-effort per-candidate latest-release
  // lookup so the admin picker can show a disambiguator. It's off by
  // default because the serial credits-commit import loop calls this for
  // every new person and must not pay N extra API round-trips.
  opts: { withReleases?: boolean } = {},
): Promise<SpotifyCandidatesResult> {
  const name = rawName.trim();
  if (!name) return { ok: true, candidates: [] };
  let token = await getAccessToken();
  if (!token) {
    console.warn("[spotify] candidates: no_token for", name);
    return { ok: false, reason: "no_token" };
  }

  const isTransientStatus = (s: number) => s === 429 || (s >= 500 && s < 600);
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  // Fetch a single page at `offset`. Carries the existing retry/timeout/
  // 401-refresh behavior: Spotify's search endpoint (and Replit's egress
  // to it) is occasionally flaky — sporadic socket resets / 5xx that
  // resolve on an immediate re-fetch — and a stale token surfaces as a
  // 401 that the token refresh fixes. The outer `token` is updated on a
  // 401 refresh so later pages reuse the fresh token.
  const fetchPage = async (offset: number): Promise<SpotifyPageResult> => {
    const url = `${SEARCH_URL}?q=${encodeURIComponent(name)}&type=artist&limit=${SPOTIFY_SEARCH_PAGE_SIZE}&offset=${offset}`;
    const fetchOnce = async (bearer: string) =>
      fetchWithTimeout(url, { headers: { Authorization: `Bearer ${bearer}` } }, SEARCH_TIMEOUT_MS);

    let res: Response | null = null;
    let lastFetchErr: string | null = null;
    try {
      res = await fetchOnce(token!);
    } catch (err) {
      lastFetchErr = (err as Error)?.message ?? "";
    }
    // Quiet retry on transport error or transient upstream status.
    if (!res || (res.status !== 401 && (res.status === 0 || isTransientStatus(res.status)) && res.ok === false)) {
      await sleep(350);
      try {
        res = await fetchOnce(token!);
      } catch (err) {
        lastFetchErr = (err as Error)?.message ?? lastFetchErr;
        res = null;
      }
    }
    if (!res) {
      console.warn("[spotify] candidates: fetch_error (after retry)", lastFetchErr, "name=", name, "offset=", offset);
      return { ok: false, reason: "fetch_error", detail: lastFetchErr ?? "" };
    }
    if (res.status === 401) {
      const refreshed = await getAccessToken(true);
      if (!refreshed) {
        console.warn("[spotify] candidates: no_token after 401 refresh for", name);
        return { ok: false, reason: "no_token" };
      }
      token = refreshed;
      try {
        res = await fetchOnce(token);
      } catch (err) {
        const detail = (err as Error)?.message ?? "";
        console.warn("[spotify] candidates: fetch_error after 401", detail, "name=", name, "offset=", offset);
        return { ok: false, reason: "fetch_error", detail };
      }
    }
    // Final transient retry — a 5xx after the first retry above can still
    // happen if the first attempt threw and the second got an upstream
    // hiccup. Give it one more shot before failing.
    if (!res.ok && isTransientStatus(res.status)) {
      await sleep(500);
      try {
        res = await fetchOnce(token!);
      } catch (err) {
        const detail = (err as Error)?.message ?? "";
        console.warn("[spotify] candidates: fetch_error on transient retry", detail, "name=", name, "offset=", offset);
        return { ok: false, reason: "fetch_error", detail };
      }
    }
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      // Task #3439 — a hard 403 "premium subscription required" is Spotify
      // suspending the whole app (owner's Premium lapsed), not a flaky
      // upstream. Surface it as its own reason so the route/UI can tell the
      // operator the actual fix instead of "try again".
      const reason = classifySpotifyApiError(res.status, body);
      console.warn(`[spotify] candidates: ${reason}`, res.status, body.slice(0, 200), "name=", name, "offset=", offset);
      return { ok: false, reason, status: res.status, detail: body.slice(0, 200) };
    }

    let json: any;
    try {
      json = await res.json();
    } catch (err) {
      const detail = (err as Error)?.message ?? "";
      console.warn("[spotify] candidates: parse_error", detail, "name=", name, "offset=", offset);
      return { ok: false, reason: "parse_error", detail };
    }
    return { ok: true, items: (json?.artists?.items ?? []) as SpotifyRawArtist[] };
  };

  // Pull the first page. If it fails, surface the failure exactly like
  // the single-page version did so the UI keeps its honest error states.
  const first = await fetchPage(0);
  if (!first.ok) {
    return { ok: false, reason: first.reason, status: first.status, detail: first.detail };
  }

  // Merge in deeper pages (best-effort). A later page hiccuping must not
  // fail the whole search — we already have a valid first page — so we
  // simply stop paging on the first non-ok deeper page. We also stop
  // early once a page returns fewer than a full page (no more results).
  const merged: SpotifyRawArtist[] = [...first.items];
  if (first.items.length >= SPOTIFY_SEARCH_PAGE_SIZE) {
    for (let page = 1; page < SPOTIFY_SEARCH_PAGES; page++) {
      const next = await fetchPage(page * SPOTIFY_SEARCH_PAGE_SIZE);
      if (!next.ok) break;
      merged.push(...next.items);
      if (next.items.length < SPOTIFY_SEARCH_PAGE_SIZE) break;
    }
  }

  // De-duplicate by artist id (the same artist can appear on more than
  // one page given Spotify's unstable ordering), then keep the existing
  // ranking: exact normalized-name matches first, the rest by popularity.
  const wanted = normalize(name);
  const byId = new Map<string, SpotifyRawArtist>();
  for (const a of merged) {
    if (!a?.external_urls?.spotify) continue;
    if (!byId.has(a.id)) byId.set(a.id, a);
  }
  const rows: SpotifyArtistCandidate[] = Array.from(byId.values()).map((a) => ({
    id: a.id,
    name: a.name,
    spotifyUrl: a.external_urls!.spotify!,
    photoUrl: (a.images ?? []).slice().sort((x, y) => y.width - x.width)[0]?.url ?? null,
    popularity: a.popularity ?? 0,
    followers: a.followers?.total ?? 0,
    genres: a.genres ?? [],
    latestRelease: null,
  }));
  // Task #3193 — strict (punctuation-preserving) exact matches outrank
  // loose (punctuation-stripped) ones: for a query of "How???" the artist
  // "How???" must sort ahead of "$how" even when the latter is more
  // popular. Loose matches still outrank non-matches for the pickers.
  const wantedStrict = normalizeStrict(name);
  rows.sort((a, b) => {
    const score = (c: SpotifyArtistCandidate) =>
      normalizeStrict(c.name) === wantedStrict ? 2 : normalize(c.name) === wanted ? 1 : 0;
    const d = score(b) - score(a);
    if (d !== 0) return d;
    return b.popularity - a.popularity;
  });
  const top = rows.slice(0, limit);
  // Enrich only the candidates we're actually returning (≤ `limit`) with a
  // latest-release hint. Best-effort + bounded concurrency so a slow
  // Spotify upstream can't multiply into a long stall, and never throws —
  // a candidate just keeps `latestRelease: null` if its lookup fails.
  if (opts.withReleases && token && top.length > 0) {
    await enrichLatestReleases(top, token);
  }
  return { ok: true, candidates: top };
}

// Per-artist latest-release lookup. We use /v1/artists/{id}/albums (which
// answers 200 for this app's token, unlike /top-tracks which 403s) and
// pick the most recently released album/single by release_date. US market
// keeps the catalog consistent for the operator. Best-effort: returns null
// on any non-2xx / transport error / empty list so the caller silently
// falls back to name + avatar.
async function fetchArtistLatestRelease(artistId: string, token: string): Promise<string | null> {
  // limit caps at 10 for this app's token tier (15/20/50 answer 400
  // "Invalid limit"); 10 is plenty to find the newest by release_date.
  const url = `https://api.spotify.com/v1/artists/${encodeURIComponent(
    artistId,
  )}/albums?include_groups=album,single&limit=10&market=US`;
  try {
    const res = await fetchWithTimeout(url, { headers: { Authorization: `Bearer ${token}` } }, SEARCH_TIMEOUT_MS);
    if (!res.ok) return null;
    const json = (await res.json()) as { items?: Array<{ name?: string; release_date?: string }> };
    const items = (json.items ?? []).filter((a) => a?.name);
    if (items.length === 0) return null;
    // Spotify's default ordering groups albums before singles rather than
    // strict newest-first, so pick the max release_date ourselves. Dates are
    // ISO-ish ("2024" or "2024-09-16"); lexical compare is correct for both.
    items.sort((a, b) => String(b.release_date ?? "").localeCompare(String(a.release_date ?? "")));
    const name = items[0]?.name;
    return name ? String(name) : null;
  } catch {
    return null;
  }
}

// Mutates each candidate in place with its latest release, running at most
// `CONCURRENCY` lookups at a time so a picker of 8 artists resolves in a
// couple of rounds rather than 8 serial round-trips.
async function enrichLatestReleases(candidates: SpotifyArtistCandidate[], token: string): Promise<void> {
  const CONCURRENCY = 5;
  let cursor = 0;
  const worker = async () => {
    while (cursor < candidates.length) {
      const idx = cursor++;
      const c = candidates[idx];
      c.latestRelease = await fetchArtistLatestRelease(c.id, token);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, candidates.length) }, () => worker()),
  );
}

// Return the top N Spotify artist candidates for a name so the admin
// can pick the right one when the auto-match is ambiguous (or when
// they want to override). Ordering: exact normalized-name hits first,
// then everything else, both sorted by popularity desc.
//
// Legacy wrapper: collapses any error reason to an empty list so older
// callers that don't need to differentiate keep working.
export async function searchArtistCandidates(
  rawName: string,
  limit = 5,
): Promise<SpotifyArtistCandidate[]> {
  const r = await searchArtistCandidatesDetailed(rawName, limit);
  return r.ok ? r.candidates : [];
}

// ── Task #3439 — proactive Spotify health probe ─────────────────────────
//
// Feeds the credential-expiry watcher (server/credentialExpiry.ts) so ops
// get ONE throttled page when Spotify starts rejecting API calls — instead
// of only finding out via per-search 502 pages when an admin happens to
// search. Mints a token and makes one cheap search call:
//   • not configured        → stay silent (unused integration adds no noise)
//   • 200                   → healthy (logged by the watcher, never paged)
//   • 403 premium-required  → rejected, naming the Premium-lapse fix
//   • 401/other 403         → rejected (creds revoked / auth rejected)
//   • token-mint failure,
//     429/5xx, network      → transient (logged, never paged)
export type SpotifyHealthProbe =
  | { kind: "not-configured" }
  | { kind: "healthy"; note?: string }
  | { kind: "rejected"; reason: string }
  | { kind: "transient"; reason: string };

export async function probeSpotifyHealth(): Promise<SpotifyHealthProbe> {
  if (!spotifyConfigured()) return { kind: "not-configured" };

  // Force a fresh token so a healthy cached token can't mask a revoked
  // credential; the probe runs twice a day so the extra mint is cheap.
  let token: string | null;
  try {
    token = await getAccessToken(true);
  } catch (e: any) {
    return { kind: "transient", reason: `token mint threw: ${e?.message ?? e}` };
  }
  if (!token) {
    // getAccessToken already retried transient token-endpoint failures and
    // logged the specifics; without the raw status here we can't tell a
    // network blip from bad creds, so log-don't-page.
    return { kind: "transient", reason: "token mint failed (see [spotify] token logs)" };
  }

  const url = `${SEARCH_URL}?q=${encodeURIComponent("a")}&type=artist&limit=1`;
  let res: Response;
  try {
    res = await fetchWithTimeout(url, { headers: { Authorization: `Bearer ${token}` } }, SEARCH_TIMEOUT_MS);
  } catch (e: any) {
    return { kind: "transient", reason: `probe fetch errored: ${e?.message ?? e}` };
  }

  if (res.ok) return { kind: "healthy", note: "token minted and Web API accepting calls" };

  const body = await res.text().catch(() => "");
  if (classifySpotifyApiError(res.status, body) === "premium_required") {
    return { kind: "rejected", reason: SPOTIFY_PREMIUM_REQUIRED_MESSAGE };
  }
  if (res.status === 401 || res.status === 403) {
    // A 401 straight after a fresh mint (or a non-premium 403 on plain
    // search) is a real auth rejection, not a stale-token race.
    return {
      kind: "rejected",
      reason: `Spotify Web API rejected the probe with HTTP ${res.status}: ${body.slice(0, 200)}`,
    };
  }
  // 429 / 5xx / anything else — transient upstream weather. Logged, never paged.
  return { kind: "transient", reason: `probe got HTTP ${res.status}: ${body.slice(0, 120)}` };
}

// Task #734 — stream-elsewhere track lookup. When Bill adds a
// credits-bearing track GoodTunes doesn't host, he pastes a Spotify
// track URL (or searches by title) and we pull back the canonical
// open.spotify.com track URL + title/artist/art so the admin form can
// prefill the SuperCredits and confirm the right track. Server-to-
// server (client-credentials), same token plumbing as artist lookup.
export type SpotifyTrackMatch = {
  id: string;
  name: string;
  spotifyUrl: string;
  artistNames: string[];
  albumName: string | null;
  artworkUrl: string | null;
  durationMs: number | null;
};

function mapSpotifyTrack(t: any): SpotifyTrackMatch | null {
  const spotifyUrl = t?.external_urls?.spotify;
  if (!t?.id || !spotifyUrl) return null;
  const artwork =
    (t?.album?.images ?? []).slice().sort((a: any, b: any) => (b.width ?? 0) - (a.width ?? 0))[0]?.url ?? null;
  return {
    id: String(t.id),
    name: String(t.name ?? ""),
    spotifyUrl: String(spotifyUrl),
    artistNames: Array.isArray(t.artists) ? t.artists.map((a: any) => String(a?.name ?? "")).filter(Boolean) : [],
    albumName: t?.album?.name ? String(t.album.name) : null,
    artworkUrl: artwork,
    durationMs: typeof t?.duration_ms === "number" ? t.duration_ms : null,
  };
}

async function fetchSpotifyJson(url: string): Promise<any | null> {
  let token = await getAccessToken();
  if (!token) return null;
  const fetchOnce = async (bearer: string) =>
    fetchWithTimeout(url, { headers: { Authorization: `Bearer ${bearer}` } }, SEARCH_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetchOnce(token);
  } catch (err) {
    console.warn("[spotify] track fetch errored", (err as Error)?.message);
    return null;
  }
  if (res.status === 401) {
    token = await getAccessToken(true);
    if (!token) return null;
    try {
      res = await fetchOnce(token);
    } catch {
      return null;
    }
  }
  if (!res.ok) {
    console.warn("[spotify] track fetch failed", res.status);
    return null;
  }
  try {
    return await res.json();
  } catch {
    return null;
  }
}

// Resolve a pasted Spotify track URL/URI to its canonical metadata.
// Accepts https://open.spotify.com/track/{id} (with optional locale
// segment + query) and spotify:track:{id}. Returns null on any failure.
export async function fetchSpotifyTrackByUrl(rawUrl: string): Promise<SpotifyTrackMatch | null> {
  const m =
    /\/track\/([A-Za-z0-9]+)/.exec(rawUrl) ||
    /spotify:track:([A-Za-z0-9]+)/.exec(rawUrl);
  const trackId = m?.[1];
  if (!trackId) return null;
  const json = await fetchSpotifyJson(`https://api.spotify.com/v1/tracks/${encodeURIComponent(trackId)}`);
  if (!json) return null;
  return mapSpotifyTrack(json);
}

// Search Spotify for tracks by free text (title, or "title artist").
// Returns the top N candidates for the admin picker.
export async function searchTrackCandidates(rawQuery: string, limit = 5): Promise<SpotifyTrackMatch[]> {
  const q = rawQuery.trim();
  if (!q) return [];
  const url = `${SEARCH_URL}?q=${encodeURIComponent(q)}&type=track&limit=${Math.min(20, Math.max(1, limit))}`;
  const json = await fetchSpotifyJson(url);
  const items = (json?.tracks?.items ?? []) as any[];
  return items.map(mapSpotifyTrack).filter((t): t is SpotifyTrackMatch => t !== null).slice(0, limit);
}

// Task #845 — per-release Spotify album deep-link resolution.
//
// Apple Music imports capture a real per-release Apple URL and (via
// Odesli, Task #843) Tidal/Deezer/Pandora. Spotify is the one big
// service Odesli doesn't reliably drive here, but we already have
// client-credentials plumbing, so we resolve the exact Spotify album URL
// with the Web API instead of falling back to a per-release search.
export type SpotifyAlbumMatch = {
  id: string;
  name: string;
  spotifyUrl: string;
  artistNames: string[];
  releaseDate: string | null;
  totalTracks: number | null;
};

function mapSpotifyAlbum(a: any): SpotifyAlbumMatch | null {
  const spotifyUrl = a?.external_urls?.spotify;
  if (!a?.id || !spotifyUrl) return null;
  return {
    id: String(a.id),
    name: String(a.name ?? ""),
    spotifyUrl: String(spotifyUrl),
    artistNames: Array.isArray(a.artists)
      ? a.artists.map((x: any) => String(x?.name ?? "")).filter(Boolean)
      : [],
    releaseDate: a?.release_date ? String(a.release_date) : null,
    totalTracks: typeof a?.total_tracks === "number" ? a.total_tracks : null,
  };
}

// Resolve the canonical open.spotify.com album URL for a release by UPC
// (exact, preferred when available) or by artist + title. Returns null
// when Spotify isn't configured, on any upstream failure, or when no
// confident match is found — callers keep the per-release search
// fallback in that case. Best-effort: never throws.
export async function resolveSpotifyAlbumUrl(
  artist: string,
  title: string,
  opts: { upc?: string | null } = {},
): Promise<string | null> {
  if (!spotifyConfigured()) return null;
  const t = (title ?? "").trim();
  if (!t) return null;
  const ar = (artist ?? "").trim();

  // UPC is an exact barcode identifier — when we have one, trust it over
  // a fuzzy name search. Spotify's search supports the `upc:` filter.
  const upc = (opts.upc ?? "").trim();
  if (upc) {
    const url = `${SEARCH_URL}?q=${encodeURIComponent(`upc:${upc}`)}&type=album&limit=1`;
    const json = await fetchSpotifyJson(url);
    const hit = ((json?.albums?.items ?? []) as any[])
      .map(mapSpotifyAlbum)
      .find((a): a is SpotifyAlbumMatch => a !== null);
    if (hit) return hit.spotifyUrl;
    // No UPC hit — fall through to the name search below.
  }

  // Field-scoped query for precision; we still verify the result
  // client-side before trusting it (Spotify's relevance ranking alone
  // will happily return a different artist's same-titled album).
  const q = ar ? `album:${t} artist:${ar}` : `album:${t}`;
  const url = `${SEARCH_URL}?q=${encodeURIComponent(q)}&type=album&limit=10`;
  const json = await fetchSpotifyJson(url);
  const rows = ((json?.albums?.items ?? []) as any[])
    .map(mapSpotifyAlbum)
    .filter((a): a is SpotifyAlbumMatch => a !== null);
  if (rows.length === 0) return null;

  const wantTitle = normalize(t);
  const titleMatches = rows.filter((a) => normalize(a.name) === wantTitle);
  if (titleMatches.length === 0) return null;

  // Without a known artist, the best we can do is the top exact-title
  // hit. With one, require an artist match so we don't link a same-named
  // album by someone else. Apple's artist string may carry featured
  // guests ("Drake feat. Rihanna") while Spotify lists only the primary
  // ("Drake"), so accept containment either way, not just equality.
  const wantArtist = normalize(ar);
  if (!wantArtist) return titleMatches[0].spotifyUrl;
  const match = titleMatches.find((a) =>
    a.artistNames.some((n) => {
      const nn = normalize(n);
      return nn.length > 0 && (nn === wantArtist || wantArtist.includes(nn) || nn.includes(wantArtist));
    }),
  );
  return match?.spotifyUrl ?? null;
}

// Batched Spotify album resolution for the discography import, where an
// artist can have dozens of releases. Bounded concurrency + a total
// wall-clock budget so a big pull can't hang the save or hammer the
// Spotify API; releases left unresolved keep the fan-side search
// fallback. Keyed by the caller-supplied `key` (the iTunes collection
// id) so results can be matched back. Best-effort: an individual failure
// just leaves that key unset.
export async function resolveSpotifyAlbumUrlsForReleases(
  items: Array<{ key: string; artist: string; title: string; upc?: string | null }>,
  opts: { concurrency?: number; totalBudgetMs?: number } = {},
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!spotifyConfigured() || items.length === 0) return out;
  const concurrency = Math.max(1, opts.concurrency ?? 3);
  const totalBudgetMs = opts.totalBudgetMs ?? 25_000;
  const deadline = Date.now() + totalBudgetMs;
  let cursor = 0;

  async function worker(): Promise<void> {
    while (cursor < items.length && Date.now() < deadline) {
      const idx = cursor++;
      const it = items[idx];
      try {
        const url = await resolveSpotifyAlbumUrl(it.artist, it.title, { upc: it.upc });
        if (url) out.set(it.key, url);
      } catch {
        /* best-effort — leave this key unresolved */
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker()),
  );
  return out;
}

