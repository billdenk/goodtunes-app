// Unit coverage for the fan-facing credit subtitle role filter.
//
// The credits importer snaps unclassified performers into "Other" and similar
// generic buckets. We keep those internally but strip them from fan subtitles
// so fans never see "Other" as a credit label. Real instrument and vocal roles
// must pass through unmodified.
//
// Pure function — no DOM needed. Run via Node's built-in test runner:
//   npx tsx --test client/src/lib/creditSubtitle.test.ts

import test from "node:test";
import assert from "node:assert/strict";
import { isDisplayRole } from "./creditSubtitle";

// ── isDisplayRole unit cases ─────────────────────────────────────────────────

test("isDisplayRole: 'Other' is suppressed", () => {
  assert.equal(isDisplayRole("Other"), false);
  assert.equal(isDisplayRole("other"), false);
  assert.equal(isDisplayRole("OTHER"), false);
});

test("isDisplayRole: Misc / Miscellaneous / Performer / Musician / Instrument(s) are suppressed", () => {
  assert.equal(isDisplayRole("Misc"), false);
  assert.equal(isDisplayRole("Miscellaneous"), false);
  assert.equal(isDisplayRole("Performer"), false);
  assert.equal(isDisplayRole("Musician"), false);
  assert.equal(isDisplayRole("Instrument"), false);
  assert.equal(isDisplayRole("Instruments"), false);
});

test("isDisplayRole: accessory words (pick/picks/plectrum/capo) are suppressed", () => {
  assert.equal(isDisplayRole("pick"), false);
  assert.equal(isDisplayRole("picks"), false);
  assert.equal(isDisplayRole("Picks"), false);
  assert.equal(isDisplayRole("plectrum"), false);
  assert.equal(isDisplayRole("capo"), false);
});

test("isDisplayRole: real instrument roles pass through", () => {
  assert.equal(isDisplayRole("Guitar"), true);
  assert.equal(isDisplayRole("Bass"), true);
  assert.equal(isDisplayRole("Drums"), true);
  assert.equal(isDisplayRole("Strings"), true);
  assert.equal(isDisplayRole("Piano"), true);
  assert.equal(isDisplayRole("Saxophone"), true);
  assert.equal(isDisplayRole("Violin"), true);
});

test("isDisplayRole: vocal roles pass through", () => {
  assert.equal(isDisplayRole("Lead Vocals"), true);
  assert.equal(isDisplayRole("Background Vocals"), true);
  assert.equal(isDisplayRole("Choir"), true);
  assert.equal(isDisplayRole("Vocals"), true);
});

test("isDisplayRole: empty / whitespace-only string is suppressed", () => {
  assert.equal(isDisplayRole(""), false);
  assert.equal(isDisplayRole("   "), false);
});

// ── buildAlbumCreditGroups subtitle integration ───────────────────────────────
// The aggregator in AlbumCreditsSheet joins each person's display roles into the
// subtitle. These cases mirror the task's four acceptance scenarios using the
// filter function directly (avoiding the React import from the sheet module).

function fakeRow(name: string, role: string, personId: string | null = null) {
  return { id: `${name}-${role}`, personId, name, role, person: null };
}

function aggregateSubtitle(rows: ReturnType<typeof fakeRow>[]): Map<string, string> {
  const order: string[] = [];
  const byKey = new Map<string, { name: string; roles: string[] }>();
  for (const r of rows) {
    const key = r.personId ?? `name:${r.name.trim().toLowerCase()}`;
    if (!byKey.has(key)) {
      byKey.set(key, { name: r.name, roles: [] });
      order.push(key);
    }
    const role = r.role.trim();
    const entry = byKey.get(key)!;
    if (isDisplayRole(role) && !entry.roles.includes(role)) entry.roles.push(role);
  }
  const out = new Map<string, string>();
  for (const key of order) {
    const e = byKey.get(key)!;
    out.set(e.name, e.roles.join(", "));
  }
  return out;
}

test('aggregator: "Other" + "Guitar" → subtitle is "Guitar"', () => {
  const rows = [fakeRow("Fernando", "Other", "p1"), fakeRow("Fernando", "Guitar", "p1")];
  assert.equal(aggregateSubtitle(rows).get("Fernando"), "Guitar");
});

test('aggregator: only "Other" → subtitle is empty (person still renders)', () => {
  const rows = [fakeRow("Session Hand", "Other", "p2")];
  assert.equal(aggregateSubtitle(rows).get("Session Hand"), "");
});

test('aggregator: "Lead Vocals" is preserved', () => {
  const rows = [fakeRow("Singer", "Lead Vocals", "p3")];
  assert.equal(aggregateSubtitle(rows).get("Singer"), "Lead Vocals");
});

test('aggregator: "Strings" is preserved', () => {
  const rows = [fakeRow("Violinist", "Strings", "p4")];
  assert.equal(aggregateSubtitle(rows).get("Violinist"), "Strings");
});
