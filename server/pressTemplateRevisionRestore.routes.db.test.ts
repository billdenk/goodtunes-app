// Task #3407 — "Restore this version" from the Templates History & tests
// panel: POST /api/press/:id/templates/:specId/revisions/:revId/restore
// brings a SPECIFIC superseded revision's stored file back as the live
// template. Covered here:
//
//   • happy path: the spec's file becomes the origin revision's file, a NEW
//     pending revision is minted (note "Restored from <rev>"), the previous
//     current revision flips to superseded, and the origin revision itself
//     stays superseded (history is never rewritten);
//   • restoring the CURRENT revision → 409 (already live);
//   • a revision with no stored file → 409 (schema is NOT NULL, so the
//     degenerate row is an empty string);
//   • permission gates: a view-only press user (edit_metadata override
//     granted=false) → 403; a cross-press editor → 403 (scope);
//   • certification state machine after a restore: a PASSING run pinned to
//     the pre-restore current revision can no longer certify (409) — the
//     restored template is Pending and must re-test against the NEW live
//     revision, never resurrect an old pass.
//
// Same harness as pressCustomSlotEdit.routes.db.test.ts: full route tree over
// a loopback socket, bearer-only auth. Every seeded row torn down.
//
//   npx tsx --test server/pressTemplateRevisionRestore.routes.db.test.ts
import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer, type Server as HttpServer } from "node:http";
import { sql } from "drizzle-orm";
import express from "express";
import { db, pool } from "./db";
import { storage } from "./storage";
import { authKindMiddleware } from "./auth/host";
import { registerRoutes } from "./routes";

const exec = (q: any) => db.execute(q);

const created = {
  manufacturers: new Set<string>(),
  users: new Set<string>(),
  tokens: new Set<string>(),
  specs: new Set<string>(),
  revisions: new Set<string>(),
  runs: new Set<string>(),
  overrides: new Set<string>(), // user ids with a seeded override row
};

let baseUrl = "";
let httpServer: HttpServer | undefined;

let pressId = "";
let otherPressId = "";
let editorToken = "";
let viewerToken = "";
let otherPressToken = "";

before(async () => {
  const app = express();
  app.set("trust proxy", 1);
  app.use(authKindMiddleware);
  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ extended: false }));
  httpServer = createServer(app);
  await registerRoutes(httpServer, app);
  await new Promise<void>((resolve) => httpServer!.listen(0, "127.0.0.1", resolve));
  const addr = httpServer!.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  baseUrl = `http://127.0.0.1:${port}`;

  pressId = await seedManufacturer("t3407 Press");
  otherPressId = await seedManufacturer("t3407 Other Press");
  const editorId = await seedManufacturerUser(pressId);
  editorToken = await tokenFor(editorId);
  const viewerId = await seedManufacturerUser(pressId);
  // View-only press user: the canonical edit gate reads the edit_metadata
  // override on the manufacturer scope — granted=false means Staff read-only.
  await exec(sql`
    INSERT INTO partner_permission_overrides
      (scope_kind, scope_id, user_id, verb, granted, updated_by_user_id, updated_at)
    VALUES (${"manufacturer"}, ${pressId}, ${viewerId}, ${"edit_metadata"}, ${false}, ${null}, NOW())
  `);
  created.overrides.add(viewerId);
  viewerToken = await tokenFor(viewerId);
  otherPressToken = await tokenFor(await seedManufacturerUser(otherPressId));
});

async function seedManufacturer(name: string): Promise<string> {
  const id = randomUUID();
  await exec(sql`INSERT INTO manufacturers (id, name) VALUES (${id}, ${name})`);
  created.manufacturers.add(id);
  return id;
}

async function seedManufacturerUser(forPressId: string): Promise<string> {
  const id = randomUUID();
  const tag = id.slice(0, 8);
  await exec(sql`
    INSERT INTO users (id, username, password, display_name, email, is_admin, role, role_scope_id)
    VALUES (${id}, ${"t3407_" + tag}, ${"x"}, ${"t3407"}, ${"t3407_" + tag + "@example.test"},
            true, ${"manufacturer"}, ${forPressId})
  `);
  created.users.add(id);
  return id;
}

async function tokenFor(userId: string): Promise<string> {
  const token = "t3407tok_" + randomUUID().replace(/-/g, "");
  await storage.createAuthToken(token, userId, "admin");
  created.tokens.add(token);
  return token;
}

async function seedSpec(componentKey: string, fileUrl: string | null): Promise<string> {
  const id = randomUUID();
  await exec(sql`
    INSERT INTO press_template_specs (id, press_id, format, component_key, variant_key, disc_count, template_file_url, template_file_name)
    VALUES (${id}, ${pressId}, ${"12_lp"}, ${componentKey}, ${""}, ${1}, ${fileUrl}, ${fileUrl ? "current.pdf" : null})
  `);
  created.specs.add(id);
  return id;
}

async function seedRevision(
  specId: string,
  revLabel: string,
  fileUrl: string,
  status: string,
  fileName: string | null = null,
): Promise<string> {
  const id = randomUUID();
  await exec(sql`
    INSERT INTO press_template_revisions (id, spec_id, rev_label, file_url, file_name, status, superseded_at)
    VALUES (${id}, ${specId}, ${revLabel}, ${fileUrl}, ${fileName},
            ${status}, ${status === "superseded" ? sql`NOW()` : null})
  `);
  created.revisions.add(id);
  return id;
}

async function seedRun(specId: string, revisionId: string | null, verdict: string): Promise<string> {
  const id = randomUUID();
  await exec(sql`
    INSERT INTO press_template_test_runs (id, spec_id, revision_id, file_url, file_name, checks, verdict)
    VALUES (${id}, ${specId}, ${revisionId}, ${"/objects/uploads/t3407-art.pdf"}, ${"art.pdf"}, ${"[]"}::jsonb, ${verdict})
  `);
  created.runs.add(id);
  return id;
}

async function req(
  method: string,
  path: string,
  token: string | null,
  body?: unknown,
): Promise<{ status: number; json: any }> {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  let json: any = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { status: res.status, json };
}

const restorePath = (specId: string, revId: string) =>
  `/api/press/${pressId}/templates/${specId}/revisions/${revId}/restore`;

async function revRows(specId: string): Promise<Array<{ id: string; status: string; note: string | null; file_url: string }>> {
  const r = await exec(sql`
    SELECT id, status, note, file_url FROM press_template_revisions
    WHERE spec_id = ${specId} ORDER BY created_at ASC
  `);
  return (r as any).rows;
}

test("restore mints a pending revision from the origin file and supersedes the previous current", async () => {
  const specId = await seedSpec("jacket", "/objects/uploads/t3407-current.pdf");
  const oldRev = await seedRevision(specId, "Rev A", "/objects/uploads/t3407-old.pdf", "superseded", "old.pdf");
  const curRev = await seedRevision(specId, "Rev B", "/objects/uploads/t3407-current.pdf", "pending", "current.pdf");

  const res = await req("POST", restorePath(specId, oldRev), editorToken);
  assert.equal(res.status, 200, JSON.stringify(res.json));
  assert.equal(res.json.spec.templateFileUrl, "/objects/uploads/t3407-old.pdf");
  assert.equal(res.json.spec.templateFileName, "old.pdf");
  assert.equal(res.json.revision.status, "pending", "restored template is Pending, never auto-certified");
  assert.equal(res.json.revision.fileUrl, "/objects/uploads/t3407-old.pdf");
  assert.match(String(res.json.revision.note), /Restored from Rev A/);
  created.revisions.add(res.json.revision.id);

  const rows = await revRows(specId);
  const byId = new Map(rows.map((r) => [r.id, r]));
  assert.equal(byId.get(oldRev)?.status, "superseded", "origin revision stays superseded — history never rewritten");
  assert.equal(byId.get(curRev)?.status, "superseded", "previous current flips to superseded");
  assert.equal(byId.get(res.json.revision.id)?.status, "pending");
});

test("restoring the CURRENT revision is refused (409)", async () => {
  const specId = await seedSpec("labels", "/objects/uploads/t3407-cur2.pdf");
  const curRev = await seedRevision(specId, "Rev A", "/objects/uploads/t3407-cur2.pdf", "pending");
  const res = await req("POST", restorePath(specId, curRev), editorToken);
  assert.equal(res.status, 409);
  assert.match(String(res.json.message), /already the current/i);
});

test("a revision with no stored file is refused (409)", async () => {
  const specId = await seedSpec("inner_sleeve", "/objects/uploads/t3407-cur3.pdf");
  const emptyRev = await seedRevision(specId, "Rev A", "", "superseded");
  await seedRevision(specId, "Rev B", "/objects/uploads/t3407-cur3.pdf", "pending");
  const res = await req("POST", restorePath(specId, emptyRev), editorToken);
  assert.equal(res.status, 409);
  assert.match(String(res.json.message), /no stored file/i);
});

test("unknown revision → 404", async () => {
  const specId = await seedSpec("booklet", "/objects/uploads/t3407-cur4.pdf");
  const res = await req("POST", restorePath(specId, randomUUID()), editorToken);
  assert.equal(res.status, 404);
});

test("view-only press user (edit override off) → 403; cross-press editor → 403", async () => {
  const specId = await seedSpec("sticker", "/objects/uploads/t3407-cur5.pdf");
  const oldRev = await seedRevision(specId, "Rev A", "/objects/uploads/t3407-old5.pdf", "superseded");
  await seedRevision(specId, "Rev B", "/objects/uploads/t3407-cur5.pdf", "pending");

  const viewer = await req("POST", restorePath(specId, oldRev), viewerToken);
  assert.equal(viewer.status, 403, "view-only roles browse history but never restore");

  const cross = await req("POST", restorePath(specId, oldRev), otherPressToken);
  assert.equal(cross.status, 403, "another press's editor can't touch this press's slots");

  // Neither call touched state: the current revision is still Rev B's file.
  const rows = await revRows(specId);
  assert.equal(rows.filter((r) => r.status === "pending").length, 1);
});

test("concurrent restores serialize: the live file always matches the sole pending revision", async () => {
  const specId = await seedSpec("obi_strip", "/objects/uploads/t3407-cur7.pdf");
  const revA = await seedRevision(specId, "Rev A", "/objects/uploads/t3407-a7.pdf", "superseded", "a.pdf");
  const revB = await seedRevision(specId, "Rev B", "/objects/uploads/t3407-b7.pdf", "superseded", "b.pdf");
  await seedRevision(specId, "Rev C", "/objects/uploads/t3407-cur7.pdf", "pending");

  // Fire interleaving restores of two different revisions at once. Without
  // the per-spec lock, one request's spec-file write can pair with the
  // OTHER request's final supersede, leaving the live file pointing at a
  // revision that isn't the pending one.
  const results = await Promise.all([
    req("POST", restorePath(specId, revA), editorToken),
    req("POST", restorePath(specId, revB), editorToken),
    req("POST", restorePath(specId, revA), editorToken),
    req("POST", restorePath(specId, revB), editorToken),
  ]);
  for (const r of results) {
    assert.equal(r.status, 200, JSON.stringify(r.json));
    created.revisions.add(r.json.revision.id);
  }

  const specRow = await exec(sql`
    SELECT template_file_url FROM press_template_specs WHERE id = ${specId}
  `);
  const liveFile = (specRow as any).rows[0].template_file_url as string;
  const pending = (await revRows(specId)).filter((r) => r.status === "pending");
  assert.equal(pending.length, 1, "exactly one pending/current revision after the dust settles");
  assert.equal(
    liveFile,
    pending[0].file_url,
    "live spec file and the sole pending revision must always match",
  );
});

test("legacy archived restore racing a revision restore keeps live file == sole pending revision", async () => {
  // The pre-existing archived-slot restore (POST .../templates/:specId/restore)
  // shares the same per-spec lock domain: without it, its "no live file"
  // check could pass, then a concurrent revision-restore mints a pending
  // revision, then the archived restore overwrites the live file and flips
  // ITS revision pending too — two pending revisions, live file matching at
  // most one of them.
  const specId = await seedSpec("poster", null); // archived slot: no live file
  const archivedRev = await seedRevision(
    specId, "Rev A", "/objects/uploads/t3407-arch8.pdf", "archived", "arch.pdf",
  );
  const oldRev = await seedRevision(specId, "Rev B", "/objects/uploads/t3407-old8.pdf", "superseded", "old.pdf");

  const results = await Promise.all([
    req("POST", `/api/press/${pressId}/templates/${specId}/restore`, editorToken),
    req("POST", restorePath(specId, oldRev), editorToken),
    req("POST", `/api/press/${pressId}/templates/${specId}/restore`, editorToken),
  ]);
  for (const r of results) {
    // Order-dependent which ones succeed (the archived restore 409s once the
    // slot is live) — but every success must preserve the invariant.
    assert.ok([200, 404, 409].includes(r.status), JSON.stringify(r.json));
    if (r.status === 200 && r.json?.revision?.id) created.revisions.add(r.json.revision.id);
  }
  assert.ok(results.some((r) => r.status === 200), "at least one restore should land");

  const specRow = await exec(sql`SELECT template_file_url FROM press_template_specs WHERE id = ${specId}`);
  const liveFile = (specRow as any).rows[0].template_file_url as string | null;
  const pending = (await revRows(specId)).filter((r) => r.status === "pending");
  assert.equal(pending.length, 1, "exactly one pending revision regardless of interleaving");
  assert.equal(liveFile, pending[0].file_url, "live file matches the sole pending revision");
  void archivedRev;
});

test("after a restore, a passing run pinned to the pre-restore current can no longer certify", async () => {
  const specId = await seedSpec("shell", "/objects/uploads/t3407-cur6.pdf");
  const oldRev = await seedRevision(specId, "Rev A", "/objects/uploads/t3407-old6.pdf", "superseded");
  const curRev = await seedRevision(specId, "Rev B", "/objects/uploads/t3407-cur6.pdf", "pending");
  const passRun = await seedRun(specId, curRev, "pass");

  const restored = await req("POST", restorePath(specId, oldRev), editorToken);
  assert.equal(restored.status, 200, JSON.stringify(restored.json));
  created.revisions.add(restored.json.revision.id);

  const certify = await req(
    "POST",
    `/api/press/${pressId}/templates/${specId}/runs/${passRun}/certify`,
    editorToken,
  );
  assert.equal(certify.status, 409, "run is pinned to a now-superseded revision — must re-test");
  assert.match(String(certify.json.message), /older template revision/i);

  // The restored revision stayed pending — nothing auto-certified.
  const rows = await revRows(specId);
  const restoredRow = rows.find((r) => r.id === restored.json.revision.id);
  assert.equal(restoredRow?.status, "pending");
});

test("archive racing a revision restore never strands a live file without a current revision", async () => {
  // Archive shares the spec lock with the live-file writers: without it,
  // archive interleaved with a restore/replace can flip the fresh pending
  // revision to archived while the fresh live file stays behind.
  const specId = await seedSpec("hype_sticker", "/objects/uploads/t3407-cur9.pdf");
  const oldRev = await seedRevision(specId, "Rev A", "/objects/uploads/t3407-old9.pdf", "superseded");
  await seedRevision(specId, "Rev B", "/objects/uploads/t3407-cur9.pdf", "pending");

  const results = await Promise.all([
    req("POST", `/api/press/${pressId}/templates/${specId}/archive`, editorToken),
    req("POST", restorePath(specId, oldRev), editorToken),
  ]);
  for (const r of results) {
    assert.ok([200, 404, 409].includes(r.status), JSON.stringify(r.json));
    if (r.status === 200 && r.json?.revision?.id) created.revisions.add(r.json.revision.id);
  }

  const specRow = await exec(sql`SELECT template_file_url FROM press_template_specs WHERE id = ${specId}`);
  const liveFile = (specRow as any).rows[0].template_file_url as string | null;
  const current = (await revRows(specId)).filter(
    (r) => r.status === "pending" || r.status === "certified",
  );
  if (liveFile) {
    // Restore won the tail: exactly one current revision matching the file.
    assert.equal(current.length, 1, "live file present ⇒ exactly one current revision");
    assert.equal(liveFile, current[0].file_url, "live file matches the current revision");
  } else {
    // Archive won the tail: no live file ⇒ no current revision left behind.
    assert.equal(current.length, 0, "no live file ⇒ no pending/certified revision");
  }
});

test("certify racing a revision restore keeps one current revision matching the live file", async () => {
  // Certification is a revision-state transition; under the shared lock the
  // two legal serializations are certify→restore (origin certified then
  // superseded) or restore→certify (409, run pinned to superseded). Either
  // way exactly ONE current revision remains and it matches the live file —
  // never a certified stamp on a revision the restore already superseded.
  const specId = await seedSpec("insert_card", "/objects/uploads/t3407-curA.pdf");
  const oldRev = await seedRevision(specId, "Rev A", "/objects/uploads/t3407-oldA.pdf", "superseded");
  const curRev = await seedRevision(specId, "Rev B", "/objects/uploads/t3407-curA.pdf", "pending");
  const passRun = await seedRun(specId, curRev, "pass");

  const [certify, restore] = await Promise.all([
    req("POST", `/api/press/${pressId}/templates/${specId}/runs/${passRun}/certify`, editorToken),
    req("POST", restorePath(specId, oldRev), editorToken),
  ]);
  assert.ok([200, 409].includes(certify.status), JSON.stringify(certify.json));
  assert.equal(restore.status, 200, JSON.stringify(restore.json));
  created.revisions.add(restore.json.revision.id);

  const rows = await revRows(specId);
  const current = rows.filter((r) => r.status === "pending" || r.status === "certified");
  assert.equal(current.length, 1, "exactly one current revision after the race");
  assert.equal(current[0].id, restore.json.revision.id, "the restored revision is the current one");
  assert.equal(current[0].status, "pending", "restored revision is Pending, never auto-certified");
  const specRow = await exec(sql`SELECT template_file_url FROM press_template_specs WHERE id = ${specId}`);
  assert.equal((specRow as any).rows[0].template_file_url, current[0].file_url);
  // If certify lost the race it must be the honest 409, not a silent stamp.
  if (certify.status === 409) {
    assert.match(String(certify.json.message), /older template revision|no longer has a live template/i);
    const origin = rows.find((r) => r.id === curRev);
    assert.notEqual(origin?.status, "certified", "409 ⇒ the origin revision was never stamped certified");
  }
});

test("background auto-certify racing a revision restore never certifies a superseded revision", async () => {
  // Drives the exact production path the async test worker uses
  // (autoCertifyTemplateTestRun) against the restore route. Two legal
  // serializations: auto-certify→restore (origin certified then superseded)
  // or restore→auto-certify (helper returns false, nothing stamped). Either
  // way exactly ONE current revision remains, it is the restored PENDING
  // one, and it matches the live file.
  const { autoCertifyTemplateTestRun } = await import("./pressTemplatesPortal");
  const specId = await seedSpec("dust_sleeve", "/objects/uploads/t3407-curB.pdf");
  const oldRev = await seedRevision(specId, "Rev A", "/objects/uploads/t3407-oldB.pdf", "superseded");
  const curRev = await seedRevision(specId, "Rev B", "/objects/uploads/t3407-curB.pdf", "pending");
  const passRun = await seedRun(specId, curRev, "pass");

  const [certified, restore] = await Promise.all([
    autoCertifyTemplateTestRun(pressId, specId, passRun, curRev),
    req("POST", restorePath(specId, oldRev), editorToken),
  ]);
  assert.equal(restore.status, 200, JSON.stringify(restore.json));
  created.revisions.add(restore.json.revision.id);

  const rows = await revRows(specId);
  const current = rows.filter((r) => r.status === "pending" || r.status === "certified");
  assert.equal(current.length, 1, "exactly one current revision after the race");
  assert.equal(current[0].id, restore.json.revision.id, "the restored revision is the current one");
  assert.equal(current[0].status, "pending", "restored revision is Pending, never auto-certified");
  const specRow = await exec(sql`SELECT template_file_url FROM press_template_specs WHERE id = ${specId}`);
  assert.equal((specRow as any).rows[0].template_file_url, current[0].file_url);
  if (!certified) {
    // Restore won: the worker must have declined — no certified stamp anywhere.
    const origin = rows.find((r) => r.id === curRev);
    assert.notEqual(origin?.status, "certified", "declined auto-certify never stamped the origin");
  }
});

test("restore re-validates the target under the lock — concurrent same-target restores keep one current", async () => {
  // Two concurrent restores of the SAME superseded revision: the loser
  // re-reads everything under the lock, so whatever it decides (a second
  // restore of the still-superseded origin, or a 409 if the target became
  // current) is computed off fresh state — never a stale pre-lock snapshot
  // double-minting a divergent pending revision.
  const specId = await seedSpec("spine_card", "/objects/uploads/t3407-curC.pdf");
  const oldRev = await seedRevision(specId, "Rev A", "/objects/uploads/t3407-oldC.pdf", "superseded");
  await seedRevision(specId, "Rev B", "/objects/uploads/t3407-curC.pdf", "pending");

  const results = await Promise.all([
    req("POST", restorePath(specId, oldRev), editorToken),
    req("POST", restorePath(specId, oldRev), editorToken),
  ]);
  for (const r of results) {
    assert.ok([200, 409].includes(r.status), JSON.stringify(r.json));
    if (r.status === 200 && r.json?.revision?.id) created.revisions.add(r.json.revision.id);
  }

  const current = (await revRows(specId)).filter(
    (r) => r.status === "pending" || r.status === "certified",
  );
  assert.equal(current.length, 1, "exactly one current revision after concurrent same-target restores");
  assert.equal(current[0].file_url, "/objects/uploads/t3407-oldC.pdf");
  const specRow = await exec(sql`SELECT template_file_url FROM press_template_specs WHERE id = ${specId}`);
  assert.equal((specRow as any).rows[0].template_file_url, current[0].file_url);
});

test("operator catalog PUT on a revision-managed spec mints a pending revision and supersedes the old current", async () => {
  // The god-view editor is a live-file writer too: once a spec has history,
  // an admin replace must keep the ledger in step — never a live file
  // pointing away from the sole current revision.
  const specId = await seedSpec("j_card", "/objects/uploads/t3407-curD.pdf");
  await seedRevision(specId, "Rev A", "/objects/uploads/t3407-oldD.pdf", "superseded");
  const curRev = await seedRevision(specId, "Rev B", "/objects/uploads/t3407-curD.pdf", "pending");

  const put = await req(
    "PUT",
    `/api/admin/manufacturers/${pressId}/template-specs`,
    editorToken,
    {
      format: "12_lp",
      componentKey: "j_card",
      discCount: 1,
      templateFileUrl: "/objects/uploads/t3407-adminD.pdf",
      templateFileName: "admin-replace.pdf",
    },
  );
  assert.equal(put.status, 200, JSON.stringify(put.json));

  const rows = await revRows(specId);
  for (const r of rows) created.revisions.add(r.id);
  const current = rows.filter((r) => r.status === "pending" || r.status === "certified");
  assert.equal(current.length, 1, "exactly one current revision after the admin replace");
  assert.equal(current[0].status, "pending", "admin replace comes back Pending, never certified");
  assert.equal(current[0].file_url, "/objects/uploads/t3407-adminD.pdf");
  const origin = rows.find((r) => r.id === curRev);
  assert.equal(origin?.status, "superseded", "the previous current is superseded");
  const specRow = await exec(sql`SELECT template_file_url FROM press_template_specs WHERE id = ${specId}`);
  assert.equal((specRow as any).rows[0].template_file_url, current[0].file_url);
});

test("operator catalog PUT racing a revision restore keeps one current revision matching the live file", async () => {
  const specId = await seedSpec("o_card", "/objects/uploads/t3407-curE.pdf");
  const oldRev = await seedRevision(specId, "Rev A", "/objects/uploads/t3407-oldE.pdf", "superseded");
  await seedRevision(specId, "Rev B", "/objects/uploads/t3407-curE.pdf", "pending");

  const [put, restore] = await Promise.all([
    req("PUT", `/api/admin/manufacturers/${pressId}/template-specs`, editorToken, {
      format: "12_lp",
      componentKey: "o_card",
      discCount: 1,
      templateFileUrl: "/objects/uploads/t3407-adminE.pdf",
      templateFileName: "admin-replace.pdf",
    }),
    req("POST", restorePath(specId, oldRev), editorToken),
  ]);
  assert.equal(put.status, 200, JSON.stringify(put.json));
  assert.ok([200, 409].includes(restore.status), JSON.stringify(restore.json));

  const rows = await revRows(specId);
  for (const r of rows) created.revisions.add(r.id);
  const current = rows.filter((r) => r.status === "pending" || r.status === "certified");
  assert.equal(current.length, 1, "exactly one current revision regardless of interleaving");
  assert.equal(current[0].status, "pending");
  const specRow = await exec(sql`SELECT template_file_url FROM press_template_specs WHERE id = ${specId}`);
  assert.equal(
    (specRow as any).rows[0].template_file_url,
    current[0].file_url,
    "live file matches the sole current revision",
  );
});

after(async () => {
  for (const id of created.runs) {
    await exec(sql`DELETE FROM press_template_test_runs WHERE id = ${id}`);
  }
  // The restore route mints revisions we track from responses; sweep any
  // stragglers by spec id too.
  for (const id of created.specs) {
    await exec(sql`DELETE FROM press_template_revisions WHERE spec_id = ${id}`);
    await exec(sql`DELETE FROM press_template_specs WHERE id = ${id}`);
  }
  for (const userId of created.overrides) {
    await exec(sql`DELETE FROM partner_permission_overrides WHERE user_id = ${userId}`);
  }
  for (const token of created.tokens) {
    await exec(sql`DELETE FROM auth_tokens WHERE token = ${token}`);
  }
  for (const id of created.users) {
    await exec(sql`DELETE FROM users WHERE id = ${id}`);
  }
  for (const id of created.manufacturers) {
    await exec(sql`DELETE FROM manufacturers WHERE id = ${id}`);
  }
  await new Promise<void>((resolve) => (httpServer ? httpServer.close(() => resolve()) : resolve()));
  await pool.end();
});
