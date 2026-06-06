// Unit coverage for the admin album editor section-completeness dots.
//
// Guards the three-state derivation (empty / in-progress / complete) that
// replaced the old "Path to press" strip, plus the two readiness flags
// that gate the relocated Go-to-Press / Push-to-Shopify affordances.
//
// Pure function, no DOM needed — runs under Node's built-in runner via tsx:
//   npx tsx --test client/src/lib/sectionCompleteness.test.ts

import test from "node:test";
import assert from "node:assert/strict";

import {
  deriveSectionCompleteness,
  rollupPreflight,
  sectionTooltip,
  type CompletenessInput,
} from "./sectionCompleteness";

function base(overrides: Partial<CompletenessInput> = {}): CompletenessInput {
  return {
    album: {
      title: "",
      artist: "",
      artwork: "",
      type: "",
      genre: "",
      goodTunesReleaseDate: "",
      sellMode: "direct",
      sellQuoteLockedAt: null,
      songs: [],
    },
    skus: [],
    validations: null,
    pressingOrder: null,
    shopifyPush: null,
    shopifyMappings: [],
    ...overrides,
  };
}

test("a brand-new album reads empty across every section", () => {
  const c = deriveSectionCompleteness(base());
  assert.equal(c.overview.state, "empty");
  assert.equal(c.sell.state, "empty");
  assert.equal(c.tracks.state, "empty");
  assert.equal(c.press.state, "empty");
  assert.equal(c.shopify.state, "empty");
  assert.equal(c.pressReadyToSend, false);
  assert.equal(c.shopifyReadyToPush, false);
});

test("overview flips to in-progress when a user field is filled but required ones remain", () => {
  const c = deriveSectionCompleteness(
    base({
      album: {
        title: "T",
        artist: "A",
        artwork: "art.jpg",
        type: "LP",
        genre: "",
        goodTunesReleaseDate: "",
        sellMode: "direct",
        sellQuoteLockedAt: null,
        songs: [],
      },
    }),
  );
  assert.equal(c.overview.state, "in-progress");
  assert.ok(c.overview.missing.includes("Genre"));
  assert.ok(c.overview.missing.includes("GoodTunes release date"));
});

test("overview is complete once every required field is set", () => {
  const c = deriveSectionCompleteness(
    base({
      album: {
        title: "T",
        artist: "A",
        artwork: "art.jpg",
        type: "LP",
        genre: "Rock",
        goodTunesReleaseDate: "2026-01-01",
        sellMode: "direct",
        sellQuoteLockedAt: null,
        songs: [],
      },
    }),
  );
  assert.equal(c.overview.state, "complete");
  assert.deepEqual(c.overview.missing, []);
});

test("package is in-progress with a SKU and complete once the quote is locked", () => {
  const withSku = deriveSectionCompleteness(
    base({ skus: [{ active: true, priceCents: 2500, plannedQuantity: 100 }] }),
  );
  assert.equal(withSku.sell.state, "in-progress");

  const locked = deriveSectionCompleteness(
    base({
      album: { ...base().album, sellQuoteLockedAt: "2026-01-01" },
      skus: [{ active: true }],
    }),
  );
  assert.equal(locked.sell.state, "complete");
});

test("digital is complete only when every track has a ready master", () => {
  const partial = deriveSectionCompleteness(
    base({
      album: {
        ...base().album,
        songs: [
          { audioUrl: "a.wav", muxStatus: "ready" },
          { audioUrl: "b.wav", muxStatus: "preparing" },
        ],
      },
    }),
  );
  assert.equal(partial.tracks.state, "in-progress");
  assert.ok(partial.tracks.missing[0].includes("1 track"));

  const done = deriveSectionCompleteness(
    base({
      album: {
        ...base().album,
        songs: [
          { audioUrl: "a.wav", muxStatus: "ready" },
          { audioUrl: "b.wav", muxStatus: "ready" },
        ],
      },
    }),
  );
  assert.equal(done.tracks.state, "complete");
});

test("rollupPreflight returns worst-case state and honors overrides", () => {
  assert.equal(rollupPreflight(null), null);
  assert.equal(rollupPreflight([{ status: "pass" }]), "pass");
  assert.equal(
    rollupPreflight([{ status: "pass" }, { status: "warn" }]),
    "warn",
  );
  assert.equal(
    rollupPreflight([{ status: "fail" }, { status: "pass" }]),
    "fail",
  );
  assert.equal(
    rollupPreflight([{ status: "fail", overrideAt: "2026-01-01" }]),
    "overridden",
  );
});

test("press is complete once an order is sent (pending/approved)", () => {
  const pending = deriveSectionCompleteness(
    base({ pressingOrder: { status: "pending" } }),
  );
  assert.equal(pending.press.state, "complete");

  const approved = deriveSectionCompleteness(
    base({ pressingOrder: { status: "approved" } }),
  );
  assert.equal(approved.press.state, "complete");
});

test("a rejected order drops press back to in-progress with a resubmit hint", () => {
  const rejected = deriveSectionCompleteness(
    base({
      album: {
        ...base().album,
        songs: [{ audioUrl: "a.wav", muxStatus: "ready" }],
      },
      validations: [{ status: "pass" }],
      pressingOrder: { status: "rejected" },
    }),
  );
  assert.equal(rejected.press.state, "in-progress");
  assert.ok(rejected.press.missing.some((m) => m.toLowerCase().includes("resubmit")));
});

test("pressReadyToSend requires every core section complete + clean preflight + masters", () => {
  const album = {
    title: "T",
    artist: "A",
    artwork: "art.jpg",
    type: "LP",
    genre: "Rock",
    goodTunesReleaseDate: "2026-01-01",
    sellMode: "direct" as const,
    sellQuoteLockedAt: "2026-01-01",
    songs: [{ audioUrl: "a.wav", muxStatus: "ready" }],
  };
  const ready = deriveSectionCompleteness(
    base({
      album,
      skus: [{ active: true }],
      validations: [{ status: "pass" }],
      pressingOrder: null,
    }),
  );
  assert.equal(ready.pressReadyToSend, true);

  // Once sent, it is no longer "ready to send".
  const sent = deriveSectionCompleteness(
    base({
      album,
      skus: [{ active: true }],
      validations: [{ status: "pass" }],
      pressingOrder: { status: "pending" },
    }),
  );
  assert.equal(sent.pressReadyToSend, false);
});

test("shopify completes on push and shopifyReadyToPush needs overview + digital", () => {
  const album = {
    title: "T",
    artist: "A",
    artwork: "art.jpg",
    type: "LP",
    genre: "Rock",
    goodTunesReleaseDate: "2026-01-01",
    sellMode: "shopify" as const,
    sellQuoteLockedAt: null,
    songs: [{ audioUrl: "a.wav", muxStatus: "ready" }],
  };
  const readyNotPushed = deriveSectionCompleteness(base({ album }));
  assert.equal(readyNotPushed.shopify.state, "in-progress");
  assert.equal(readyNotPushed.shopifyReadyToPush, true);

  const pushed = deriveSectionCompleteness(
    base({ album, shopifyPush: { push: { pushedAt: "2026-01-01" } } }),
  );
  assert.equal(pushed.shopify.state, "complete");

  const pushedViaMapping = deriveSectionCompleteness(
    base({ album, shopifyMappings: [{}] }),
  );
  assert.equal(pushedViaMapping.shopify.state, "complete");
});

test("sectionTooltip names what's missing", () => {
  const status = { state: "in-progress" as const, missing: ["Genre", "Artwork"] };
  assert.equal(
    sectionTooltip("Overview", status),
    "Overview — still needed: Genre, Artwork",
  );
  assert.equal(
    sectionTooltip("Overview", { state: "complete", missing: [] }),
    "Overview: complete",
  );
});
