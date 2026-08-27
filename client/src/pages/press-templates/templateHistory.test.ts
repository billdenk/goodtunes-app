// Task #3407 — History & tests panel view-model: mapping server revisions +
// runs into interactive rows, which rows are openable, and what a test-row
// click loads (the run's art must render against the revision it was pinned
// to). Pure-module tests — the live-test page itself can't run under node
// (pdf.js Vite-only imports), so the clickability rules live here.
//
//   npx tsx --test client/src/pages/press-templates/templateHistory.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  specHistoryViewModel,
  revisionRowOpenable,
  runViewPlan,
  verdictWordFor,
  artInspectionAllowed,
  type HistoryRevisionVM,
  type HistoryTestVM,
} from "./templateHistory";
import type { TemplateRevision, TemplateTestRun } from "./types";

const rev = (o: Partial<TemplateRevision> & { id: string; status: TemplateRevision["status"] }): TemplateRevision => ({
  specId: "spec1",
  revLabel: o.id,
  fileUrl: "/objects/uploads/rev.pdf",
  fileName: null,
  note: null,
  measuredSnapshot: null,
  createdAt: "2026-08-01T00:00:00.000Z",
  supersededAt: null,
  certifiedAt: null,
  ...o,
});

const run = (o: Partial<TemplateTestRun> & { id: string; revisionId: string | null }): TemplateTestRun => ({
  specId: "spec1",
  fileUrl: "/objects/uploads/art.pdf",
  fileName: "art.pdf",
  checks: [],
  verdict: "pass",
  previewUrl: null,
  previewUrl2: null,
  createdAt: "2026-08-02T00:00:00.000Z",
  certifiedAt: null,
  ...o,
});

test("view model: current-rev runs land in priorTests (oldest→newest), superseded revs carry their own runs", () => {
  const vm = specHistoryViewModel({
    revisions: [
      rev({ id: "cur", status: "pending" }),
      rev({ id: "old", status: "superseded", fileName: "old.pdf" }),
    ],
    runs: [
      // Server order is newest-first.
      run({ id: "r3", revisionId: "cur", verdict: "fail" }),
      run({ id: "r2", revisionId: "cur" }),
      run({ id: "r1", revisionId: "old" }),
    ],
  });
  assert.deepEqual(vm.priorTests.map((t) => t.runId), ["r2", "r3"], "oldest→newest for the sheet");
  assert.equal(vm.priorTests[1].verdict, "Flagged");
  assert.equal(vm.revisions.length, 1);
  assert.equal(vm.revisions[0].id, "old");
  assert.equal(vm.revisions[0].name, "old.pdf");
  assert.equal(vm.revisions[0].hasFile, true);
  assert.deepEqual(vm.revisions[0].tests.map((t) => t.runId), ["r1"]);
});

test("view model: runs with non-stored art are marked hasFile=false; unpinned runs count as current", () => {
  const vm = specHistoryViewModel({
    revisions: [rev({ id: "cur", status: "certified" })],
    runs: [
      run({ id: "ext", revisionId: "cur", fileUrl: "https://example.com/a.pdf" }),
      run({ id: "legacy", revisionId: null }),
    ],
  });
  assert.deepEqual(vm.priorTests.map((t) => t.runId), ["legacy", "ext"]);
  assert.equal(vm.priorTests.find((t) => t.runId === "ext")?.hasFile, false);
  assert.equal(vm.priorTests.find((t) => t.runId === "legacy")?.hasFile, true);
});

test("revisionRowOpenable: needs a server id AND a stored file", () => {
  assert.equal(revisionRowOpenable({ id: "a", hasFile: true, name: "", wMm: 0, hMm: 0, at: "", tests: [] }), true);
  assert.equal(revisionRowOpenable({ id: "a", hasFile: false, name: "", wMm: 0, hMm: 0, at: "", tests: [] }), false);
  // Local this-session rows (Replace pushed before the PUT landed) have no id.
  assert.equal(revisionRowOpenable({ name: "", wMm: 0, hMm: 0, at: "", tests: [] }), false);
});

test("runViewPlan: pinned to a superseded revision → load that revision first", () => {
  const old: HistoryRevisionVM = { id: "old", hasFile: true, name: "old.pdf", wMm: 0, hMm: 0, at: "", tests: [] };
  const t: HistoryTestVM = { art: "a.pdf", at: "", verdict: "Pass", runId: "r1", revisionId: "old", hasFile: true };
  const plan = runViewPlan(t, { supersededRevisions: [old], viewingRevisionId: null });
  assert.deepEqual(plan, { kind: "view", loadRevision: old, backToCurrent: false });
  // Already viewing that revision — nothing to switch.
  const plan2 = runViewPlan(t, { supersededRevisions: [old], viewingRevisionId: "old" });
  assert.deepEqual(plan2, { kind: "view", loadRevision: null, backToCurrent: false });
});

test("runViewPlan: pinned to current while viewing a superseded rev → back to current first", () => {
  const t: HistoryTestVM = { art: "a.pdf", at: "", verdict: "Pass", runId: "r1", revisionId: "cur", hasFile: true };
  const viewing = runViewPlan(t, { supersededRevisions: [], viewingRevisionId: "old" });
  assert.deepEqual(viewing, { kind: "view", loadRevision: null, backToCurrent: true });
  const notViewing = runViewPlan(t, { supersededRevisions: [], viewingRevisionId: null });
  assert.deepEqual(notViewing, { kind: "view", loadRevision: null, backToCurrent: false });
});

test("runViewPlan: no stored art (or local-only row) is unavailable; pinned rev without file shows art in place", () => {
  assert.deepEqual(
    runViewPlan({ art: "a", at: "", verdict: "Pass" }, { supersededRevisions: [], viewingRevisionId: null }),
    { kind: "unavailable" },
  );
  assert.deepEqual(
    runViewPlan(
      { art: "a", at: "", verdict: "Pass", runId: "r1", hasFile: false },
      { supersededRevisions: [], viewingRevisionId: null },
    ),
    { kind: "unavailable" },
  );
  const fileless: HistoryRevisionVM = { id: "old", hasFile: false, name: "", wMm: 0, hMm: 0, at: "", tests: [] };
  assert.deepEqual(
    runViewPlan(
      { art: "a", at: "", verdict: "Pass", runId: "r1", revisionId: "old", hasFile: true },
      { supersededRevisions: [fileless], viewingRevisionId: null },
    ),
    { kind: "view", loadRevision: null, backToCurrent: false },
    "art is still worth seeing over whatever template is loaded",
  );
});

test("verdict words mirror the server verdict states", () => {
  assert.equal(verdictWordFor("pass"), "Pass");
  assert.equal(verdictWordFor("unverified"), "Visual only");
  assert.equal(verdictWordFor("processing"), "Checking…");
  assert.equal(verdictWordFor("error"), "Check didn\u2019t finish");
  assert.equal(verdictWordFor("fail"), "Flagged");
  assert.equal(verdictWordFor("warn"), "Flagged");
});

test("artInspectionAllowed: read-only states never fire an art inspection (auto or retry)", () => {
  // Superseded-view mode is strictly read-only — the retry control's handler
  // and the auto-inspect on load both route through this policy.
  assert.equal(
    artInspectionAllowed({ viewingSupersededRevision: true, viewedRunArt: false }),
    false,
  );
  // A saved run's re-hydrated art carries its recorded verdict — never
  // re-measured, even when viewed against the current template.
  assert.equal(
    artInspectionAllowed({ viewingSupersededRevision: false, viewedRunArt: true }),
    false,
  );
  assert.equal(
    artInspectionAllowed({ viewingSupersededRevision: true, viewedRunArt: true }),
    false,
  );
  // Only a fresh deliberate pick in the live view may inspect.
  assert.equal(
    artInspectionAllowed({ viewingSupersededRevision: false, viewedRunArt: false }),
    true,
  );
});
