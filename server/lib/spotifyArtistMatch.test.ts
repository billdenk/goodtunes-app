// Task #3193 — the credits-commit auto-enrichment and the bulk
// "Match people on Spotify" scan must never treat a punctuation-stripped
// (loose) name collision as an identity: "How???" and "$how" both loosen
// to "how" but are different artists. Auto-writing a link requires exactly
// one STRICT (punctuation-preserving) name hit.
import { test } from "node:test";
import assert from "node:assert/strict";
import { decideImportMatch, namesMatchStrict, type SpotifyArtistCandidate } from "./spotify";

const cand = (name: string, over: Partial<SpotifyArtistCandidate> = {}): SpotifyArtistCandidate => ({
  id: name,
  name,
  spotifyUrl: `https://open.spotify.com/artist/${encodeURIComponent(name)}`,
  photoUrl: null,
  popularity: 50,
  followers: 0,
  genres: [],
  latestRelease: null,
  ...over,
});

test("namesMatchStrict keeps punctuation but folds case/diacritics/whitespace", () => {
  assert.equal(namesMatchStrict("How???", "$how"), false);
  assert.equal(namesMatchStrict("How???", "how???"), true);
  assert.equal(namesMatchStrict("Beyoncé", "beyonce"), true);
  assert.equal(namesMatchStrict("  A  B ", "a b"), true);
  assert.equal(namesMatchStrict("AC/DC", "ACDC"), false);
});

test("decideImportMatch: loose-only collision is ambiguous, never auto-matched", () => {
  const r = decideImportMatch("How???", [cand("$how", { popularity: 90 })]);
  assert.equal(r.status, "ambiguous");
});

test("decideImportMatch: single strict hit auto-matches even beside loose collisions", () => {
  const r = decideImportMatch("How???", [cand("$how", { popularity: 90 }), cand("How???")]);
  assert.equal(r.status, "matched");
  assert.equal((r as any).match.name, "How???");
});

test("decideImportMatch: two strict same-name artists stay ambiguous", () => {
  const r = decideImportMatch("John Williams", [
    cand("John Williams", { id: "a" }),
    cand("John Williams", { id: "b" }),
  ]);
  assert.equal(r.status, "ambiguous");
});

test("decideImportMatch: empty pool is none", () => {
  assert.deepEqual(decideImportMatch("Anyone", []), { status: "none", candidates: [] });
});
