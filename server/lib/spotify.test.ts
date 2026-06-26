// Coverage for the widened Spotify candidate pool.
//
// `searchArtistCandidatesDetailed` pages Spotify's search endpoint
// (3 × 10 = a 30-candidate pool) specifically so an obscure exact-name
// artist that ranks just past the first page (e.g. "Black Canoe" at
// ~position 8-9, which Spotify's unstable ordering floats in and out of
// the first 10) still surfaces. A regression that drops the deeper-page
// paging would silently lose that artist.
//
// This test asserts the exact-name candidate is PRESENT in the pool — not
// its rank (ordering is non-deterministic upstream). The Spotify HTTP
// calls are stubbed hermetically (no network, no real credentials): we
// set placeholder client creds so `getAccessToken` proceeds, then swap
// `globalThis.fetch` to serve the token + paged search responses.
//
//   npx tsx --test server/lib/spotify.test.ts

import test, { before, after } from "node:test";
import assert from "node:assert/strict";

// Spotify's client-credentials guard checks these before any fetch; set
// placeholders so the lookup proceeds against our stubbed fetch.
process.env.SPOTIFY_CLIENT_ID = "test-client-id";
process.env.SPOTIFY_CLIENT_SECRET = "test-client-secret";

const TOKEN_HOST = "accounts.spotify.com";
const SEARCH_HOST = "api.spotify.com";

// The obscure exact-name artist we expect the widened pool to surface.
// It deliberately appears ONLY on the second page (offset=10), so a
// single first-page fetch would miss it — the test fails if paging
// regresses.
const OBSCURE_NAME = "Black Canoe";

function decoyArtist(i: number) {
  return {
    id: `decoy-${i}`,
    name: `Canoe Decoy ${i}`,
    external_urls: { spotify: `https://open.spotify.com/artist/decoy-${i}` },
    images: [{ url: `https://img/decoy-${i}.jpg`, width: 640, height: 640 }],
    popularity: 90 - i,
    followers: { total: 100000 - i },
    genres: ["folk"],
  };
}

function obscureArtist() {
  return {
    id: "obscure-black-canoe",
    name: OBSCURE_NAME,
    external_urls: { spotify: "https://open.spotify.com/artist/obscure-black-canoe" },
    images: [{ url: "https://img/black-canoe.jpg", width: 640, height: 640 }],
    // Deliberately LOW popularity so it would never win a popularity sort
    // on its own — it only survives because exact-name matches sort first.
    popularity: 3,
    followers: { total: 42 },
    genres: ["experimental"],
  };
}

// Build the paged search response. Page 0 (offset 0): a full page of 10
// decoys (so paging continues). Page 1 (offset 10): the obscure exact
// match buried among decoys. Page 2 (offset 20): a short page (stops
// paging). All names except the obscure one are non-matching.
function searchItemsForOffset(offset: number) {
  if (offset === 0) {
    return Array.from({ length: 10 }, (_, i) => decoyArtist(i));
  }
  if (offset === 10) {
    const page = Array.from({ length: 10 }, (_, i) => decoyArtist(100 + i));
    page[8] = obscureArtist(); // ~position 9 within the page
    return page;
  }
  // offset 20+: short page, no more results → paging stops.
  return [decoyArtist(200)];
}

let realFetch: typeof globalThis.fetch;

before(() => {
  realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: any, _init?: any) => {
    const url = typeof input === "string" ? input : input?.url ?? String(input);
    const u = new URL(url);
    if (u.host === TOKEN_HOST) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ access_token: "stub-token", expires_in: 3600 }),
        text: async () => "",
      } as any;
    }
    if (u.host === SEARCH_HOST) {
      const offset = Number(u.searchParams.get("offset") ?? "0");
      return {
        ok: true,
        status: 200,
        json: async () => ({ artists: { items: searchItemsForOffset(offset) } }),
        text: async () => "",
      } as any;
    }
    throw new Error(`unexpected fetch in spotify test: ${url}`);
  }) as any;
});

after(() => {
  globalThis.fetch = realFetch;
});

test("widened candidate pool surfaces an obscure exact-name artist from a deeper page", async () => {
  const { searchArtistCandidates } = await import("./spotify");
  // Default limit is 5; the exact-name match must survive the slice
  // because exact normalized-name hits sort to the front of the pool.
  const candidates = await searchArtistCandidates(OBSCURE_NAME);

  const names = candidates.map((c) => c.name);
  assert.ok(
    names.includes(OBSCURE_NAME),
    `expected the widened pool to include "${OBSCURE_NAME}" (got: ${JSON.stringify(names)})`,
  );
});

test("the obscure artist is missing from only the first page (paging is what surfaces it)", async () => {
  // Sanity check that the fixture is meaningful: the obscure artist is
  // NOT on page 0, so the only way the previous test could find it is via
  // the deeper-page paging. If this ever fails, the fixture changed and
  // the coverage above is no longer proving the widened pool.
  const page0 = searchItemsForOffset(0).map((a) => a.name);
  assert.ok(
    !page0.includes(OBSCURE_NAME),
    "fixture invariant: obscure artist must not be on the first page",
  );
});
