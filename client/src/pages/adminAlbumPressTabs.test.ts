// Task #2256 / #2925 — regression guard for partner tab gating in
// AdminAlbum. The operator-only Customers + Early-access (waitlist) tabs
// are gated on an explicit `operatorTabs` flag (AdminAlbum passes
// `operatorTabs: isOperator`, the same super_admin/admin predicate the
// endpoints enforce) and FAIL CLOSED: any caller that doesn't assert
// operator-ness gets no buyer roster and no waitlist. This replaced the
// old `hidePress || hideCustomers` exclude-list, which failed OPEN — when
// Task #2578 narrowed `hidePress` to labels-only, artists silently
// regained both tabs and the Shopify reviewer hit two 403 error cards.
//
// `visibleTabsFor` is a pure function, so this imports + calls it directly
// rather than rendering the whole AdminFrame page (the delete-gating test
// covers the rendered path). It still stands up the jsdom harness because
// importing AdminAlbum pulls in the full admin component graph.
//
//   TSX_TSCONFIG_PATH=tsconfig.test.json \
//     npx tsx --test client/src/pages/adminAlbumPressTabs.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { installTestDom } from "./jsdomHarness";

// AdminAlbum imports the GoodTunes wordmark PNG (via AdminFrame) and reads
// import.meta.env; stub both before the component graph is imported.
register("./assetStubLoader.mjs", import.meta.url);
installTestDom({ url: "http://localhost/admin/albums/a1" });

const { visibleTabsFor } = await import("./AdminAlbum");

const DIRECT_ALBUM = {
  sellMode: "direct",
  sellQuoteLockedAt: "2026-01-01T00:00:00.000Z",
  isGoodTunesRelease: true,
  isPrepping: false,
};

const keys = (opts?: { hidePress?: boolean; operatorTabs?: boolean }) =>
  visibleTabsFor(DIRECT_ALBUM, opts).map((t) => t.key);

test("operator (operatorTabs) sees Customers + Early access + Physical on a direct album", () => {
  const k = keys({ operatorTabs: true });
  assert.ok(k.includes("customers"), "operator sees the Customers buyer roster");
  assert.ok(k.includes("waitlist"), "operator sees the Early-access waitlist");
  assert.ok(k.includes("press"), "operator sees the Physical tab");
});

test("no opts FAILS CLOSED: Customers + Early access hidden, Physical kept", () => {
  // A press (manufacturer) partner: no operatorTabs, no hidePress. It must
  // keep Physical (its whole reason to be here) but never see the buyer
  // roster or waitlist. Same shape covers any FUTURE partner role a caller
  // forgets to gate — absence of the flag hides the operator tabs.
  const k = keys();
  assert.ok(!k.includes("customers"), "non-operator never sees the buyer roster");
  assert.ok(!k.includes("waitlist"), "non-operator never sees the Early-access waitlist");
  assert.ok(k.includes("press"), "a press STILL sees the Physical tab — its reason to be here");
});

test("artist partner (no flags) — the exact reviewer scenario — gets neither tab", () => {
  // Task #2925 root cause: artists stopped passing hidePress (Task #2578
  // unhid Physical for them) and the old exclude-list then showed them
  // Customers + Early access, whose endpoints 403 non-operators.
  const k = keys();
  assert.ok(!k.includes("customers"), "artist: no buyer roster");
  assert.ok(!k.includes("waitlist"), "artist: no waitlist");
});

test("hidePress (label partner) drops Physical too", () => {
  const k = keys({ hidePress: true });
  assert.ok(!k.includes("customers"), "label partner: no buyer roster");
  assert.ok(!k.includes("waitlist"), "label partner: no waitlist");
  assert.ok(!k.includes("press"), "label partner: no Physical tab");
});

// Task #2428 — a shopify_plus album MUST expose the Shopify mapping tab to the
// operator. Shopify+ sells on the customer's own store, but GoodTunes still
// needs each product mapped to this album so incoming order webhooks route
// here — and that same mapping row is where the operator opts a product in to
// also mint the digital unlock + GoodDeed. If the tab is hidden, both mapping
// creation AND the per-product unlock opt-in are unreachable.
const SHOPIFY_PLUS_ALBUM = {
  sellMode: "shopify_plus",
  sellQuoteLockedAt: "2026-01-01T00:00:00.000Z",
  isGoodTunesRelease: true,
  isPrepping: false,
};

test("operator sees the Shopify mapping tab + Physical + Payments on a shopify_plus album", () => {
  const k = visibleTabsFor(SHOPIFY_PLUS_ALBUM).map((t) => t.key);
  assert.ok(k.includes("shopify"), "operator can reach the Shopify mapping surface (unlock opt-in)");
  assert.ok(k.includes("press"), "operator still sees the Physical manufacturing tab");
  assert.ok(k.includes("payments"), "operator still sees the prepaid Payments ledger");
});

test("manage_payouts partner on shopify_plus gets Payments but NOT the operator mapping tab", () => {
  // The mapping surface is operator-only; a payer-partner (hidePress) only
  // needs the Payments ledger, never the product mapping or Physical tabs.
  const k = visibleTabsFor(SHOPIFY_PLUS_ALBUM, { hidePress: true, canManagePayouts: true }).map((t) => t.key);
  assert.ok(k.includes("payments"), "payer-partner sees the Payments ledger");
  assert.ok(!k.includes("shopify"), "payer-partner does NOT see the operator mapping tab");
  assert.ok(!k.includes("press"), "payer-partner does NOT see the Physical tab");
});
