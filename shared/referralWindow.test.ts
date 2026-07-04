// Task #2519 — pure unit coverage for the artist→artist referral one-year
// earning window helper. No DB, no network.
//
//   TSX_TSCONFIG_PATH=tsconfig.test.json npx tsx --test shared/referralWindow.test.ts

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isReferralWindowActive,
  referralWindowEndsAt,
  REFERRAL_WINDOW_YEARS,
} from "./referralWindow";

const DAY = 24 * 60 * 60 * 1000;

test("window is exactly one year long", () => {
  assert.equal(REFERRAL_WINDOW_YEARS, 1);
  const start = new Date("2025-01-15T00:00:00.000Z");
  assert.equal(referralWindowEndsAt(start).toISOString(), "2026-01-15T00:00:00.000Z");
});

test("active inside the window, ended after it", () => {
  const start = new Date("2025-01-01T00:00:00.000Z");
  assert.equal(isReferralWindowActive(start, new Date("2025-06-01T00:00:00.000Z")), true, "mid-year is active");
  assert.equal(isReferralWindowActive(start, new Date("2025-12-31T00:00:00.000Z")), true, "day before anniversary is active");
  assert.equal(isReferralWindowActive(start, new Date("2026-01-02T00:00:00.000Z")), false, "past the anniversary is ended");
});

test("the anniversary instant itself is the exclusive boundary (ended)", () => {
  const start = new Date("2025-01-01T00:00:00.000Z");
  const end = referralWindowEndsAt(start);
  assert.equal(isReferralWindowActive(start, end), false, "at the exact end instant the window is closed");
  assert.equal(isReferralWindowActive(start, new Date(end.getTime() - 1)), true, "one ms before the end is still active");
});

test("accepts an ISO string anchor", () => {
  const recent = new Date(Date.now() - 30 * DAY).toISOString();
  const old = new Date(Date.now() - 400 * DAY).toISOString();
  assert.equal(isReferralWindowActive(recent), true, "30 days ago is active");
  assert.equal(isReferralWindowActive(old), false, "400 days ago is ended");
});

test("a null / undefined / unparseable anchor fails OPEN (active) to protect legacy referrals", () => {
  assert.equal(isReferralWindowActive(null), true);
  assert.equal(isReferralWindowActive(undefined), true);
  assert.equal(isReferralWindowActive("not-a-date"), true);
});
