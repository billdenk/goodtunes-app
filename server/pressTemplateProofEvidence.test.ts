import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { PDFDocument, PDFName, PDFString, rgb } from "pdf-lib";
import {
  proofCheck,
  runHasPassingOrderedPageProof,
  validateOrderedPageProof,
} from "./pressTemplateProofEvidence";
import { analyzeServerPdfBytes, serverPagePass } from "./pressTemplateServerPageAnalysis";

const pair = (page: number, verdict: "pass" | "fail" | "untested" = "pass") => ({
  page,
  template: { widthMm: 190.5, heightMm: 222.3 },
  art: { widthMm: 190.5, heightMm: 222.3 },
  effectivePpi: 300,
  color: { hasCmyk: true, hasRgb: false, hasGray: false, hasSpot: false },
  gtLayerNames: [],
  verdict,
});
const proof = (pairs = [pair(1), pair(2)]) => ({
  templatePageCount: pairs.length,
  artPageCount: pairs.length,
  pairs,
});

test("only contiguous, complete, all-pass evidence matching server artifacts validates", () => {
  assert.equal(validateOrderedPageProof(proof(), 2, 2).ok, true);
  assert.equal(validateOrderedPageProof(proof(), 1, 2).ok, false);
  assert.equal(validateOrderedPageProof(proof([pair(1), pair(3)]), 2, 2).ok, false);
  assert.equal(validateOrderedPageProof(proof([pair(1), pair(2, "fail")]), 2, 2).ok, false);
  assert.equal(
    validateOrderedPageProof(proof(), 2, 2, [{ w: 190.5, h: 222.3 }, { w: 190.5, h: 222.3 }], [{ w: 190.5, h: 222.3 }, { w: 190.5, h: 222.3 }]).ok,
    true,
  );
  assert.equal(
    validateOrderedPageProof(proof(), 2, 2, [{ w: 100, h: 100 }, { w: 100, h: 100 }], []).ok,
    false,
  );
});

test("forged aggregate true cannot replace failed or missing ordered evidence", () => {
  // certifyOnPass is intentionally absent from this validator: no client
  // boolean changes a failing/missing pair into certifiable proof.
  const failed = validateOrderedPageProof(proof([pair(1), pair(2, "fail")]), 2, 2);
  assert.equal(failed.ok, false);
  const missing = validateOrderedPageProof(undefined, 2, 2);
  assert.equal(missing.ok, false);
  assert.equal(runHasPassingOrderedPageProof([proofCheck(proof(), { ok: true })]), true);
  assert.equal(runHasPassingOrderedPageProof([proofCheck(proof(), failed)]), false);
});

test("forged all-pass facts fail when server finds low PPI, painted RGB, or referenced GT OCG", () => {
  const clean = {
    effectivePpi: 300,
    color: { hasCmyk: true, hasRgb: false, hasGray: false, hasSpot: false },
    gtLayerNames: [] as string[],
    pass: true,
  };
  const facts = (first: typeof clean) => [first, clean];
  const lowPpi = { ...clean, effectivePpi: 72, pass: false };
  const rgb = { ...clean, color: { ...clean.color, hasRgb: true }, pass: false };
  const gt = { ...clean, gtLayerNames: ["GT BLEED"], pass: false };
  for (const serverFacts of [facts(lowPpi), facts(rgb), facts(gt)]) {
    assert.equal(validateOrderedPageProof(proof(), 2, 2, [], [], serverFacts).ok, false);
  }
});

test("server independently derives all four fixture page facts", async () => {
  const bytes = await readFile("handoff/otis-final-canon-readiness-2026-09-04/test-fixtures/CenterLabels_Finished.pdf");
  const pages = await analyzeServerPdfBytes(new Uint8Array(bytes));
  assert.equal(pages.length, 4);
  for (const [index, page] of pages.entries()) {
    assert.equal(page.page, index + 1);
    assert.ok(Math.abs(page.minEffectivePpi! - 300) < 0.5);
    assert.equal(page.hasCmyk, true);
    assert.deepEqual(page.referencedGtLayerNames, []);
  }
  assert.deepEqual(pages.map((page) => page.hasRgb), [false, false, false, false]);
  assert.deepEqual(pages.map((page) => serverPagePass(page)), [true, true, true, true]);
});

test("server parser—not forged client pass—detects low PPI, painted RGB, and referenced GT", async () => {
  const rgbDoc = await PDFDocument.create();
  const rgbPage = rgbDoc.addPage([612, 792]);
  rgbPage.drawRectangle({ x: 10, y: 10, width: 100, height: 100, color: rgb(1, 0, 0) });
  const rgbPages = await analyzeServerPdfBytes(new Uint8Array(await rgbDoc.save({ useObjectStreams: false })));
  assert.equal(rgbPages[0].hasRgb, true);
  assert.equal(serverPagePass(rgbPages[0]), false);

  // A 1×1 RGB PNG painted one inch wide is 1 PPI (and painted RGB).
  const lowDoc = await PDFDocument.create();
  const lowPage = lowDoc.addPage([612, 792]);
  const onePixelPng = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64"));
  const lowImage = await lowDoc.embedPng(onePixelPng);
  lowPage.drawImage(lowImage, { x: 10, y: 10, width: 72, height: 72 });
  const lowPages = await analyzeServerPdfBytes(new Uint8Array(await lowDoc.save({ useObjectStreams: false })));
  assert.ok(lowPages[0].minEffectivePpi! < 2);
  assert.equal(serverPagePass(lowPages[0]), false);

  const gtDoc = await PDFDocument.create();
  const gtPage = gtDoc.addPage([612, 792]);
  const gtRef = gtDoc.context.register(gtDoc.context.obj({ Type: "OCG", Name: PDFString.of("GT BLEED") }));
  gtDoc.catalog.set(PDFName.of("OCProperties"), gtDoc.context.obj({
    OCGs: [gtRef],
    D: gtDoc.context.obj({ Order: [gtRef], ON: [gtRef] }),
  }));
  gtPage.node.set(PDFName.of("Resources"), gtDoc.context.obj({ Properties: { GT1: gtRef } }));
  const gtStream = gtDoc.context.flateStream("/OC /GT1 BDC\n0 0 0 1 k\n10 10 20 20 re f\nEMC");
  gtPage.node.addContentStream(gtDoc.context.register(gtStream));
  const gtPages = await analyzeServerPdfBytes(new Uint8Array(await gtDoc.save({ useObjectStreams: false })));
  assert.deepEqual(gtPages[0].referencedGtLayerNames, ["GT BLEED"]);
  assert.equal(serverPagePass(gtPages[0]), false);
});

test("server recursively inspects Form XObjects and fails closed on cyclic forms", async () => {
  const form = (doc: PDFDocument, content: string, resources: Record<string, unknown> = {}) =>
    doc.context.register(doc.context.flateStream(content, {
      Type: "XObject", Subtype: "Form", BBox: [0, 0, 100, 100],
      ...(Object.keys(resources).length ? { Resources: resources } : {}),
    }));
  const addPageDo = (doc: PDFDocument, name: string, ref: unknown, direct = "") => {
    const page = doc.addPage([100, 100]);
    page.node.set(PDFName.of("Resources"), doc.context.obj({ XObject: { [name]: ref } }));
    page.node.addContentStream(doc.context.register(doc.context.flateStream(`${direct}\n/${name} Do`)));
  };

  const rgbFormDoc = await PDFDocument.create();
  const rgbForm = form(rgbFormDoc, "1 0 0 rg 0 0 10 10 re f");
  addPageDo(rgbFormDoc, "F1", rgbForm, "0 0 0 1 k 0 0 1 1 re f");
  const rgbFormPage = (await analyzeServerPdfBytes(new Uint8Array(await rgbFormDoc.save({ useObjectStreams: false }))))[0];
  assert.equal(rgbFormPage.hasCmyk, true);
  assert.equal(rgbFormPage.hasRgb, true);
  assert.equal(serverPagePass(rgbFormPage), false);

  const nestedDoc = await PDFDocument.create();
  const inner = form(nestedDoc, "0 0 0 1 k 0 0 10 10 re f");
  const outer = form(nestedDoc, "/Inner Do", { XObject: { Inner: inner } });
  addPageDo(nestedDoc, "Outer", outer);
  const nestedPage = (await analyzeServerPdfBytes(new Uint8Array(await nestedDoc.save({ useObjectStreams: false }))))[0];
  assert.equal(nestedPage.hasCmyk, true);
  assert.equal(nestedPage.hasRgb, false);
  assert.equal(serverPagePass(nestedPage), true);

  const cycleDoc = await PDFDocument.create();
  const a = form(cycleDoc, "/B Do");
  const b = form(cycleDoc, "/A Do", { XObject: { A: a } });
  // Complete A's cyclic resource dictionary after B exists.
  const aStream: any = cycleDoc.context.lookup(a);
  aStream.dict.set(PDFName.of("Resources"), cycleDoc.context.obj({ XObject: { B: b } }));
  addPageDo(cycleDoc, "A", a);
  const cyclicPage = (await analyzeServerPdfBytes(new Uint8Array(await cycleDoc.save({ useObjectStreams: false }))))[0];
  assert.equal(serverPagePass(cyclicPage), false);
});