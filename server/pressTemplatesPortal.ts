// Press-portal Templates flow (Ruby handoff, handoff/press-templates/) —
// press-scoped API behind requireAdmin + requirePressScope, mounted from
// registerPressPortalRoutes. The LIVE template file + measured geometry stay
// on press_template_specs exactly as the admin manufacturer catalog wrote
// them (Task #2109/#3011/#3030); this module adds:
//   • revision history (press_template_revisions) minted on every attach,
//   • finished-file certification test runs (press_template_test_runs)
//     through the SAME engine as the album completed-template check
//     (validateCompletedComponent + rollupStatus — never a parallel
//     validator that could drift),
//   • certify: promote a passing run's revision to "certified".
// Staff can view everything; attach/archive/test/certify are Owner/Admin
// (requirePressEditor), matching every other press-portal mutation.
import type { Express, Request, Response } from "express";
import { z } from "zod";
import { storage } from "./storage";
import {
  resolveFinishedComponents,
  matchInvitedPressToVendor,
  sanitizePrintRules,
  type CompletedTemplateConfig,
  type FinishedComponentSpec,
  type JacketKind,
} from "@shared/vendorSpecs";
import { rollupStatus, type CheckResult } from "@shared/uploadValidation";
import { validateCompletedComponent, logSpotUsageFallback, measuredBleedInches, hasTrustworthyBleedBoxes, fontsCheckVerdict } from "./validators/completedTemplate";
import {
  measureTemplateSpecRow,
  clearTemplateSpecMeasurements,
  deleteMirroredTemplateObject,
  mirrorExternalTemplatePdf,
  scanPdfStream,
  scanTemplateUrl,
  detectTemplateOptionsForUrl,
  renderTestRunPreviews,
  renderTemplateSpecPreviews,
  renderUrlPreviewPages,
} from "./templateSpecs";
import {
  isKnownOptionSet,
  customSlotKeyFromName,
  iconKindForSlotName,
  CUSTOM_SLOT_KEY_RE,
  type TemplateOption,
} from "./templateOptions";
import type { PressTemplateSpec } from "@shared/schema";
import { pool } from "./db";

// Task #3066 — attach vs delete on a CUSTOM slot must be mutually exclusive:
// DELETE's "is this slot bare?" check and PUT's "does this slot exist?" check
// are both check-then-act, and the slot/spec relationship has no FK. A
// per-(press, slotKey) pg advisory lock serializes the two critical sections;
// both re-check state after acquiring it. Session-level (not xact) locks are
// used because each section spans several storage calls on pooled
// connections — the lock lives on ONE dedicated client, always released.
export function customSlotLockKey(pressId: string, slotKey: string): string {
  return `press_custom_slot:${pressId}:${slotKey}`;
}

async function withCustomSlotLock<T>(
  pressId: string,
  slotKey: string,
  fn: () => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  const key = customSlotLockKey(pressId, slotKey);
  try {
    await client.query("SELECT pg_advisory_lock(hashtextextended($1, 0))", [key]);
    try {
      return await fn();
    } finally {
      await client.query("SELECT pg_advisory_unlock(hashtextextended($1, 0))", [key]);
    }
  } finally {
    client.release();
  }
}

// Same closed vocabularies as the admin template-spec routes
// (server/routes.ts) — a portal upload can only create slots the
// completed-art resolver understands.
const FORMAT_VALUES = ["7_inch", "10_inch", "12_lp", "12_double", "cassette", "cd"] as const;
const COMPONENT_VALUES = [
  "jacket",
  "labels",
  "inner_sleeve",
  "booklet",
  "shell",
  "j_card",
  "o_card",
  "sticker",
] as const;

// Task #3065 — custom operator-defined slots ride the same spec rows with
// componentKey "custom_<slug>". The attach route verifies a matching
// press_custom_template_slots row exists (the vocabulary stays closed per
// press — a client can't invent arbitrary component keys).
const attachSchema = z.object({
  format: z.enum(FORMAT_VALUES),
  componentKey: z.union([z.enum(COMPONENT_VALUES), z.string().regex(CUSTOM_SLOT_KEY_RE)]),
  variantKey: z.string().max(64).optional().default(""),
  discCount: z.number().int().min(0).max(9).optional().default(0),
  fileUrl: z.string().min(1).max(2048),
  fileName: z.string().max(512).nullable().optional(),
});

const optionsSchema = z.object({
  options: z
    .array(z.object({ key: z.string().min(1).max(48), label: z.string().min(1).max(64) }))
    .min(2)
    .max(4)
    .nullable(),
});

const createSlotSchema = z.object({
  format: z.enum(FORMAT_VALUES),
  name: z.string().trim().min(2).max(64),
  note: z.string().trim().max(140).optional(),
});

// Task #3066 — rename keeps the slotKey stable; only display fields move.
const renameSlotSchema = z.object({
  name: z.string().trim().min(2).max(64),
  note: z.string().trim().max(140).optional(),
});

// Task #3101 — operator-entered fold/score positions + safety inset for
// templates whose PDFs carry no readable dieline guides. Fold positions are
// inches from the artboard's LEFT (X) / TOP (Y) edge (same coordinate space
// as measuredGuides); the safety inset is inches per side inside the cut
// line. Empty array / null clears a field.
const operatorGuidesSchema = z.object({
  foldXInches: z.array(z.number().min(0).max(120)).max(12).nullable().optional().default(null),
  foldYInches: z.array(z.number().min(0).max(120)).max(12).nullable().optional().default(null),
  safetyInsetInches: z.number().min(0).max(2).nullable().optional().default(null),
});

// Task #3200 — hard bound on the detached certification scan. Steps inside
// are individually bounded (60s stream scan, 60s/page rasterize), so this is
// belt-and-braces against a wedged storage stream leaving "processing" forever.
const TEST_RUN_PROCESSING_TIMEOUT_MS = 10 * 60_000;
// A run still "processing" this long after creation is orphaned (e.g. the
// instance restarted mid-scan) — the templates GET sweeps it to a readable
// error so the shelf never shows an eternal "Checking…".
const TEST_RUN_STALE_MS = 15 * 60_000;

const testSchema = z.object({
  url: z.string().min(1).max(2048),
  // Task #3200 — the scan runs in the background after the route answers,
  // so the client can't wait for the verdict and certify itself. When set,
  // a pass/warn verdict certifies the pinned live revision server-side
  // (same guards as the explicit certify route).
  certifyOnPass: z.boolean().optional(),
  fileName: z.string().max(512).nullable().optional(),
  // The template's own bleed line, read by the live-test client from the
  // template PDF's GT Bleed/Cut layer boxes — templates that draw guides in
  // GT layers (not a "does not print" dieline separation) never get a
  // measured line server-side, and without one the Bleed check fell back to
  // the ART file's meaningless PDF BleedBox and hard-failed (gogoods, Aug 16
  // 2026). Used only when the spec has no stored line; persisted as the
  // measured line so future runs and prepress agree.
  templateBleedLineInches: z.number().positive().max(2).optional(),
  // The template's cut rectangle (template coordinates, inches, top-left
  // origin), read from the same GT layers. Sheet-with-margins templates
  // (MRP jackets) place the cut line deep inside the artboard, so the
  // rendered-content bleed measurement needs the real cut geometry — the
  // validator refuses to infer it and stays "unmeasured" otherwise.
  templateCutRect: z
    .object({
      leftIn: z.number().min(0).max(60),
      topIn: z.number().min(0).max(60),
      widthIn: z.number().positive().max(60),
      heightIn: z.number().positive().max(60),
    })
    .optional(),
});

/** Mint a display revision label: R-MMDDYY (+ -2, -3… on same-day re-uploads). */
function nextRevLabel(existing: { revLabel: string }[]): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const yy = String(d.getFullYear() % 100).padStart(2, "0");
  const base = `R-${mm}${dd}${yy}`;
  const taken = new Set(existing.map((r) => r.revLabel));
  if (!taken.has(base)) return base;
  for (let i = 2; i < 100; i++) if (!taken.has(`${base}-${i}`)) return `${base}-${i}`;
  return `${base}-${Date.now() % 1000}`;
}

/** Snapshot the measured_* columns for the revision's display history. */
function measuredSnapshotOf(row: PressTemplateSpec): Record<string, unknown> {
  return {
    artboardWInches: row.measuredArtboardWInches,
    artboardHInches: row.measuredArtboardHInches,
    pages: row.measuredPages,
    bleedLineInches: row.measuredBleedLineInches,
    hasCmyk: row.measuredHasCmyk,
    hasRgb: row.measuredHasRgb,
    hasSpot: row.measuredHasSpot,
    hasLiveText: row.measuredHasLiveText,
    hasEmbeddedFonts: row.measuredHasEmbeddedFonts,
    hasDieline: row.measuredHasDieline,
    error: row.measuredError,
  };
}

/**
 * Resolve the FinishedComponentSpec for ONE catalog slot, through the same
 * resolveFinishedComponents precedence the album completed-art check uses
 * (operator edit → measured template → measured-constant baseline). Returns
 * null when the slot has no baseline the engine understands yet (cassette /
 * cd / unmapped press) — the route answers 422, never fabricates a spec.
 */
async function resolveSlotSpec(
  press: { id: string; name: string; printRules?: unknown },
  row: PressTemplateSpec,
  opts: { excludeOwnMeasured?: boolean } = {},
): Promise<FinishedComponentSpec | null> {
  // Task #3065 — custom operator-defined slots have no baseline in the
  // engine's vocabulary; their finished-file checks run against the slot's
  // OWN geometry (operator-entered artboard first, else measured from the
  // attached template). No geometry yet → null (route answers 422, never
  // fabricates a spec).
  if (row.componentKey.startsWith("custom_")) {
    const w =
      row.artboardWInches ??
      (opts.excludeOwnMeasured ? null : row.measuredArtboardWInches);
    const h =
      row.artboardHInches ??
      (opts.excludeOwnMeasured ? null : row.measuredArtboardHInches);
    if (w == null || h == null) return null;
    const bleed =
      (row.bleedLineInches ?? row.measuredBleedLineInches ?? 0) > 0
        ? (row.bleedLineInches ?? row.measuredBleedLineInches)!
        : 0;
    const slots = await storage.listPressCustomTemplateSlots(press.id);
    const slot = slots.find((s) => s.format === row.format && s.slotKey === row.componentKey);
    const pressRules = sanitizePrintRules((press as any).printRules ?? null);
    const rowRules = sanitizePrintRules(row.printRules ?? null);
    return {
      id: row.componentKey,
      label: slot?.displayName ?? "Custom template",
      templatePageInches: { w, h },
      finishedInches: { w: Math.max(0.1, w - 2 * bleed), h: Math.max(0.1, h - 2 * bleed) },
      bleedInches: bleed,
      expectedPages: row.expectedPages ?? row.measuredPages ?? 0,
      color: row.color === "cmyk-or-pms" ? "cmyk-or-pms" : "process-4c",
      minPpi: row.minPpi ?? null,
      templateFileUrl: row.templateFileUrl ?? null,
      printRules: rowRules ?? pressRules ?? null,
      pressName: press.name ?? null,
      sizeSource: row.artboardWInches != null ? "operator" : "measured",
      measuredFromLabel: row.artboardWInches != null ? null : press.name,
    } as FinishedComponentSpec;
  }
  // Name-matched presses (MRP/Hellbender/PMP/Viryl) get their measured
  // vendor baseline; any other press falls back to the "generic" vendor
  // baseline — its own catalog rows (storeRows) still override per field,
  // so a press with a measured template is checked against ITS template.
  const vendorId = matchInvitedPressToVendor(press.name) ?? "generic";
  const size =
    row.format === "7_inch"
      ? '7"'
      : row.format === "10_inch"
        ? '10"'
        : row.format === "12_lp" || row.format === "12_double"
          ? '12"'
          : null;
  if (!size) return null;
  const discs =
    row.discCount > 0 ? row.discCount : row.format === "12_double" ? 2 : 1;
  const config: CompletedTemplateConfig = {
    size,
    discs,
    jacket: (row.componentKey === "jacket" && row.variantKey ? (row.variantKey as JacketKind) : "single"),
    innerSleeves: row.componentKey === "inner_sleeve" ? "printed" : "none",
    labelColor: "process-4c",
    booklet: row.componentKey === "booklet",
  };
  let storeRows = await storage.listPressTemplateSpecs(row.pressId, row.format);
  if (opts.excludeOwnMeasured) {
    // Identity checks compare the row's measured artboard against what the
    // slot SHOULD be — the persisted measured values must not ride in as
    // the basis (the comparison would trivially match itself).
    storeRows = storeRows.map((s) =>
      s.id === row.id
        ? ({ ...s, measuredArtboardWInches: null, measuredArtboardHInches: null } as typeof s)
        : s,
    );
  }
  const resolved = resolveFinishedComponents({
    vendorId,
    config,
    storeRows,
    pressPrintRules: sanitizePrintRules((press as any).printRules ?? null),
    pressName: press.name,
  });
  const match = resolved.find((s) => {
    if (row.componentKey === "jacket") return s.id === "jacket";
    if (row.componentKey === "labels") return s.id === "labels";
    if (row.componentKey === "inner_sleeve") return s.id.startsWith("inner_sleeve");
    if (row.componentKey === "booklet") return s.id === "booklet";
    return s.id === row.componentKey;
  });
  return match ?? null;
}

/**
 * Auto-import previously uploaded template PDFs onto the Templates flow
 * (Ruby handoff, handoff/press-components/README.md "Templates
 * follow-through"). Any slot with a live template file but ZERO revision
 * rows predates the revision flow (old admin/catalog uploads). Each such
 * row is measured once, then a revision is minted:
 *   • measured cleanly + artboard plausibly matches the slot's expected
 *     finished+bleed geometry → status "pending" (imported, ready to test)
 *   • scan failed, or the measured artboard is far from what this slot
 *     should be (likely filed under the wrong component) → status "review"
 *     — queued for a quick press review (re-attach or archive resolves it).
 * A revision is minted EVEN on failure so the row is never rescanned on
 * every GET. Runs lazily from the templates GET (bounded per press,
 * best-effort — an import failure never blocks the page).
 */
export async function autoImportLegacyTemplates(
  press: { id: string; name: string; printRules?: unknown },
  specs: PressTemplateSpec[],
): Promise<boolean> {
  const withFile = specs.filter((s) => s.templateFileUrl);
  if (!withFile.length) return false;
  const revs = await storage.listPressTemplateRevisions(withFile.map((s) => s.id));
  const seen = new Set(revs.map((r) => r.specId));
  const orphans = withFile.filter((s) => !seen.has(s.id));
  if (!orphans.length) return false;

  let minted = false;
  for (const spec of orphans) {
    try {
      // Measure once if never measured (a recorded measuredError counts
      // as measured — don't rescan a known-bad file forever).
      let row = spec;
      if (row.measuredArtboardWInches == null && !row.measuredError) {
        await measureTemplateSpecRow(press.id, row.id);
        row = (await storage.getPressTemplateSpecById(press.id, row.id)) ?? row;
      }
      // Race guard (now that this runs in the background off the GET): a
      // concurrent PUT attach may have replaced the file and minted its own
      // revision while we were measuring. Reload and only import if the
      // spec still carries the SAME file and still has NO revision history —
      // otherwise the attach owns the truth and a delayed legacy import
      // would insert a stale second live revision.
      const current = await storage.getPressTemplateSpecById(press.id, spec.id);
      if (!current || current.templateFileUrl !== spec.templateFileUrl) continue;
      const nowRevs = await storage.listPressTemplateRevisions([spec.id]);
      if (nowRevs.length > 0) continue;
      row = current;

      let status: "pending" | "review" = "pending";
      let note = "Imported from an earlier upload";
      if (row.measuredError || row.measuredArtboardWInches == null) {
        status = "review";
        note = `Needs review — couldn't read the file (${row.measuredError ?? "not measurable"})`;
      } else {
        // Identity check: compare the measured artboard against what this
        // SLOT should roughly be (finished trim + bleed, orientation-
        // agnostic). We deliberately resolve WITHOUT the row's own measured
        // override (it would match itself trivially) by checking against
        // the computed finished basis only.
        const slotSpec = await resolveSlotSpec(press, row, { excludeOwnMeasured: true });
        const basis = slotSpec
          ? {
              w: slotSpec.finishedInches.w + 2 * (slotSpec.bleedInches || 0),
              h: slotSpec.finishedInches.h + 2 * (slotSpec.bleedInches || 0),
            }
          : null;
        if (basis) {
          const mw = Number(row.measuredArtboardWInches);
          const mh = Number(row.measuredArtboardHInches);
          const TOL = 1.5; // generous — templates legitimately outsize trim
          const fits =
            (Math.abs(mw - basis.w) <= TOL && Math.abs(mh - basis.h) <= TOL) ||
            (Math.abs(mw - basis.h) <= TOL && Math.abs(mh - basis.w) <= TOL);
          if (!fits) {
            status = "review";
            note = `Needs review — measured ${mw}"×${mh}" doesn't look like this slot (expected ≈${basis.w.toFixed(1)}"×${basis.h.toFixed(1)}")`;
          }
        }
        // No baseline (cassette/cd/unknown) → import as pending; the test
        // route already answers honestly for those slots.
      }

      const revision = await storage.createPressTemplateRevision({
        specId: row.id,
        revLabel: nextRevLabel([]),
        fileUrl: row.templateFileUrl!,
        fileName: row.templateFileName ?? null,
        createdByUserId: null,
        measuredSnapshot: measuredSnapshotOf(row),
        note,
      });
      if (status === "review") {
        await storage.setPressTemplateRevisionStatus(revision.id, "review");
      }
      minted = true;
    } catch (e: any) {
      console.error(`[templates-import] spec ${spec.id} failed:`, e?.message ?? e);
    }
  }
  return minted;
}

export function registerPressTemplateFlowRoutes(
  app: Express,
  requireAdmin: any,
  requirePressScope: any,
  requirePressEditor: (req: Request, res: Response, next: any) => Promise<any>,
) {
  // ── Task #3099 — lazy preview backfill helpers ──────────────────────
  // De-dupe per process so concurrent views don't rasterize the same file
  // twice; a genuine failure persists ([] on specs) or is remembered
  // in-memory (runs) so views don't hammer a file that can't render.
  const previewInFlight = new Set<string>();
  const runPreviewFailed = new Set<string>();
  // A durably-failed render ([] on specs, "" on runs) gets ONE fresh attempt
  // per instance lifetime — a prior deploy image without poppler persisted
  // failures for files that render fine once the tool exists. The in-memory
  // set keeps the original bound: no re-download storm on every GET.
  const specPreviewRetried = new Set<string>();
  // One background maintenance chain per press at a time (import + preview
  // backfills kicked off the templates GET without blocking the response).
  const maintainInFlight = new Set<string>();

  async function backfillTemplatePreviews(
    pressId: string,
    specs: Array<{ id: string; templateFileUrl: string | null; previewUrls: string[] | null }>,
  ): Promise<boolean> {
    let changed = false;
    for (const s of specs) {
      if (!s.templateFileUrl) continue;
      const failedBefore = Array.isArray(s.previewUrls) && s.previewUrls.length === 0;
      if (s.previewUrls !== null && !failedBefore) continue;
      const key = `spec:${s.id}`;
      if (previewInFlight.has(key)) continue;
      if (failedBefore) {
        if (specPreviewRetried.has(key)) continue;
        specPreviewRetried.add(key);
      }
      previewInFlight.add(key);
      try {
        await renderTemplateSpecPreviews(pressId, s.id);
        changed = true;
      } finally {
        previewInFlight.delete(key);
      }
    }
    return changed;
  }

  async function backfillRunPreviews(
    specs: Array<{ id: string; componentKey: string }>,
    runs: Array<{ id: string; specId: string; fileUrl: string; previewUrl: string | null; previewUrl2: string | null }>,
  ) {
    const out = [...runs];
    for (const spec of specs) {
      // Latest run per spec only — that's the one the Test page shows.
      const idx = out.findIndex((r) => r.specId === spec.id);
      if (idx === -1) continue;
      const run = out[idx];
      // NULL = never attempted; "" = attempted and failed (durable across
      // instances — the in-memory set alone let every fresh autoscale
      // instance re-download unrenderable legacy files on the GET path,
      // which is what made the prod Templates page take ~10s to load).
      const runFailedBefore = run.previewUrl === "";
      if (run.previewUrl !== null && !runFailedBefore) continue;
      const key = `run:${run.id}`;
      if (previewInFlight.has(key) || runPreviewFailed.has(key)) continue;
      if (runFailedBefore) runPreviewFailed.add(key); // one fresh attempt per instance
      previewInFlight.add(key);
      try {
        const pages = spec.componentKey === "labels" ? 2 : 1;
        const urls = await renderUrlPreviewPages(run.fileUrl, { pages });
        if (urls.length === 0) {
          runPreviewFailed.add(key); // genuine rasterize failure — honest no-preview
          await storage.updatePressTemplateTestRunPreviews(run.id, "", null); // persist the failure
          continue;
        }
        const updated = await storage.updatePressTemplateTestRunPreviews(
          run.id,
          urls[0] ?? null,
          urls[1] ?? null,
        );
        if (updated) out[idx] = updated as (typeof out)[number];
      } finally {
        previewInFlight.delete(key);
      }
    }
    return out;
  }

  // GET /api/press/:id/templates — every slot row for this press with its
  // revision history and latest test runs, one payload for the whole flow.
  app.get("/api/press/:id/templates", requireAdmin, requirePressScope, async (req, res) => {
    const pressId = String(req.params.id);
    const press = await storage.getManufacturerById(pressId);
    if (!press) return res.status(404).json({ message: "Press not found" });
    const specs = await storage.listPressTemplateSpecs(pressId);
    const specIds = specs.map((s) => s.id);
    const [revisions, runs] = await Promise.all([
      storage.listPressTemplateRevisions(specIds),
      storage.listPressTemplateTestRuns(specIds),
    ]);
    // Task #3200 — a run orphaned in "processing" (instance restarted
    // mid-scan) must not show an eternal "Checking…": sweep anything older
    // than the stale bound to a readable error, in this payload and the DB.
    const staleCutoff = Date.now() - TEST_RUN_STALE_MS;
    for (const r of runs) {
      if (r.verdict === "processing" && new Date(r.createdAt as any).getTime() < staleCutoff) {
        r.verdict = "error";
        r.checks = [
          {
            key: "scan",
            label: "Certification scan",
            status: "fail",
            message: "The certification check was interrupted — run the test again.",
            tier: "system",
          },
        ] as unknown[];
        void storage
          .updatePressTemplateTestRunResult(r.id, { checks: r.checks, verdict: "error" })
          .catch((e: any) => console.error("[template-test] stale-run sweep failed:", e?.message ?? e));
      }
    }
    // Lazy maintenance — legacy-upload import (revision minting) plus
    // preview rasterization for spec files and legacy test runs — used to
    // run INSIDE this GET, which meant downloading + rasterizing PDFs
    // before the page could paint (observed ~9s on prod). It now runs in
    // the background, de-duped per press: this response serves what's
    // already persisted, and the results land on the next fetch. All
    // outcomes (including failures) persist, so the work never repeats.
    if (!maintainInFlight.has(pressId)) {
      maintainInFlight.add(pressId);
      void (async () => {
        try {
          const imported = await autoImportLegacyTemplates(press, specs).catch((e) => {
            console.error("[templates-import] failed:", e?.message ?? e);
            return false;
          });
          const fresh = imported ? await storage.listPressTemplateSpecs(pressId) : specs;
          await backfillTemplatePreviews(pressId, fresh).catch((e) => {
            console.error("[template-preview] backfill failed:", e?.message ?? e);
          });
          await backfillRunPreviews(fresh, runs).catch((e) => {
            console.error("[template-preview] run backfill failed:", e?.message ?? e);
          });
        } catch (e: any) {
          // Belt-and-braces: nothing in this detached chain may reject
          // unhandled (e.g. the spec re-read between the guarded steps).
          console.error("[templates-maintain] background chain failed:", e?.message ?? e);
        } finally {
          maintainInFlight.delete(pressId);
        }
      })();
    }
    const { pressUserCanEdit } = await import("./auth/partnerPermissions");
    const canEdit = await pressUserCanEdit(req.session.userId!, pressId);
    // Task #3065 — operator-defined slots render alongside the built-ins.
    const customSlots = await storage.listPressCustomTemplateSlots(pressId);
    // Live-test templates (handoff, Aug 14 2026) — the saved shelf on the
    // Templates page, each with its client-side test trail.
    const liveRows = await storage.listPressLiveTemplates(pressId);
    const liveTests = await storage.listPressLiveTemplateTests(liveRows.map((r) => r.id));
    res.json({
      canEdit,
      // Standard slots this press archived off the shelf ("not offered").
      archivedSlots: Array.isArray((press as any).archivedTemplateSlots)
        ? ((press as any).archivedTemplateSlots as string[])
        : [],
      customSlots,
      liveTemplates: liveRows.map((r) => ({
        ...r,
        tests: liveTests.filter((t) => t.liveTemplateId === r.id),
      })),
      specs: specs.map((s) => ({
        ...s,
        revisions: revisions.filter((r) => r.specId === s.id),
        runs: runs.filter((r) => r.specId === s.id).slice(0, 10),
      })),
    });
  });

  // GET /api/press/:id/templates/:specId/file — same-origin download of the
  // slot's live template PDF for the live-test instrument (?template=<id>).
  // Stored /objects/ files redirect (already same-origin); external https
  // links (Dropbox/Drive paste flow) are proxied through the SSRF-guarded
  // fetcher — a direct browser fetch would die on CORS.
  app.get("/api/press/:id/templates/:specId/file", requireAdmin, requirePressScope, async (req, res) => {
    const pressId = String(req.params.id);
    const spec = await storage.getPressTemplateSpecById(pressId, String(req.params.specId));
    if (!spec?.templateFileUrl) return res.status(404).json({ message: "No template file on this slot." });
    const url = spec.templateFileUrl;
    if (url.startsWith("/")) return res.redirect(url);
    if (!/^https:\/\//i.test(url)) return res.status(409).json({ message: "This template's link can't be fetched." });
    const os = await import("node:os");
    const path = await import("node:path");
    const fs = await import("node:fs");
    const { fetchAndScanPdf } = await import("./validators/completedTemplate");
    const tmp = path.join(os.tmpdir(), `press-template-${spec.id}-${Date.now()}.pdf`);
    try {
      const fetched = await fetchAndScanPdf(url, { spoolTo: tmp });
      if (!fetched.ok) {
        // Task #3154 — a dead/unreachable/not-a-PDF external link is CLIENT
        // state (a legacy pasted link whose host stopped serving the file),
        // not a server fault: answer 422 with a code the Templates UI maps
        // to a "needs re-upload" slot state. 5xx stays reserved for genuine
        // infra failures so the /api 5xx ops alert doesn't page on every
        // open of a stale slot.
        return res.status(422).json({
          code: "template_link_dead",
          message: `${fetched.error} Re-attach the template file to this slot to fix it.`,
        });
      }
      if (fetched.spooled !== true) {
        return res.status(502).json({ message: "Couldn't spool the template file." });
      }
      res.setHeader("Content-Type", "application/pdf");
      const stream = fs.createReadStream(tmp);
      stream.on("close", () => fs.unlink(tmp, () => {}));
      stream.on("error", () => { fs.unlink(tmp, () => {}); if (!res.headersSent) res.status(500).end(); else res.end(); });
      stream.pipe(res);
    } catch (e: any) {
      fs.unlink(tmp, () => {});
      if (!res.headersSent) res.status(502).json({ message: e?.message ?? "Couldn't fetch the template file." });
    }
  });

  // GET /api/press/:id/templates/:specId/runs/:runId/file — same-origin
  // download of a saved test run's art file, so opening a certified template
  // can re-hydrate the proof view (gogoods, Aug 16 2026: "if I come back to
  // the template and want to view the Current… load tests so I can check
  // bleeds, template, etc."). Run files always live in OUR object store
  // (uploads land there; pasted links are mirrored at test time), so this is
  // a scope-checked redirect — view access, not editor.
  app.get("/api/press/:id/templates/:specId/runs/:runId/file", requireAdmin, requirePressScope, async (req, res) => {
    const pressId = String(req.params.id);
    const spec = await storage.getPressTemplateSpecById(pressId, String(req.params.specId));
    if (!spec) return res.status(404).json({ message: "Template slot not found" });
    const runs = await storage.listPressTemplateTestRuns([spec.id]);
    const run = runs.find((r) => r.id === String(req.params.runId));
    if (!run?.fileUrl) return res.status(404).json({ message: "No art file on this test run." });
    if (!run.fileUrl.startsWith("/objects/")) {
      return res.status(409).json({ message: "This run's art file isn't stored — re-run the test to view it." });
    }
    return res.redirect(run.fileUrl);
  });

  // ── Live-test templates (handoff/press-template-live-test, Aug 14 2026) ──
  // "Accept & Save" on the Live test page. The client uploads the PDF first
  // (uploadAdminDoc → /objects/...), reads GT layers with pdf.js, then posts
  // the metadata + test trail here. Editor-gated like every other mutation.
  const liveTestSchema = z.object({
    artName: z.string().trim().min(1).max(512),
    verdict: z.enum(["Pass", "Flagged", "Visual only"]),
  });
  // Integrity bounds (review, Aug 14 2026): the PDF must live in OUR object
  // store (uploadAdminDoc's path — no external/other-scheme URLs persisted),
  // the preview must be a real image data URL small enough to ride the
  // templates payload (client shrinks to ~480px JPEG), and dimensions must
  // be plausible physical mm. A trail cap stops unbounded test appends.
  const liveFileUrl = z
    .string()
    .min(1)
    .max(2048)
    .regex(/^\/objects\/[A-Za-z0-9._\-\/]+$/, "fileUrl must be an /objects/ path");
  const livePreviewImg = z
    .string()
    .max(300_000)
    .regex(/^data:image\/(png|jpeg|webp);base64,/, "previewImg must be an image data URL");
  const liveMm = z.number().finite().positive().max(2000);
  const LIVE_TRAIL_CAP = 200; // total persisted tests per template
  const liveCreateSchema = z.object({
    name: z.string().trim().min(1).max(200),
    component: z.string().trim().max(64).nullable().optional(),
    fileUrl: liveFileUrl,
    fileName: z.string().max(512).nullable().optional(),
    previewImg: livePreviewImg.nullable().optional(), // page-1 data URL
    wMm: liveMm.nullable().optional(),
    hMm: liveMm.nullable().optional(),
    layerCount: z.number().int().min(0).max(500).optional().default(0),
    tests: z.array(liveTestSchema).max(50).optional().default([]),
  });
  app.post(
    "/api/press/:id/templates/live",
    requireAdmin,
    requirePressScope,
    requirePressEditor,
    async (req, res) => {
      const pressId = String(req.params.id);
      const body = liveCreateSchema.safeParse(req.body);
      if (!body.success) return res.status(400).json({ message: body.error.message });
      const row = await storage.createPressLiveTemplate({
        pressId,
        name: body.data.name,
        component: body.data.component ?? null,
        fileUrl: body.data.fileUrl,
        fileName: body.data.fileName ?? null,
        previewImg: body.data.previewImg ?? null,
        wMm: body.data.wMm ?? null,
        hMm: body.data.hMm ?? null,
        layerCount: body.data.layerCount,
        createdByUserId: req.session.userId ?? null,
      });
      const tests = await storage.appendPressLiveTemplateTests(
        row.id,
        body.data.tests.map((t) => ({ artName: t.artName, verdict: t.verdict })),
      );
      res.status(201).json({ liveTemplate: { ...row, tests } });
    },
  );

  // Re-saving an existing shelf template after another test session:
  // append the new trail rows (and refresh name/metadata if they changed).
  const livePatchSchema = z.object({
    name: z.string().trim().min(1).max(200).optional(),
    // Replace template… (Bill, Aug 15 2026): the swapped-in PDF persists on
    // the SAME row — one tile, the old file simply superseded.
    fileUrl: z.string().trim().min(1).max(2000).optional(),
    fileName: z.string().trim().min(1).max(300).nullable().optional(),
    previewImg: livePreviewImg.nullable().optional(),
    wMm: liveMm.nullable().optional(),
    hMm: liveMm.nullable().optional(),
    layerCount: z.number().int().min(0).max(500).optional(),
    tests: z.array(liveTestSchema).max(50).optional().default([]),
  });
  app.patch(
    "/api/press/:id/templates/live/:liveId",
    requireAdmin,
    requirePressScope,
    requirePressEditor,
    async (req, res) => {
      const pressId = String(req.params.id);
      const body = livePatchSchema.safeParse(req.body);
      if (!body.success) return res.status(400).json({ message: body.error.message });
      const existing = await storage.getPressLiveTemplateById(pressId, String(req.params.liveId));
      if (!existing) return res.status(404).json({ message: "Saved template not found" });
      const { tests: newTests, ...patch } = body.data;
      const updated = Object.keys(patch).length
        ? await storage.updatePressLiveTemplate(pressId, existing.id, patch)
        : existing;
      // Trail cap — a template's persisted test history is bounded so the
      // shared templates GET can't grow without limit; extra rows past the
      // cap are dropped (newest-first within this request).
      const existingTests = await storage.listPressLiveTemplateTests([existing.id]);
      const room = Math.max(0, LIVE_TRAIL_CAP - existingTests.length);
      await storage.appendPressLiveTemplateTests(
        existing.id,
        newTests.slice(0, room).map((t) => ({ artName: t.artName, verdict: t.verdict })),
      );
      const tests = await storage.listPressLiveTemplateTests([existing.id]);
      res.json({ liveTemplate: { ...(updated ?? existing), tests } });
    },
  );

  // PUT /api/press/:id/templates/:specId/guides — Task #3101: hand-entered
  // fold/score positions + safety inset. Guides-only write (never touches
  // the file or measured_* columns); the Printed-areas study prefers these
  // over measured guides, per the operator-wins convention on the spec row.
  app.put(
    "/api/press/:id/templates/:specId/guides",
    requireAdmin,
    requirePressScope,
    requirePressEditor,
    async (req, res) => {
      const pressId = String(req.params.id);
      const body = operatorGuidesSchema.safeParse(req.body);
      if (!body.success) return res.status(400).json({ message: body.error.message });
      const row = await storage.getPressTemplateSpecById(pressId, String(req.params.specId));
      if (!row) return res.status(404).json({ message: "Template slot not found" });
      const norm = (a: number[] | null) =>
        a && a.length ? [...a].sort((x, y) => x - y) : null;
      const updated = await storage.updatePressTemplateSpecOperatorGuides(
        pressId,
        row.id,
        {
          foldXInches: norm(body.data.foldXInches),
          foldYInches: norm(body.data.foldYInches),
          safetyInsetInches: body.data.safetyInsetInches,
        },
        req.session.userId ?? null,
      );
      res.json({ spec: updated });
    },
  );

  // PATCH /api/press/:id/templates/:specId/display-name — press-given
  // nickname for a slot's template (gogoods, Aug 15 2026). The slot keeps
  // its canonical title; this is the quiet small-text line under it.
  // Empty string clears the nickname.
  app.patch(
    "/api/press/:id/templates/:specId/display-name",
    requireAdmin,
    requirePressScope,
    requirePressEditor,
    async (req, res) => {
      const pressId = String(req.params.id);
      const parsed = z.object({ displayName: z.string().max(120) }).safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
      const row = await storage.getPressTemplateSpecById(pressId, String(req.params.specId));
      if (!row) return res.status(404).json({ message: "Template slot not found" });
      const displayName = parsed.data.displayName.trim() || null;
      await pool.query(
        `UPDATE press_template_specs
            SET display_name = $1, updated_by_user_id = $2, updated_at = now()
          WHERE press_id = $3 AND id = $4`,
        [displayName, req.session.userId ?? null, pressId, row.id],
      );
      res.json({ ok: true, displayName });
    },
  );

  // PUT /api/press/:id/templates — attach or replace the template file on a
  // slot (creating the spec row if the slot has never had one). Only the
  // file columns are written — operator-entered artboard/pages/rules stay
  // untouched. Mints a revision row; previous live revisions supersede.
  app.put(
    "/api/press/:id/templates",
    requireAdmin,
    requirePressScope,
    requirePressEditor,
    async (req, res) => {
      const pressId = String(req.params.id);
      const body = attachSchema.safeParse(req.body);
      if (!body.success) return res.status(400).json({ message: body.error.message });
      const d = body.data;
      if (!d.fileUrl.startsWith("/objects/uploads/") && !/^https:\/\//i.test(d.fileUrl)) {
        return res
          .status(400)
          .json({ message: "Upload the file or paste an https:// link." });
      }
      // Rule (gogoods, Aug 15 2026): a pasted external link is downloaded
      // into OUR object storage before it becomes a template source — same
      // policy as audio masters. The spec row and revision store the
      // /objects path, so measurement and preview renders never depend on
      // the external host staying alive.
      let mirroredAttachPath: string | null = null;
      if (/^https:\/\//i.test(d.fileUrl)) {
        const mirrored = await mirrorExternalTemplatePdf(d.fileUrl);
        if (!mirrored.ok) return res.status(422).json({ message: mirrored.error });
        d.fileUrl = mirrored.objectPath;
        mirroredAttachPath = mirrored.objectPath;
      }
      // Non-jacket components carry no variant (mirrors the admin route).
      const variantKey = d.componentKey === "jacket" ? d.variantKey : "";
      // Slot check + spec write as ONE critical section. Task #3066 — for a
      // custom componentKey this runs under the per-(press, slotKey) advisory
      // lock so a concurrent slot DELETE can't interleave between "the slot
      // exists" and "the spec row carries the file" (which is what DELETE's
      // history check reads).
      const attach = async (): Promise<
        { spec: PressTemplateSpec; existing?: PressTemplateSpec } | { status: number; message: string }
      > => {
        // Task #3065 — a custom componentKey must match one of this press's
        // defined custom slots for the same format (vocabulary stays closed).
        if (d.componentKey.startsWith("custom_")) {
          const slots = await storage.listPressCustomTemplateSlots(pressId);
          const slot = slots.find((s) => s.format === d.format && s.slotKey === d.componentKey);
          if (!slot) {
            return { status: 400, message: "Unknown custom template slot — create it first." };
          }
        }
        const existing = (await storage.listPressTemplateSpecs(pressId, d.format)).find(
          (r) =>
            r.componentKey === d.componentKey &&
            (r.variantKey ?? "") === variantKey &&
            r.discCount === (d.discCount ?? 0),
        );
        if (existing) {
          const updated = await storage.updatePressTemplateSpecFile(
            pressId,
            existing.id,
            d.fileUrl,
            d.fileName ?? null,
            req.session.userId ?? null,
          );
          if (!updated) return { status: 404, message: "Template slot not found" };
          return { spec: updated, existing };
        }
        const spec = await storage.upsertPressTemplateSpec(
          {
            pressId,
            format: d.format,
            componentKey: d.componentKey,
            variantKey,
            discCount: d.discCount ?? 0,
            templateFileUrl: d.fileUrl,
            templateFileName: d.fileName ?? null,
          },
          req.session.userId ?? null,
        );
        return { spec };
      };
      const attached = d.componentKey.startsWith("custom_")
        ? await withCustomSlotLock(pressId, d.componentKey, attach)
        : await attach();
      if ("status" in attached) {
        // The attach never happened (unknown custom slot etc.) — don't
        // strand the just-mirrored object.
        await deleteMirroredTemplateObject(mirroredAttachPath);
        return res.status(attached.status).json({ message: attached.message });
      }
      const { spec, existing } = attached;
      await clearTemplateSpecMeasurements(pressId, spec.id);
      await measureTemplateSpecRow(pressId, spec.id);
      // Task #3099 — kick off the template-page render in the background so
      // the Test page has real artwork under the rings on next view (the
      // lazy view-time backfill covers it either way; the in-flight set
      // de-dupes a concurrent GET).
      const renderKey = `spec:${spec.id}`;
      if (!previewInFlight.has(renderKey)) {
        previewInFlight.add(renderKey);
        void renderTemplateSpecPreviews(pressId, spec.id)
          .catch((e) => console.error("[template-preview] attach render failed:", e?.message ?? e))
          .finally(() => previewInFlight.delete(renderKey));
      }
      const measured = (await storage.getPressTemplateSpecById(pressId, spec.id)) ?? spec;

      const priorRevs = await storage.listPressTemplateRevisions([spec.id]);
      const revision = await storage.createPressTemplateRevision({
        specId: spec.id,
        revLabel: nextRevLabel(priorRevs),
        fileUrl: d.fileUrl,
        fileName: d.fileName ?? null,
        createdByUserId: req.session.userId ?? null,
        measuredSnapshot: measuredSnapshotOf(measured),
      });
      await storage.supersedePressTemplateRevisions(
        spec.id,
        revision.id,
        `Superseded ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`,
      );

      // Task #3065 — option detection: does this ONE file draw multiple
      // physical options (small vs large hole)? Best-effort text scan of
      // our own stored file; conservative (all options of a family must be
      // mentioned). Nothing persists without the operator confirming:
      //   • detected + not yet stamped → detectedOptions rides the response
      //     (the client offers the confirm prompt);
      //   • already stamped + still detected → keep the stamp (a replace
      //     doesn't nag again);
      //   • already stamped + no longer detected → clear (the new file
      //     doesn't cover both options anymore — honest reset).
      let detectedOptions: TemplateOption[] = [];
      let specOut = measured;
      try {
        const detected = await detectTemplateOptionsForUrl(d.fileUrl);
        const prior = (existing?.variantOptions ?? null) as TemplateOption[] | null;
        if (prior?.length) {
          const same =
            detected.length === prior.length && prior.every((p) => detected.some((o) => o.key === p.key));
          if (!same) {
            specOut = (await storage.updatePressTemplateSpecVariantOptions(pressId, spec.id, null)) ?? specOut;
            if (detected.length) detectedOptions = detected;
          }
        } else if (detected.length) {
          detectedOptions = detected;
        }
      } catch (e: any) {
        console.error("[template-options] attach detection failed:", e?.message ?? e);
      }
      res.json({ spec: specOut, revision, detectedOptions });
    },
  );

  // POST /api/press/:id/templates/:specId/options — stamp (or clear) the
  // option set this one template file covers, after the operator confirms
  // the detection prompt. Only known option families are accepted.
  app.post(
    "/api/press/:id/templates/:specId/options",
    requireAdmin,
    requirePressScope,
    requirePressEditor,
    async (req, res) => {
      const pressId = String(req.params.id);
      const body = optionsSchema.safeParse(req.body);
      if (!body.success) return res.status(400).json({ message: body.error.message });
      const spec = await storage.getPressTemplateSpecById(pressId, String(req.params.specId));
      if (!spec) return res.status(404).json({ message: "Template slot not found" });
      if (body.data.options && !spec.templateFileUrl) {
        return res.status(409).json({ message: "This slot has no live template file." });
      }
      if (body.data.options && !isKnownOptionSet(body.data.options)) {
        return res.status(400).json({ message: "Unknown option set." });
      }
      const updated = await storage.updatePressTemplateSpecVariantOptions(
        pressId,
        spec.id,
        body.data.options,
      );
      res.json({ spec: updated });
    },
  );

  // POST /api/press/:id/templates/custom-slots — define a new template slot
  // for a format ("Create new template" tile). The slot key is minted from
  // the name; the icon is auto-assigned. Uploading then rides the normal
  // attach flow with componentKey = slotKey.
  app.post(
    "/api/press/:id/templates/custom-slots",
    requireAdmin,
    requirePressScope,
    requirePressEditor,
    async (req, res) => {
      const pressId = String(req.params.id);
      const body = createSlotSchema.safeParse(req.body);
      if (!body.success) return res.status(400).json({ message: body.error.message });
      const d = body.data;
      const existing = await storage.listPressCustomTemplateSlots(pressId);
      // Reject names that collide with an existing custom slot in the format.
      let slotKey = customSlotKeyFromName(d.name);
      const inFormat = existing.filter((s) => s.format === d.format);
      if (inFormat.some((s) => s.displayName.trim().toLowerCase() === d.name.trim().toLowerCase())) {
        return res.status(409).json({ message: "A template with that name already exists in this format." });
      }
      if (inFormat.some((s) => s.slotKey === slotKey)) {
        for (let i = 2; i < 50; i++) {
          if (!inFormat.some((s) => s.slotKey === `${slotKey}_${i}`)) {
            slotKey = `${slotKey}_${i}`;
            break;
          }
        }
      }
      const slot = await storage.createPressCustomTemplateSlot({
        pressId,
        format: d.format,
        slotKey,
        displayName: d.name.trim(),
        note: d.note?.trim() || null,
        iconKind: iconKindForSlotName(d.name),
        createdByUserId: req.session.userId ?? null,
      });
      res.json({ slot });
    },
  );

  // Task #3066 — PATCH /api/press/:id/templates/custom-slots/:slotId — rename
  // a custom slot (display name / note only; slotKey stays stable so any
  // attached spec row keeps its componentKey).
  app.patch(
    "/api/press/:id/templates/custom-slots/:slotId",
    requireAdmin,
    requirePressScope,
    requirePressEditor,
    async (req, res) => {
      const pressId = String(req.params.id);
      const body = renameSlotSchema.safeParse(req.body);
      if (!body.success) return res.status(400).json({ message: body.error.message });
      const d = body.data;
      const slots = await storage.listPressCustomTemplateSlots(pressId);
      const slot = slots.find((s) => s.id === String(req.params.slotId));
      if (!slot) return res.status(404).json({ message: "Custom template slot not found" });
      // Same collision rule as create: no two slots in a format share a name.
      const collision = slots.some(
        (s) =>
          s.id !== slot.id &&
          s.format === slot.format &&
          s.displayName.trim().toLowerCase() === d.name.trim().toLowerCase(),
      );
      if (collision) {
        return res.status(409).json({ message: "A template with that name already exists in this format." });
      }
      const updated = await storage.updatePressCustomTemplateSlot(pressId, slot.id, {
        displayName: d.name.trim(),
        note: d.note !== undefined ? d.note.trim() || null : undefined,
        iconKind: iconKindForSlotName(d.name),
      });
      res.json({ slot: updated });
    },
  );

  // Task #3066 — DELETE /api/press/:id/templates/custom-slots/:slotId — remove
  // a slot made by mistake. Refuses (409) when the slot's spec already has
  // revision history (uploads happened — history is never lost; archive the
  // file instead). A bare, never-uploaded slot deletes cleanly, along with
  // any empty orphan spec row.
  app.delete(
    "/api/press/:id/templates/custom-slots/:slotId",
    requireAdmin,
    requirePressScope,
    requirePressEditor,
    async (req, res) => {
      const pressId = String(req.params.id);
      // Peek at the slot only to learn its slotKey for the lock; everything
      // is re-checked INSIDE the critical section (a concurrent upload for
      // this slot serializes on the same lock — see the PUT route).
      const peek = (await storage.listPressCustomTemplateSlots(pressId)).find(
        (s) => s.id === String(req.params.slotId),
      );
      if (!peek) return res.status(404).json({ message: "Custom template slot not found" });
      const out = await withCustomSlotLock(pressId, peek.slotKey, async (): Promise<{
        status: number;
        body: Record<string, unknown>;
      }> => {
        const slot = (await storage.listPressCustomTemplateSlots(pressId)).find(
          (s) => s.id === String(req.params.slotId),
        );
        if (!slot) return { status: 404, body: { message: "Custom template slot not found" } };
        const specs = (await storage.listPressTemplateSpecs(pressId, slot.format)).filter(
          (s) => s.componentKey === slot.slotKey,
        );
        if (specs.length) {
          const revisions = await storage.listPressTemplateRevisions(specs.map((s) => s.id));
          if (revisions.length || specs.some((s) => s.templateFileUrl)) {
            return {
              status: 409,
              body: {
                message:
                  "This template has upload history — it can't be deleted. Archive the file instead; the slot and its revisions are kept.",
              },
            };
          }
        }
        // Bare orphan spec rows (no file, no revisions) go with the slot —
        // one transaction, so a failure never leaves a half-deleted slot.
        await storage.deletePressCustomTemplateSlotWithSpecs(
          pressId,
          slot.id,
          specs.map((s) => s.id),
        );
        return { status: 200, body: { ok: true } };
      });
      res.status(out.status).json(out.body);
    },
  );

  // POST /api/press/:id/templates/:specId/archive — pull the live file
  // without a replacement. Measured columns clear so the completed-art
  // checks fall back to baseline; revisions flip to archived.
  app.post(
    "/api/press/:id/templates/:specId/archive",
    requireAdmin,
    requirePressScope,
    requirePressEditor,
    async (req, res) => {
      const pressId = String(req.params.id);
      const spec = await storage.getPressTemplateSpecById(pressId, String(req.params.specId));
      if (!spec) return res.status(404).json({ message: "Template slot not found" });
      await storage.updatePressTemplateSpecFile(pressId, spec.id, null, null, req.session.userId ?? null);
      await clearTemplateSpecMeasurements(pressId, spec.id);
      const revs = await storage.listPressTemplateRevisions([spec.id]);
      for (const r of revs) {
        if (r.status === "pending" || r.status === "certified") {
          await storage.setPressTemplateRevisionStatus(r.id, "archived");
        }
      }
      res.json({ ok: true });
    },
  );

  // POST /api/press/:id/templates/:specId/restore — put an archived
  // template back on the shelf (Bill, Aug 15 2026: archive is history,
  // never deletion). Reinstates the most recent archived revision's file
  // onto the spec, re-measures, and flips that revision back to pending.
  app.post(
    "/api/press/:id/templates/:specId/restore",
    requireAdmin,
    requirePressScope,
    requirePressEditor,
    async (req, res) => {
      const pressId = String(req.params.id);
      const spec = await storage.getPressTemplateSpecById(pressId, String(req.params.specId));
      if (!spec) return res.status(404).json({ message: "Template slot not found" });
      if (spec.templateFileUrl) return res.status(409).json({ message: "This template is already live." });
      const revs = await storage.listPressTemplateRevisions([spec.id]);
      const archived = revs.find((r) => r.status === "archived" && r.fileUrl);
      if (!archived) return res.status(404).json({ message: "No archived revision to restore." });
      await storage.updatePressTemplateSpecFile(
        pressId,
        spec.id,
        archived.fileUrl,
        archived.fileName ?? null,
        req.session.userId ?? null,
      );
      await clearTemplateSpecMeasurements(pressId, spec.id);
      await measureTemplateSpecRow(pressId, spec.id);
      await storage.setPressTemplateRevisionStatus(archived.id, "pending");
      res.json({ ok: true });
    },
  );

  // POST /api/press/:id/templates/slots/archive|restore — a standard slot
  // this press doesn't offer ("Archived — not offered"). Pure per-press
  // dismissal on the manufacturer row; nothing about the slot is deleted.
  for (const action of ["archive", "restore"] as const) {
    app.post(
      `/api/press/:id/templates/slots/${action}`,
      requireAdmin,
      requirePressScope,
      requirePressEditor,
      async (req, res) => {
        const pressId = String(req.params.id);
        const slotKey = typeof req.body?.slotKey === "string" ? req.body.slotKey.trim() : "";
        if (!slotKey) return res.status(400).json({ message: "slotKey is required" });
        const press = await storage.getManufacturerById(pressId);
        if (!press) return res.status(404).json({ message: "Press not found" });
        const current = Array.isArray((press as any).archivedTemplateSlots)
          ? ((press as any).archivedTemplateSlots as string[])
          : [];
        const next =
          action === "archive"
            ? Array.from(new Set([...current, slotKey]))
            : current.filter((k) => k !== slotKey);
        await storage.updateManufacturer(pressId, { archivedTemplateSlots: next } as any);
        res.json({ ok: true, archivedSlots: next });
      },
    );
  }

  // POST /api/press/:id/templates/live/:liveId/archive|restore — saved
  // shelf tiles archive the same way (history, never deletion).
  for (const action of ["archive", "restore"] as const) {
    app.post(
      `/api/press/:id/templates/live/:liveId/${action}`,
      requireAdmin,
      requirePressScope,
      requirePressEditor,
      async (req, res) => {
        const pressId = String(req.params.id);
        const updated = await storage.updatePressLiveTemplate(pressId, String(req.params.liveId), {
          archivedAt: action === "archive" ? new Date() : null,
        });
        if (!updated) return res.status(404).json({ message: "Saved template not found" });
        res.json({ ok: true });
      },
    );
  }

  // POST /api/press/:id/templates/:specId/test — run a finished test file
  // against this slot through the completed-template engine. Streams the
  // file (own object storage or SSRF-guarded https) — the original is never
  // stored; only a small first-page preview PNG is kept for the proof view.
  app.post(
    "/api/press/:id/templates/:specId/test",
    requireAdmin,
    requirePressScope,
    requirePressEditor,
    async (req, res) => {
      const pressId = String(req.params.id);
      const body = testSchema.safeParse(req.body);
      if (!body.success) return res.status(400).json({ message: body.error.message });
      const press = await storage.getManufacturerById(pressId);
      if (!press) return res.status(404).json({ message: "Press not found" });
      const spec = await storage.getPressTemplateSpecById(pressId, String(req.params.specId));
      if (!spec) return res.status(404).json({ message: "Template slot not found" });
      if (!spec.templateFileUrl) {
        return res.status(409).json({
          message: "This slot has no live template — attach a template before running a certification test.",
        });
      }

      const slotSpec = await resolveSlotSpec(press, spec);
      if (!slotSpec) {
        return res.status(422).json({
          message:
            "Certification test runs aren't available for this slot yet — the finished-file checker doesn't have a baseline for this format.",
        });
      }
      // Rule (gogoods, Aug 15 2026): a pasted external test file is
      // downloaded into OUR object storage first — the run row stores the
      // /objects path so its proof previews can always self-heal, even if
      // the external link dies. Same policy as the template attach path.
      let runFileUrl = body.data.url;
      if (!runFileUrl.startsWith("/objects/uploads/") && !/^https:\/\//i.test(runFileUrl)) {
        return res
          .status(400)
          .json({ message: "Upload the file or paste an https:// link." });
      }
      // Task #3200 — the scan of a hundreds-of-MB finished-art PDF takes
      // minutes; run synchronously it outlived the deployed edge's request
      // timeout and the client's Save froze on a fetch that never resolved.
      // The route now records a run in the "processing" state and answers
      // immediately; the mirror/scan/preview/certify work happens in a
      // detached background task that lands the final verdict (or a
      // readable error) on the same run row for the shelf to refetch.
      // Bleed reference (gogoods, Aug 16 2026): stored line wins; else the
      // client-read GT-layer line fills the gap and is persisted as the
      // measured line so future runs, art-inspect, and prepress all agree.
      const storedLine = spec.bleedLineInches ?? spec.measuredBleedLineInches ?? null;
      const clientLine = body.data.templateBleedLineInches ?? null;
      const effLine =
        ((slotSpec as any).templateBleedLineInches as number | null | undefined) ??
        (storedLine != null && storedLine > 0 ? storedLine : null) ??
        (clientLine != null && clientLine > 0 ? clientLine : null);
      const slotSpecEff =
        effLine != null && (slotSpec as any).templateBleedLineInches == null
          ? ({ ...slotSpec, templateBleedLineInches: effLine } as typeof slotSpec)
          : slotSpec;
      if (storedLine == null && clientLine != null && clientLine > 0) {
        await storage.updatePressTemplateSpecMeasured(pressId, spec.id, {
          measuredBleedLineInches: clientLine,
        });
      }
      // Aug 18 2026 (Bill's CALIFORNIALAND false-flag): persist the
      // client-read GT-layer cut rect on the spec row so the ARTIST-side
      // check route can pass the same trim override this route gets from
      // its client. Client-measured geometry only — never inferred.
      const clientCut = body.data.templateCutRect ?? null;
      if (clientCut && clientCut.widthIn > 0 && clientCut.heightIn > 0) {
        const stored = spec.measuredCutRectInches ?? null;
        const next = { left: clientCut.leftIn, top: clientCut.topIn, width: clientCut.widthIn, height: clientCut.heightIn };
        const same =
          stored != null &&
          Math.abs(stored.left - next.left) < 0.005 &&
          Math.abs(stored.top - next.top) < 0.005 &&
          Math.abs(stored.width - next.width) < 0.005 &&
          Math.abs(stored.height - next.height) < 0.005;
        if (!same) {
          await storage.updatePressTemplateSpecMeasured(pressId, spec.id, {
            measuredCutRectInches: next,
          });
        }
      }

      // Pin the run to the revision that is live right now, mint it in the
      // "processing" state, and answer — the client returns to the shelf
      // immediately and the tile shows "Checking…" until the verdict lands.
      const revs = await storage.listPressTemplateRevisions([spec.id]);
      const live = revs.find((r) => r.status === "pending" || r.status === "certified") ?? null;
      const run = await storage.createPressTemplateTestRun({
        specId: spec.id,
        revisionId: live?.id ?? null,
        fileUrl: runFileUrl,
        fileName: body.data.fileName ?? null,
        checks: [],
        verdict: "processing",
        createdByUserId: req.session.userId ?? null,
      });
      res.json({ run });

      const certifyOnPass = body.data.certifyOnPass === true;
      const cutRect = body.data.templateCutRect ?? null;
      // Detached background scan — every failure lands a READABLE error on
      // the run row (verdict "error"); nothing here can hang the response.
      void (async () => {
        // All results land through this guarded transition: the storage
        // update only applies while the run is still "processing", so a
        // worker that stalls past the deadline (its run already swept to a
        // terminal error) can never overwrite that error — and never
        // certifies off a verdict the operator was told failed.
        const landRun = async (patch: {
          fileUrl?: string;
          checks: unknown[];
          verdict: string;
          previewUrl?: string | null;
          previewUrl2?: string | null;
        }): Promise<boolean> => {
          try {
            return (await storage.updatePressTemplateTestRunResult(run.id, patch)) != null;
          } catch (e: any) {
            console.error("[template-test] couldn't record run result:", e?.message ?? e);
            return false;
          }
        };
        const failRun = (message: string) =>
          landRun({
            checks: [
              {
                key: "scan",
                label: "Certification scan",
                status: "fail",
                message,
                tier: "system",
              },
            ],
            verdict: "error",
          });
        let mirroredRunPath: string | null = null;
        let deadline: ReturnType<typeof setTimeout> | undefined;
        let timedOut = false;
        try {
          // Overall bound — the individual steps are each bounded too, but a
          // stuck object-storage stream must never leave "processing" forever.
          const work = (async () => {
            let fileUrl = runFileUrl;
            if (/^https:\/\//i.test(fileUrl)) {
              const mirrored = await mirrorExternalTemplatePdf(fileUrl);
              if (!mirrored.ok) {
                await failRun(mirrored.error);
                return;
              }
              fileUrl = mirrored.objectPath;
              mirroredRunPath = mirrored.objectPath;
            }
            const { scan, error } = await scanTemplateUrl(fileUrl);
            if (!scan) {
              await failRun(error ?? "Couldn't read that file.");
              // Own failure path — the run row never references the mirror.
              await deleteMirroredTemplateObject(mirroredRunPath);
              mirroredRunPath = null;
              return;
            }
            // Task #3069 — log every spot-usage fallback with its reason code.
            logSpotUsageFallback(scan, { fileName: null, source: fileUrl });
            // Task #3072 parity with the album-side route: when a line exists but
            // the art carries no trustworthy PDF boxes (print-ready exports strip
            // them), measure bleed from RENDERED content — otherwise the check
            // fails on boxes the file never had. Best-effort; null degrades to
            // the explicit "could not be measured" verdict.
            let contentBleed: import("./validators/completedTemplate").ContentBleedMeasurement | null = null;
            if (
              effLine != null &&
              (slotSpecEff as any).templatePageInches != null &&
              (!hasTrustworthyBleedBoxes(scan) ||
                (measuredBleedInches(scan) ?? 0) + 0.005 < effLine) &&
              fileUrl.startsWith("/objects/")
            ) {
              const fsp = await import("node:fs/promises");
              const os = await import("node:os");
              const path = await import("node:path");
              let tmpDir: string | null = null;
              try {
                const { ObjectStorageService } = await import("./replit_integrations/object_storage/objectStorage");
                const file = await new ObjectStorageService().getObjectEntityFile(fileUrl);
                const [meta] = await file.getMetadata();
                const size = Number(meta?.size ?? 0);
                if (Number.isFinite(size) && size > 0 && size <= 300 * 1024 * 1024) {
                  tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), "press-test-bleed-"));
                  const pdfPath = path.join(tmpDir, "src.pdf");
                  await file.download({ destination: pdfPath });
                  const { contentBleedMeasurement } = await import("./validators/completedTemplate");
                  contentBleed = await contentBleedMeasurement(pdfPath, scan, slotSpecEff as any, {
                    trimRectOverrideInches: cutRect
                      ? { left: cutRect.leftIn, top: cutRect.topIn, width: cutRect.widthIn, height: cutRect.heightIn }
                      : null,
                  });
                }
              } catch {
                contentBleed = null;
              } finally {
                if (tmpDir) fsp.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
              }
            }
            const checks: CheckResult[] = validateCompletedComponent(scan, slotSpecEff, { contentBleed });
            const verdict = rollupStatus(checks);

            // Task #3090 — rasterize the test file's first page(s) so the client
            // can render the artwork under the TEMPLATE's zone rings. Best-effort,
            // never blocks; no renderable image → the run row degrades to the
            // checks list.
            const pages = spec.componentKey === "labels" ? Math.min(scan.pageCount, 2) : 1;
            const previews = await renderTestRunPreviews(fileUrl, { pages });

            const landed = await landRun({
              fileUrl,
              checks: checks as unknown[],
              verdict,
              previewUrl: previews.previewUrl,
              previewUrl2: previews.previewUrl2,
            });
            if (!landed) {
              // The run already carries a terminal error (deadline hit or a
              // restart sweep) — that verdict stands. The mirror was never
              // referenced by the row, so clean it up and stop: no certify.
              await deleteMirroredTemplateObject(mirroredRunPath);
              mirroredRunPath = null;
              return;
            }
            mirroredRunPath = null; // the run row references it now — keep it

            // Auto-certify on a clean verdict (the client used to do this
            // after awaiting the scan; async it must happen here). Same
            // state-machine guards as the explicit certify route: only the
            // revision that is live RIGHT NOW may be certified by this run.
            if (certifyOnPass && (verdict === "pass" || verdict === "warn") && run.revisionId) {
              const specNow = await storage.getPressTemplateSpecById(pressId, spec.id);
              const revsNow = await storage.listPressTemplateRevisions([spec.id]);
              const liveNow =
                revsNow.find((r) => r.status === "pending" || r.status === "certified") ?? null;
              if (specNow?.templateFileUrl && liveNow && liveNow.id === run.revisionId) {
                const when = new Date();
                await storage.certifyPressTemplateTestRun(run.id, when);
                await storage.setPressTemplateRevisionStatus(liveNow.id, "certified", when);
              }
            }
          })();
          await Promise.race([
            work,
            new Promise<never>((_, reject) => {
              deadline = setTimeout(() => {
                timedOut = true;
                reject(new Error("The certification check timed out — run the test again."));
              }, TEST_RUN_PROCESSING_TIMEOUT_MS);
            }),
          ]);
        } catch (e: any) {
          console.error("[template-test] background run failed:", e?.message ?? e);
          await failRun(
            e?.message
              ? `The certification check didn't finish: ${e.message}`
              : "The certification check didn't finish — run the test again.",
          );
          // On a deadline hit the work promise is still running and may yet
          // read the mirrored file — its own guarded landing cleans up when
          // it eventually settles. Delete here only when the work itself
          // threw (nothing can still be using the object).
          if (!timedOut) await deleteMirroredTemplateObject(mirroredRunPath);
        } finally {
          clearTimeout(deadline);
        }
      })();
    },
  );

  // POST /api/press/:id/templates/art-inspect — live ink + image-resolution
  // inspection for the Template. Test. Certify. page (gogoods, Aug 15 2026:
  // "we need it to run here — verify CMYK and 300ppi"). The client posts the
  // picked art PDF as a raw body the moment it's loaded; nothing is stored.
  // Read-only, so no press-editor gate. Semantics mirror the certification
  // checks: CMYK-or-spot passes (embedded RGB previews ignored), RGB-only
  // fails; PPI is a full-artboard lower-bound estimate against a 300 floor
  // (1-bit images against 800, per the Memphis template fine print).
  app.post(
    "/api/press/:id/templates/art-inspect",
    requireAdmin,
    requirePressScope,
    async (req, res) => {
      const ART_INSPECT_MAX_BYTES = 300 * 1024 * 1024;
      const declared = Number(req.headers["content-length"] ?? 0);
      if (declared > ART_INSPECT_MAX_BYTES) {
        return res.status(413).json({ message: "That file is too large to inspect (300 MB max)." });
      }
      // Raster art (JPEG/PNG) — measurable too (gogoods, Aug 16 2026: MRP
      // wants art-only files at the proper artboard size, no template — so a
      // correct JPG is a legitimate final; "Visual only" was wrong for it).
      // What a raster carries: pixel dims + a density (PPI) tag + its color
      // space. What it can't carry: trim/bleed boxes — so bleed is judged by
      // the frame covering the slot's full artboard (finished + bleed).
      const ctype = String(req.headers["content-type"] ?? "").toLowerCase();
      // TIFF is the standard CMYK-capable print raster (Task #3161); PSD is
      // accepted best-effort — flattened with ImageMagick below, then run
      // through the exact same inspection as the other rasters.
      let rasterKind: "jpeg" | "png" | "tiff" | "psd" | null =
        ctype.startsWith("image/jpeg") ? "jpeg"
        : ctype.startsWith("image/png") ? "png"
        : ctype.startsWith("image/tiff") ? "tiff"
        : ctype.startsWith("image/vnd.adobe.photoshop") || ctype.startsWith("application/x-photoshop") ||
          ctype.startsWith("application/photoshop") || ctype.startsWith("image/x-psd") || ctype.startsWith("application/psd") ? "psd"
        : null;
      // Large files can't ride through the deployment edge — it 413s big
      // request bodies before they ever reach us (gogoods' 59MB CMYK jacket
      // JPEG never arrived, Aug 16 2026; dev has no such cap, which is why it
      // "worked here"). The client uploads those straight to object storage
      // with the signed-PUT flow and posts {objectPath} instead; we read the
      // bytes back from storage. The object stays private — no finalize/ACL.
      let storedFile: Awaited<ReturnType<typeof import("./replit_integrations/object_storage/objectStorage").ObjectStorageService.prototype.getObjectEntityFile>> | null = null;
      if (ctype.startsWith("application/json")) {
        const objectPath = String((req.body as any)?.objectPath ?? "");
        if (!/^\/objects\/uploads\/[A-Za-z0-9._-]+$/.test(objectPath)) {
          return res.status(400).json({ message: "Invalid upload path." });
        }
        try {
          const { ObjectStorageService } = await import("./replit_integrations/object_storage/objectStorage");
          storedFile = await new ObjectStorageService().getObjectEntityFile(objectPath);
        } catch {
          return res.status(404).json({ message: "Upload not found — pick the file again." });
        }
        try {
          const [metaObj] = await storedFile.getMetadata();
          if (Number(metaObj.size ?? 0) > ART_INSPECT_MAX_BYTES) {
            return res.status(413).json({ message: "That file is too large to inspect (300 MB max)." });
          }
          const oct = String(metaObj.contentType ?? "").toLowerCase();
          const lower = objectPath.toLowerCase();
          rasterKind =
            oct.startsWith("image/jpeg") || lower.endsWith(".jpg") || lower.endsWith(".jpeg") ? "jpeg"
            : oct.startsWith("image/png") || lower.endsWith(".png") ? "png"
            : oct.startsWith("image/tiff") || lower.endsWith(".tif") || lower.endsWith(".tiff") ? "tiff"
            : oct.startsWith("image/vnd.adobe.photoshop") || oct.startsWith("application/x-photoshop") || lower.endsWith(".psd") ? "psd"
            : null; // anything else falls to the PDF scanner below
        } catch (e: any) {
          console.error("[art-inspect] stored-object metadata failed:", e?.message ?? e);
          return res.status(422).json({ message: "Couldn't read that upload — ink + PPI will be verified at prepress." });
        }
      }
      if (rasterKind) {
        try {
          // Buffer the body WITHOUT destroying the socket mid-upload — the
          // client must receive the declared 413/422, not a network error
          // (review, Aug 16 2026). On cap/timeout we stop consuming, answer,
          // and only then drop the connection.
          const { buf, err } = storedFile
            ? await storedFile.download()
                .then(([b]) => ({ buf: b as Buffer, err: null as "too_large" | "timeout" | "aborted" | null }))
                .catch(() => ({ buf: null as Buffer | null, err: "aborted" as const }))
            : await new Promise<{ buf: Buffer | null; err: "too_large" | "timeout" | "aborted" | null }>((resolve) => {
            const chunks: Buffer[] = [];
            let n = 0;
            let done = false;
            const finish = (buf: Buffer | null, err: "too_large" | "timeout" | "aborted" | null) => {
              if (done) return;
              done = true;
              clearTimeout(timer);
              req.removeAllListeners("data");
              req.pause();
              resolve({ buf, err });
            };
            const timer = setTimeout(() => finish(null, "timeout"), 300_000);
            req.on("data", (c: Buffer) => {
              n += c.length;
              if (n > ART_INSPECT_MAX_BYTES) { finish(null, "too_large"); return; }
              chunks.push(c);
            });
            req.on("end", () => finish(Buffer.concat(chunks), null));
            req.on("error", () => finish(null, "aborted"));
          });
          const dropAfterResponse = () => { res.once("finish", () => req.destroy()); res.once("close", () => req.destroy()); };
          if (err === "too_large") {
            dropAfterResponse();
            return res.status(413).json({ message: "That file is too large to inspect (300 MB max)." });
          }
          if (err === "timeout") {
            dropAfterResponse();
            return res.status(422).json({ message: "The upload took too long to inspect — ink + PPI will be verified at prepress." });
          }
          if (!buf || buf.length === 0) {
            return res.status(422).json({ message: "Couldn't read that image — ink + PPI will be verified at prepress." });
          }
          // PSD — sharp/libvips can't decode it; flatten the composite with
          // ImageMagick into a CMYK-preserving TIFF (density rides along),
          // then inspect that exactly like an uploaded TIFF. Best-effort: any
          // failure (unsupported PSD variant, tool missing, huge layered file)
          // answers with a clear "export TIFF or PDF" instead of a generic
          // error (Task #3161).
          let inspectBuf = buf;
          if (rasterKind === "psd") {
            const os = await import("node:os");
            const fs = await import("node:fs/promises");
            const path = await import("node:path");
            const { execFile } = await import("node:child_process");
            const dir = await fs.mkdtemp(path.join(os.tmpdir(), "art-psd-"));
            const inPath = path.join(dir, "in.psd");
            const outPath = path.join(dir, "flat.tif");
            try {
              await fs.writeFile(inPath, buf);
              await new Promise<void>((resolve, reject) => {
                // `[0]` = the PSD's merged composite; -flatten collapses any
                // remaining alpha/layers. Memory/map limits + a 120s kill
                // guard bound a hostile or enormous layered file.
                execFile(
                  "magick",
                  ["-limit", "memory", "1GiB", "-limit", "map", "2GiB", `${inPath}[0]`, "-flatten", outPath],
                  { timeout: 120_000 },
                  (err) => (err ? reject(err) : resolve()),
                );
              });
              inspectBuf = await fs.readFile(outPath);
            } catch (e: any) {
              console.warn("[art-inspect] psd flatten failed:", e?.message ?? e);
              return res.status(422).json({
                code: "psd_flatten_failed",
                message: "Couldn't flatten that PSD (unsupported variant or too complex). Export a CMYK TIFF or a PDF from Photoshop and upload that instead.",
              });
            } finally {
              await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
            }
          }
          // Everything below inspects the flattened composite for PSDs.
          const effectiveKind: "jpeg" | "png" | "tiff" = rasterKind === "psd" ? "tiff" : rasterKind;
          const sharp = (await import("sharp")).default;
          const meta = await sharp(inspectBuf, { limitInputPixels: 1_000_000_000 }).metadata();
          const wPx = meta.width ?? 0;
          const hPx = meta.height ?? 0;
          if (!wPx || !hPx) {
            return res.status(422).json({ message: "Couldn't read that image — ink + PPI will be verified at prepress." });
          }
          // Slot geometry — the spec's artboard already includes bleed.
          const specIdQ = typeof req.query.specId === "string" ? req.query.specId : null;
          let aw: number | null = null, ah: number | null = null, bleedLine: number | null = null, ppiFloor = 300;
          if (specIdQ) {
            const specRow = await storage.getPressTemplateSpecById(String(req.params.id), specIdQ);
            aw = specRow?.artboardWInches ?? specRow?.measuredArtboardWInches ?? null;
            ah = specRow?.artboardHInches ?? specRow?.measuredArtboardHInches ?? null;
            const line = specRow?.bleedLineInches ?? specRow?.measuredBleedLineInches ?? null;
            if (line != null && line > 0) bleedLine = line;
            if (specRow?.minPpi != null && specRow.minPpi > 0) ppiFloor = specRow.minPpi;
          }
          const rows: Array<{ param: string; tone: "pass" | "fail" | "na"; detail: string }> = [];
          // Color — PNG cannot carry CMYK at all; JPEG (Adobe CMYK JPEGs) and
          // TIFF (the standard print raster) both can; PSD is judged by its
          // flattened composite.
          const space = String(meta.space ?? "").toLowerCase();
          const kindLabel = rasterKind === "psd" ? "PSD (flattened)" : effectiveKind === "tiff" ? "TIFF" : effectiveKind === "jpeg" ? "JPEG" : "PNG";
          if (rasterKind === "png") {
            rows.push({ param: "Color", tone: "fail", detail: "PNG is an RGB format — it can't carry CMYK ink. Export a CMYK TIFF, a CMYK JPEG, or a PDF instead." });
          } else if (space === "cmyk") {
            rows.push({ param: "Color", tone: "pass", detail: `CMYK ${kindLabel} — ink is print-ready.` });
          } else if (space === "b-w" || space === "grey" || space === "gray" || meta.channels === 1) {
            rows.push({ param: "Color", tone: "pass", detail: "Grayscale — acceptable ink for print." });
          } else if (space) {
            rows.push({ param: "Color", tone: "fail", detail: `RGB ${kindLabel} — print art must be CMYK. Re-export from your design app as a CMYK TIFF or JPEG (or PDF); we never convert color for you.` });
          } else {
            rows.push({ param: "Color", tone: "na", detail: "Couldn't determine the color space — confirm CMYK on export." });
          }
          // Only trust a density that's actually EMBEDDED in the file —
          // sharp/libvips defaults untagged JPEGs to 72 DPI, which would make
          // us "measure" a physical size the file never claimed (review, Aug
          // 16 2026). Parse JFIF APP0 / PNG pHYs ourselves; fall back to
          // sharp's density only when it isn't the 72 default (Exif-tagged
          // files surface there).
          const embeddedPpi = (): number | null => {
            // TIFF (and flattened PSD → TIFF): libvips reads the file's own
            // XResolution/ResolutionUnit tags and reports density in PPI —
            // and unlike JPEG it does NOT default an untagged file to 72
            // (verified: untagged TIFF → density undefined). So a TIFF
            // density is trustworthy as-is.
            if (effectiveKind === "tiff") return meta.density && meta.density > 1 ? meta.density : null;
            try {
              if (rasterKind === "jpeg") {
                // Scan JPEG segments for APP0 "JFIF": units 1 = dots/inch, 2 = dots/cm.
                let p = 2;
                while (p + 4 <= buf.length && buf[p] === 0xff) {
                  const marker = buf[p + 1];
                  if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd9)) { p += 2; continue; }
                  const len = buf.readUInt16BE(p + 2);
                  if (marker === 0xe0 && len >= 14 && buf.toString("latin1", p + 4, p + 9) === "JFIF\0") {
                    const units = buf[p + 11];
                    const xden = buf.readUInt16BE(p + 12);
                    if (units === 1 && xden > 1) return xden;
                    if (units === 2 && xden > 1) return xden * 2.54;
                    return null; // units 0 = aspect ratio only, no physical size
                  }
                  if (marker === 0xda) break; // start of scan — no JFIF found
                  p += 2 + len;
                }
              } else if (rasterKind === "png") {
                const idx = buf.indexOf("pHYs", 8, "latin1");
                if (idx >= 0 && idx + 13 <= buf.length) {
                  const ppuX = buf.readUInt32BE(idx + 4);
                  const unit = buf[idx + 12];
                  if (unit === 1 && ppuX > 0) return ppuX * 0.0254; // pixels/metre → PPI
                }
                return null;
              }
            } catch { /* fall through */ }
            // Exif-carried resolution shows up in sharp's density; the bare
            // libvips default is exactly 72, so a 72 here stays untrusted.
            if (meta.density && meta.density > 1 && meta.density !== 72) return meta.density;
            return null;
          };
          const densityRaw = embeddedPpi();
          const density = densityRaw ? Math.round(densityRaw) : null;
          const r3 = (v: number) => Math.round(v * 1000) / 1000;
          const SIZE_TOL = 0.05; // inches — same tolerance as validateArt
          if (aw != null && ah != null && aw > 0 && ah > 0) {
            // Effective PPI if this frame IS the artboard (orientation-best).
            const effPpi = Math.round(Math.max(Math.min(wPx / aw, hPx / ah), Math.min(wPx / ah, hPx / aw)));
            if (density) {
              const wIn = wPx / density, hIn = hPx / density;
              const fits = (a: number, b: number) => Math.abs(a - aw!) <= SIZE_TOL && Math.abs(b - ah!) <= SIZE_TOL;
              const covers = (a: number, b: number) => a >= aw! - SIZE_TOL && b >= ah! - SIZE_TOL;
              const sizeOk = fits(wIn, hIn) || fits(hIn, wIn) || covers(wIn, hIn) || covers(hIn, wIn);
              rows.push(sizeOk
                ? { param: "Artboard size", tone: "pass", detail: `${r3(wIn)}" × ${r3(hIn)}" at ${density} PPI — covers the slot's ${r3(aw)}" × ${r3(ah)}" artboard (finished + bleed).` }
                : { param: "Artboard size", tone: "fail", detail: `${r3(wIn)}" × ${r3(hIn)}" at ${density} PPI — the slot's artboard is ${r3(aw)}" × ${r3(ah)}" (finished + bleed). Re-export at the full artboard size.` });
              rows.push(density >= ppiFloor
                ? { param: `Image resolution (min ${ppiFloor} PPI)`, tone: "pass", detail: `${density} PPI at the exported size — meets the ${ppiFloor} PPI minimum.` }
                : { param: `Image resolution (min ${ppiFloor} PPI)`, tone: "fail", detail: `${density} PPI at the exported size — below the ${ppiFloor} PPI minimum. Re-export at a higher resolution.` });
              // Bleed — no trim box in a raster; the artboard already includes
              // the bleed, so a frame that covers it carries its bleed.
              if (bleedLine != null) {
                rows.push(sizeOk
                  ? { param: "Bleed", tone: "pass", detail: `Frame covers the full artboard — the outer ${r3(bleedLine)}" is your bleed. Keep art extending to the very edges.` }
                  : { param: "Bleed", tone: "fail", detail: `Frame doesn't cover the artboard, so the ${r3(bleedLine)}" bleed can't be present. Re-export at the full artboard size with art to the edges.` });
              }
            } else {
              // No PPI tag — physical size is unknowable, but the frame's
              // PROPORTIONS are still a real measurement against the artboard
              // (gogoods, Aug 16 2026: "artboard size wasn't measured").
              // Orientation-best, 1% ratio tolerance.
              const ratioOk = (a: number, b: number) => Math.abs(a / b - aw! / ah!) / (aw! / ah!) <= 0.01;
              const propOk = ratioOk(wPx, hPx) || ratioOk(hPx, wPx);
              rows.push(propOk
                ? { param: "Artboard size", tone: "pass", detail: `${wPx} × ${hPx} px matches the slot's ${r3(aw)}" × ${r3(ah)}" artboard proportions — that's the full artboard at ≈${effPpi} PPI. (No PPI tag in the file to confirm the export scale.)` }
                : { param: "Artboard size", tone: "fail", detail: `${wPx} × ${hPx} px doesn't match the slot's ${r3(aw)}" × ${r3(ah)}" artboard proportions. Re-export at the full artboard size (finished + bleed).` });
              rows.push(effPpi >= ppiFloor
                ? { param: `Image resolution (min ${ppiFloor} PPI)`, tone: "pass", detail: `${wPx} × ${hPx} px ≈ ${effPpi} PPI at the artboard size — meets the ${ppiFloor} PPI minimum.` }
                : { param: `Image resolution (min ${ppiFloor} PPI)`, tone: "fail", detail: `${wPx} × ${hPx} px ≈ ${effPpi} PPI at the artboard size — below the ${ppiFloor} PPI minimum.` });
              if (bleedLine != null) {
                rows.push({ param: "Bleed", tone: "na", detail: `No PPI tag to confirm physical size — if the frame is the full artboard, the outer ${r3(bleedLine)}" is your bleed. Confirmed at prepress.` });
              }
            }
          } else if (density) {
            rows.push({ param: "Artboard size", tone: "na", detail: `Measures ${r3(wPx / density)}" × ${r3(hPx / density)}" at ${density} PPI — no artboard on this slot to compare against.` });
            rows.push(density >= ppiFloor
              ? { param: `Image resolution (min ${ppiFloor} PPI)`, tone: "pass", detail: `${density} PPI at the exported size — meets the ${ppiFloor} PPI minimum.` }
              : { param: `Image resolution (min ${ppiFloor} PPI)`, tone: "fail", detail: `${density} PPI at the exported size — below the ${ppiFloor} PPI minimum.` });
          } else {
            rows.push({ param: "Artboard size", tone: "na", detail: `${wPx} × ${hPx} px — no PPI tag and no slot artboard to measure against. Verified at prepress.` });
          }
          // Browsers can't reliably decode CMYK JPEGs — the client's <img>
          // preview came up blank for exactly the files that pass the ink
          // check (gogoods, Aug 16 2026). Send back a resized sRGB preview
          // so the overlay always renders, color-correct. Best-effort: a
          // preview failure never blocks the measured rows.
          let previewDataUrl: string | undefined;
          try {
            // 320 MP cap — real jacket art tops out well under this (30" ×
            // 600 PPI ≈ 234 MP); an unbounded decode of a crafted raster
            // could exhaust worker memory (review, Aug 16 2026).
            let pvPipe = sharp(inspectBuf, { limitInputPixels: 320_000_000 })
              .resize({ width: 2000, withoutEnlargement: true });
            // A flattened PSD/TIFF can carry an alpha channel (CMYKA) — JPEG
            // can't; composite onto white (paper) instead of sharp's black.
            if (meta.hasAlpha) pvPipe = pvPipe.flatten({ background: "#ffffff" });
            const pv = await pvPipe
              .toColourspace("srgb")
              .jpeg({ quality: 78 })
              .toBuffer();
            previewDataUrl = `data:image/jpeg;base64,${pv.toString("base64")}`;
          } catch (e: any) {
            console.warn("[art-inspect] preview render failed:", e?.message ?? e);
          }
          // Pixel dims ride along so the client can keep the raster's own
          // aspect ratio in the overlay (it was stretch-filling the anchor).
          return res.json({ checks: rows, previewDataUrl, pxW: wPx, pxH: hPx });
        } catch (e: any) {
          console.error("[art-inspect] raster failed:", e?.message ?? e);
          return res.status(422).json({ message: "Couldn't inspect that image — ink + PPI will be verified at prepress." });
        }
      }
      try {
        // 5-minute cap, not 60s — the timer covers the UPLOAD too, and a
        // jacket-spread art PDF over a home uplink easily outlives a minute
        // (gogoods hit "inspection unavailable" on prod, Aug 16 2026).
        const { scan, error } = await scanPdfStream(
          storedFile ? (storedFile.createReadStream() as NodeJS.ReadableStream & { destroy?: (err?: Error) => void }) : req,
          { maxBytes: ART_INSPECT_MAX_BYTES, timeoutMs: 300_000 },
        );
        if (error === "too_large") {
          return res.status(413).json({ message: "That file is too large to inspect (300 MB max)." });
        }
        if (!scan || error) {
          console.warn(`[art-inspect] scan failed reason=${error ?? "no-scan"} bytes=${declared || "?"}`);
          if (error === "timeout") {
            return res.status(422).json({ message: "The upload took too long to inspect — ink + PPI will be verified at prepress." });
          }
          return res.status(422).json({ message: "Couldn't inspect that file — ink + PPI will be verified at prepress." });
        }
        if (!scan.isPdf) {
          return res.status(422).json({ message: "That file isn't a PDF or JPEG/PNG/TIFF/PSD — export one of those for ink and resolution checks." });
        }
        if (scan.truncated) {
          // A partial scan must not report measured rows as authoritative.
          return res.status(422).json({ message: "Couldn't read the whole file — ink + PPI will be verified at prepress." });
        }
        const rows: Array<{ param: string; tone: "pass" | "warn" | "fail" | "na"; detail: string }> = [];
        // Ink — same canon as the certification test's cmyk-or-pms branch.
        const spotUsage = (scan as any).spotUsage ?? (scan.hasSpot ? "unknown" : "none");
        const spotInUse = scan.hasSpot && spotUsage !== "unused";
        // RGB usage discipline — non-printing RGB (palette swatches, hidden
        // / print-off dieline layers) must not fail; mirrors certification.
        const rgbUsage = (scan as any).rgbUsage ?? (scan.hasRGB ? "unknown" : "none");
        const rgbInUse = scan.hasRGB && rgbUsage !== "unused";
        if (scan.hasCMYK || spotInUse) {
          const parts = [scan.hasCMYK ? "CMYK" : null, spotInUse ? "spot/PMS" : null].filter(Boolean);
          rows.push({
            param: "Color",
            tone: "pass",
            detail: `${parts.join(" + ")} ink present${scan.hasRGB ? (rgbUsage === "unused" ? " — non-printing RGB (swatches / hidden layers) ignored" : " — embedded RGB preview ignored") : ""}`,
          });
        } else if (rgbInUse) {
          rows.push({
            param: "Color",
            tone: "fail",
            detail: "RGB only — print art must be CMYK (or named spot/PMS colors). Convert and re-export.",
          });
        } else {
          rows.push({ param: "Color", tone: "na", detail: "Couldn't determine color mode — confirm CMYK on export." });
        }
        // Image resolution — placement isn't readable from the PDF, so we
        // bracket it: the full page is the worst case, and the template's GT
        // Bleed frame (sent by the client from the loaded template's own
        // layers) is the INTENDED footprint — art matching the template puts
        // its background image at the bleed frame (gogoods, Aug 16 2026:
        // jacket PDF read ≈282 worst-case but ≈345 at its bleed placement).
        const page = scan.pageSizesInches[0] ?? null;
        // The client-sent frame is bounded against the file's OWN page (the
        // artboard, measured server-side from the PDF): it must fit inside
        // the page and cover at least 40% of it in both dimensions, or it's
        // ignored — a forged tiny frame can't manufacture a Pass (review,
        // Aug 16 2026).
        const bleedWq = Number(req.query.bleedWIn), bleedHq = Number(req.query.bleedHIn);
        const bleedBox = (() => {
          if (!Number.isFinite(bleedWq) || !Number.isFinite(bleedHq) || bleedWq <= 0 || bleedHq <= 0) return null;
          if (!page) return null;
          const TOL = 0.05;
          const fitsInPage = bleedWq <= page.w + TOL && bleedHq <= page.h + TOL;
          const coversEnough = bleedWq >= page.w * 0.4 && bleedHq >= page.h * 0.4;
          return fitsInPage && coversEnough ? { w: bleedWq, h: bleedHq } : null;
        })();
        // PPI of the largest image BY PIXEL AREA (most plausibly the full-
        // bleed background) placed at the given footprint — not the best-case
        // image, which would let a hi-res icon mask a low-res background.
        const ppiAt = (dims: { w: number; h: number }[], box: { w: number; h: number }): number => {
          let biggest: { w: number; h: number } | null = null;
          for (const d of dims) if (!biggest || d.w * d.h > biggest.w * biggest.h) biggest = d;
          if (!biggest) return 0;
          return Math.max(
            Math.min(biggest.w / box.w, biggest.h / box.h),
            Math.min(biggest.w / box.h, biggest.h / box.w),
          );
        };
        const bestPpi = (dims: { w: number; h: number }[]): number => {
          if (!page) return 0;
          let best = 0;
          for (const d of dims) {
            const est = Math.max(
              Math.min(d.w / page.w, d.h / page.h),
              Math.min(d.w / page.h, d.h / page.w),
            );
            if (est > best) best = est;
          }
          return best;
        };
        if (scan.imageDimsPx.length === 0) {
          rows.push({
            param: "Image resolution (min 300 PPI)",
            // Viryl, Aug 18 2026: vector-only art PASSES — pixels aren't
            // required, so there is nothing to hold to a resolution floor.
            tone: "pass",
            detail: "No embedded raster images — vector-only art passes (no resolution floor applies).",
          });
        } else if (!page) {
          rows.push({
            param: "Image resolution (min 300 PPI)",
            tone: "na",
            detail: "Couldn't read the page size to estimate PPI — verify placed images at prepress.",
          });
        } else {
          const best = Math.round(bestPpi(scan.imageDimsPx));
          const atBleed = bleedBox ? Math.round(ppiAt(scan.imageDimsPx, bleedBox)) : null;
          rows.push(
            best >= 300
              ? { param: "Image resolution (min 300 PPI)", tone: "pass", detail: `Largest embedded image ≈${best} PPI even if it spans the full artboard (worst case) — meets the 300 PPI minimum.` }
              : atBleed != null && atBleed >= 300
              ? { param: "Image resolution (min 300 PPI)", tone: "pass", detail: `Largest embedded image ≈${atBleed} PPI at the template's bleed frame — art matching the template places its image there, and that meets the 300 PPI minimum. (≈${best} PPI only if it were stretched across the entire artboard, template margins included. Exact placement is confirmed at prepress.)` }
              : atBleed != null
              ? { param: "Image resolution (min 300 PPI)", tone: "fail", detail: `Largest embedded image ≈${atBleed} PPI even at the template's bleed frame — below the 300 PPI minimum. Re-export with higher-resolution images.` }
              : { param: "Image resolution (min 300 PPI)", tone: "na", detail: `Largest embedded image ≈${best} PPI if it spans the full artboard — placement isn't measured, so an image covering just the bleed area is proportionally higher. Confirmed exactly at prepress.` },
          );
        }
        if (scan.bitmapImageDimsPx.length > 0 && page) {
          const best = Math.round(bestPpi(scan.bitmapImageDimsPx));
          const atBleed = bleedBox ? Math.round(ppiAt(scan.bitmapImageDimsPx, bleedBox)) : null;
          rows.push(
            best >= 800
              ? { param: "1-bit image resolution (min 800 PPI)", tone: "pass", detail: `Largest 1-bit image ≈${best} PPI even if it spans the full artboard (worst case) — meets the 800 PPI minimum.` }
              : atBleed != null && atBleed >= 800
              ? { param: "1-bit image resolution (min 800 PPI)", tone: "pass", detail: `Largest 1-bit image ≈${atBleed} PPI at the template's bleed frame — meets the 800 PPI minimum.` }
              : atBleed != null
              ? { param: "1-bit image resolution (min 800 PPI)", tone: "fail", detail: `Largest 1-bit image ≈${atBleed} PPI even at the template's bleed frame — below the 800 PPI minimum for line art.` }
              : { param: "1-bit image resolution (min 800 PPI)", tone: "na", detail: `Largest 1-bit image ≈${best} PPI if it spans the full artboard — placement isn't measured, so a smaller placement is proportionally higher. Confirmed exactly at prepress.` },
          );
        }
        // Bleed — live, same canon as the full test (gogoods, Aug 16 2026:
        // the banner said "3 of 3 passed" while the server test failed on
        // bleed — the live check must measure it too so they can't diverge).
        // Reference line = the slot's certified/measured template bleed line,
        // threaded via ?specId= when the client knows its slot. Check gated
        // on a reference being present (press-print-rules canon: no rule, no
        // verdict); the file's own boxes alone report informationally.
        {
          const specIdQ = typeof req.query.specId === "string" ? req.query.specId : null;
          let bleedLine: number | null = null;
          if (specIdQ) {
            const specRow = await storage.getPressTemplateSpecById(String(req.params.id), specIdQ);
            const line = specRow?.bleedLineInches ?? specRow?.measuredBleedLineInches ?? null;
            if (line != null && line > 0) bleedLine = line;
          }
          const measured = hasTrustworthyBleedBoxes(scan) ? measuredBleedInches(scan) : null;
          const r3 = (v: number) => Math.round(v * 1000) / 1000;
          const BLEED_TOL = 0.005;
          if (bleedLine != null) {
            if (measured == null) {
              rows.push({ param: "Bleed", tone: "na", detail: `This file carries no usable trim/bleed boxes — bleed is checked against the template's ${r3(bleedLine)}" line at prepress.` });
            } else if (measured + BLEED_TOL >= bleedLine) {
              rows.push({ param: "Bleed", tone: "pass", detail: `Measured ≈${r3(measured)}" bleed — meets the template's ${r3(bleedLine)}" bleed line.` });
            } else {
              rows.push({ param: "Bleed", tone: "fail", detail: `Measured ≈${r3(measured)}" bleed — below the template's ${r3(bleedLine)}" bleed line. Re-export with bleed included.` });
            }
          } else if (measured != null) {
            rows.push({ param: "Bleed", tone: "na", detail: `Measured ≈${r3(measured)}" bleed from the file's own boxes — no certified template bleed line on this slot to compare against.` });
          }
        }
        // Fonts / live text — live, same canon as the full test (Task #3400:
        // the banner claimed Pass on files the certification run flags for
        // live text — the same live-vs-server divergence that bit Bleed).
        // ONE shared verdict (fontsCheckVerdict) so the surfaces can't drift.
        // PDF-only by construction: rasters returned above (pixels can't
        // carry live text).
        {
          const fonts = fontsCheckVerdict(scan);
          rows.push({ param: "Fonts", tone: fonts.status, detail: fonts.message });
        }
        res.json({ checks: rows });
      } catch (e: any) {
        console.error("[art-inspect] failed:", e?.message ?? e);
        res.status(422).json({ message: "Couldn't inspect that file — ink + PPI will be verified at prepress." });
      }
    },
  );

  // POST /api/press/:id/templates/:specId/runs/:runId/certify — promote a
  // clean run: stamps the run and flips its pinned revision to certified.
  app.post(
    "/api/press/:id/templates/:specId/runs/:runId/certify",
    requireAdmin,
    requirePressScope,
    requirePressEditor,
    async (req, res) => {
      const pressId = String(req.params.id);
      const spec = await storage.getPressTemplateSpecById(pressId, String(req.params.specId));
      if (!spec) return res.status(404).json({ message: "Template slot not found" });
      const run = await storage.getPressTemplateTestRunById(String(req.params.runId));
      if (!run || run.specId !== spec.id) return res.status(404).json({ message: "Test run not found" });
      if (run.verdict !== "pass" && run.verdict !== "warn") {
        return res.status(409).json({
          message: "Only a passing test run can certify a template — fix the flagged checks and run the test again.",
        });
      }
      // State machine: a run may only certify the revision that is live
      // RIGHT NOW. A run pinned to a superseded/archived revision (the file
      // was replaced or pulled since the test) — or to no revision at all —
      // must re-test against the current template, never resurrect history.
      if (!spec.templateFileUrl) {
        return res.status(409).json({
          message: "This slot no longer has a live template — attach one and run the test again.",
        });
      }
      const revs = await storage.listPressTemplateRevisions([spec.id]);
      const live = revs.find((r) => r.status === "pending" || r.status === "certified") ?? null;
      if (!run.revisionId || !live || run.revisionId !== live.id) {
        return res.status(409).json({
          message:
            "This test ran against an older template revision — the template has changed since. Run the test again on the current file.",
        });
      }
      const when = new Date();
      await storage.certifyPressTemplateTestRun(run.id, when);
      await storage.setPressTemplateRevisionStatus(live.id, "certified", when);
      res.json({ ok: true, certifiedAt: when.toISOString() });
    },
  );
}
