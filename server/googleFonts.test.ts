// Task #3410 — Google Fonts catalog fetch/cache tests. Hermetic: the
// network is stubbed via globalThis.fetch (repo canon — no live calls).
import { test, describe, afterEach } from "node:test";
import assert from "node:assert/strict";

import {
  buildGoogleFontsIndex,
  parseGoogleFontsMetadata,
  getGoogleFontsIndex,
  __resetGoogleFontsCacheForTests,
} from "./googleFonts";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
  __resetGoogleFontsCacheForTests();
});

const families = Array.from({ length: 150 }, (_, i) => `Family ${i}`).concat([
  "Open Sans",
  "Roboto Condensed",
]);
const payload = JSON.stringify({ familyMetadataList: families.map((family) => ({ family })) });

describe("Task #3410 — Google Fonts catalog", () => {
  test("parseGoogleFontsMetadata strips the )]}' anti-hijacking prefix", () => {
    const got = parseGoogleFontsMetadata(")]}'\n" + payload);
    assert.equal(got.length, families.length);
    assert.ok(got.includes("Open Sans"));
  });

  test("an implausibly small catalog is a failure, not a mass no-match", () => {
    assert.throws(() =>
      parseGoogleFontsMetadata(JSON.stringify({ familyMetadataList: [{ family: "Lone" }] })),
    );
  });

  test("buildGoogleFontsIndex keys by normalized family", () => {
    const index = buildGoogleFontsIndex(["Open Sans", "PT Sans"]);
    assert.equal(index.get("opensans"), "Open Sans");
    assert.equal(index.get("ptsans"), "PT Sans");
  });

  test("getGoogleFontsIndex resolves the index and caches it (one fetch)", async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls++;
      return { ok: true, text: async () => payload } as any;
    }) as any;
    const a = await getGoogleFontsIndex();
    const b = await getGoogleFontsIndex();
    assert.ok(a);
    assert.equal(a!.get("robotocondensed"), "Roboto Condensed");
    assert.equal(b, a);
    assert.equal(calls, 1);
  });

  test("catalog unreachable → null (never throws), failure negative-cached", async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls++;
      throw new Error("network down");
    }) as any;
    assert.equal(await getGoogleFontsIndex(), null);
    assert.equal(await getGoogleFontsIndex(), null);
    assert.equal(calls, 1);
  });

  test("HTTP error → null", async () => {
    globalThis.fetch = (async () => ({ ok: false, status: 503, text: async () => "" })) as any;
    assert.equal(await getGoogleFontsIndex(), null);
  });
});
