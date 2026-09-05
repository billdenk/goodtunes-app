// Task #3423 — emailed estimate links land on the white-label portal.
//
// A SKINNED press (manufacturers.client_portal_skin set) mints estimate
// emails whose link is the portal entrance `/next-steps?e=<shareToken>`
// (the token is the auth; the portal links back to /e/<token> for the
// estimate itself). An UNSKINNED press keeps the plain `/e/<token>`
// estimate page. Covers first send, resend, and the anonymous token
// /share path, plus the token-only portal read:
//   - GET /api/press-client/portal?e=<tok> on the OWN press host → 200
//   - the same token on ANOTHER press's host → 401 (never leaks cross-press)
//   - anon with no token → 401 (before any host 404)
//
// Harness mirrors pressEstimateSenderName.routes.db.test.ts. Real DB:
//   GT_TEST=1 npx tsx --test server/pressEstimateEmailedLanding.routes.db.test.ts
process.env.SESSION_SECRET = process.env.SESSION_SECRET || "t3423-test-session-secret";
// This suite asserts the in-process delivery seam. Set it before importing the
// mail module so focused multi-file runs remain hermetic without requiring the
// caller to export GT_TEST.
process.env.GT_TEST = "1";

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
import { QUOTE_SETUP_SERVICE_KEYS, computeQuotePendingIds } from "@shared/quotePricing";
import { loadPressComponents } from "./pressComponents";
import { MRP_CODA_CROSSWALK, MRP_CODA_SOURCE } from "@shared/mrpCodaPricing";

const scryptAsync = promisify(_scrypt);
const exec = (q: any) => db.execute(q);

const PASSWORD = "t3423-correct-horse";
const RUN = randomUUID().slice(0, 8);
const SKINNED_NAME = `T3423 Skinned Press ${RUN}`;
const SKINNED_SLUG = `t3423s${RUN}`;
const PLAIN_NAME = `T3423 Plain Press ${RUN}`;
const PLAIN_SLUG = `t3423p${RUN}`;
const ACCEPT_EMAIL = `t3462-accept-${RUN}@example.test`;
let ADMIN_EMAIL = "";
let baseUrl = "";
let httpServer: HttpServer | undefined;
let cookie = "";
let bearer = "";
let adminId = "";
let skinnedPressId = "";
let plainPressId = "";

const created = { users: new Set<string>(), presses: new Set<string>() };

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
  ADMIN_EMAIL = `t3423_${adminId.slice(0, 8)}@example.test`;
  const pw = await hashPassword(PASSWORD);
  await exec(sql`
    INSERT INTO users (id, email, username, password, display_name, is_admin, role)
    VALUES (${adminId}, ${ADMIN_EMAIL}, ${ADMIN_EMAIL}, ${pw}, ${"T3423 Operator " + RUN}, true, 'super_admin')
  `);
  const login = await api("POST", "/api/login", { username: ADMIN_EMAIL, password: PASSWORD, kind: "admin" });
  assert.equal(login.status, 200, `login failed: ${await login.clone().text()}`);
  const loginBody = await login.json();
  bearer = String(loginBody.token ?? "");
  cookie = login.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");

  skinnedPressId = randomUUID();
  plainPressId = randomUUID();
  created.presses.add(skinnedPressId);
  created.presses.add(plainPressId);
  await exec(sql`
    INSERT INTO manufacturers (id, name, does_vinyl, contact_email, white_label_slug, client_portal_skin)
    VALUES (${skinnedPressId}, ${SKINNED_NAME}, true, 't3423-skinned@example.test', ${SKINNED_SLUG}, 'mrp-light')
  `);
  await exec(sql`
    INSERT INTO manufacturers (id, name, does_vinyl, contact_email, white_label_slug)
    VALUES (${plainPressId}, ${PLAIN_NAME}, true, 't3423-plain@example.test', ${PLAIN_SLUG})
  `);
  for (const id of [skinnedPressId, plainPressId]) {
    await exec(sql`
      INSERT INTO press_components (press_id, component_key, config)
      VALUES (${id}, 'pricing', ${JSON.stringify({ rows: PRICED_ROWS })}::jsonb)
    `);
  }
});

after(async () => {
  try {
    await exec(sql`DELETE FROM auth_tokens WHERE customer_user_id IN (SELECT id FROM customer_users WHERE lower(email) = lower(${ACCEPT_EMAIL}))`);
    await exec(sql`DELETE FROM customer_users WHERE lower(email) = lower(${ACCEPT_EMAIL})`);
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

const RECIPIENT_EMAIL = "t3423-recipient@example.test";
const RECIPIENTS = { artistName: "Test Artist", recipients: [{ name: "Test Artist", email: RECIPIENT_EMAIL }] };
const deliveriesSince = (mark: number) => __testEstimateDeliveries.slice(mark);

const sendEstimate = async (pressId: string, title: string) => {
  const create = await api("POST", `/api/press/${pressId}/estimates`, {
    kind: "estimate", title,
    payload: { builderState: builderState(), source: "Builder" },
  });
  assert.equal(create.status, 201, await create.clone().text());
  const row = await create.json();
  const mark = __testEstimateDeliveries.length;
  const send = await api("POST", `/api/press/${pressId}/estimates/${row.id}/send`, RECIPIENTS);
  assert.equal(send.status, 200, await send.clone().text());
  const body = await send.json();
  return { row, sendBody: body, deliveries: deliveriesSince(mark) };
};

let skinnedToken = "";

test("skinned press: emailed estimate link lands on the portal entrance (/next-steps?e=), send + resend + share", async () => {
  const { sendBody, deliveries } = await sendEstimate(skinnedPressId, "T3423 skinned landing");
  skinnedToken = String(sendBody.shareToken);
  assert.ok(skinnedToken.length >= 24);
  const expectedPath = `/next-steps?e=${skinnedToken}`;
  assert.ok(String(sendBody.linkUrl).endsWith(expectedPath), `send linkUrl ${sendBody.linkUrl} should end with ${expectedPath}`);
  assert.equal(deliveries.length, 1);
  assert.ok(String(deliveries[0].linkUrl).endsWith(expectedPath), `emailed linkUrl ${deliveries[0].linkUrl} should end with ${expectedPath}`);

  // Resend re-emails the SAME portal-entrance link.
  const mark = __testEstimateDeliveries.length;
  const resend = await api("POST", `/api/press/${skinnedPressId}/estimates/${(sendBody.row ?? {}).id}/send`, RECIPIENTS);
  assert.equal(resend.status, 200, await resend.clone().text());
  const resendBody = await resend.json();
  assert.equal(resendBody.resend, true);
  assert.ok(String(resendBody.linkUrl).endsWith(expectedPath), `resend linkUrl ${resendBody.linkUrl}`);
  const re = deliveriesSince(mark);
  assert.equal(re.length, 1);
  assert.ok(String(re[0].linkUrl).endsWith(expectedPath), `resent emailed linkUrl ${re[0].linkUrl}`);

  // Anonymous client /share also mails the portal entrance.
  const mark2 = __testEstimateDeliveries.length;
  const share = await api("POST", `/api/estimate-link/${skinnedToken}/share`, { email: "t3423-share@example.test" }, { anon: true });
  assert.ok([200, 502].includes(share.status), await share.clone().text());
  const shared = deliveriesSince(mark2);
  assert.equal(shared.length, 1);
  assert.ok(String(shared[0].linkUrl).endsWith(expectedPath), `share emailed linkUrl ${shared[0].linkUrl}`);
});

test("unskinned press: emailed estimate link stays on the /e/<token> estimate page", async () => {
  const { sendBody, deliveries } = await sendEstimate(plainPressId, "T3423 plain landing");
  const token = String(sendBody.shareToken);
  assert.ok(token.length >= 24);
  assert.ok(String(sendBody.linkUrl).endsWith(`/e/${token}`), `send linkUrl ${sendBody.linkUrl}`);
  assert.ok(!String(sendBody.linkUrl).includes("/next-steps"), "no portal entrance for an unskinned press");
  assert.equal(deliveries.length, 1);
  assert.ok(String(deliveries[0].linkUrl).endsWith(`/e/${token}`), `emailed linkUrl ${deliveries[0].linkUrl}`);
});

test("token-only portal read: own host 200, other press's host 401, no token 401", async () => {
  assert.ok(skinnedToken, "share token from the skinned send");
  // Own press host (dev/GT_TEST ?wl= override mirrors the subdomain).
  const own = await api("GET", `/api/press-client/portal?e=${skinnedToken}&wl=${SKINNED_SLUG}`, undefined, { anon: true });
  assert.equal(own.status, 200, await own.clone().text());
  const portal = await own.json();
  assert.equal(String(portal.client?.email ?? "").toLowerCase(), RECIPIENT_EMAIL);
  assert.ok(Array.isArray(portal.estimates) && portal.estimates.length >= 1, "tokened portal lists the estimate");
  // Token visitors are view-only: the payload says so, and mutating
  // actions (file upload) stay session-gated — the UI hides them.
  assert.equal(portal.tokenOnly, true, "token-authorized read flags tokenOnly");
  const estimateId = String(portal.estimates[0].id);
  const fd = new FormData();
  fd.append("file", new Blob([Buffer.from("not-really-audio")], { type: "application/octet-stream" }), "master.wav");
  const upload = await fetch(`${baseUrl}/api/press-client/estimates/${estimateId}/files?e=${skinnedToken}&wl=${SKINNED_SLUG}`, {
    method: "POST",
    headers: { "x-forwarded-proto": "https" },
    body: fd,
  });
  assert.equal(upload.status, 401, "upload requires a signed-in customer, never the view-only token");

  // The SAME token on another press's host must not authorize anything.
  const cross = await api("GET", `/api/press-client/portal?e=${skinnedToken}&wl=${PLAIN_SLUG}`, undefined, { anon: true });
  assert.equal(cross.status, 401, await cross.clone().text());

  // Anonymous with no token: 401 (auth before host resolution).
  const anon = await api("GET", `/api/press-client/portal?wl=${SKINNED_SLUG}`, undefined, { anon: true });
  assert.equal(anon.status, 401);
  const anonNoHost = await api("GET", `/api/press-client/portal`, undefined, { anon: true });
  assert.equal(anonNoHost.status, 401);
});

test("MRP-skinned fixture is saved, sent, opened, and accepted without real email", async () => {
  assert.ok(skinnedToken, "share token from the saved/sent fixture");
  // Opening the public estimate uses the same anonymous token an email carries.
  const opened = await api("GET", `/api/estimate-link/${skinnedToken}`, undefined, { anon: true });
  assert.equal(opened.status, 200, await opened.clone().text());
  const openBody = await opened.json();
  assert.equal(openBody.brand?.skin, "mrp-light");

  // Accept by creating a hermetic test identity. Mail remains captured by the
  // test seam (__testEstimateDeliveries); no real delivery is attempted.
  const accepted = await api(
    "POST",
    `/api/estimate-link/${skinnedToken}/start`,
    { name: "T3462 Test Artist", email: ACCEPT_EMAIL, password: "t3462-test-password" },
    { anon: true },
  );
  assert.equal(accepted.status, 200, await accepted.clone().text());
  assert.equal((await accepted.json()).ok, true);

  const result = await exec(sql`
    SELECT status FROM press_estimates
    WHERE press_id = ${skinnedPressId} AND payload->>'shareToken' = ${skinnedToken}
    LIMIT 1
  `);
  assert.equal((result as any).rows?.[0]?.status, "Converted");
});

test("MRP CODA 1LP/2LP totals stay identical across save, email, landing, and acceptance", async () => {
  const ladder = (key: string, kind: PricingRow["kind"], cents: number, codaCode: string): PricingRow => ({
    key, label: key, detail: "", kind, sizes: [], priceCents: null, pricesBySize: {},
    rungsBySize: { '12"': [{ qty: 2000, unitCents: cents }] },
    codaCode, codaSource: MRP_CODA_SOURCE,
  });
  const rows: PricingRow[] = [
    { ...ladder("type:opaque", "type", 230, "4011A-0006"), label: "Opaque", codaCode: undefined, codaCodesBySize: { '12"': "4011A-0006" } },
    { ...ladder("type:splatter", "type", 55, "4011A-0012"), label: "Splatter", surchargeOver: "type:opaque" },
    ladder("labels:color", "labels", 25, "4035-0004"),
    ladder("jackets:single", "jackets", 81, "4031-0004"),
    ladder("sleeves:unprinted", "sleeves", 0, "4033-0003"),
    ladder("inserts:12x12-color", "inserts", 35, "4032-0003"),
    ladder("service:assembly", "service", 12, "4040A-0004"),
    ladder("service:shrink", "service", 17, "4040E-0002"),
    { ...flat("service:cutting", "service", 40000), codaCode: "4050-0001", codaSource: MRP_CODA_SOURCE },
    { ...flat("service:plating", "service", 30000), codaCode: "4020-0002", codaSource: MRP_CODA_SOURCE },
    { ...flat("service:test", "service", 12500), codaCode: "4011B-0001", codaSource: MRP_CODA_SOURCE },
    flat("service:stampers", "service", 99999),
    flat("service:colorfee", "service", 99999),
  ];
  const setupRules = {
    source: "mrp-day2-tracker-s16",
    codaSource: MRP_CODA_SOURCE,
    stamper: { reordersAlwaysPay: true, rules: [{ weights: ["140"], perUnitCents: 14, freeUnits: 1000, codaCode: "4021-0001" }] },
    colorSetup: {
      perColorCents: 9500, perDisc: true, categories: [], defaultColors: 1,
      codaCode: "4011A-0003",
      splatter: { match: ["splatter"], baseColors: 1, perSplatterColorCents: 3500, maxSplatterColors: 3, codaCode: "4011A-0014" },
    },
    pressSetup: { amountCents: 9500, underQty: 500, codaCode: "4080-0001" },
    polyBag: { label: "Open-top poly bag", bagCents: 25, insertionCents: 12, bagCodaCode: "4033-0018", insertionCodaCode: "4040A-0004" },
  };
  const coda = {
    source: MRP_CODA_SOURCE,
    reviewedWorkbook: "GoodTunes___GoGoods-Tier3-2_1788555344172.xlsx",
    entries: Array.from(MRP_CODA_CROSSWALK.values()),
  };
  await exec(sql`
    UPDATE press_components SET config = ${JSON.stringify({ rows, setupRules, mrpCodaCrosswalk: coda })}::jsonb
    WHERE press_id = ${skinnedPressId} AND component_key = 'pricing'
  `);

  for (const [discs, expected] of [[1, 10_970], [2, 18_415]] as const) {
    const state = {
      ...builderState(), qty: 2000, discs, colorName: "Custom Splatter",
      colorTierName: "Splatter", colorKind: "splatter", splatterColors: 2,
      labelId: "color", insertId: "12x12-color", polyBag: true,
    };
    const loaded = await loadPressComponents(skinnedPressId);
    assert.deepEqual(
      computeQuotePendingIds(state, loaded.pricing.rows, loaded.pricing.setupRules, loaded.pricing.mrpCodaCrosswalk),
      [],
      JSON.stringify(loaded.pricing.rows.filter((r) => r.key.startsWith("type:"))),
    );
    const create = await api("POST", `/api/press/${skinnedPressId}/estimates`, {
      kind: "estimate", title: `T3462 CODA ${discs}LP`,
      payload: { builderState: state, source: "Builder", totalCents: 1 },
    });
    assert.equal(create.status, 201, await create.clone().text());
    const draft = await create.json();
    const mark = __testEstimateDeliveries.length;
    const send = await api("POST", `/api/press/${skinnedPressId}/estimates/${draft.id}/send`, {
      artistName: "T3462 Test Artist", recipients: [{ name: "T3462 Test Artist", email: ACCEPT_EMAIL }],
    });
    assert.equal(send.status, 200, await send.clone().text());
    const sent = await send.json();
    assert.equal(sent.row.payload.totalCents, expected * 100, "server replaces forged saved total");
    assert.equal(sent.row.payload.quoteBreakdown.total, expected);
    assert.equal(__testEstimateDeliveries[mark]?.breakdown?.total, expected);

    const opened = await api("GET", `/api/estimate-link/${sent.shareToken}`, undefined, { anon: true });
    assert.equal(opened.status, 200);
    const landing = await opened.json();
    assert.equal(landing.totalCents, expected * 100);
    assert.equal(landing.quoteBreakdown.total, expected);

    const accepted = await api("POST", `/api/estimate-link/${sent.shareToken}/start`, {
      email: ACCEPT_EMAIL, password: "t3462-test-password", mode: "signin",
    }, { anon: true });
    assert.equal(accepted.status, 200, await accepted.clone().text());
    const afterAccept = await api("GET", `/api/estimate-link/${sent.shareToken}`, undefined, { anon: true });
    const acceptedLanding = await afterAccept.json();
    assert.equal(acceptedLanding.status, "Converted");
    assert.equal(acceptedLanding.totalCents, expected * 100);
    assert.deepEqual(acceptedLanding.quoteBreakdown, landing.quoteBreakdown);
  }

  for (const [label, state, pendingId] of [
    ["unmapped jacket", { ...builderState(), qty: 2000, colorName: "Opaque Pick", colorTierName: "Opaque", colorKind: "opaque", labelId: "color", jacketId: "gatefold" }, "jacket"],
    ["held color setup", { ...builderState(), qty: 2000, colorName: "Opaque Pick", colorTierName: "Opaque", colorKind: "opaque", labelId: "color" }, "colorfee"],
  ] as const) {
    const create = await api("POST", `/api/press/${skinnedPressId}/estimates`, {
      kind: "estimate", title: `T3462 ${label}`, payload: { builderState: state, source: "Builder", totalCents: 999_999_999 },
    });
    assert.equal(create.status, 201);
    const draft = await create.json();
    const send = await api("POST", `/api/press/${skinnedPressId}/estimates/${draft.id}/send`, {
      artistName: "T3462 Test Artist", recipients: [{ name: "T3462 Test Artist", email: ACCEPT_EMAIL }],
    });
    assert.equal(send.status, 409);
    assert.ok((await send.json()).pendingLineIds.includes(pendingId));
  }
});
