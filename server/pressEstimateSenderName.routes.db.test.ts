// Task #3365 — estimate emails arrive FROM the press's name.
//
// Drives the real routes over loopback and asserts the delivery options
// (captured via mail.ts __testEstimateDeliveries under GT_TEST, no real
// send) for all three estimate-email paths:
//   1. First /send  — From display name = press name (no "· via GoodTunes®"
//      suffix), Reply-To = the preparing operator's real email.
//   2. Resend /send — same.
//   3. Token /share — same press-name From; Reply-To prefers the preparer
//      (resolved off payload.preparedBy), falling back to press contact.
//
// Harness mirrors pressEstimateSendGate.routes.db.test.ts. Real DB:
//   GT_TEST=1 npx tsx --test server/pressEstimateSenderName.routes.db.test.ts
process.env.SESSION_SECRET = process.env.SESSION_SECRET || "t3365-test-session-secret";

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
import { __testEstimateDeliveries } from "./mail";
import type { PricingRow } from "@shared/pressComponents";
import { QUOTE_SETUP_SERVICE_KEYS } from "@shared/quotePricing";

const scryptAsync = promisify(_scrypt);
const exec = (q: any) => db.execute(q);

const PASSWORD = "t3365-correct-horse";
const PRESS_NAME = `T3365 Memphis Record Pressing ${randomUUID().slice(0, 8)}`;
const ADMIN_DISPLAY_NAME = `T3365 Andrew ${randomUUID().slice(0, 8)}`;
const PRESS_CONTACT_EMAIL = "t3365-press-contact@example.test";
let ADMIN_EMAIL = "";
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

const api = async (method: string, path: string, body?: unknown, opts: { anon?: boolean } = {}) => {
  return fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      "x-forwarded-proto": "https",
      ...(!opts.anon && cookie ? { cookie } : {}),
      ...(!opts.anon && bearer ? { authorization: `Bearer ${bearer}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
};

// Fully-priced rows (same vocabulary as the send-gate test).
const flat = (key: string, kind: PricingRow["kind"], cents: number | null): PricingRow => ({
  key, label: key, detail: "", kind, sizes: [], priceCents: cents, pricesBySize: {},
});
const PRICED_ROWS: PricingRow[] = [
  { key: "type:black", label: "Black", detail: "", kind: "type", sizes: ['12"'], priceCents: null, pricesBySize: { '12"': 176 } },
  { key: "color:black:classic", label: "Classic Black", detail: "Black", kind: "color", sizes: ['12"'], priceCents: null, pricesBySize: { '12"': 176 } },
  flat("labels:blank", "labels", 8),
  flat("jackets:single", "jackets", 165),
  flat("sleeves:unprinted", "sleeves", 0),
  flat("service:assembly", "service", 11),
  flat("service:shrink", "service", 15),
  ...QUOTE_SETUP_SERVICE_KEYS.map((k) => flat(k, "service", k === "service:stampers" ? 0 : 10000)),
];

const builderState = () => ({
  sizeId: "12", discs: 1, qty: 1000, weightId: "140", colorId: "classic", colorKind: "black",
  colorName: "Classic Black", colorTierName: "Black",
  jacketId: "single", jacketVariantId: "standard", sleeveId: "unprinted", sleeveVariantId: "white",
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

  adminId = randomUUID();
  created.users.add(adminId);
  ADMIN_EMAIL = `t3365_${adminId.slice(0, 8)}@example.test`;
  const pw = await hashPassword(PASSWORD);
  await exec(sql`
    INSERT INTO users (id, email, username, password, display_name, is_admin, role)
    VALUES (${adminId}, ${ADMIN_EMAIL}, ${ADMIN_EMAIL}, ${pw}, ${ADMIN_DISPLAY_NAME}, true, 'super_admin')
  `);
  const login = await api("POST", "/api/login", { username: ADMIN_EMAIL, password: PASSWORD, kind: "admin" });
  assert.equal(login.status, 200, `login failed: ${await login.clone().text()}`);
  const loginBody = await login.json();
  bearer = String(loginBody.token ?? "");
  cookie = login.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");

  pressId = randomUUID();
  created.presses.add(pressId);
  await exec(sql`
    INSERT INTO manufacturers (id, name, does_vinyl, contact_email)
    VALUES (${pressId}, ${PRESS_NAME}, true, ${PRESS_CONTACT_EMAIL})
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

const RECIPIENTS = { artistName: "Test Artist", recipients: [{ name: "Test Artist", email: "t3365-recipient@example.test" }] };

const deliveriesSince = (mark: number) => __testEstimateDeliveries.slice(mark);

test("first send: From displays the press name (no via-GoodTunes suffix), Reply-To = preparer", async () => {
  const create = await api("POST", `/api/press/${pressId}/estimates`, {
    kind: "estimate", title: "T3365 sender-name",
    payload: { builderState: builderState(), source: "Builder" },
  });
  assert.equal(create.status, 201, await create.clone().text());
  const row = await create.json();
  created.estimates.add(row.id);

  let mark = __testEstimateDeliveries.length;
  const send = await api("POST", `/api/press/${pressId}/estimates/${row.id}/send`, RECIPIENTS);
  assert.equal(send.status, 200, await send.clone().text());
  const shareToken = (await send.json()).shareToken as string;
  assert.ok(typeof shareToken === "string" && shareToken.length >= 24);

  const first = deliveriesSince(mark);
  assert.equal(first.length, 1);
  assert.equal(first[0].fromDisplayName, PRESS_NAME);
  assert.ok(!String(first[0].fromDisplayName).includes("GoodTunes"), "no '· via GoodTunes®' suffix");
  assert.equal(first[0].replyTo, ADMIN_EMAIL);

  // Resend — same sender display name + Reply-To.
  mark = __testEstimateDeliveries.length;
  const resend = await api("POST", `/api/press/${pressId}/estimates/${row.id}/send`, RECIPIENTS);
  assert.equal(resend.status, 200);
  assert.equal((await resend.json()).resend, true);
  const second = deliveriesSince(mark);
  assert.equal(second.length, 1);
  assert.equal(second[0].fromDisplayName, PRESS_NAME);
  assert.equal(second[0].replyTo, ADMIN_EMAIL);

  // Token /share (anonymous client) — press-name From; Reply-To prefers the
  // preparer resolved off payload.preparedBy, before the press contact.
  await db.execute(sql`
    UPDATE press_estimates
    SET payload = payload || ${JSON.stringify({ preparedBy: ADMIN_DISPLAY_NAME })}::jsonb
    WHERE id = ${row.id}
  `);
  mark = __testEstimateDeliveries.length;
  const share = await api("POST", `/api/estimate-link/${shareToken}/share`, { email: "t3365-share@example.test" }, { anon: true });
  // No mail transport in tests (synthetic recipient / no RESEND key), so the
  // route honestly 502s — the GT_TEST capture still recorded the options.
  assert.ok([200, 502].includes(share.status), await share.clone().text());
  const shared = deliveriesSince(mark);
  assert.equal(shared.length, 1);
  assert.equal(shared[0].fromDisplayName, PRESS_NAME);
  assert.equal(shared[0].replyTo, ADMIN_EMAIL);

  // With NO resolvable preparer, /share falls back to the press contact.
  await db.execute(sql`
    UPDATE press_estimates
    SET payload = payload - 'preparedBy'
    WHERE id = ${row.id}
  `);
  mark = __testEstimateDeliveries.length;
  const share2 = await api("POST", `/api/estimate-link/${shareToken}/share`, { email: "t3365-share2@example.test" }, { anon: true });
  assert.ok([200, 502].includes(share2.status), await share2.clone().text());
  const shared2 = deliveriesSince(mark);
  assert.equal(shared2.length, 1);
  assert.equal(shared2[0].fromDisplayName, PRESS_NAME);
  assert.equal(shared2[0].replyTo, PRESS_CONTACT_EMAIL);
});
