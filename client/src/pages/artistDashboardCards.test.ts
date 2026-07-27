// Task #2893 — the merged artist Dashboard's card contract.
//
// `buildArtistDashboardCards` is a pure function (no DOM), so this proves
// the exact NINE-card set — and the tier discipline behind it — hermetically:
//   • card order: Units, Gross, Net (artist), Orders, Fan plays, Unique
//     listeners, Completion rate, Top track, New fans;
//   • no dropped cards sneak back (Artist share, Top album, Grant plays,
//     standalone Price/unit);
//   • the Fan-plays headline is purchaser plays ONLY, with grant/preview/
//     internal spelled out on the secondary line — never a blended sum;
//   • Gross keeps its order-total base with Price/unit in the breakdown;
//   • Net keeps the cost-stack math off the per-copy product-price base.
// Also pins the artist nav registry: Overview is gone for artists while
// label/manager (out of scope) keep theirs.
//
//   GT_TEST=1 TSX_TSCONFIG_PATH=tsconfig.test.json \
//     npx tsx --test client/src/pages/artistDashboardCards.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildArtistDashboardCards, fanPlaysSubline,
  type ArtistKpis, type ArtistSalesStack,
} from "./artistDashboardCards";
import { modulesForRole } from "@/components/operator/registry";

// Distinct, sum-detectable seeds: any blend of tiers (2+11, 2+17, 2+11+17,
// 2+11+17+13 …) lands on a value no card legitimately holds.
const kpis: ArtistKpis = {
  grossCents: 123400, refundedCents: 0,
  units: 7, orders: 5, buyers: 4,
  plays: 2, completions: 1, completionRate: 0.5,
  fanListeners: 1, listeners: 3,
  previewPlays: 11, excludedPlays: 13,
  grantPlays: 17, grantCompletes: 0, grantListeners: 2,
  newFans: 23,
  topTrack: { song_id: "s1", title: "Song One", plays: "2" },
  topAlbum: { album_id: "a1", title: "Album One", revenue: "9900" },
};
const stack: ArtistSalesStack = {
  units: 7, grossCents: 100000, manufacturingCents: 20000, publishingCents: 5000,
  platformFeeCents: 10000, stripeFeeCents: 3000, netCents: 62000, pricePerUnitCents: 14286,
};

const cards = () =>
  buildArtistDashboardCards({ cur: kpis, prev: null, stack, stackPrevious: null, series: null });

test("merged Dashboard renders exactly the nine agreed cards, in order", () => {
  assert.deepEqual(
    cards().map((c) => c.testId),
    [
      "kpi-units", "kpi-gross", "kpi-net", "kpi-orders", "kpi-plays",
      "kpi-listeners", "kpi-completion", "kpi-top-track", "kpi-new-fans",
    ],
  );
  const labels = cards().map((c) => c.model.label);
  for (const gone of ["Artist share", "Top album", "Grant plays", "Price / unit"]) {
    assert.equal(labels.includes(gone), false, `dropped card "${gone}" must not come back`);
  }
});

test("fan plays headline is purchaser-only with the tier line — never a blended sum", () => {
  const plays = cards().find((c) => c.testId === "kpi-plays")!;
  assert.equal(plays.model.value, 2, "headline = fan (purchaser) plays only");
  assert.equal(plays.model.valueText, "2");
  assert.equal(
    plays.model.note,
    "1 listener · 17 grant plays · 11 previews · internal excluded",
    "secondary line spells the other tiers out",
  );
  assert.equal(fanPlaysSubline(kpis), plays.model.note);
  // The old blended count (fan+preview+grant[+internal]) appears NOWHERE.
  const blends = new Set([2 + 11, 2 + 17, 2 + 11 + 17, 2 + 11 + 17 + 13]);
  for (const c of cards()) {
    if (typeof c.model.value === "number") {
      assert.equal(blends.has(c.model.value), false, `${c.testId} holds a blended play sum`);
    }
  }
});

test("unique listeners = fan + grant listeners", () => {
  const l = cards().find((c) => c.testId === "kpi-listeners")!;
  assert.equal(l.model.value, 3, "distinct fan + grant listeners");
  assert.equal(l.model.note, "Fans + grant listeners");
});

test("gross keeps the order-total base with Price/unit in its breakdown", () => {
  const g = cards().find((c) => c.testId === "kpi-gross")!;
  assert.equal(g.model.value, 123400, "order totals incl. tax + shipping");
  assert.match(g.model.info ?? "", /tax and shipping/);
  assert.deepEqual(
    g.model.breakdown?.map((b) => ({ label: b.label, value: b.value })),
    [{ label: "Price / unit", value: 14286 }],
  );
});

test("net keeps the cost-stack math off the product-price base", () => {
  const n = cards().find((c) => c.testId === "kpi-net")!;
  assert.equal(n.model.value, 62000);
  assert.deepEqual(
    n.model.breakdown?.map((b) => b.label),
    ["Product revenue", "Manufacturing", "Publishing", "Platform fee", "Stripe fees"],
  );
  const rows = n.model.breakdown!;
  assert.equal(
    rows.reduce((s, b) => s + b.value, 0), 62000,
    "breakdown rows reconcile to the net figure",
  );
  for (const cost of rows.slice(1)) {
    assert.ok(cost.value < 0, `${cost.label} renders as a deduction`);
  }
});

test("new fans card carries the first-fan-or-grant-play definition", () => {
  const nf = cards().find((c) => c.testId === "kpi-new-fans")!;
  assert.equal(nf.model.value, 23);
  assert.equal(nf.model.note, "First fan or grant play in this window");
});

test("artist nav registry: single Dashboard, Overview gone (label/manager keep theirs)", () => {
  const artist = modulesForRole("artist");
  assert.equal(artist.some((m) => m.id === "overview"), false, "artist Overview removed");
  assert.equal(artist.filter((m) => m.id === "dashboard").length, 1, "single Dashboard entry");
  assert.equal(modulesForRole("label").some((m) => m.id === "overview"), true);
  assert.equal(modulesForRole("manager").some((m) => m.id === "overview"), true);
});
