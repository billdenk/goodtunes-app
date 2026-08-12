// Press template-spec measurement helpers, extracted from routes.ts so the
// press portal (server/pressPortal.ts) can share ONE implementation with the
// admin manufacturer-catalog routes. Behavior is byte-identical to the old
// route-local closures (Task #3011/#3030): measure an attached template PDF
// into the spec row's measured_* columns; never touch operator-entered
// fields; a broken scan records measuredError and the checks keep resolving
// on the baseline.
import { storage } from "./storage";
import {
  CompletedPdfScanner,
  fetchAndScanPdf,
  measuredBleedInches,
  type CompletedPdfScan,
} from "./validators/completedTemplate";
import { ObjectStorageService } from "./replit_integrations/object_storage/objectStorage";

const objectStorage = new ObjectStorageService();

// Task #2705 — scan a PDF already sitting in OUR object storage
// (`/objects/uploads/<id>`), streaming it through the same bounded scanner
// the paste-a-URL path uses. No SSRF surface (never fetches an external host).
export async function scanObjectPdf(objectPath: string): Promise<CompletedPdfScan> {
  const file = await objectStorage.getObjectEntityFile(objectPath);
  const scanner = new CompletedPdfScanner();
  await new Promise<void>((resolve, reject) => {
    const rs = file.createReadStream();
    rs.on("data", (chunk: Buffer) => scanner.push(chunk));
    rs.on("end", () => resolve());
    rs.on("error", (e: Error) => reject(e));
  });
  return scanner.finish();
}

const TEMPLATE_SCAN_MAX_BYTES = 300 * 1024 * 1024;

/** Stream-scan a template/test file wherever it lives (own object storage or
 *  an https URL through the SSRF-safe fetcher). Returns the scan or an error
 *  string — never throws. */
export async function scanTemplateUrl(
  url: string,
): Promise<{ scan: CompletedPdfScan | null; error: string | null }> {
  let scan: CompletedPdfScan | null = null;
  let error: string | null = null;
  try {
    if (url.startsWith("/objects/uploads/")) {
      scan = await scanObjectPdf(url);
      if (!scan.isPdf) {
        error = "The attached file isn't a PDF — only PDF templates can be measured.";
        scan = null;
      }
    } else if (/^https?:\/\//i.test(url)) {
      const fetched = await fetchAndScanPdf(url, {
        maxBytes: TEMPLATE_SCAN_MAX_BYTES,
        timeoutMs: 60_000,
      });
      if (fetched.ok) scan = fetched.scan;
      else error = fetched.error;
    } else {
      error = "Unsupported template location — upload the file or paste an https:// link.";
    }
  } catch (e: any) {
    error = e?.message ? `Couldn't measure this template: ${e.message}` : "Couldn't measure this template.";
  }
  return { scan, error };
}

// Task #3011 — measure an attached template file and persist what's in it
// (artboard dims, page count, convention observations) onto the spec row's
// measured-* columns.
export async function measureTemplateSpecRow(pressId: string, specId: string): Promise<void> {
  const row = await storage.getPressTemplateSpecById(pressId, specId);
  if (!row?.templateFileUrl) return;
  const { scan, error } = await scanTemplateUrl(row.templateFileUrl);

  if (scan) {
    // Use the FIRST page's MediaBox as the artboard (all real vendor
    // templates are uniform; a mixed-size file still records page 1).
    const first = scan.pageSizesInches[0] ?? null;
    // Task #3030 — the template's own drawn bleed line: per-side distance
    // between its trim and bleed geometry (BleedBox preferred, MediaBox
    // fallback). Null when the template carries no trim box.
    const bleedLine = measuredBleedInches(scan);
    await storage.updatePressTemplateSpecMeasured(pressId, specId, {
      measuredArtboardWInches: first ? Math.round(first.w * 10000) / 10000 : null,
      measuredArtboardHInches: first ? Math.round(first.h * 10000) / 10000 : null,
      measuredPages: scan.pageCount > 0 ? scan.pageCount : null,
      measuredBleedLineInches:
        bleedLine != null && bleedLine > 0 ? Math.round(bleedLine * 10000) / 10000 : null,
      measuredHasCmyk: scan.hasCMYK,
      measuredHasRgb: scan.hasRGB,
      measuredHasSpot: scan.hasSpot,
      measuredHasLiveText: scan.hasFontDicts,
      measuredHasEmbeddedFonts: scan.hasEmbeddedFonts,
      measuredHasDieline: scan.hasDieline,
      measuredAt: new Date(),
      measuredError: null,
    });
  } else {
    await storage.updatePressTemplateSpecMeasured(pressId, specId, {
      measuredAt: new Date(),
      measuredError: error ?? "Couldn't measure this template.",
    });
  }
}

/** Blank every measured-* column (template removed or replaced). */
export async function clearTemplateSpecMeasurements(pressId: string, specId: string): Promise<void> {
  await storage.updatePressTemplateSpecMeasured(pressId, specId, {
    measuredArtboardWInches: null,
    measuredArtboardHInches: null,
    measuredPages: null,
    measuredBleedLineInches: null,
    measuredHasCmyk: null,
    measuredHasRgb: null,
    measuredHasSpot: null,
    measuredHasLiveText: null,
    measuredHasEmbeddedFonts: null,
    measuredHasDieline: null,
    measuredAt: null,
    measuredError: null,
  });
}
