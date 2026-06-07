// Coverage for Apple Pages (.pages) credits extraction.
//
// Uses Node's built-in test runner so it can run with:
//   npx tsx --test server/lib/credits.pages.test.ts
// without adding a third-party test framework to package.json.

import { test } from "node:test";
import assert from "node:assert/strict";
import AdmZip from "adm-zip";
import { detectCreditsFormat, extractCreditsText } from "./credits";

test("detectCreditsFormat recognizes .pages (and strips Dropbox query strings)", () => {
  assert.equal(detectCreditsFormat("Fernando-Perdomo-Credits-Description.pages"), "pages");
  assert.equal(
    detectCreditsFormat("https://www.dropbox.com/scl/fi/x/Credits.pages?rlkey=abc&dl=1"),
    "pages",
  );
  // Keynote / Numbers stay unsupported (out of scope).
  assert.equal(detectCreditsFormat("deck.key"), null);
  assert.equal(detectCreditsFormat("sheet.numbers"), null);
});

test("extractCreditsText reads legacy index.xml when no preview PDF is present", async () => {
  const zip = new AdmZip();
  zip.addFile(
    "index.xml",
    Buffer.from("<doc><p>Written by Fernando Perdomo. Produced by Bill.</p></doc>", "utf8"),
  );
  const text = await extractCreditsText(zip.toBuffer(), "pages");
  assert.match(text, /Fernando Perdomo/);
  assert.match(text, /Produced by Bill/);
});

test("extractCreditsText throws a clear error for a Pages bundle with no readable content", async () => {
  const zip = new AdmZip();
  zip.addFile("Metadata/DocumentIdentifier", Buffer.from("nothing", "utf8"));
  await assert.rejects(
    () => extractCreditsText(zip.toBuffer(), "pages"),
    /no embedded preview/i,
  );
});

test("extractCreditsText throws a clear error for a corrupt / non-zip .pages file", async () => {
  await assert.rejects(
    () => extractCreditsText(Buffer.from("not a real pages bundle"), "pages"),
    /corrupted|couldn't be opened/i,
  );
});
