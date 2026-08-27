// Task #3412 — OCR tracklist matching: found/missing/wrong-order cases,
// fuzzy tolerance for misreads, and albums with unassigned sides.
//   npx tsx --test server/validators/trackOrderOcr.test.ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  sideTracklistsFromSongs,
  matchTracklistChecks,
  assignPagesToSides,
  findTitleInWords,
  normalizeTitleText,
} from "./trackOrderOcr";
import type { OcrWordBox } from "./ocrTextSize";

/** Shorthand: turn text into confident OCR word boxes on a page. */
function words(texts: string[], page = 1, conf = 90): OcrWordBox[] {
  return texts.map((t) => ({ text: t, conf, heightPx: 20, widthPx: 60, page }));
}

describe("sideTracklistsFromSongs", () => {
  it("groups by side in vinyl running order", () => {
    const sides = sideTracklistsFromSongs([
      { title: "Closer", vinylSide: "B", vinylOrder: 2 },
      { title: "Opener", vinylSide: "A", vinylOrder: 1 },
      { title: "Middle", vinylSide: "A", vinylOrder: 2 },
      { title: "Ender", vinylSide: "B", vinylOrder: 1 },
    ]);
    assert.deepEqual(sides, [
      { side: "A", titles: ["Opener", "Middle"] },
      { side: "B", titles: ["Ender", "Closer"] },
    ]);
  });

  it("skips songs with no side/order and yields [] for unassigned albums", () => {
    assert.deepEqual(
      sideTracklistsFromSongs([
        { title: "Loose One", vinylSide: null, vinylOrder: null },
        { title: "Another", vinylSide: undefined, vinylOrder: undefined },
      ]),
      [],
    );
    // Side without order (inconsistent row) is skipped too.
    assert.deepEqual(sideTracklistsFromSongs([{ title: "X1", vinylSide: "A", vinylOrder: null }]), []);
  });
});

describe("normalizeTitleText / findTitleInWords", () => {
  it("normalizes case, punctuation, diacritics", () => {
    assert.equal(normalizeTitleText("Don't Stop (Reprise)!"), "don t stop reprise");
    assert.equal(normalizeTitleText("Café Días"), "cafe dias");
  });

  it("finds a multi-word title even when OCR splits differ", () => {
    const seq = words(["1.", "Golden", "Hour", "2.", "Nightbird"]).map((w, i) => ({
      norm: normalizeTitleText(w.text).replace(/ /g, ""),
      page: w.page,
      index: i,
    }));
    const hit = findTitleInWords("Golden Hour", seq.filter((s) => s.norm));
    assert.ok(hit);
  });

  it("does not fuzzy-match very short titles to noise", () => {
    const seq = [{ norm: "gone", page: 1, index: 0 }];
    assert.equal(findTitleInWords("Go", seq), null);
  });
});

describe("matchTracklistChecks", () => {
  const SIDES = [
    { side: "A", titles: ["Golden Hour", "Nightbird", "Last Light"] },
    { side: "B", titles: ["Undertow", "Homeward"] },
  ];

  it("all titles present in order → single pass advisory row", () => {
    const w = [
      ...words(["SIDE", "A", "1.", "Golden", "Hour", "2.", "Nightbird", "3.", "Last", "Light"], 1),
      ...words(["SIDE", "B", "1.", "Undertow", "2.", "Homeward"], 2),
    ];
    const rows = matchTracklistChecks(w, SIDES);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].key, "art.tracklist_ocr");
    assert.equal(rows[0].status, "pass");
    assert.equal(rows[0].tier, "advisory");
    assert.match(rows[0].message, /All 5 track titles/);
  });

  it("fuzzy-matches an OCR misread of a title", () => {
    const w = [
      ...words(["Golden", "Hovr", "Nightbird", "Last", "Light"], 1), // "Hour" → "Hovr"
      ...words(["Undertow", "Homeward"], 2),
    ];
    const rows = matchTracklistChecks(w, SIDES);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].status, "pass");
  });

  it("a missing title (the real-world incident) → warn row naming it", () => {
    const w = [
      ...words(["Golden", "Hour", "Last", "Light"], 1), // Nightbird missing
      ...words(["Undertow", "Homeward"], 2),
    ];
    const rows = matchTracklistChecks(w, SIDES);
    const missing = rows.find((r) => r.key === "art.tracklist_missing");
    assert.ok(missing);
    assert.equal(missing!.status, "warn");
    assert.match(missing!.message, /Nightbird/);
    // Warn-only contract: nothing ever fails.
    assert.ok(rows.every((r) => r.status !== "fail"));
  });

  it("titles printed in the OLD order → warn row flagging the order", () => {
    const w = [
      // Label lists Nightbird before Golden Hour — outdated order.
      ...words(["Nightbird", "Golden", "Hour", "Last", "Light"], 1),
      ...words(["Undertow", "Homeward"], 2),
    ];
    const rows = matchTracklistChecks(w, SIDES);
    const order = rows.find((r) => r.key === "art.tracklist_order");
    assert.ok(order);
    assert.equal(order!.status, "warn");
    assert.match(order!.message, /different order/i);
  });

  it("no assigned sides → no rows at all", () => {
    assert.deepEqual(matchTracklistChecks(words(["Anything"]), []), []);
  });

  it("no confident OCR words → no rows (never a false claim)", () => {
    assert.deepEqual(matchTracklistChecks([], SIDES), []);
    assert.deepEqual(matchTracklistChecks(words(["Golden", "Hour"], 1, 10), SIDES), []);
  });

  it("two one-track sides SWAPPED between label faces → wrong-side warn, never a pass", () => {
    const sides = [
      { side: "A", titles: ["Alpha Song"] },
      { side: "B", titles: ["Beta Song"] },
    ];
    const w = [...words(["Beta", "Song"], 1), ...words(["Alpha", "Song"], 2)];
    const rows = matchTracklistChecks(w, sides);
    const side = rows.find((r) => r.key === "art.tracklist_side");
    assert.ok(side, "swapped sides must warn");
    assert.equal(side!.status, "warn");
    assert.match(side!.message, /Alpha Song/);
    assert.match(side!.message, /Beta Song/);
    assert.ok(!rows.some((r) => r.key === "art.tracklist_ocr"), "must not also claim all-good");
  });

  it("explicit SIDE markers override positional page order", () => {
    const sides = [
      { side: "A", titles: ["Alpha Song"] },
      { side: "B", titles: ["Beta Song"] },
    ];
    // File pages are B-face first, but each page SAYS which side it is.
    const w = [
      ...words(["SIDE", "B", "Beta", "Song"], 1),
      ...words(["SIDE", "A", "Alpha", "Song"], 2),
    ];
    const rows = matchTracklistChecks(w, sides);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].key, "art.tracklist_ocr");
    assert.equal(rows[0].status, "pass");
  });

  it("assignPagesToSides: markers (incl. merged 'SideB') beat position; count-match fallback", () => {
    const sides = [
      { side: "A", titles: ["x"] },
      { side: "B", titles: ["y"] },
    ];
    const seq = (texts: string[], page: number) =>
      texts.map((t) => ({ norm: normalizeTitleText(t).replace(/ /g, ""), page }));
    const marked = assignPagesToSides([...seq(["SideB"], 1), ...seq(["side", "a"], 2)], sides);
    assert.equal(marked.get(1), "B");
    assert.equal(marked.get(2), "A");
    const positional = assignPagesToSides([...seq(["foo"], 1), ...seq(["bar"], 2)], sides);
    assert.equal(positional.get(1), "A");
    assert.equal(positional.get(2), "B");
    // Page count ≠ side count and no markers → no mapping at all.
    assert.equal(assignPagesToSides(seq(["foo"], 1), sides).size, 0);
  });

  it("the same title on BOTH sides matches each side's own face (duplicates don't cross)", () => {
    const sides = [
      { side: "A", titles: ["Reprise"] },
      { side: "B", titles: ["Reprise"] },
    ];
    const w = [...words(["Reprise"], 1), ...words(["Reprise"], 2)];
    const rows = matchTracklistChecks(w, sides);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].status, "pass");
    // …and when only ONE face prints it, the other side flags wrong-side.
    const rows2 = matchTracklistChecks(
      [...words(["Reprise"], 1), ...words(["Instrumental"], 2)],
      [
        { side: "A", titles: ["Reprise"] },
        { side: "B", titles: ["Reprise"] },
      ],
    );
    assert.ok(rows2.some((r) => r.key === "art.tracklist_side" && r.status === "warn"));
  });

  it("a title expected TWICE on one side needs two printed occurrences", () => {
    const sides = [{ side: "A", titles: ["Echo", "Echo (Reprise)"] }, { side: "B", titles: ["Basswork"] }];
    // Side A face prints "Echo" only once — the second expected entry
    // must not re-bind to the same word and claim all-good.
    const w = [...words(["Echo", "Interlude"], 1), ...words(["Basswork"], 2)];
    const rows = matchTracklistChecks(w, sides);
    const miss = rows.find((r) => r.key === "art.tracklist_missing");
    assert.ok(miss, "duplicate shortfall must warn missing");
    assert.match(miss!.message, /Echo \(Reprise\)/);
    assert.ok(!rows.some((r) => r.key === "art.tracklist_ocr"));
    // Same duplicate expected list with BOTH occurrences printed → pass.
    const rows2 = matchTracklistChecks(
      [...words(["Echo", "Echo", "Reprise"], 1), ...words(["Basswork"], 2)],
      sides,
    );
    assert.equal(rows2.length, 1);
    assert.equal(rows2[0].status, "pass");
  });

  it("partially OCR'd SIDE markers: remaining pages still bind positionally, wrong face warns", () => {
    const sides = [
      { side: "A", titles: ["Alpha Song"] },
      { side: "B", titles: ["Beta Song"] },
      { side: "C", titles: ["Gamma Song"] },
    ];
    // Only page 1's marker OCR'd ("SIDE B") — and it wrongly carries the
    // A-side title. Pages 2/3 have no readable markers but pair up with
    // the remaining sides A and C in order.
    const w = [
      ...words(["SIDE", "B", "Beta", "Song", "Alpha", "Song"], 1),
      ...words(["Interlude"], 2),
      ...words(["Gamma", "Song"], 3),
    ];
    const rows = matchTracklistChecks(w, sides);
    const side = rows.find((r) => r.key === "art.tracklist_side");
    assert.ok(side, "title on the marked wrong face must warn, not pass via whole-file fallback");
    assert.match(side!.message, /Alpha Song/);
    assert.ok(!rows.some((r) => r.key === "art.tracklist_ocr"));
  });

  it("titles never match across a page boundary", () => {
    const w = [
      ...words(["Nightbird", "Last", "Light", "Golden"], 1),
      ...words(["Hour", "Undertow", "Homeward"], 2),
    ];
    const rows = matchTracklistChecks(w, [{ side: "A", titles: ["Golden Hour"] }]);
    const missing = rows.find((r) => r.key === "art.tracklist_missing");
    assert.ok(missing, "Golden|Hour split across pages must not count as found");
  });
});
