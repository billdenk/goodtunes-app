// Task #3271 — white-label client estimate email (Ruby handoff e86b169).
// Pure-builder tests: one shared structure, swappable accent bundle
// (GoodTunes blue default vs MRP gold with dark button ink), fully-expanded
// numbers for the ONE prepared quantity, dark canvas via explicit
// background colors, and the copy rules (real ®, commas in dollars,
// "estimate" never "quote").
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildPressClientEstimateEmail,
  resolvePressEstimateAccent,
  PRESS_ESTIMATE_ACCENT_DEFAULT,
  type PressEstimateEmailBreakdown,
} from "./mail";
import { computeQuoteEmailBreakdown } from "@shared/quotePricing";

const BREAKDOWN: PressEstimateEmailBreakdown = {
  qty: 1000,
  unitLines: [
    { name: '12" · 140g Ruby translucent', note: "Vinyl", unitDollars: 2.3 },
    { name: "Full Color label", unitDollars: 0.25 },
    { name: "Single Jacket", unitDollars: 0.81 },
    { name: "Assembly", note: "Insert placed on top before shrink", unitDollars: 0.36 },
    { name: "Shrinkwrap", note: "Retail-ready seal", unitDollars: 0.17 },
  ],
  setupLines: [
    { name: "Lacquer cutting", dollars: 650 },
    { name: "Lacquer plating", dollars: 375 },
    { name: "Test pressing", note: "Includes 2-day domestic shipping", dollars: 175 },
    { name: "Stampers", dollars: 0 },
    { name: "Color setup fee", dollars: 95 },
  ],
  unitCost: 3.89,
  setupTotal: 1295,
  subtotal: 3890,
  total: 5185,
};

const baseOpts = {
  clientName: "Niina Soleil",
  clientEmail: "niina@example-client.test",
  estimateNo: "071526-02",
  sentAt: "2026-08-24T12:00:00Z",
  preparedBy: "Brandon Seavers",
  pressName: "Memphis Record Pressing",
  jobTitle: "Californialand",
  specLine: '12" · 140g · Ruby translucent · 1 LP',
  linkUrl: "https://my.goodtunes.music/e/abc123token",
  breakdown: BREAKDOWN,
};

test("blue default flavor: structure, expanded numbers, one filled button", () => {
  const { subject, html, text } = buildPressClientEstimateEmail(baseOpts);
  assert.equal(subject, "Your Californialand estimate from Memphis Record Pressing");
  // Fully expanded numbers for the ONE prepared quantity, commas in dollars.
  assert.match(html, /1,000 units/);
  assert.match(html, /\$5,185\.00/);
  assert.match(html, /\$3,890\.00/);
  assert.match(html, /\$3\.89/);
  assert.match(html, /Per record/);
  assert.match(html, /Setup costs/);
  assert.match(html, /Included/); // $0 setup line renders "Included"
  assert.match(html, /Pressed and packed/);
  // ONE filled action to the tokenized page.
  const buttonCount = (html.match(/Open your estimate/g) ?? []).length;
  assert.ok(buttonCount >= 1);
  assert.match(html, /\/e\/abc123token/);
  assert.match(html, /no account needed/);
  // Quiet other-run-sizes line + GoodTunes hook.
  assert.match(html, /every run size from 100 to 3,000/);
  assert.match(html, /Get this for \$0 out of pocket/);
  // Default accent is GoodTunes blue.
  assert.match(html, /#319ED8/);
  assert.ok(!html.includes("#D6A63F"));
  // Copy rules: real ®, "estimate" never "quote".
  assert.match(html, /GoodTunes®/);
  assert.ok(!/quote/i.test(html), "email body must never say 'quote'");
  assert.ok(!/quote/i.test(text));
  assert.ok(!/quote/i.test(subject));
  // Dark canvas: explicit background colors on canvas + cards.
  assert.match(html, /background-color:#111112/);
  assert.match(html, /background-color:#1c1c1e/);
  assert.match(html, /background-color:#232326/);
  // Table-based, 600px column.
  assert.match(html, /width="600"/);
  assert.match(html, /role="presentation"/);
  // Sender identity + footer platform line.
  assert.match(html, /Replies go straight to Brandon at Memphis Record Pressing/);
  assert.match(html, /Sent by GoodTunes® on behalf of Memphis Record Pressing/);
  assert.match(html, /because Brandon prepared an estimate for you/);
  // Meta block: estimate no, sent date, valid-until (+30 days).
  assert.match(html, /071526-02/);
  assert.match(html, /August 24, 2026/);
  assert.match(html, /September 23, 2026/);
});

test("MRP gold flavor from branding field — same structure, gold accent, dark button ink", () => {
  const accent = resolvePressEstimateAccent({ accent: "#D6A63F", buttonInk: "#1d1d1f" });
  assert.equal(accent.accent, "#D6A63F");
  assert.equal(accent.buttonInk, "#1d1d1f");
  assert.match(accent.tintTop, /rgba\(214,166,63/);
  const { html } = buildPressClientEstimateEmail({ ...baseOpts, accent });
  assert.match(html, /#D6A63F/);
  assert.match(html, /#1d1d1f/);
  assert.ok(!html.includes("#319ED8"));
  // Flavor is data-driven — no press-name string checks in the template.
  assert.match(html, /Estimate total/);
});

test("accent resolution: null → blue; light accent w/o explicit ink → dark ink", () => {
  assert.deepEqual(resolvePressEstimateAccent(null), PRESS_ESTIMATE_ACCENT_DEFAULT);
  assert.deepEqual(resolvePressEstimateAccent({}), PRESS_ESTIMATE_ACCENT_DEFAULT);
  assert.deepEqual(resolvePressEstimateAccent({ accent: "not-a-hex" }), PRESS_ESTIMATE_ACCENT_DEFAULT);
  const gold = resolvePressEstimateAccent({ accent: "#D6A63F" });
  assert.equal(gold.buttonInk, "#1d1d1f"); // luminance-derived
  const navy = resolvePressEstimateAccent({ accent: "#1c3b5a" });
  assert.equal(navy.buttonInk, "#ffffff");
});

test("no breakdown → totals card omitted, never partial numbers", () => {
  const { html, text } = buildPressClientEstimateEmail({ ...baseOpts, breakdown: null });
  assert.ok(!html.includes("Per record"));
  assert.ok(!html.includes("Setup costs"));
  assert.match(html, /Open your estimate/);
  assert.ok(!text.includes("Per record"));
});

test("no preparer → press-level fallbacks", () => {
  const { html } = buildPressClientEstimateEmail({ ...baseOpts, preparedBy: null });
  assert.match(html, /Replies go straight to Memphis Record Pressing\./);
  assert.match(html, /because Memphis Record Pressing prepared an estimate for you/);
  assert.ok(!html.includes("Prepared by"));
});

test("computeQuoteEmailBreakdown mirrors the builder's curve and lines", () => {
  const rows = [
    { key: "type:black", kind: "type", label: "Classic Black", pricesBySize: { '12"': 230 } },
    { key: "labels:color", kind: "labels", label: "Full Color", priceCents: 25 },
    { key: "jackets:single", kind: "jackets", label: "Single Jacket", priceCents: 81 },
    { key: "sleeves:unprinted", kind: "sleeves", label: "Unprinted", priceCents: 81 },
    { key: "service:assembly", kind: "service", label: "Assembly", priceCents: 36 },
    { key: "service:shrink", kind: "service", label: "Shrinkwrap", priceCents: 17 },
    { key: "service:cutting", kind: "service", label: "Lacquer cutting", priceCents: 65000 },
    { key: "service:plating", kind: "service", label: "Lacquer plating", priceCents: 37500 },
    { key: "service:test", kind: "service", label: "Test pressing", priceCents: 17500 },
    { key: "service:stampers", kind: "service", label: "Stampers", priceCents: 0 },
    { key: "service:colorfee", kind: "service", label: "Color setup fee", priceCents: 9500 },
  ] as any[];
  const bs = {
    sizeId: "12", discs: 1, qty: 1000, weightId: "140",
    colorName: "Classic Black", colorTierName: "Classic Black",
    jacketId: "single", sleeveId: "unprinted", labelId: "color",
    done: ["size", "discs", "weight", "ctype", "color", "jacket", "sleeve", "label", "sticker", "qty"],
  };
  const b = computeQuoteEmailBreakdown(bs as any, rows);
  assert.ok(b, "fully-priced build must produce a breakdown");
  assert.equal(b!.qty, 1000);
  // 1,000-unit tier is the curve baseline → unit prices pass through 1:1.
  const vinyl = b!.unitLines.find((l) => l.id === "vinyl")!;
  assert.equal(vinyl.unitDollars, 2.3);
  assert.match(vinyl.name, /12" · 140g Classic Black/);
  assert.equal(b!.setupTotal, 1295);
  assert.equal(b!.subtotal, b!.unitCost * 1000);
  assert.equal(b!.total, b!.subtotal + 1295);
  const stampers = b!.setupLines.find((l) => l.id === "stampers")!;
  assert.equal(stampers.dollars, 0);
  // Fail-closed: pending pricing or invalid state → null (email omits card).
  assert.equal(computeQuoteEmailBreakdown(bs as any, rows.slice(0, 3)), null);
  assert.equal(computeQuoteEmailBreakdown({ ...bs, done: [] } as any, rows), null);
  assert.equal(computeQuoteEmailBreakdown(null, rows), null);
});
