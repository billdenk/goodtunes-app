// Task #3455 — legacy manufacturing-estimate total recovery.
//
// Historical estimate PDFs uploaded before Task #2697's automatic total
// extraction carry totalCents NULL and were never activated, so the
// Payments tab silently fell back to the system-computed SKU cost (the
// CALIFORNIALAND $5,430-instead-of-$5,755 incident). The ledger read now
// lazily recovers the total from the stored PDF via
// recoverLegacyQuoteTotal. These tests pin its selection rules with an
// injected extractor (no object storage / network), plus the text
// extraction on an MRP-style estimate body.
//
//   npx tsx --test server/shopifyPlusQuoteRecovery.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  extractQuoteTotalCents,
  recoverLegacyQuoteTotal,
} from "./shopifyPlus";

const q = (id: string, fileUrl: string, totalCents: number | null) => ({
  id,
  fileUrl,
  totalCents,
});

test("recovers the newest stored-PDF row missing a total", async () => {
  const calls: string[] = [];
  const out = await recoverLegacyQuoteTotal(
    [
      q("newest", "/objects/manufacturer-quotes/a.pdf", null),
      q("older", "/objects/manufacturer-quotes/b.pdf", null),
    ],
    async (url) => {
      calls.push(url);
      return 575_500;
    },
  );
  assert.deepEqual(out, { quoteId: "newest", totalCents: 575_500 });
  assert.deepEqual(calls, ["/objects/manufacturer-quotes/a.pdf"]);
});

test("skips rows that already carry a total — they need no recovery", async () => {
  const out = await recoverLegacyQuoteTotal(
    [q("has-total", "/objects/manufacturer-quotes/a.pdf", 123_00)],
    async () => {
      throw new Error("must not extract a row that has a total");
    },
  );
  assert.equal(out, null);
});

test("skips external-link rows — only stored PDFs are parseable", async () => {
  const calls: string[] = [];
  const out = await recoverLegacyQuoteTotal(
    [
      q("external", "https://example.com/quote.pdf", null),
      q("stored", "/objects/manufacturer-quotes/b.pdf", null),
    ],
    async (url) => {
      calls.push(url);
      return 999_00;
    },
  );
  assert.deepEqual(out, { quoteId: "stored", totalCents: 999_00 });
  assert.deepEqual(calls, ["/objects/manufacturer-quotes/b.pdf"]);
});

test("an unparseable newest PDF falls through to the next candidate", async () => {
  const out = await recoverLegacyQuoteTotal(
    [
      q("newest", "/objects/manufacturer-quotes/a.pdf", null),
      q("older", "/objects/manufacturer-quotes/b.pdf", null),
    ],
    async (url) => (url.endsWith("a.pdf") ? null : 250_000),
  );
  assert.deepEqual(out, { quoteId: "older", totalCents: 250_000 });
});

test("no parseable candidate → null (system fallback stays)", async () => {
  const out = await recoverLegacyQuoteTotal(
    [
      q("a", "/objects/manufacturer-quotes/a.pdf", null),
      q("b", "/objects/manufacturer-quotes/b.pdf", null),
    ],
    async () => null,
  );
  assert.equal(out, null);
});

test("candidate scan is bounded to 3 rows", async () => {
  const calls: string[] = [];
  const rows = ["a", "b", "c", "d", "e"].map((n) =>
    q(n, `/objects/manufacturer-quotes/${n}.pdf`, null),
  );
  const out = await recoverLegacyQuoteTotal(rows, async (url) => {
    calls.push(url);
    return null;
  });
  assert.equal(out, null);
  assert.equal(calls.length, 3, "must probe at most 3 PDFs per read");
});

test("zero/negative extraction results are refused", async () => {
  const out = await recoverLegacyQuoteTotal(
    [q("a", "/objects/manufacturer-quotes/a.pdf", null)],
    async () => 0,
  );
  assert.equal(out, null);
});

// The CALIFORNIALAND incident shape: subtotal lines stack under a final
// TOTAL — the extractor must return the last total-labelled amount, not
// the setup subtotal and not the largest line item.
test("MRP-style estimate text parses to the final total ($5,755.00 → 575500)", () => {
  const text = [
    "Memphis Record Pressing — Estimate",
    "Setup costs ......... $1,295.00",
    "Unit subtotal ....... $4,460.00",
    "TOTAL ............... $5,755.00",
  ].join("\n");
  assert.equal(extractQuoteTotalCents(text), 575_500);
});
