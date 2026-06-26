// Task #2256 — regression guard for the press-partner tab gating in
// AdminAlbum. A press (manufacturer-role admin) views an album with
// `hideCustomers` set (AdminAlbum passes `hideCustomers: isPress`, where
// `isPress = adminRoleInfo?.role === "manufacturer"`). When it's set,
// `visibleTabsFor` must drop the operator-only Customers + Early-access
// (waitlist) tabs — a press never sees the artist's buyer roster — while
// KEEPING the Physical tab (the press's whole reason to be here). The
// customers/waitlist append hangs off one ternary
// (`opts?.hidePress || opts?.hideCustomers ? tabs : [...]`), so a refactor
// could silently re-expose the buyer roster to a press, or conflate
// hideCustomers with hidePress and hide Physical too.
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

const keys = (opts?: { hidePress?: boolean; hideCustomers?: boolean }) =>
  visibleTabsFor(DIRECT_ALBUM, opts).map((t) => t.key);

test("operator (no opts) sees Customers + Early access + Physical on a direct album", () => {
  const k = keys();
  assert.ok(k.includes("customers"), "operator sees the Customers buyer roster");
  assert.ok(k.includes("waitlist"), "operator sees the Early-access waitlist");
  assert.ok(k.includes("press"), "operator sees the Physical tab");
});

test("hideCustomers drops Customers + Early access but KEEPS Physical", () => {
  const k = keys({ hideCustomers: true });
  assert.ok(!k.includes("customers"), "a press never sees the buyer roster");
  assert.ok(!k.includes("waitlist"), "a press never sees the Early-access waitlist");
  assert.ok(k.includes("press"), "a press STILL sees the Physical tab — its reason to be here");
});

test("hidePress (artist/label partner) drops Customers, Early access AND Physical", () => {
  // The other partner path: artist/label partners get neither the buyer
  // roster nor the manufacturing tab. This pins that hideCustomers is the
  // narrower of the two and doesn't accidentally take Physical with it.
  const k = keys({ hidePress: true });
  assert.ok(!k.includes("customers"), "artist/label partner: no buyer roster");
  assert.ok(!k.includes("waitlist"), "artist/label partner: no waitlist");
  assert.ok(!k.includes("press"), "artist/label partner: no Physical tab");
});
