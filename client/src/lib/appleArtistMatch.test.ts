// Task #3191 — the wrong-Apple-match regression: "How???" must never link
// (or be renamed to) "$how". Pure-function coverage for the strong-match
// classifier, the candidate picker (no fall-back-to-first), the release
// corroboration check, and the create-merge (a mismatched Apple result
// never replaces the Spotify name/photo).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  classifyAppleNameMatch,
  pickAppleCandidate,
  releasesCorroborate,
  mergeArtistIdentity,
} from "./appleArtistMatch";

// ─── classifyAppleNameMatch ───────────────────────────────────────────

test("punctuation-stripped collisions are 'loose', never 'exact' ($how vs How???)", () => {
  assert.equal(classifyAppleNameMatch("How???", "$how"), "loose");
  assert.equal(classifyAppleNameMatch("$how", "How???"), "loose");
});

test("genuine exact names still match exactly (case + diacritics folded)", () => {
  assert.equal(classifyAppleNameMatch("How???", "How???"), "exact");
  assert.equal(classifyAppleNameMatch("beyoncé", "Beyonce"), "exact");
  assert.equal(classifyAppleNameMatch("The  Band", "the band"), "exact");
});

test("unrelated names are 'none'", () => {
  assert.equal(classifyAppleNameMatch("How???", "Howard Shore"), "none");
});

// ─── pickAppleCandidate ───────────────────────────────────────────────

test("picker prefers the exact raw match over an earlier loose collision", () => {
  const res = pickAppleCandidate("How???", [{ name: "$how" }, { name: "How???" }]);
  assert.equal(res?.level, "exact");
  assert.equal(res?.candidate.name, "How???");
});

test("picker returns a 'loose' hit (needs corroboration) when no exact exists", () => {
  const res = pickAppleCandidate("How???", [{ name: "$how" }]);
  assert.equal(res?.level, "loose");
});

test("picker never falls back to the first unrelated result", () => {
  assert.equal(pickAppleCandidate("How???", [{ name: "Howard Shore" }, { name: "Howie Day" }]), null);
  assert.equal(pickAppleCandidate("How???", []), null);
});

// ─── releasesCorroborate ──────────────────────────────────────────────

test("a shared release title corroborates; absence (or no known release) does not", () => {
  assert.ok(releasesCorroborate("Wide Awake!", ["Older Stuff", "Wide Awake"]));
  assert.ok(!releasesCorroborate("Wide Awake!", ["Completely Different"]));
  assert.ok(!releasesCorroborate(null, ["Anything"]));
  assert.ok(!releasesCorroborate("", ["Anything"]));
});

// ─── mergeArtistIdentity ──────────────────────────────────────────────

test("no linked Apple result → Spotify identity passes through untouched", () => {
  const out = mergeArtistIdentity({
    pickedName: "How???",
    pickedPhotoUrl: "https://spotify.example/how.jpg",
    pickedSource: "spotify",
    apple: null,
    appleMatchLevel: null,
  });
  assert.equal(out.name, "How???");
  assert.equal(out.photoUrl, "https://spotify.example/how.jpg");
});

test("exact Apple match may supply canonical casing + fill a missing photo", () => {
  const out = mergeArtistIdentity({
    pickedName: "how???",
    pickedPhotoUrl: null,
    pickedSource: "spotify",
    apple: { name: "How???", photoUrl: "https://apple.example/how.jpg" },
    appleMatchLevel: "exact",
  });
  assert.equal(out.name, "How???");
  assert.equal(out.photoUrl, "https://apple.example/how.jpg");
});

test("corroborated (loose) Apple match NEVER rewrites the Spotify name; Spotify photo wins", () => {
  const out = mergeArtistIdentity({
    pickedName: "How???",
    pickedPhotoUrl: "https://spotify.example/how.jpg",
    pickedSource: "spotify",
    apple: { name: "$how", photoUrl: "https://apple.example/showdollar.jpg" },
    appleMatchLevel: "corroborated",
  });
  assert.equal(out.name, "How???");
  assert.equal(out.photoUrl, "https://spotify.example/how.jpg");
});

test("operator hand-pick (Task #3192) NEVER rewrites the Spotify name; Spotify photo wins", () => {
  const out = mergeArtistIdentity({
    pickedName: "How???",
    pickedPhotoUrl: "https://spotify.example/how.jpg",
    pickedSource: "spotify",
    apple: { name: "$how", photoUrl: "https://apple.example/showdollar.jpg" },
    appleMatchLevel: "operator",
  });
  assert.equal(out.name, "How???");
  assert.equal(out.photoUrl, "https://spotify.example/how.jpg");
});

test("apple-sourced picks keep preferring Apple canonical data", () => {
  const out = mergeArtistIdentity({
    pickedName: "how (from url)",
    pickedPhotoUrl: null,
    pickedSource: "apple",
    apple: { name: "How???", photoUrl: "https://apple.example/how.jpg" },
    appleMatchLevel: "exact",
  });
  assert.equal(out.name, "How???");
  assert.equal(out.photoUrl, "https://apple.example/how.jpg");
});
