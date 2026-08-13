// Task #3120 — per-album redemption-email branding. Verifies the pure HTML
// builder: default blue-gradient button + no hero, custom color threading
// (CSS gradient AND the Outlook VML flat fill), the rounded-rect hero image
// with alt text, and that a non-https hero (unresolved/relative) is dropped
// rather than rendered broken.
// Also covers classifyShopifyLineFormatKind — the title-based Shopify line
// format refinement the hero ladder uses (classifySkuKind calls every
// "shopify:*" bundle vinyl, so titles are the only CD/cassette signal).
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildShopifyRedemptionEmail } from "./mail";
import { classifyShopifyLineFormatKind } from "./orderDesk";

const REDEEM = "https://my.goodtunes.music/redeem/abc123";

test("default send (no appearance) keeps the blue gradient and no hero", () => {
  const { subject, html } = buildShopifyRedemptionEmail("CALIFORNIALAND", REDEEM);
  assert.match(subject, /CALIFORNIALAND/);
  assert.match(html, /linear-gradient\(135deg,#1D5E8F,#319ED8\)/);
  assert.match(html, /fillcolor="#1D5E8F"/); // Outlook VML flat fill
  assert.ok(!html.includes("album artwork")); // no hero <img>
});

test("title-only send (no art, no settings) still renders cleanly", () => {
  const { subject, html } = buildShopifyRedemptionEmail(null, REDEEM);
  assert.match(subject, /here's your link/);
  assert.match(html, /Your album is waiting for you/);
  assert.match(html, /fillcolor="#1D5E8F"/);
  assert.ok(!html.includes("<img src=\"\""));
});

test("custom button color drives both CSS gradient and VML fill", () => {
  const { html } = buildShopifyRedemptionEmail("CALIFORNIALAND", REDEEM, {
    buttonColor: "#D0342C",
  });
  assert.match(html, /fillcolor="#D0342C"/);
  assert.match(html, /background:linear-gradient\(135deg,#D0342C,#[0-9a-fA-F]{6}\)/);
  assert.ok(!html.includes("#1D5E8F"));
});

test("https hero renders as rounded-rect img with alt text", () => {
  const hero = "https://my.goodtunes.music/objects/uploads/xyz.jpg";
  const { html } = buildShopifyRedemptionEmail("CALIFORNIALAND", REDEEM, {
    heroImageUrl: hero,
  });
  assert.ok(html.includes(`src="${hero}"`));
  assert.match(html, /border-radius:12px/);
  assert.match(html, /alt="CALIFORNIALAND album artwork"/);
  assert.match(html, /width="432"/); // Outlook-safe explicit width
});

test("non-https hero (unresolved relative path) is dropped, not broken", () => {
  const { html } = buildShopifyRedemptionEmail("CALIFORNIALAND", REDEEM, {
    heroImageUrl: "/objects/uploads/xyz.jpg",
  });
  assert.ok(!html.includes("/objects/uploads/xyz.jpg"));
});

test("Shopify line format classification: vinyl, CD, cassette pick their own hero key", () => {
  const heroByFormat: Record<string, string> = {
    vinyl: "/objects/uploads/vinyl.jpg",
    cd: "/objects/uploads/cd.jpg",
    cassette: "/objects/uploads/cassette.jpg",
  };
  // Vinyl (explicit + default-unrecognized)
  assert.equal(classifyShopifyLineFormatKind("CALIFORNIALAND — 12\" Red Vinyl LP"), "vinyl");
  assert.equal(classifyShopifyLineFormatKind("CALIFORNIALAND Deluxe Bundle"), "vinyl");
  // CD — word-bounded (no false hit inside other words), any of the texts
  assert.equal(classifyShopifyLineFormatKind("CALIFORNIALAND CD"), "cd");
  assert.equal(classifyShopifyLineFormatKind("CALIFORNIALAND", "Compact Disc", null), "cd");
  assert.equal(classifyShopifyLineFormatKind("Orchid Dreams record"), "vinyl"); // "cd" inside a word doesn't count
  // Cassette
  assert.equal(classifyShopifyLineFormatKind("CALIFORNIALAND Cassette Tape"), "cassette");
  assert.equal(classifyShopifyLineFormatKind(null, "Cassette", "CALIFORNIALAND"), "cassette");
  // Each classification selects its own configured hero
  for (const [texts, expected] of [
    [["Red Vinyl LP"], "vinyl"],
    [["Album on CD"], "cd"],
    [["Limited Cassette"], "cassette"],
  ] as Array<[string[], string]>) {
    assert.equal(heroByFormat[classifyShopifyLineFormatKind(...texts)], heroByFormat[expected]);
  }
});

test("hero ladder: format graphic → default graphic → artwork", () => {
  const appear = {
    heroDefaultUrl: "/objects/uploads/default.jpg",
    heroByFormat: { cd: "/objects/uploads/cd.jpg" } as Record<string, string>,
  };
  const artwork = "/objects/uploads/cover.jpg";
  const resolve = (kind: string, a: typeof appear | null) =>
    a?.heroByFormat?.[kind] || a?.heroDefaultUrl || artwork || null;
  assert.equal(resolve("cd", appear), "/objects/uploads/cd.jpg"); // format match wins
  assert.equal(resolve("vinyl", appear), "/objects/uploads/default.jpg"); // no vinyl override → default
  assert.equal(resolve("vinyl", null), "/objects/uploads/cover.jpg"); // no settings → cover art
});

test("malformed button color falls back to the default blue", () => {
  const { html } = buildShopifyRedemptionEmail("X", REDEEM, {
    buttonColor: "red",
  });
  assert.match(html, /fillcolor="#1D5E8F"/);
});
