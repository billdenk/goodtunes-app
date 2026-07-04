// Unit coverage for the Apple-Music boilerplate bio matcher.
//
// Pure function, no DB dependency — import the real module directly. Runs with
// Node's built-in test runner:
//
//   npx tsx --test shared/appleMusicBio.test.ts
//
// The regression this pins: Apple serves "Listen to music by <Artist> on Apple
// Music." with a NON-BREAKING SPACE (U+00A0) between "Apple" and "Music", which
// the old ASCII-space regexes never matched. The matcher MUST stay whitespace-
// tolerant, or the boilerplate silently leaks back into stored/rendered bios.

import { test } from "node:test";
import assert from "node:assert/strict";
import { stripAppleMusicBoilerplate } from "./appleMusicBio";

const NBSP = "\u00a0"; // the actual bug
const NARROW_NBSP = "\u202f";
const THIN = "\u2009";
const MMSP = "\u205f";
const IDEOGRAPHIC = "\u3000";

test("nullish input collapses to empty string", () => {
  assert.equal(stripAppleMusicBoilerplate(null), "");
  assert.equal(stripAppleMusicBoilerplate(undefined), "");
  assert.equal(stripAppleMusicBoilerplate(""), "");
});

test("strips the plain ASCII-space boilerplate to empty", () => {
  assert.equal(
    stripAppleMusicBoilerplate("Listen to music by Miley Cyrus on Apple Music."),
    "",
  );
});

test("strips the NBSP variant (the root-cause bug) to empty", () => {
  // NBSP between Apple and Music — the exact form Apple serves.
  const bio = `Listen to music by Michael Bolton on Apple${NBSP}Music.`;
  assert.equal(stripAppleMusicBoilerplate(bio), "");
});

test("strips other Unicode-space variants between every word", () => {
  for (const sp of [NBSP, NARROW_NBSP, THIN, MMSP, IDEOGRAPHIC]) {
    const bio = `Listen${sp}to${sp}music${sp}by${sp}Pavement${sp}on${sp}Apple${sp}Music.`;
    assert.equal(
      stripAppleMusicBoilerplate(bio),
      "",
      `expected empty for U+${sp.codePointAt(0)!.toString(16)}`,
    );
  }
});

test("strips with or without the trailing period", () => {
  assert.equal(
    stripAppleMusicBoilerplate("Listen to music by Twinnie on Apple Music"),
    "",
  );
  assert.equal(
    stripAppleMusicBoilerplate(`Listen to music by Twinnie on Apple${NBSP}Music`),
    "",
  );
});

test("keeps a real bio, stripping only the embedded boilerplate sentence", () => {
  const bio = `Award-winning producer. Listen to music by Johanna Stahley on Apple${NBSP}Music. Based in Nashville.`;
  const out = stripAppleMusicBoilerplate(bio);
  assert.match(out, /Award-winning producer\./);
  assert.match(out, /Based in Nashville\./);
  assert.doesNotMatch(out, /Listen to music by/i);
  assert.doesNotMatch(out, /Apple/);
});

test("leaves a legitimate bio with no boilerplate unchanged", () => {
  const bio = "Grammy-nominated singer-songwriter from Memphis.";
  assert.equal(stripAppleMusicBoilerplate(bio), bio);
});

test("boilerplate-only bio yields no alphanumerics (richness must not count it)", () => {
  // personProfileIsRich gates on this returning falsy for boilerplate-only.
  assert.equal(stripAppleMusicBoilerplate(`Listen to music by X on Apple${NBSP}Music.`), "");
  assert.ok(!stripAppleMusicBoilerplate(`Listen to music by X on Apple${NBSP}Music.`));
});
