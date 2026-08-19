// Task #3200 — the live-test certification scan runs DETACHED from Save, so
// its results land through a GUARDED state transition:
// `updatePressTemplateTestRunResult` only applies while the run is still
// "processing". Regression coverage for the review-flagged race: a scan that
// stalls past the deadline gets its run swept to a terminal "error" — if the
// stalled worker later resumes and lands a pass, that pass must be REJECTED
// (returns null, row keeps the error), or it would silently overwrite the
// failure the operator saw and auto-certify off it.
//
//   npx tsx --test server/pressTemplateTestRuns.asyncGuard.db.test.ts
import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { db, pool } from "./db";
import { storage } from "./storage";

const exec = (q: any) => db.execute(q);

let pressId = "";
let specId = "";
const runIds = new Set<string>();

before(async () => {
  pressId = randomUUID();
  await exec(sql`INSERT INTO manufacturers (id, name) VALUES (${pressId}, ${"t3200 Press"})`);
  specId = randomUUID();
  await exec(sql`
    INSERT INTO press_template_specs (id, press_id, format, component_key, variant_key, disc_count)
    VALUES (${specId}, ${pressId}, ${"12_lp"}, ${"jacket"}, ${""}, ${1})
  `);
});

after(async () => {
  for (const id of runIds) {
    await exec(sql`DELETE FROM press_template_test_runs WHERE id = ${id}`);
  }
  await exec(sql`DELETE FROM press_template_specs WHERE id = ${specId}`);
  await exec(sql`DELETE FROM manufacturers WHERE id = ${pressId}`);
  await pool.end();
});

const mintProcessingRun = async () => {
  const run = await storage.createPressTemplateTestRun({
    specId,
    revisionId: null,
    fileUrl: "/objects/uploads/t3200-art.pdf",
    fileName: "t3200-art.pdf",
    checks: [],
    verdict: "processing",
    createdByUserId: null,
  });
  runIds.add(run.id);
  return run;
};

test("a normal completion lands on a processing run", async () => {
  const run = await mintProcessingRun();
  const landed = await storage.updatePressTemplateTestRunResult(run.id, {
    checks: [{ key: "bleed", label: "Bleed", status: "pass" }],
    verdict: "pass",
  });
  assert.ok(landed, "result should land while the run is processing");
  assert.equal(landed!.verdict, "pass");
});

test("timeout-then-late-success: a late pass never overwrites the recorded error", async () => {
  const run = await mintProcessingRun();
  // Deadline (or restart sweep) records the terminal error first…
  const errored = await storage.updatePressTemplateTestRunResult(run.id, {
    checks: [
      { key: "scan", label: "Certification scan", status: "fail", message: "timed out" },
    ],
    verdict: "error",
  });
  assert.ok(errored);
  assert.equal(errored!.verdict, "error");
  // …then the stalled worker resumes and tries to land a pass.
  const late = await storage.updatePressTemplateTestRunResult(run.id, {
    checks: [{ key: "bleed", label: "Bleed", status: "pass" }],
    verdict: "pass",
  });
  assert.equal(late, null, "late result must be rejected (guarded transition)");
  const row = await storage.getPressTemplateTestRunById(run.id);
  assert.equal(row?.verdict, "error", "the error verdict the operator saw must stand");
});

test("a second completion (double-settle) is also rejected", async () => {
  const run = await mintProcessingRun();
  const first = await storage.updatePressTemplateTestRunResult(run.id, {
    checks: [],
    verdict: "fail",
  });
  assert.ok(first);
  const second = await storage.updatePressTemplateTestRunResult(run.id, {
    checks: [],
    verdict: "pass",
  });
  assert.equal(second, null);
});
