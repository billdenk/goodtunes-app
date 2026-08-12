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
import { validateCompletedComponent } from "./validators/completedTemplate";
import {
  measureTemplateSpecRow,
  clearTemplateSpecMeasurements,
  scanTemplateUrl,
} from "./templateSpecs";
import type { PressTemplateSpec } from "@shared/schema";

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

const attachSchema = z.object({
  format: z.enum(FORMAT_VALUES),
  componentKey: z.enum(COMPONENT_VALUES),
  variantKey: z.string().max(64).optional().default(""),
  discCount: z.number().int().min(0).max(9).optional().default(0),
  fileUrl: z.string().min(1).max(2048),
  fileName: z.string().max(512).nullable().optional(),
});

const testSchema = z.object({
  url: z.string().min(1).max(2048),
  fileName: z.string().max(512).nullable().optional(),
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
  // GET /api/press/:id/templates — every slot row for this press with its
  // revision history and latest test runs, one payload for the whole flow.
  app.get("/api/press/:id/templates", requireAdmin, requirePressScope, async (req, res) => {
    const pressId = String(req.params.id);
    const press = await storage.getManufacturerById(pressId);
    if (!press) return res.status(404).json({ message: "Press not found" });
    let specs = await storage.listPressTemplateSpecs(pressId);
    // Legacy uploads (file on the slot, no revision history) get imported
    // into the revision flow on first view — best-effort, never blocks.
    const imported = await autoImportLegacyTemplates(press, specs).catch((e) => {
      console.error("[templates-import] failed:", e?.message ?? e);
      return false;
    });
    if (imported) specs = await storage.listPressTemplateSpecs(pressId);
    const specIds = specs.map((s) => s.id);
    const [revisions, runs] = await Promise.all([
      storage.listPressTemplateRevisions(specIds),
      storage.listPressTemplateTestRuns(specIds),
    ]);
    const { pressUserCanEdit } = await import("./auth/partnerPermissions");
    const canEdit = await pressUserCanEdit(req.session.userId!, pressId);
    res.json({
      canEdit,
      specs: specs.map((s) => ({
        ...s,
        revisions: revisions.filter((r) => r.specId === s.id),
        runs: runs.filter((r) => r.specId === s.id).slice(0, 10),
      })),
    });
  });

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
      // Non-jacket components carry no variant (mirrors the admin route).
      const variantKey = d.componentKey === "jacket" ? d.variantKey : "";
      const existing = (await storage.listPressTemplateSpecs(pressId, d.format)).find(
        (r) =>
          r.componentKey === d.componentKey &&
          (r.variantKey ?? "") === variantKey &&
          r.discCount === (d.discCount ?? 0),
      );
      let spec: PressTemplateSpec;
      if (existing) {
        const updated = await storage.updatePressTemplateSpecFile(
          pressId,
          existing.id,
          d.fileUrl,
          d.fileName ?? null,
          req.session.userId ?? null,
        );
        if (!updated) return res.status(404).json({ message: "Template slot not found" });
        spec = updated;
      } else {
        spec = await storage.upsertPressTemplateSpec(
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
      }
      await clearTemplateSpecMeasurements(pressId, spec.id);
      await measureTemplateSpecRow(pressId, spec.id);
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
      res.json({ spec: measured, revision });
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

  // POST /api/press/:id/templates/:specId/test — run a finished test file
  // against this slot through the completed-template engine. Streams the
  // file (own object storage or SSRF-guarded https) — never stores it.
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
      const { scan, error } = await scanTemplateUrl(body.data.url);
      if (!scan) {
        return res.status(422).json({ message: error ?? "Couldn't read that file." });
      }
      const checks: CheckResult[] = validateCompletedComponent(scan, slotSpec);
      const verdict = rollupStatus(checks);

      // Pin the run to the revision that is live right now.
      const revs = await storage.listPressTemplateRevisions([spec.id]);
      const live = revs.find((r) => r.status === "pending" || r.status === "certified") ?? null;
      const run = await storage.createPressTemplateTestRun({
        specId: spec.id,
        revisionId: live?.id ?? null,
        fileUrl: body.data.url,
        fileName: body.data.fileName ?? null,
        checks,
        verdict,
        createdByUserId: req.session.userId ?? null,
      });
      res.json({ run });
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
