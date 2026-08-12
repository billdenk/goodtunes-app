// Task #3066 — a press can rename or remove a custom template slot made by
// mistake:
//   • PATCH renames the display name only — slotKey stays stable, and a name
//     colliding with another slot in the same format is 409'd.
//   • DELETE on a bare, never-uploaded slot removes it cleanly (plus any
//     empty orphan spec row).
//   • DELETE when the slot's spec carries revision history (or a live file)
//     is refused (409) — upload history is never lost.
//   • Both mutations sit behind requirePressEditor (Staff read-only 403 is
//     covered by the shared editor gate; here we prove a cross-press caller
//     can't touch another press's slots).
//
// Same harness as completedTemplateAccess.routes.db.test.ts: full route tree
// over a loopback socket, bearer-only auth. Every seeded row torn down.
//
//   npx tsx --test server/pressCustomSlotEdit.routes.db.test.ts
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
import { customSlotLockKey } from "./pressTemplatesPortal";

const exec = (q: any) => db.execute(q);

const created = {
  manufacturers: new Set<string>(),
  users: new Set<string>(),
  tokens: new Set<string>(),
};

let baseUrl = "";
let httpServer: HttpServer | undefined;

let pressId = "";
let otherPressId = "";
let pressToken = "";
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

  pressId = await seedManufacturer("t3066 Press");
  otherPressId = await seedManufacturer("t3066 Other Press");
  pressToken = await tokenFor(await seedManufacturerUser(pressId));
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
    VALUES (${id}, ${"t3066_" + tag}, ${"x"}, ${"t3066"}, ${"t3066_" + tag + "@example.test"},
            true, ${"manufacturer"}, ${forPressId})
  `);
  created.users.add(id);
  return id;
}

async function tokenFor(userId: string): Promise<string> {
  const token = "t3066tok_" + randomUUID().replace(/-/g, "");
  await storage.createAuthToken(token, userId, "admin");
  created.tokens.add(token);
  return token;
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
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  let json: any = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { status: res.status, json };
}

const base = () => `/api/press/${pressId}/templates/custom-slots`;

async function createSlot(name: string): Promise<{ id: string; slotKey: string }> {
  const res = await req("POST", base(), pressToken, { format: "12_lp", name });
  assert.equal(res.status, 200, `create "${name}" should succeed`);
  return { id: res.json.slot.id, slotKey: res.json.slot.slotKey };
}

// ─── Rename ────────────────────────────────────────────────────────────

test("rename changes the display name but keeps slotKey stable", async () => {
  const slot = await createSlot("Hype stikcer");
  const res = await req("PATCH", `${base()}/${slot.id}`, pressToken, {
    name: "Hype sticker",
    note: "Front of shrinkwrap",
  });
  assert.equal(res.status, 200);
  assert.equal(res.json.slot.displayName, "Hype sticker");
  assert.equal(res.json.slot.note, "Front of shrinkwrap");
  assert.equal(res.json.slot.slotKey, slot.slotKey, "slotKey must not move on rename");
});

test("rename colliding with a sibling slot's name in the format → 409", async () => {
  const a = await createSlot("Obi strip");
  await createSlot("Poster insert");
  const res = await req("PATCH", `${base()}/${a.id}`, pressToken, { name: "poster INSERT" });
  assert.equal(res.status, 409);
});

test("a different press can't rename this press's slot", async () => {
  const slot = await createSlot("Belly band");
  const res = await req("PATCH", `${base()}/${slot.id}`, otherPressToken, { name: "Hijacked" });
  assert.ok(res.status === 403 || res.status === 404, `expected 403/404, got ${res.status}`);
});

// ─── Delete ────────────────────────────────────────────────────────────

test("a bare, never-uploaded slot deletes cleanly — orphan spec row included", async () => {
  const slot = await createSlot("Oops slot");
  // An empty orphan spec row (no file, no revisions) — the residue of an
  // attach that never completed. It must go with the slot.
  const orphanSpecId = randomUUID();
  await exec(sql`
    INSERT INTO press_template_specs (id, press_id, format, component_key, variant_key, disc_count)
    VALUES (${orphanSpecId}, ${pressId}, ${"12_lp"}, ${slot.slotKey}, ${""}, 0)
  `);
  const res = await req("DELETE", `${base()}/${slot.id}`, pressToken);
  assert.equal(res.status, 200);
  const list = await storage.listPressCustomTemplateSlots(pressId);
  assert.ok(!list.some((s) => s.id === slot.id), "slot row must be gone");
  const specRows = await exec(sql`SELECT id FROM press_template_specs WHERE id = ${orphanSpecId}`);
  assert.equal((specRows as any).rows.length, 0, "orphan spec row must be gone too");
});

test("delete waits for the slot lock, re-checks, and refuses a slot uploaded to mid-delete", async () => {
  const slot = await createSlot("Race slot");
  // Simulate an in-flight upload holding the per-slot advisory lock (the PUT
  // route's critical section) on a dedicated connection.
  const client = await pool.connect();
  const key = customSlotLockKey(pressId, slot.slotKey);
  await client.query("SELECT pg_advisory_lock(hashtextextended($1, 0))", [key]);
  try {
    let settled = false;
    const delP = req("DELETE", `${base()}/${slot.id}`, pressToken).then((r) => {
      settled = true;
      return r;
    });
    await new Promise((r) => setTimeout(r, 400));
    assert.equal(settled, false, "DELETE must block on the slot lock while an upload runs");
    // The "upload" lands its spec + revision, then releases the lock.
    const specId = randomUUID();
    await exec(sql`
      INSERT INTO press_template_specs (id, press_id, format, component_key, variant_key, disc_count, template_file_url)
      VALUES (${specId}, ${pressId}, ${"12_lp"}, ${slot.slotKey}, ${""}, 0, ${"/objects/uploads/t3066-race.pdf"})
    `);
    await exec(sql`
      INSERT INTO press_template_revisions (id, spec_id, rev_label, file_url, status)
      VALUES (${randomUUID()}, ${specId}, ${"R-081226-2"}, ${"/objects/uploads/t3066-race.pdf"}, ${"pending"})
    `);
    await client.query("SELECT pg_advisory_unlock(hashtextextended($1, 0))", [key]);
    const res = await delP;
    assert.equal(res.status, 409, "post-lock re-check must see the fresh upload and refuse");
    const list = await storage.listPressCustomTemplateSlots(pressId);
    assert.ok(list.some((s) => s.id === slot.id), "slot must survive");
    const specRows = await exec(sql`SELECT id FROM press_template_specs WHERE id = ${specId}`);
    assert.equal((specRows as any).rows.length, 1, "the fresh upload's spec must survive");
  } finally {
    client.release();
  }
});

test("delete refuses (409) when the slot's spec has revision history", async () => {
  const slot = await createSlot("Used slot");
  // Attach a spec row + a revision directly (the upload path's residue).
  const specId = randomUUID();
  await exec(sql`
    INSERT INTO press_template_specs (id, press_id, format, component_key, variant_key, disc_count, template_file_url)
    VALUES (${specId}, ${pressId}, ${"12_lp"}, ${slot.slotKey}, ${""}, 0, ${"/objects/uploads/t3066.pdf"})
  `);
  await exec(sql`
    INSERT INTO press_template_revisions (id, spec_id, rev_label, file_url, status)
    VALUES (${randomUUID()}, ${specId}, ${"R-081226"}, ${"/objects/uploads/t3066.pdf"}, ${"pending"})
  `);
  const res = await req("DELETE", `${base()}/${slot.id}`, pressToken);
  assert.equal(res.status, 409, "history must block delete");
  const list = await storage.listPressCustomTemplateSlots(pressId);
  assert.ok(list.some((s) => s.id === slot.id), "slot row must survive");
});

test("deleting an unknown slot id → 404", async () => {
  const res = await req("DELETE", `${base()}/${randomUUID()}`, pressToken);
  assert.equal(res.status, 404);
});

after(async () => {
  try {
    for (const id of created.manufacturers) {
      await exec(sql`DELETE FROM press_template_revisions WHERE spec_id IN (SELECT id FROM press_template_specs WHERE press_id = ${id})`);
      await exec(sql`DELETE FROM press_template_specs WHERE press_id = ${id}`);
      await exec(sql`DELETE FROM press_custom_template_slots WHERE press_id = ${id}`);
    }
    for (const token of created.tokens) await exec(sql`DELETE FROM auth_tokens WHERE token = ${token}`);
    for (const id of created.users) await exec(sql`DELETE FROM users WHERE id = ${id}`);
    for (const id of created.manufacturers) await exec(sql`DELETE FROM manufacturers WHERE id = ${id}`);
  } finally {
    httpServer?.close();
    await pool.end();
  }
});
