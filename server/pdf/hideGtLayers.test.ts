// Task #3307 — clean artist template copy: GT layers hidden via OC config.
import test from "node:test";
import assert from "node:assert/strict";
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRef, PDFString } from "pdf-lib";
import { hideGtLayersInPdf } from "./hideGtLayers";
import { isGtEligibleLayer } from "@shared/gtLayerNames";

async function makePdf(layerNames: string[], opts?: { on?: string[]; off?: string[] }): Promise<Buffer> {
  const doc = await PDFDocument.create();
  doc.addPage([612, 792]);
  const refs = new Map<string, PDFRef>();
  for (const name of layerNames) {
    refs.set(name, doc.context.register(doc.context.obj({ Type: "OCG", Name: PDFString.of(name) })));
  }
  const d: Record<string, unknown> = { Order: [...refs.values()] };
  if (opts?.on) d.ON = opts.on.map((n) => refs.get(n)!);
  if (opts?.off) d.OFF = opts.off.map((n) => refs.get(n)!);
  doc.catalog.set(
    PDFName.of("OCProperties"),
    doc.context.obj({ OCGs: [...refs.values()], D: doc.context.obj(d) }),
  );
  return Buffer.from(await doc.save({ useObjectStreams: false }));
}

// Reload a produced PDF and map default-config ON/OFF membership by layer name.
async function readVisibility(buf: Buffer): Promise<{ off: string[]; on: string[]; names: string[]; pages: number; box: number[] }> {
  const doc = await PDFDocument.load(new Uint8Array(buf));
  const ocProps = doc.catalog.lookupMaybe(PDFName.of("OCProperties"), PDFDict)!;
  const ocgs = ocProps.lookupMaybe(PDFName.of("OCGs"), PDFArray)!;
  const nameOf = new Map<string, string>();
  for (let i = 0; i < ocgs.size(); i++) {
    const ref = ocgs.get(i) as PDFRef;
    const g = doc.context.lookupMaybe(ref, PDFDict)!;
    const nm = g.get(PDFName.of("Name")) as PDFString;
    nameOf.set(ref.toString(), nm.decodeText());
  }
  const d = ocProps.lookupMaybe(PDFName.of("D"), PDFDict);
  const list = (key: string): string[] => {
    const arr = d?.lookupMaybe(PDFName.of(key), PDFArray);
    return arr ? arr.asArray().map((o) => nameOf.get(o.toString())!).filter(Boolean) : [];
  };
  const page = doc.getPage(0);
  const { width, height } = page.getSize();
  return { off: list("OFF"), on: list("ON"), names: [...nameOf.values()], pages: doc.getPageCount(), box: [width, height] };
}

test("GT-name eligibility is the ONE shared viewer predicate", () => {
  // Eligible — exactly what the press/artist viewers turn into toggle chips.
  for (const name of ["GT CUT LINE", "gt-bleed_area", "SAFETY AREA", "SPINE LINE", "GTX", "Front Safety LINE", "Outline of the design"]) {
    assert.equal(isGtEligibleLayer(name), true, name);
  }
  // Not eligible — plain content layers stay visible.
  for (const name of ["Layer 1", "Artwork", "Background", "Photo", "guides", "Ink KO"]) {
    assert.equal(isGtEligibleLayer(name), false, name);
  }
});

test("hides a GT-prefixed layer with no space (GTX) — viewer-contract parity", async () => {
  const src = await makePdf(["GTX", "Artwork"]);
  const out = await hideGtLayersInPdf(src);
  assert.ok(out, "GTX must be hidden, not fail-open to raw");
  const vis = await readVisibility(out!);
  assert.deepEqual(vis.off, ["GTX"]);
});

test("hides GT layers in the default OC config, keeps them present", async () => {
  const src = await makePdf(["GT CUT LINE", "GT BLEED AREA", "Artwork", "Text"]);
  const out = await hideGtLayersInPdf(src);
  assert.ok(out, "rewrite should succeed");
  const vis = await readVisibility(out!);
  assert.deepEqual(vis.off.sort(), ["GT BLEED AREA", "GT CUT LINE"]);
  // Layers are hidden, not deleted.
  assert.deepEqual(vis.names.sort(), ["Artwork", "GT BLEED AREA", "GT CUT LINE", "Text"].sort());
  // Geometry unchanged.
  assert.equal(vis.pages, 1);
  assert.deepEqual(vis.box, [612, 792]);
});

test("prunes GT refs from an explicit ON list and preserves existing OFF entries", async () => {
  const src = await makePdf(["GT SPINE LINE", "Artwork", "Hidden notes"], {
    on: ["GT SPINE LINE", "Artwork"],
    off: ["Hidden notes"],
  });
  const out = await hideGtLayersInPdf(src);
  assert.ok(out);
  const vis = await readVisibility(out!);
  assert.deepEqual(vis.on, ["Artwork"]);
  assert.deepEqual(vis.off.sort(), ["GT SPINE LINE", "Hidden notes"]);
});

test("returns null (serve raw) when there are no GT-named layers", async () => {
  const src = await makePdf(["Artwork", "Background"]);
  assert.equal(await hideGtLayersInPdf(src), null);
});

test("returns null (serve raw) when the PDF has no layers at all", async () => {
  const doc = await PDFDocument.create();
  doc.addPage([100, 100]);
  const src = Buffer.from(await doc.save());
  assert.equal(await hideGtLayersInPdf(src), null);
});

test("fails open on garbage input", async () => {
  assert.equal(await hideGtLayersInPdf(Buffer.from("not a pdf at all")), null);
  assert.equal(await hideGtLayersInPdf(Buffer.alloc(0)), null);
});
