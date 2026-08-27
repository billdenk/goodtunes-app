// Task #3407 — History & tests panel view-model. Pure functions so the
// mapping from a spec's server-logged revisions/runs to interactive panel
// rows (and the "what happens when you click a test row" plan) is unit-
// testable without mounting the pdf.js-heavy live-test page.
import type { TemplateSpecWithHistory, TemplateTestRun, TemplateRevision } from "./types";

/** One test row in the panel — runId/hasFile present only for server runs. */
export type HistoryTestVM = {
  art: string;
  at: string;
  verdict: string;
  runId?: string;
  revisionId?: string | null;
  hasFile?: boolean;
};

/** One superseded/archived revision row in the panel. */
export type HistoryRevisionVM = {
  /** Server revision id — absent for this-session local rows (a Replace
   *  pushes the outgoing template as a local row before the PUT lands). */
  id?: string;
  name: string;
  wMm: number;
  hMm: number;
  at: string;
  /** True when the revision's stored PDF can be fetched for viewing. */
  hasFile?: boolean;
  status?: TemplateRevision["status"];
  tests: HistoryTestVM[];
};

export const verdictWordFor = (v: string): string =>
  v === "pass" ? "Pass"
  : v === "unverified" ? "Visual only"
  : v === "processing" ? "Checking…"
  : v === "error" ? "Check didn\u2019t finish"
  : "Flagged";

export const fmtHistoryDate = (d: string): string =>
  new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

const runToTest = (run: TemplateTestRun): HistoryTestVM => ({
  art: run.fileName ?? "Art file",
  at: fmtHistoryDate(run.createdAt),
  verdict: verdictWordFor(run.verdict),
  runId: run.id,
  revisionId: run.revisionId,
  // The run-file route only serves stored /objects paths (409 otherwise).
  hasFile: !!run.fileUrl?.startsWith("/objects/"),
});

/**
 * Map a spec's revisions + runs into the panel's state: the current
 * revision's test trail (oldest→newest, matching the sheet) and the
 * superseded/archived revision rows with their tests attached.
 */
export function specHistoryViewModel(
  spec: Pick<TemplateSpecWithHistory, "revisions" | "runs">,
): { priorTests: HistoryTestVM[]; revisions: HistoryRevisionVM[] } {
  const currentRevIds = new Set(
    spec.revisions.filter((rv) => rv.status !== "superseded" && rv.status !== "archived").map((rv) => rv.id),
  );
  const priorTests = spec.runs
    .filter((run) => run.revisionId === null || currentRevIds.has(run.revisionId))
    .slice()
    .reverse() // server is newest-first; the sheet reads oldest→newest
    .map(runToTest);
  const revisions = spec.revisions
    .filter((rv) => rv.status === "superseded" || rv.status === "archived")
    .map((rv) => ({
      id: rv.id,
      name: rv.fileName ?? rv.revLabel,
      wMm: 0, // unknown for stored revisions — the sheet hides 0-size
      hMm: 0,
      at: fmtHistoryDate(rv.createdAt),
      hasFile: !!rv.fileUrl,
      status: rv.status,
      tests: spec.runs.filter((run) => run.revisionId === rv.id).slice().reverse().map(runToTest),
    }));
  return { priorTests, revisions };
}

/** A superseded revision row is openable only when its stored PDF exists. */
export function revisionRowOpenable(rev: HistoryRevisionVM): boolean {
  return !!rev.id && rev.hasFile === true;
}

/**
 * Task #3407 review — read-only art policy. Historical states never fire an
 * active art operation against the server (ink/PPI inspection or its retry):
 *   • viewing a superseded revision is strictly read-only;
 *   • a saved run's re-hydrated art already carries its recorded verdict —
 *     re-measuring it is meaningless and mutates nothing on purpose.
 * Only a fresh, deliberate art pick in the live view may inspect.
 */
export function artInspectionAllowed(opts: {
  viewingSupersededRevision: boolean;
  viewedRunArt: boolean;
}): boolean {
  return !opts.viewingSupersededRevision && !opts.viewedRunArt;
}

/**
 * Decide what a test-row click loads. The run's art must render against the
 * revision it was pinned to:
 *   • pinned to a superseded revision (with a stored file) → load that
 *     revision's template first (unless it's already being viewed);
 *   • pinned to the current revision (or unpinned) while viewing a
 *     superseded one → go back to the current template first;
 *   • no stored art file → not clickable.
 */
export function runViewPlan(
  test: HistoryTestVM,
  opts: { supersededRevisions: HistoryRevisionVM[]; viewingRevisionId: string | null },
):
  | { kind: "unavailable" }
  | { kind: "view"; loadRevision: HistoryRevisionVM | null; backToCurrent: boolean } {
  if (!test.runId || !test.hasFile) return { kind: "unavailable" };
  const pinned = test.revisionId
    ? opts.supersededRevisions.find((r) => r.id === test.revisionId) ?? null
    : null;
  if (pinned) {
    if (!revisionRowOpenable(pinned)) {
      // The pinned revision's file is gone — the art alone is still worth
      // seeing; show it over whatever template is currently loaded.
      return { kind: "view", loadRevision: null, backToCurrent: false };
    }
    return {
      kind: "view",
      loadRevision: opts.viewingRevisionId === pinned.id ? null : pinned,
      backToCurrent: false,
    };
  }
  // Pinned to the live revision (or unpinned legacy run).
  return { kind: "view", loadRevision: null, backToCurrent: opts.viewingRevisionId !== null };
}
