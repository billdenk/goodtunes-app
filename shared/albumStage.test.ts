// Task #886 — unit coverage for the album lifecycle stage rule.
//
// Pure functions with no DB dependency, so we import the real module
// directly (unlike the storage gate test, which mirrors the Drizzle
// filter). Runs with Node's built-in test runner, no extra framework:
//
//   npx tsx --test shared/albumStage.test.ts
//
// Mirrors the pattern in server/lib/dropboxCreditsImport.test.ts.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  albumStage,
  hasReachedSunset,
  isSunrisePending,
  todayISODate,
} from "./albumStage";

// A fixed "today" so the tests don't drift with the wall clock.
const TODAY = "2026-06-01";
const YESTERDAY = "2026-05-31";
const TOMORROW = "2026-06-02";

// ---------------------------------------------------------------------------
// isSunrisePending — null / today / past are live (false); future is pending.
// ---------------------------------------------------------------------------

test("isSunrisePending: null date is never pending", () => {
  assert.equal(isSunrisePending(null, TODAY), false);
});

test("isSunrisePending: undefined date is never pending", () => {
  assert.equal(isSunrisePending(undefined, TODAY), false);
});

test("isSunrisePending: empty-string date is never pending", () => {
  assert.equal(isSunrisePending("", TODAY), false);
});

test("isSunrisePending: today's date is not pending (live the moment it arrives)", () => {
  assert.equal(isSunrisePending(TODAY, TODAY), false);
});

test("isSunrisePending: a past date is not pending", () => {
  assert.equal(isSunrisePending(YESTERDAY, TODAY), false);
});

test("isSunrisePending: a future date is pending", () => {
  assert.equal(isSunrisePending(TOMORROW, TODAY), true);
});

// ---------------------------------------------------------------------------
// hasReachedSunset — null/future stay inside the window (false); today/past
// have sunset (true). Mirror image of isSunrisePending.
// ---------------------------------------------------------------------------

test("hasReachedSunset: null date has not sunset", () => {
  assert.equal(hasReachedSunset(null, TODAY), false);
});

test("hasReachedSunset: undefined date has not sunset", () => {
  assert.equal(hasReachedSunset(undefined, TODAY), false);
});

test("hasReachedSunset: empty-string date has not sunset", () => {
  assert.equal(hasReachedSunset("", TODAY), false);
});

test("hasReachedSunset: today's date has sunset (sells out the moment it arrives)", () => {
  assert.equal(hasReachedSunset(TODAY, TODAY), true);
});

test("hasReachedSunset: a past date has sunset", () => {
  assert.equal(hasReachedSunset(YESTERDAY, TODAY), true);
});

test("hasReachedSunset: a future date has not sunset yet", () => {
  assert.equal(hasReachedSunset(TOMORROW, TODAY), false);
});

// ---------------------------------------------------------------------------
// albumStage — precedence: prepping > sunset(hidden) > staged > sunset(date)
//   > released.
// ---------------------------------------------------------------------------

test("albumStage: isPrepping wins over everything (even a future date + hidden)", () => {
  assert.equal(
    albumStage(
      { isPrepping: true, isHidden: true, goodTunesReleaseDate: TOMORROW },
      TODAY,
    ),
    "prepping",
  );
});

test("albumStage: isHidden maps to sunset (when not prepping)", () => {
  assert.equal(
    albumStage(
      { isPrepping: false, isHidden: true, goodTunesReleaseDate: null },
      TODAY,
    ),
    "sunset",
  );
});

test("albumStage: isHidden maps to sunset even with a future date", () => {
  // Hidden is a hard flag that wins over the sunrise split.
  assert.equal(
    albumStage(
      { isPrepping: false, isHidden: true, goodTunesReleaseDate: TOMORROW },
      TODAY,
    ),
    "sunset",
  );
});

test("albumStage: future date (not prepping, not hidden) is staged", () => {
  assert.equal(
    albumStage(
      { isPrepping: false, isHidden: false, goodTunesReleaseDate: TOMORROW },
      TODAY,
    ),
    "staged",
  );
});

test("albumStage: null date is released", () => {
  assert.equal(
    albumStage(
      { isPrepping: false, isHidden: false, goodTunesReleaseDate: null },
      TODAY,
    ),
    "released",
  );
});

test("albumStage: today's date is released (sunrise has arrived)", () => {
  assert.equal(
    albumStage(
      { isPrepping: false, isHidden: false, goodTunesReleaseDate: TODAY },
      TODAY,
    ),
    "released",
  );
});

test("albumStage: a past date is released", () => {
  assert.equal(
    albumStage(
      { isPrepping: false, isHidden: false, goodTunesReleaseDate: YESTERDAY },
      TODAY,
    ),
    "released",
  );
});

test("albumStage: empty input (all undefined) is released", () => {
  assert.equal(albumStage({}, TODAY), "released");
});

test("albumStage: a reached sunset date sunsets a live release", () => {
  assert.equal(
    albumStage(
      {
        isPrepping: false,
        isHidden: false,
        goodTunesReleaseDate: YESTERDAY,
        streamingReleaseDate: TODAY,
      },
      TODAY,
    ),
    "sunset",
  );
});

test("albumStage: a future sunset date is still released", () => {
  assert.equal(
    albumStage(
      {
        isPrepping: false,
        isHidden: false,
        goodTunesReleaseDate: YESTERDAY,
        streamingReleaseDate: TOMORROW,
      },
      TODAY,
    ),
    "released",
  );
});

test("albumStage: a pending sunrise beats a reached sunset (staged wins)", () => {
  // Not live yet, so it can't already be sunsetting — staged takes precedence.
  assert.equal(
    albumStage(
      {
        isPrepping: false,
        isHidden: false,
        goodTunesReleaseDate: TOMORROW,
        streamingReleaseDate: YESTERDAY,
      },
      TODAY,
    ),
    "staged",
  );
});

// ---------------------------------------------------------------------------
// todayISODate — local civil date as YYYY-MM-DD, not a UTC toISOString shift.
// ---------------------------------------------------------------------------

test("todayISODate: formats from local date parts as YYYY-MM-DD", () => {
  // 2026-03-09 23:30 local — toISOString() on a negative-offset host would
  // roll forward to the 10th; todayISODate must report the local day.
  const d = new Date(2026, 2, 9, 23, 30, 0);
  assert.equal(todayISODate(d), "2026-03-09");
});

test("todayISODate: zero-pads single-digit months and days", () => {
  const d = new Date(2026, 0, 5, 12, 0, 0);
  assert.equal(todayISODate(d), "2026-01-05");
});
