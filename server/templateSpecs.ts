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
import { detectOptionsInText, type TemplateOption } from "./templateOptions";

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
  opts?: {
    /** Task #3090 — for EXTERNAL urls, also tee the fetched bytes into this
     *  local file so the caller can render a proof preview. `spooled` comes
     *  back true only when the complete file landed on disk. */
    spoolTo?: string;
  },
): Promise<{ scan: CompletedPdfScan | null; error: string | null; spooled: boolean }> {
  let scan: CompletedPdfScan | null = null;
  let error: string | null = null;
  let spooled = false;
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
        spoolTo: opts?.spoolTo,
      });
      if (fetched.ok) {
        scan = fetched.scan;
        spooled = fetched.spooled === true;
      } else error = fetched.error;
    } else {
      error = "Unsupported template location — upload the file or paste an https:// link.";
    }
  } catch (e: any) {
    error = e?.message ? `Couldn't measure this template: ${e.message}` : "Couldn't measure this template.";
  }
  return { scan, error, spooled };
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

// Task #3065 — extract the template PDF's text (pdftotext) and detect
// option-family wording ("small hole" / "large hole"). Only runs against
// files in OUR object storage (`/objects/uploads/<id>`) — pasted external
// https templates skip detection (no SSRF surface, conservative: no prompt).
// Best-effort: any failure returns [] and never blocks the attach.
const DETECT_MAX_SOURCE_BYTES = 300 * 1024 * 1024;

export async function detectTemplateOptionsForUrl(url: string): Promise<TemplateOption[]> {
  if (!url?.startsWith("/objects/uploads/")) return [];
  const fsp = await import("node:fs/promises");
  const os = await import("node:os");
  const path = await import("node:path");
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const run = promisify(execFile);
  let tmpDir: string | null = null;
  try {
    const file = await objectStorage.getObjectEntityFile(url);
    const [meta] = await file.getMetadata();
    const size = Number(meta?.size ?? 0);
    if (!Number.isFinite(size) || size <= 0 || size > DETECT_MAX_SOURCE_BYTES) return [];
    tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), "template-options-"));
    const pdfPath = path.join(tmpDir, "src.pdf");
    await file.download({ destination: pdfPath });
    const { stdout } = await run("pdftotext", ["-q", pdfPath, "-"], {
      timeout: 30_000,
      maxBuffer: 8 * 1024 * 1024,
    });
    return detectOptionsInText(stdout);
  } catch (e: any) {
    console.error("[template-options] detection failed:", e?.message ?? e);
    return [];
  } finally {
    if (tmpDir) {
      try {
        await (await import("node:fs/promises")).rm(tmpDir, { recursive: true, force: true });
      } catch {
        /* non-fatal */
      }
    }
  }
}

// Task #3090 — certification proof view: rasterize the FIRST page(s) of a
// test run's finished file so the client can draw the template's zone rings
// over the real artwork (rings always come from the TEMPLATE — this render
// is just the image under them). Same pipeline as the completed-art preview
// (pdftoppm → sharp → PNG back into object storage, public ACL) but WITHOUT
// the front-panel trim crop: the template study's rings inset from the full
// artboard edge, so the proof image must be the full page. Only ever runs
// against our own objects (`/objects/uploads/<id>`) — pasted external URLs
// get no preview and the run degrades to the checks list. Best-effort:
// returns nulls on any failure, never blocks the test run.
const RENDER_MAX_SOURCE_BYTES = 300 * 1024 * 1024;

// Helper: ask the Replit object-storage sidecar to sign a URL (same request
// shape as the routes.ts direct-upload helper).
async function signGcsUrl(
  bucketName: string,
  objectName: string,
  method: "GET" | "PUT",
  ttlSec: number,
): Promise<string> {
  const response = await fetch("http://127.0.0.1:1106/object-storage/signed-object-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      bucket_name: bucketName,
      object_name: objectName,
      method,
      expires_at: new Date(Date.now() + ttlSec * 1000).toISOString(),
    }),
  });
  if (!response.ok) throw new Error(`Failed to sign object URL: ${response.status}`);
  const { signed_url } = (await response.json()) as { signed_url: string };
  return signed_url;
}

function uploadDestination(id: string): { bucketName: string; objectName: string } {
  const privateDir = objectStorage.getPrivateObjectDir().replace(/\/$/, "");
  const trimmed = privateDir.startsWith("/") ? privateDir.slice(1) : privateDir;
  const firstSlash = trimmed.indexOf("/");
  const bucketName = firstSlash === -1 ? trimmed : trimmed.slice(0, firstSlash);
  const prefix = firstSlash === -1 ? "" : trimmed.slice(firstSlash + 1);
  const objectName = `${prefix ? `${prefix}/` : ""}uploads/${id}`;
  return { bucketName, objectName };
}

/** Rasterize page(s) of a LOCAL PDF into public object-storage PNGs. The
 *  shared core behind both intake paths (own-object download and external
 *  URL spool). Best-effort: returns nulls on any failure. */
export async function renderLocalPdfPreviews(
  pdfPath: string,
  opts: { pages: number },
): Promise<{ previewUrl: string | null; previewUrl2: string | null }> {
  const none = { previewUrl: null, previewUrl2: null };
  const fsp = await import("node:fs/promises");
  const os = await import("node:os");
  const path = await import("node:path");
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const { randomUUID } = await import("node:crypto");
  const run = promisify(execFile);
  let tmpDir: string | null = null;
  try {
    const stat = await fsp.stat(pdfPath);
    if (!stat.isFile() || stat.size <= 0 || stat.size > RENDER_MAX_SOURCE_BYTES) return none;
    tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), "template-test-preview-"));

    const sharp = (await import("sharp")).default;
    const { setObjectAclPolicy } = await import("./replit_integrations/object_storage/objectAcl");

    const storePng = async (png: Buffer): Promise<string | null> => {
      const id = `${randomUUID()}.png`;
      const { bucketName, objectName } = uploadDestination(id);
      const putUrl = await signGcsUrl(bucketName, objectName, "PUT", 900);
      const putRes = await fetch(putUrl, {
        method: "PUT",
        headers: { "Content-Type": "image/png" },
        body: png,
      });
      if (!putRes.ok) return null;
      const finalPath = `/objects/uploads/${id}`;
      const stored = await objectStorage.getObjectEntityFile(finalPath);
      try {
        await stored.setMetadata({ contentType: "image/png" });
      } catch {
        /* non-fatal */
      }
      await setObjectAclPolicy(stored, { owner: "admin", visibility: "public" });
      return finalPath;
    };

    const renderPage = async (page: number): Promise<string | null> => {
      const outBase = path.join(tmpDir!, `page${page}`);
      try {
        await run(
          "pdftoppm",
          ["-f", String(page), "-l", String(page), "-png", "-r", "96", pdfPath, outBase],
          { timeout: 60_000 },
        );
      } catch {
        return null; // e.g. the page doesn't exist
      }
      const files = await fsp.readdir(tmpDir!);
      const pageFile = files.find((f) => f.startsWith(`page${page}-`) && f.endsWith(".png"));
      if (!pageFile) return null;
      const png = await sharp(path.join(tmpDir!, pageFile))
        .resize(1200, 1200, { fit: "inside", withoutEnlargement: true })
        .png()
        .toBuffer();
      return storePng(png);
    };

    const previewUrl = await renderPage(1);
    const previewUrl2 = previewUrl && opts.pages >= 2 ? await renderPage(2) : null;
    return { previewUrl, previewUrl2 };
  } catch (e: any) {
    console.warn(`[template-test] preview render failed for ${pdfPath}:`, e?.message ?? e);
    return none;
  } finally {
    if (tmpDir) {
      try {
        await (await import("node:fs/promises")).rm(tmpDir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
  }
}

/** Own-object variant: download `/objects/uploads/<id>` to a temp file and
 *  render through the shared local-PDF core. Best-effort, never throws. */
export async function renderTestRunPreviews(
  objectPath: string,
  opts: { pages: number },
): Promise<{ previewUrl: string | null; previewUrl2: string | null }> {
  const none = { previewUrl: null, previewUrl2: null };
  if (!objectPath.startsWith("/objects/uploads/")) return none;
  const fsp = await import("node:fs/promises");
  const os = await import("node:os");
  const path = await import("node:path");
  let tmpDir: string | null = null;
  try {
    const file = await objectStorage.getObjectEntityFile(objectPath);
    const [meta] = await file.getMetadata();
    const size = Number(meta?.size ?? 0);
    if (!Number.isFinite(size) || size <= 0 || size > RENDER_MAX_SOURCE_BYTES) return none;
    tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), "template-test-src-"));
    const pdfPath = path.join(tmpDir, "src.pdf");
    await file.download({ destination: pdfPath });
    return await renderLocalPdfPreviews(pdfPath, opts);
  } catch (e: any) {
    console.warn(`[template-test] preview render failed for ${objectPath}:`, e?.message ?? e);
    return none;
  } finally {
    if (tmpDir) {
      try {
        await fsp.rm(tmpDir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
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
