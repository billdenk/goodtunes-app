// Task #3307 — clean artist template copy: rewrite a press template PDF so
// its GT guide layers (bleed/cut/spine/dieline overlays) open HIDDEN.
//
// Visibility flip ONLY — nothing is deleted. The GT optional-content groups
// (Illustrator layers) stay in the file; we add them to the default OC
// configuration's /OFF array (and prune them from /ON) so Acrobat/Illustrator
// open the file with guides toggled off, and a designer can re-enable them
// from the Layers panel. Artwork geometry, page boxes, and dimensions are
// untouched (pdf-lib re-serializes the same objects).
//
// Known limitation (documented in the artist UI): renderers that ignore PDF
// layer visibility (quick-look previews, some thumbnailers) will still show
// the guides — that is a viewer limitation, not a bad file.
//
// Fail-open contract: ANY problem (encrypted, malformed, no OC groups, no
// GT-named groups, oversized) returns null and the caller serves the raw file.

import { PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFObject, PDFRef, PDFString } from "pdf-lib";
import { isGtEligibleLayer } from "@shared/gtLayerNames";

// Press templates are typically a few MB; completed print files (350–530MB)
// never come through this path. Cap the in-memory rewrite defensively.
export const MAX_CLEAN_REWRITE_BYTES = 150 * 1024 * 1024;

export async function hideGtLayersInPdf(input: Buffer): Promise<Buffer | null> {
  try {
    if (input.length === 0 || input.length > MAX_CLEAN_REWRITE_BYTES) return null;
    const doc = await PDFDocument.load(new Uint8Array(input), { updateMetadata: false });
    const ocProps = doc.catalog.lookupMaybe(PDFName.of("OCProperties"), PDFDict);
    if (!ocProps) return null; // no layers at all — raw file is already clean
    const ocgs = ocProps.lookupMaybe(PDFName.of("OCGs"), PDFArray);
    if (!ocgs) return null;

    // Collect the OCG refs whose /Name matches the shared GT guide grammar.
    const gtRefs: PDFRef[] = [];
    for (let i = 0; i < ocgs.size(); i++) {
      const el = ocgs.get(i);
      if (!(el instanceof PDFRef)) continue;
      const group = doc.context.lookupMaybe(el, PDFDict);
      const nameObj = group?.get(PDFName.of("Name"));
      const name =
        nameObj instanceof PDFString || nameObj instanceof PDFHexString ? nameObj.decodeText() : null;
      if (name && isGtEligibleLayer(name)) gtRefs.push(el);
    }
    if (gtRefs.length === 0) return null; // nothing to hide — serve raw

    // Default configuration dict /D — create if the producer omitted it.
    let d = ocProps.lookupMaybe(PDFName.of("D"), PDFDict);
    if (!d) {
      d = doc.context.obj({}) as PDFDict;
      ocProps.set(PDFName.of("D"), d);
    }
    const gtKeys = new Set(gtRefs.map((r) => r.toString()));

    // Prune GT refs from /ON (an explicit ON would override BaseState/OFF).
    const on = d.lookupMaybe(PDFName.of("ON"), PDFArray);
    if (on) {
      const kept = on.asArray().filter((o: PDFObject) => !(o instanceof PDFRef && gtKeys.has(o.toString())));
      const arr = doc.context.obj([]) as PDFArray;
      for (const k of kept) arr.push(k);
      d.set(PDFName.of("ON"), arr);
    }

    // /OFF = existing OFF entries ∪ the GT refs (deduped).
    const off = d.lookupMaybe(PDFName.of("OFF"), PDFArray);
    const offArr = doc.context.obj([]) as PDFArray;
    const seen = new Set<string>();
    if (off) {
      for (const o of off.asArray()) {
        offArr.push(o);
        if (o instanceof PDFRef) seen.add(o.toString());
      }
    }
    for (const r of gtRefs) if (!seen.has(r.toString())) offArr.push(r);
    d.set(PDFName.of("OFF"), offArr);

    const saved = await doc.save({ useObjectStreams: false });
    return Buffer.from(saved);
  } catch {
    return null; // fail open — caller serves the raw template
  }
}
