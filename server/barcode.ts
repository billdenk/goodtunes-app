// Task #3248 — UPC-A barcode artwork rendering (bwip-js).
//
// Pure helpers so the route + tests share one implementation. Input is
// always a canonical 12-digit GTIN-12 (validated upstream via
// shared/upc.ts normalizeUpc); bwip-js re-verifies the check digit and
// throws on a bad number, which we surface as a 400 at the route.
//
// Standards notes:
//  • includetext renders the human-readable digits in UPC-A layout
//    (number-system + check digit flanking the guard bars).
//  • quiet zones: UPC-A requires ≥ 9 modules each side. bwip-js's
//    `quietzones` guard-bar option doesn't add whitespace, so we add
//    explicit horizontal padding in module units (paddingwidth is
//    specified in points at scale 1 ≈ modules).
//  • PNG at scale 6 with height 25.9mm ≈ 1200+ px wide — comfortably
//    print-resolution (≥ 300 dpi at 100% nominal UPC size).

import bwipjs from "bwip-js";
import { normalizeUpc } from "@shared/upc";

// UPC-A nominal bar height is 25.9 mm ≈ 1.02"; bwip-js height is in mm.
const UPC_HEIGHT_MM = 25.9;
// ≥ 9 modules of quiet zone each side (spec minimum).
const QUIET_MODULES = 10;

function bwipOpts(upc12: string) {
  return {
    bcid: "upca" as const,
    text: upc12,
    includetext: true,
    textxalign: "center" as const,
    height: UPC_HEIGHT_MM,
    paddingwidth: QUIET_MODULES,
    paddingheight: 2,
    backgroundcolor: "FFFFFF",
  };
}

/** Render a validated 12-digit UPC as an SVG string. Throws on invalid input. */
export function renderUpcSvg(upcInput: string): string {
  const v = normalizeUpc(upcInput);
  if (!v.ok) throw new Error(v.error);
  return bwipjs.toSVG(bwipOpts(v.upc12));
}

/** Render a validated 12-digit UPC as a print-resolution PNG buffer. */
export async function renderUpcPng(upcInput: string): Promise<Buffer> {
  const v = normalizeUpc(upcInput);
  if (!v.ok) throw new Error(v.error);
  // scale 12 → 12px per module: ~1380px wide overall (95 modules + quiet
  // zones), well above 300dpi at the nominal 37.3mm symbol width.
  return await bwipjs.toBuffer({ ...bwipOpts(v.upc12), scale: 12 });
}
