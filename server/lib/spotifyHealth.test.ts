// Task #3439 — Spotify outage self-diagnosis coverage.
//
// On 2026-08-27 Spotify suspended this app's Web API access because the app
// owner's Premium subscription lapsed: the token endpoint kept answering 200
// while every API call got 403 "Active premium subscription required for the
// owner of the app". These tests pin the classification of that state:
//   • the premium-required 403 body maps to the distinct `premium_required`
//     reason (other 4xx/5xx keep their existing reasons), and
//   • the proactive health probe maps healthy / premium-403 / unconfigured /
//     transient upstream weather to the right probe outcomes.
// All Spotify HTTP is stubbed hermetically — no network, no real credentials.
//
//   npx tsx --test server/lib/spotifyHealth.test.ts

import test, { before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";

// The client-credentials guard checks these before any fetch; set
// placeholders so lookups proceed against our stubbed fetch.
process.env.SPOTIFY_CLIENT_ID = "test-client-id";
process.env.SPOTIFY_CLIENT_SECRET = "test-client-secret";

const TOKEN_HOST = "accounts.spotify.com";
const SEARCH_HOST = "api.spotify.com";

// The verbatim body Spotify answers with while the app is suspended.
const PREMIUM_403_BODY = JSON.stringify({
  error: { status: 403, message: "Active premium subscription required for the owner of the app" },
});

function stubResponse(status: number, body: string): any {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => JSON.parse(body),
    text: async () => body,
  };
}

// Mutable per-test handler for API-host requests. The token endpoint always
// succeeds unless a test overrides `tokenHandler` — mirroring the live
// incident where token minting stayed healthy while the API rejected calls.
let apiHandler: () => any = () => stubResponse(200, JSON.stringify({ artists: { items: [] } }));
let tokenHandler: () => any = () =>
  stubResponse(200, JSON.stringify({ access_token: "stub-token", expires_in: 3600 }));

let realFetch: typeof globalThis.fetch;

before(() => {
  realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: any) => {
    const url = typeof input === "string" ? input : input?.url ?? String(input);
    const u = new URL(url);
    if (u.host === TOKEN_HOST) return tokenHandler();
    if (u.host === SEARCH_HOST) return apiHandler();
    throw new Error(`unexpected fetch in spotify health test: ${url}`);
  }) as any;
});

after(() => {
  globalThis.fetch = realFetch;
});

beforeEach(() => {
  process.env.SPOTIFY_CLIENT_ID = "test-client-id";
  process.env.SPOTIFY_CLIENT_SECRET = "test-client-secret";
  apiHandler = () => stubResponse(200, JSON.stringify({ artists: { items: [] } }));
  tokenHandler = () =>
    stubResponse(200, JSON.stringify({ access_token: "stub-token", expires_in: 3600 }));
});

// ── classifySpotifyApiError: the pure body classifier ────────────────────

test("premium-required 403 body classifies as premium_required", async () => {
  const { classifySpotifyApiError } = await import("./spotify");
  assert.equal(classifySpotifyApiError(403, PREMIUM_403_BODY), "premium_required");
});

test("a 403 WITHOUT the premium phrase stays upstream_error (e.g. /top-tracks tier 403)", async () => {
  const { classifySpotifyApiError } = await import("./spotify");
  const body = JSON.stringify({ error: { status: 403, message: "Forbidden" } });
  assert.equal(classifySpotifyApiError(403, body), "upstream_error");
});

test("other statuses keep upstream_error even if the body mentions premium", async () => {
  const { classifySpotifyApiError } = await import("./spotify");
  assert.equal(classifySpotifyApiError(400, PREMIUM_403_BODY), "upstream_error");
  assert.equal(classifySpotifyApiError(500, PREMIUM_403_BODY), "upstream_error");
});

test("spotifyLookupFailureMessage names the fix for premium_required, generic otherwise", async () => {
  const { spotifyLookupFailureMessage, SPOTIFY_PREMIUM_REQUIRED_MESSAGE } = await import("./spotify");
  assert.equal(spotifyLookupFailureMessage("premium_required"), SPOTIFY_PREMIUM_REQUIRED_MESSAGE);
  assert.match(SPOTIFY_PREMIUM_REQUIRED_MESSAGE, /Premium subscription/i);
  assert.equal(spotifyLookupFailureMessage("upstream_error"), "Spotify lookup failed.");
  assert.equal(spotifyLookupFailureMessage("no_token"), "Spotify lookup failed.");
});

// ── searchArtistCandidatesDetailed threads the reason through ────────────

test("detailed search surfaces premium_required with the upstream 403 status", async () => {
  const { searchArtistCandidatesDetailed } = await import("./spotify");
  apiHandler = () => stubResponse(403, PREMIUM_403_BODY);
  const r = await searchArtistCandidatesDetailed("Some Artist");
  assert.equal(r.ok, false);
  assert.equal((r as any).reason, "premium_required");
  assert.equal((r as any).status, 403);
});

test("a non-premium 4xx keeps the existing upstream_error reason", async () => {
  const { searchArtistCandidatesDetailed } = await import("./spotify");
  apiHandler = () => stubResponse(400, JSON.stringify({ error: { status: 400, message: "Invalid limit" } }));
  const r = await searchArtistCandidatesDetailed("Some Artist");
  assert.equal(r.ok, false);
  assert.equal((r as any).reason, "upstream_error");
  assert.equal((r as any).status, 400);
});

test("legacy simple callers still get an empty list on the premium 403 (null/empty contract unchanged)", async () => {
  const { searchArtistCandidates } = await import("./spotify");
  apiHandler = () => stubResponse(403, PREMIUM_403_BODY);
  const candidates = await searchArtistCandidates("Some Artist");
  assert.deepEqual(candidates, []);
});

// ── probeSpotifyHealth: the credential-expiry watcher's probe ────────────

test("probe: healthy token + 200 search → healthy", async () => {
  const { probeSpotifyHealth } = await import("./spotify");
  const p = await probeSpotifyHealth();
  assert.equal(p.kind, "healthy");
});

test("probe: premium-required 403 → rejected, naming the Premium cause", async () => {
  const { probeSpotifyHealth, SPOTIFY_PREMIUM_REQUIRED_MESSAGE } = await import("./spotify");
  apiHandler = () => stubResponse(403, PREMIUM_403_BODY);
  const p = await probeSpotifyHealth();
  assert.equal(p.kind, "rejected");
  assert.equal((p as any).reason, SPOTIFY_PREMIUM_REQUIRED_MESSAGE);
});

test("probe: unconfigured stays silent (not-configured)", async () => {
  const { probeSpotifyHealth } = await import("./spotify");
  delete process.env.SPOTIFY_CLIENT_ID;
  delete process.env.SPOTIFY_CLIENT_SECRET;
  const p = await probeSpotifyHealth();
  assert.equal(p.kind, "not-configured");
});

test("probe: a 5xx from the API is transient (logged, never paged)", async () => {
  const { probeSpotifyHealth } = await import("./spotify");
  // Keep every attempt failing so the client's internal transient retries
  // can't turn this into a healthy probe.
  apiHandler = () => stubResponse(502, "Bad Gateway");
  const p = await probeSpotifyHealth();
  assert.equal(p.kind, "transient");
});

test("probe: hard token-mint rejection (400 bad creds) is transient, not a page", async () => {
  const { probeSpotifyHealth } = await import("./spotify");
  tokenHandler = () => stubResponse(400, JSON.stringify({ error: "invalid_client" }));
  const p = await probeSpotifyHealth();
  assert.equal(p.kind, "transient");
});

test("probe: a non-premium API 401 after a fresh mint is rejected (auth revoked)", async () => {
  const { probeSpotifyHealth } = await import("./spotify");
  apiHandler = () => stubResponse(401, JSON.stringify({ error: { status: 401, message: "Invalid access token" } }));
  const p = await probeSpotifyHealth();
  assert.equal(p.kind, "rejected");
  assert.match((p as any).reason, /HTTP 401/);
});
