// Task #3243 — the honest-quote send gate is SERVER-owned, end to end.
//
// Drives the real press-estimates routes over a loopback socket and proves:
//   1. A fully priced build sends (the /send route passes the pricing gate —
//      mail is best-effort so a 200 with sentCount 0 is a pass here).
//   2. The same build with an UNPRICED gatefold jacket 409s on /send, even
//      when the payload claims `pricingPending: false` (the server recomputes
//      from stored builder state + the press's CURRENT pricing rows and never
//      trusts the client flag).
//   3. Direct status writes cannot mint a Sent estimate: POST with
//      status "Sent" and PUT flipping Draft → Sent both 409.
//
// Harness mirrors adminTrustedDeviceMint.routes.db.test.ts, but WITHOUT
// forceProductionAuth: the dev login path signs the seeded super_admin in
// with no second factor. Real DB (DATABASE_URL):
//
//   npx tsx --test server/pressEstimateSendGate.routes.db.test.ts
process.env.SESSION_SECRET = process.env.SESSION_SECRET || "t3243-test-session-secret";

import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, randomBytes, scrypt as _scrypt } from "node:crypto";
import { promisify } from "node:util";
import { createServer, type Server as HttpServer } from "node:http";
import { sql } from "drizzle-orm";
import express from "express";
import { db } from "./db";
import { authKindMiddleware } from "./auth/host";
import { registerRoutes } from "./routes";
import type { PricingRow } from "@shared/pressComponents";
import { QUOTE_SETUP_SERVICE_KEYS } from "@shared/quotePricing";

const scryptAsync = promisify(_scrypt);
const exec = (q: any) => db.execute(q);

const PASSWORD = "t3243-correct-horse";
let baseUrl = "";
let httpServer: HttpServer | undefined;
let cookie = "";
let bearer = "";
let adminId = "";
let pressId = "";

const created = { users: new Set<string>(), presses: new Set<string>(), estimates: new Set<string>() };

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

const api = async (method: string, path: string, body?: unknown) => {
  return fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      "x-forwarded-proto": "https",
      ...(cookie ? { cookie } : {}),
      ...(bearer ? { authorization: `Bearer ${bearer}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
};

// Pricing rows for a FULLY priced build (vinyl by name + every flat line the
// builder charges), matching the builder's key vocabulary.
const flat = (key: string, kind: PricingRow["kind"], cents: number | null): PricingRow => ({
  key, label: key, detail: "", kind, sizes: [], priceCents: cents, pricesBySize: {},
});
const PRICED_ROWS: PricingRow[] = [
  { key: "type:black", label: "Black", detail: "", kind: "type", sizes: ['12"'], priceCents: null, pricesBySize: { '12"': 176 } },
  { key: "color:black:classic", label: "Classic Black", detail: "Black", kind: "color", sizes: ['12"'], priceCents: null, pricesBySize: { '12"': 176 } },
  flat("labels:blank", "labels", 8),
  flat("jackets:single", "jackets", 165),
  flat("jackets:gatefold", "jackets", null), // ← Custom Quote: stays unpriced
  flat("sleeves:unprinted", "sleeves", 0),
  flat("service:assembly", "service", 11),
  flat("service:shrink", "service", 15),
  ...QUOTE_SETUP_SERVICE_KEYS.map((k) => flat(k, "service", k === "service:stampers" ? 0 : 10000)),
];

const builderState = (jacketId: string) => ({
  sizeId: "12", discs: 1, qty: 1000, weightId: "140", colorId: "classic", colorKind: "black",
  colorName: "Classic Black", colorTierName: "Black",
  jacketId, jacketVariantId: "standard", sleeveId: "unprinted", sleeveVariantId: "white",
  labelId: "blank", holeId: "small", insertId: "none", insertVariantId: "",
  stickerShapeId: "none", stickerSizeId: "",
  clientName: "Test Artist",
  done: ["size", "discs", "weight", "ctype", "color", "qty", "label", "jacket", "sleeve", "insert", "sticker"],
});

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
  baseUrl = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
  await db.execute(sql`SELECT 1`);

  // Seed a super_admin + login (dev path: no second factor).
  adminId = randomUUID();
  created.users.add(adminId);
  const email = `t3243_${adminId.slice(0, 8)}@example.test`;
  const pw = await hashPassword(PASSWORD);
  await exec(sql`
    INSERT INTO users (id, email, username, password, display_name, is_admin, role)
    VALUES (${adminId}, ${email}, ${email}, ${pw}, 'T3243 Admin', true, 'super_admin')
  `);
  const login = await api("POST", "/api/login", { username: email, password: PASSWORD, kind: "admin" });
  assert.equal(login.status, 200, `login failed: ${await login.clone().text()}`);
  const loginBody = await login.json();
  bearer = String(loginBody.token ?? "");
  cookie = login.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  assert.ok(cookie, "expected the login response to set a session cookie");

  // Seed a press + its pricing component (fully priced except gatefold).
  pressId = randomUUID();
  created.presses.add(pressId);
  await exec(sql`
    INSERT INTO manufacturers (id, name, does_vinyl)
    VALUES (${pressId}, ${"T3243 Press " + pressId.slice(0, 8)}, true)
  `);
  await exec(sql`
    INSERT INTO press_components (press_id, component_key, config)
    VALUES (${pressId}, 'pricing', ${JSON.stringify({ rows: PRICED_ROWS })}::jsonb)
  `);
});

after(async () => {
  try {
    for (const id of created.estimates) await exec(sql`DELETE FROM press_estimates WHERE id = ${id}`);
    for (const id of created.presses) {
      await exec(sql`DELETE FROM press_estimates WHERE press_id = ${id}`);
      await exec(sql`DELETE FROM press_components WHERE press_id = ${id}`);
      await exec(sql`DELETE FROM manufacturers WHERE id = ${id}`);
    }
    for (const id of created.users) {
      await exec(sql`DELETE FROM user_sessions WHERE sess::text LIKE ${"%" + id + "%"}`);
      await exec(sql`DELETE FROM auth_tokens WHERE admin_user_id = ${id}`);
      await exec(sql`DELETE FROM users WHERE id = ${id}`);
    }
  } finally {
    if (httpServer) await new Promise<void>((r) => httpServer!.close(() => r()));
  }
});

async function createDraft(jacketId: string, extraPayload: Record<string, unknown> = {}): Promise<string> {
  const res = await api("POST", `/api/press/${pressId}/estimates`, {
    kind: "estimate",
    title: `T3243 ${jacketId}`,
    payload: { builderState: builderState(jacketId), source: "Builder", ...extraPayload },
  });
  assert.equal(res.status, 201, `create failed: ${await res.clone().text()}`);
  const row = await res.json();
  created.estimates.add(row.id);
  return row.id as string;
}

const RECIPIENTS = { artistName: "Test Artist", recipients: [{ name: "Test Artist", email: "t3243-recipient@example.test" }] };

test("fully priced build passes the send gate", async () => {
  const id = await createDraft("single");
  const res = await api("POST", `/api/press/${pressId}/estimates/${id}/send`, RECIPIENTS);
  const body = await res.clone().text();
  assert.equal(res.status, 200, `expected send to pass the gate: ${body}`);
  const json = JSON.parse(body);
  assert.equal(json.row.status, "Sent");
});

test("unpriced gatefold 409s on /send even when the payload lies pricingPending:false", async () => {
  const id = await createDraft("gatefold", { pricingPending: false });
  const res = await api("POST", `/api/press/${pressId}/estimates/${id}/send`, RECIPIENTS);
  assert.equal(res.status, 409);
  const json = await res.json();
  assert.ok(Array.isArray(json.pendingLineIds) && json.pendingLineIds.includes("jacket"), JSON.stringify(json));
});

test("direct Sent writes are rejected: POST status Sent and PUT Draft→Sent both 409", async () => {
  const post = await api("POST", `/api/press/${pressId}/estimates`, {
    kind: "estimate", title: "T3243 direct-sent", status: "Sent",
    payload: { builderState: builderState("gatefold"), source: "Builder" },
  });
  assert.equal(post.status, 409);

  const id = await createDraft("gatefold");
  const put = await api("PUT", `/api/press/${pressId}/estimates/${id}`, { status: "Sent" });
  assert.equal(put.status, 409);
  // Non-Sent updates still work (drafts stay iterable).
  const rename = await api("PUT", `/api/press/${pressId}/estimates/${id}`, { title: "T3243 renamed" });
  assert.equal(rename.status, 200);
});

test("fail closed: /send 409s when builderState is missing, even with pricingPending omitted or false", async () => {
  // created with NO builderState at all
  const res1 = await api("POST", `/api/press/${pressId}/estimates`, {
    kind: "estimate", title: "T3243 no-state", payload: { source: "Builder", pricingPending: false },
  });
  assert.equal(res1.status, 201);
  const bare = await res1.json();
  created.estimates.add(bare.id);
  const send1 = await api("POST", `/api/press/${pressId}/estimates/${bare.id}/send`, RECIPIENTS);
  assert.equal(send1.status, 409);

  // PUT-then-send: strip the builder state off a previously valid draft
  const id = await createDraft("single");
  const strip = await api("PUT", `/api/press/${pressId}/estimates/${id}`, { payload: { source: "Builder" } });
  assert.equal(strip.status, 200);
  const send2 = await api("POST", `/api/press/${pressId}/estimates/${id}/send`, RECIPIENTS);
  assert.equal(send2.status, 409);
});

test("a sent estimate's payload is immutable via PUT", async () => {
  const id = await createDraft("single");
  const send = await api("POST", `/api/press/${pressId}/estimates/${id}/send`, RECIPIENTS);
  assert.equal(send.status, 200);
  const put = await api("PUT", `/api/press/${pressId}/estimates/${id}`, { payload: { builderState: builderState("single"), qty: 1 } });
  assert.equal(put.status, 409);
  // title-only updates remain allowed
  const rename = await api("PUT", `/api/press/${pressId}/estimates/${id}`, { title: "T3243 sent rename" });
  assert.equal(rename.status, 200);
});

test("send is one-way: Sent -> Draft downgrade 409s, so payload stays immutable", async () => {
  const id = await createDraft("single");
  const send = await api("POST", `/api/press/${pressId}/estimates/${id}/send`, RECIPIENTS);
  assert.equal(send.status, 200);
  const downgrade = await api("PUT", `/api/press/${pressId}/estimates/${id}`, { status: "Draft" });
  assert.equal(downgrade.status, 409);
  const downgradeWithPayload = await api("PUT", `/api/press/${pressId}/estimates/${id}`, { status: "Draft", payload: { builderState: builderState("single"), qty: 2 } });
  assert.equal(downgradeWithPayload.status, 409);
});

test("/send on an already-sent estimate is a resend: emails only, status + payload unchanged", async () => {
  const id = await createDraft("single");
  const first = await api("POST", `/api/press/${pressId}/estimates/${id}/send`, RECIPIENTS);
  assert.equal(first.status, 200);
  const fetchRow = async () => {
    const r = await db.execute(sql`SELECT status, payload FROM press_estimates WHERE id = ${id}`);
    return (r as any).rows[0];
  };
  const before = await fetchRow();
  assert.equal(before.status, "Sent");
  const again = await api("POST", `/api/press/${pressId}/estimates/${id}/send`, { ...RECIPIENTS, artistName: "Different Name" });
  assert.equal(again.status, 200);
  const againBody = await again.json();
  assert.equal(againBody.resend, true);
  const after = await fetchRow();
  assert.equal(after.status, before.status);
  assert.deepEqual(after.payload, before.payload);
  // simulate Viewed then resend - status must NOT regress to Sent
  await db.execute(sql`UPDATE press_estimates SET status = 'Viewed' WHERE id = ${id}`);
  const res3 = await api("POST", `/api/press/${pressId}/estimates/${id}/send`, RECIPIENTS);
  assert.equal(res3.status, 200);
  const after3 = await fetchRow();
  assert.equal(after3.status, "Viewed");
  assert.deepEqual(after3.payload, before.payload);
});

test("parallel /send: one claim wins, every success returns the single persisted token", async () => {
  const id = await createDraft("single");
  const results = await Promise.all([
    api("POST", `/api/press/${pressId}/estimates/${id}/send`, RECIPIENTS),
    api("POST", `/api/press/${pressId}/estimates/${id}/send`, RECIPIENTS),
    api("POST", `/api/press/${pressId}/estimates/${id}/send`, RECIPIENTS),
  ]);
  const bodies = await Promise.all(results.map((r) => r.json()));
  for (const r of results) assert.equal(r.status, 200);
  const dbRow = (await db.execute(sql`SELECT status, payload FROM press_estimates WHERE id = ${id}`) as any).rows[0];
  assert.equal(dbRow.status, "Sent");
  const persisted = dbRow.payload.shareToken;
  assert.ok(typeof persisted === "string" && persisted.length >= 24);
  for (const b of bodies) assert.equal(b.shareToken, persisted);
  assert.equal(bodies.filter((b) => !b.resend).length, 1);
});

test("forged/minimal builder state cannot send: empty done or hidden selections 409", async () => {
  // empty done array
  const r1 = await api("POST", `/api/press/${pressId}/estimates`, {
    kind: "estimate", title: "T3243 forged empty", payload: { source: "Builder", builderState: { qty: 1000, done: [] } },
  });
  const id1 = (await r1.json()).id; created.estimates.add(id1);
  const s1 = await api("POST", `/api/press/${pressId}/estimates/${id1}/send`, RECIPIENTS);
  assert.equal(s1.status, 409);

  // complete done but a gatefold jacket selection hidden by omitting the jacket step
  const hidden = { ...builderState("gatefold"), done: ["size", "discs", "weight", "ctype", "color", "qty", "label", "sleeve", "insert", "sticker"] };
  const r2 = await api("POST", `/api/press/${pressId}/estimates`, {
    kind: "estimate", title: "T3243 hidden jacket", payload: { source: "Builder", builderState: hidden },
  });
  const id2 = (await r2.json()).id; created.estimates.add(id2);
  const s2 = await api("POST", `/api/press/${pressId}/estimates/${id2}/send`, RECIPIENTS);
  assert.equal(s2.status, 409);
});

test("concurrent stale PUT cannot overwrite a row that /send just claimed", async () => {
  const id = await createDraft("single");
  // send wins first
  const send = await api("POST", `/api/press/${pressId}/estimates/${id}/send`, RECIPIENTS);
  assert.equal(send.status, 200);
  // a stale draft save races in with an optimistic predicate: it read Draft
  // long ago, the row is now Sent - the write must lose (409), payload intact
  const stale = await api("PUT", `/api/press/${pressId}/estimates/${id}`, { payload: { source: "Builder", builderState: builderState("gatefold") } });
  assert.equal(stale.status, 409);
  const row = (await db.execute(sql`SELECT status, payload FROM press_estimates WHERE id = ${id}`) as any).rows[0];
  assert.equal(row.status, "Sent");
  assert.ok(typeof row.payload.shareToken === "string");
});
