// Task #2339 — regression coverage for the per-press AUDIO spec CRUD
// (Task #2324). The card lives in the press portal catalog editor and writes
// through GET/PUT/DELETE /api/admin/manufacturers/:id/audio-spec, all gated by
// requirePressManager. The boundary that matters: a press-scoped manufacturer
// admin may read/write ONLY its own row; a different press's account must be
// 403'd (or it could overwrite another plant's cutting numbers); and a BLANK
// field must store as NULL so the validator inherits the measured baseline
// (nothing fabricated). None of that was covered, so a loosened gate or a
// schema change that coerced blanks into zeros would ship silently. This pins
// it in.
//
// Same harness as pressScopedPeople.db.test.ts: the full route tree mounted
// over a real loopback socket (127.0.0.1 skips the host/kind boundary so the
// bearer token's kind is trusted). The audio-spec routes use
// requireAdminBearer (bearer-only), so a Bearer token alone authenticates —
// no session cookie needed. Every seeded row is torn down in `after`.
//
// Real DB (DATABASE_URL), Node's built-in runner:
//
//   npx tsx --test server/pressAudioSpec.routes.db.test.ts
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
};

let baseUrl = "";
let httpServer: HttpServer | undefined;

// IDs shared across the tests, seeded once in `before`.
let ownPressId = "";
let otherPressId = "";
let pressUserId = ""; // manufacturer scoped to ownPress
let pressToken = "";
let adminToken = ""; // super_admin (god access — sanity-checks the route works)

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

  ownPressId = await seedManufacturer("t2339 Own Press");
  otherPressId = await seedManufacturer("t2339 Other Press");
  pressUserId = await seedManufacturerUser(ownPressId);
  pressToken = await tokenFor(pressUserId);
  const adminUserId = await seedAdminUser();
  adminToken = await tokenFor(adminUserId);
});

async function seedManufacturer(name: string): Promise<string> {
  const id = randomUUID();
  await exec(sql`INSERT INTO manufacturers (id, name) VALUES (${id}, ${name})`);
  created.manufacturers.add(id);
  return id;
}

// An admin user whose ONLY hat is a manufacturer scoped to `pressId`.
// getUserRole / findMembershipForScope synthesize exactly one membership from
// these legacy columns when the account has no memberships rows, which is what
// requirePressManager reads. is_admin=true so it clears requireAdmin first.
async function seedManufacturerUser(pressId: string): Promise<string> {
  const id = randomUUID();
  const tag = id.slice(0, 8);
  await exec(sql`
    INSERT INTO users (id, username, password, display_name, email, is_admin, role, role_scope_id)
    VALUES (${id}, ${"t2339_" + tag}, ${"x"}, ${"t2339"}, ${"t2339_" + tag + "@example.test"},
            true, ${"manufacturer"}, ${pressId})
  `);
  created.users.add(id);
  return id;
}

async function seedAdminUser(): Promise<string> {
  const id = randomUUID();
  const tag = id.slice(0, 8);
  await exec(sql`
    INSERT INTO users (id, username, password, display_name, email, is_admin, role)
    VALUES (${id}, ${"t2339a_" + tag}, ${"x"}, ${"t2339a"}, ${"t2339a_" + tag + "@example.test"},
            true, ${"super_admin"})
  `);
  created.users.add(id);
  return id;
}

async function tokenFor(userId: string): Promise<string> {
  const token = "t2339tok_" + randomUUID().replace(/-/g, "");
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

const audioPath = (pressId: string) =>
  `/api/admin/manufacturers/${pressId}/audio-spec`;

// ─── No bearer → 401 (requireAdminBearer) ────────────────────────────

test("a request with no bearer token is rejected before any DB read", async () => {
  const res = await req("GET", audioPath(ownPressId), null);
  assert.equal(res.status, 401, "audio-spec routes require a bearer token");
});

// ─── GET own press: no override yet → spec null (inherit baseline) ────

test("a scoped press reads its own (empty) audio spec as null", async () => {
  const res = await req("GET", audioPath(ownPressId), pressToken);
  assert.equal(res.status, 200, "the press can read its own audio-spec row");
  assert.equal(res.json.spec, null, "no override yet → null → inherit the measured baseline");
});

// ─── PUT own press: a scoped press writes its own cutting numbers ─────

test("a scoped press writes its own audio spec and reads it back", async () => {
  const put = await req("PUT", audioPath(ownPressId), pressToken, {
    requiredBitDepth: 24,
    requiredSampleRateHz: 96000,
    maxSideSeconds: { '12"': { "33": 1320, "45": 900 } },
    notes: "Half-speed master preferred.",
  });
  assert.equal(put.status, 200, "the press can write its own audio spec");
  assert.equal(put.json.spec.requiredBitDepth, 24);
  assert.equal(put.json.spec.requiredSampleRateHz, 96000);
  assert.equal(put.json.spec.maxSideSeconds['12"']["33"], 1320);
  assert.equal(put.json.spec.maxSideSeconds['12"']["45"], 900);
  assert.equal(put.json.spec.notes, "Half-speed master preferred.");

  const get = await req("GET", audioPath(ownPressId), pressToken);
  assert.equal(get.status, 200);
  assert.equal(get.json.spec.requiredBitDepth, 24, "the write persisted");
  assert.equal(get.json.spec.requiredSampleRateHz, 96000);
});

// ─── Blank fields inherit: nothing is fabricated ─────────────────────

test("a blank field stores as NULL so the validator inherits the baseline", async () => {
  // Set only the bit depth; leave sample rate / per-side grid / notes blank.
  const put = await req("PUT", audioPath(ownPressId), pressToken, {
    requiredBitDepth: 16,
    requiredSampleRateHz: null,
    maxSideSeconds: null,
    notes: null,
  });
  assert.equal(put.status, 200);
  assert.equal(put.json.spec.requiredBitDepth, 16, "the one set field is stored");
  assert.equal(
    put.json.spec.requiredSampleRateHz,
    null,
    "a blank sample rate stays NULL — never coerced to 0 or a fabricated default",
  );
  assert.equal(put.json.spec.maxSideSeconds, null, "an all-blank grid stores as NULL, not {}");
  assert.equal(put.json.spec.notes, null, "blank notes stay NULL");
});

test("an all-blank per-side grid is stripped to NULL (not an empty object)", async () => {
  const put = await req("PUT", audioPath(ownPressId), pressToken, {
    requiredBitDepth: null,
    requiredSampleRateHz: null,
    // Every cell omitted → server strips to NULL so it can't mask the baseline.
    maxSideSeconds: { '7"': {}, '12"': {} },
    notes: null,
  });
  assert.equal(put.status, 200);
  assert.equal(put.json.spec.maxSideSeconds, null, "empty cells collapse to a NULL grid");
});

// ─── Cross-press isolation: a press can't touch another plant's row ──

test("a scoped press is 403'd reading ANOTHER press's audio spec", async () => {
  const res = await req("GET", audioPath(otherPressId), pressToken);
  assert.equal(res.status, 403, "no cross-press read");
});

test("a scoped press is 403'd writing ANOTHER press's cutting numbers", async () => {
  const res = await req("PUT", audioPath(otherPressId), pressToken, {
    requiredBitDepth: 8,
    requiredSampleRateHz: 44100,
    maxSideSeconds: null,
    notes: "should never land",
  });
  assert.equal(res.status, 403, "a press can't overwrite another plant's audio spec");

  // And confirm nothing was written to the other press.
  const check = await req("GET", audioPath(otherPressId), adminToken);
  assert.equal(check.status, 200);
  assert.equal(check.json.spec, null, "the other press's row is untouched");
});

test("a scoped press is 403'd clearing ANOTHER press's audio spec", async () => {
  const res = await req("DELETE", audioPath(otherPressId), pressToken);
  assert.equal(res.status, 403, "no cross-press delete");
});

// ─── DELETE own: clearing the override falls back to inherit ──────────

test("a scoped press clears its own override and falls back to inherit", async () => {
  const del = await req("DELETE", audioPath(ownPressId), pressToken);
  assert.equal(del.status, 200, "the press can clear its own override");

  const get = await req("GET", audioPath(ownPressId), pressToken);
  assert.equal(get.status, 200);
  assert.equal(get.json.spec, null, "after clearing, the row is gone → inherit the baseline");
});

after(async () => {
  try {
    if (httpServer) await new Promise<void>((resolve) => httpServer!.close(() => resolve()));
    for (const id of created.manufacturers)
      await exec(sql`DELETE FROM press_audio_specs WHERE press_id = ${id}`);
    for (const t of created.tokens) await exec(sql`DELETE FROM auth_tokens WHERE token = ${t}`);
    for (const id of created.users) {
      await exec(sql`DELETE FROM memberships WHERE user_id = ${id}`);
      await exec(sql`DELETE FROM users WHERE id = ${id}`);
    }
    for (const id of created.manufacturers)
      await exec(sql`DELETE FROM manufacturers WHERE id = ${id}`);
  } finally {
    await pool.end();
  }
});
