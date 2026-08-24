// Task #3339 — press bring-your-own custom domain: host resolution against a
// real Postgres + the real route stack.
//   - an ACTIVE custom host serves that press's skin via /api/whitelabel/branding
//   - a PENDING custom host stays neutral (fail-closed until operator activation)
//   - an unknown custom host stays neutral, never an error
//   - the makesvinyl slug host keeps working byte-identically
//   - invite acceptance works under a custom Host header (flexible-kind)
//   - whitelabelOriginForPress prefers the active custom domain (prod-only)
//   - the case-insensitive unique index refuses a second press claiming the host
//
//   npx tsx --test server/whitelabelCustomDomain.db.test.ts

import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer, type Server as HttpServer } from "node:http";
import { sql } from "drizzle-orm";
import express from "express";
import { db, pool } from "./db";
import { authKindMiddleware } from "./auth/host";
import { registerRoutes } from "./routes";
import { whitelabelOriginForPress } from "./pressPortal";

const exec = (q: any) => db.execute(q);

const created = {
  manufacturers: new Set<string>(),
  invites: new Set<string>(),
  users: new Set<string>(),
};

let baseUrl = "";
let httpServer: HttpServer | undefined;
let activePressId = "";
let pendingPressId = "";

const ACTIVE_HOST = "vinyl.t3339press.example";
const PENDING_HOST = "vinyl.t3339pending.example";
const SLUG = "t3339slug";

before(async () => {
  // Guard drifted clones: ensure the Task #3339 columns exist (post-merge.sh
  // pattern — idempotent, never db:push).
  await exec(sql`ALTER TABLE manufacturers ADD COLUMN IF NOT EXISTS custom_domain text`);
  await exec(sql`ALTER TABLE manufacturers ADD COLUMN IF NOT EXISTS custom_domain_status text`);
  await exec(sql`ALTER TABLE manufacturers ADD COLUMN IF NOT EXISTS custom_domain_verified_at timestamp`);
  await exec(sql`CREATE UNIQUE INDEX IF NOT EXISTS manufacturers_custom_domain_lower_uniq
    ON manufacturers (lower(custom_domain)) WHERE custom_domain IS NOT NULL`);

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

  activePressId = randomUUID();
  await exec(sql`
    INSERT INTO manufacturers (id, name, brand_accent_color, brand_corner_style,
                               white_label_slug, custom_domain, custom_domain_status,
                               custom_domain_verified_at)
    VALUES (${activePressId}, ${"t3339 Active Press"}, ${"#B3282D"}, ${"square"},
            ${SLUG}, ${ACTIVE_HOST}, ${"active"}, now())
  `);
  created.manufacturers.add(activePressId);

  pendingPressId = randomUUID();
  await exec(sql`
    INSERT INTO manufacturers (id, name, custom_domain, custom_domain_status)
    VALUES (${pendingPressId}, ${"t3339 Pending Press"}, ${PENDING_HOST}, ${"pending_activation"})
  `);
  created.manufacturers.add(pendingPressId);
});

after(async () => {
  try {
    for (const id of created.invites) await exec(sql`DELETE FROM admin_invites WHERE id = ${id}`);
    for (const id of created.users) {
      await exec(sql`DELETE FROM auth_tokens WHERE user_id = ${id}`).catch(() => {});
      await exec(sql`DELETE FROM users WHERE id = ${id}`);
    }
    for (const id of created.manufacturers) await exec(sql`DELETE FROM manufacturers WHERE id = ${id}`);
  } finally {
    if (httpServer) await new Promise<void>((r) => httpServer!.close(() => r()));
    await pool.end();
  }
});

async function branding(host: string): Promise<any> {
  const res = await fetch(`${baseUrl}/api/whitelabel/branding`, {
    headers: { host, "x-forwarded-host": host, "x-forwarded-proto": "https" },
  });
  assert.equal(res.status, 200, `branding on ${host} returned ${res.status}`);
  return res.json();
}

test("ACTIVE custom host serves that press's skin", async () => {
  const b = await branding(ACTIVE_HOST);
  assert.equal(b.whitelabel, true);
  assert.equal(b.known, true);
  assert.equal(b.pressName, "t3339 Active Press");
  assert.equal(b.accentColor, "#B3282D");
});

test("PENDING custom host is fail-closed neutral", async () => {
  const b = await branding(PENDING_HOST);
  assert.equal(b.known, false);
  assert.equal(b.whitelabel, false, "pending custom host must not claim whitelabel");
});

test("unknown custom host stays neutral, never an error", async () => {
  const b = await branding("nobody.nowhere-t3339.example");
  assert.deepEqual(b, { whitelabel: false, known: false });
});

test("makesvinyl slug host behavior unchanged", async () => {
  const b = await branding(`${SLUG}.makesvinyl.com`);
  assert.equal(b.known, true);
  assert.equal(b.pressName, "t3339 Active Press");
});

test("invite read + accept work under the custom Host header", async () => {
  const invId = randomUUID();
  const token = "t3339tok_" + invId.replace(/-/g, "");
  const email = `t3339_${invId.slice(0, 8)}@example.test`;
  await exec(sql`
    INSERT INTO admin_invites (id, email, role, token, expires_at, created_by_user_id, review_status, default_press_id)
    VALUES (${invId}, ${email}, 'artist', ${token}, ${new Date(Date.now() + 864e5)},
            ${"00000000-0000-0000-0000-000000000001"}, 'approved', ${activePressId})
  `);
  created.invites.add(invId);

  const read = await fetch(`${baseUrl}/api/invites/${token}`, {
    headers: { host: ACTIVE_HOST, "x-forwarded-host": ACTIVE_HOST, "x-forwarded-proto": "https" },
  });
  assert.equal(read.status, 200, `invite read returned ${read.status}`);

  const accept = await fetch(`${baseUrl}/api/invites/${token}/accept`, {
    method: "POST",
    headers: { host: ACTIVE_HOST, "x-forwarded-host": ACTIVE_HOST, "x-forwarded-proto": "https", "content-type": "application/json" },
    body: JSON.stringify({ username: `t3339u_${invId.slice(0, 8)}`, password: "t3339-Passw0rd!", displayName: "T3339 Artist" }),
  });
  const body: any = await accept.json().catch(() => null);
  assert.equal(accept.status, 200, `accept returned ${accept.status}: ${JSON.stringify(body)}`);
  if (body?.user?.id) created.users.add(body.user.id);
});

test("whitelabelOriginForPress prefers the ACTIVE custom domain in production", () => {
  const prev = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  try {
    assert.equal(
      whitelabelOriginForPress({ whiteLabelSlug: SLUG, customDomain: ACTIVE_HOST, customDomainStatus: "active" } as any),
      `https://${ACTIVE_HOST}`,
    );
    // Not yet active → slug wins.
    assert.equal(
      whitelabelOriginForPress({ whiteLabelSlug: SLUG, customDomain: ACTIVE_HOST, customDomainStatus: "pending_activation" } as any),
      `https://${SLUG}.makesvinyl.com`,
    );
    // No custom, no slug → null (request-host fallback upstream).
    assert.equal(whitelabelOriginForPress({} as any), null);
  } finally {
    process.env.NODE_ENV = prev;
  }
});

test("case-insensitive uniqueness refuses a second press claiming the host", async () => {
  const dupId = randomUUID();
  await assert.rejects(
    exec(sql`
      INSERT INTO manufacturers (id, name, custom_domain, custom_domain_status)
      VALUES (${dupId}, ${"t3339 Dup Press"}, ${ACTIVE_HOST.toUpperCase()}, ${"pending_dns"})
    `),
    (err: any) => /duplicate key|unique/i.test(String(err?.message ?? "") + String((err as any)?.cause?.message ?? "")),
  );
});

// ── Task #3339 review follow-ups ─────────────────────────────────────────────

test("activation is refused until DNS verification has passed", async () => {
  const { storage } = await import("./storage");
  const opId = randomUUID();
  const tag = opId.slice(0, 8);
  await exec(sql`
    INSERT INTO users (id, username, password, display_name, email, is_admin, role)
    VALUES (${opId}, ${"t3339op_" + tag}, ${"x"}, ${"t3339 op"}, ${"t3339op_" + tag + "@example.test"}, true, 'super_admin')
  `);
  created.users.add(opId);
  const opTok = "t3339optok_" + randomUUID().replace(/-/g, "");
  await storage.createAuthToken(opTok, opId, "admin");
  await exec(sql`UPDATE manufacturers SET custom_domain_status = 'pending_dns', custom_domain_verified_at = NULL WHERE id = ${pendingPressId}`);
  try {
    const activate = (body: any) =>
      fetch(`${baseUrl}/api/press/${pendingPressId}/custom-domain/activate`, {
        method: "POST",
        headers: { authorization: `Bearer ${opTok}`, "content-type": "application/json" },
        body: JSON.stringify(body),
      });

    // pending_dns, no verified_at → 409, status untouched
    const r1 = await activate({ active: true });
    assert.equal(r1.status, 409, `pending_dns activation must 409, got ${r1.status}: ${JSON.stringify(await r1.json().catch(() => null))}`);
    let row = (await exec(sql`SELECT custom_domain_status FROM manufacturers WHERE id = ${pendingPressId}`) as any).rows[0];
    assert.equal(row.custom_domain_status, "pending_dns");

    // BYPASS regression: pending_dns → deactivate must be refused and must
    // NOT advance status or synthesize verified_at (then activate would pass).
    const rB = await activate({ active: false });
    assert.equal(rB.status, 409, "pending_dns deactivate must 409, not launder the status");
    let rowB = (await exec(sql`SELECT custom_domain_status, custom_domain_verified_at FROM manufacturers WHERE id = ${pendingPressId}`) as any).rows[0];
    assert.equal(rowB.custom_domain_status, "pending_dns");
    assert.equal(rowB.custom_domain_verified_at, null, "deactivate must never stamp verified_at");
    const rB2 = await activate({ active: true });
    assert.equal(rB2.status, 409, "activate after a refused deactivate must still 409");

    // verified_at alone (status still pending_dns) → still refused
    await exec(sql`UPDATE manufacturers SET custom_domain_verified_at = NOW() WHERE id = ${pendingPressId}`);
    const r1b = await activate({ active: true });
    assert.equal(r1b.status, 409, "pending_dns + stray verified_at must still 409");

    // pending_activation + verified_at → activates
    await exec(sql`UPDATE manufacturers SET custom_domain_status = 'pending_activation' WHERE id = ${pendingPressId}`);
    const r2 = await activate({ active: true });
    assert.equal(r2.status, 200, `verified activation should 200, got ${r2.status}: ${JSON.stringify(await r2.json().catch(() => null))}`);
    row = (await exec(sql`SELECT custom_domain_status FROM manufacturers WHERE id = ${pendingPressId}`) as any).rows[0];
    assert.equal(row.custom_domain_status, "active");

    // deactivate falls back to pending_activation
    const r3 = await activate({ active: false });
    assert.equal(r3.status, 200);
    row = (await exec(sql`SELECT custom_domain_status FROM manufacturers WHERE id = ${pendingPressId}`) as any).rows[0];
    assert.equal(row.custom_domain_status, "pending_activation");
  } finally {
    await exec(sql`DELETE FROM auth_tokens WHERE token = ${opTok}`).catch(() => {});
    await exec(sql`UPDATE manufacturers SET custom_domain_status = 'pending_dns', custom_domain_verified_at = NULL WHERE id = ${pendingPressId}`);
  }
});

test("client Share email link is minted on the ACTIVE custom domain", async () => {
  // Seed a sent estimate on the active-custom-domain press.
  const estId = randomUUID();
  const shareToken = "t3339share_" + randomUUID().replace(/-/g, "");
  await exec(sql`
    INSERT INTO press_estimates (id, press_id, kind, title, status, payload)
    VALUES (${estId}, ${activePressId}, 'estimate', ${"T3339 Share Test"}, 'Sent',
            ${JSON.stringify({ shareToken, recipients: [] })}::jsonb)
  `);

  // Capture the outbound Resend call in-process (hermetic — no network).
  const realFetch = globalThis.fetch;
  const capturedBodies: any[] = [];
  const prevEnv = process.env.NODE_ENV;
  const prevKey = process.env.RESEND_API_KEY;
  process.env.NODE_ENV = "production"; // whitelabelOriginForPress is prod-only
  process.env.RESEND_API_KEY = "test-key-t3339";
  globalThis.fetch = (async (input: any, init?: any) => {
    const url = typeof input === "string" ? input : input?.url ?? String(input);
    if (url.includes("api.resend.com")) {
      capturedBodies.push(JSON.parse(String(init?.body ?? "{}")));
      return new Response(JSON.stringify({ id: "t3339" }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return realFetch(input, init);
  }) as any;
  try {
    const res = await globalThis.fetch(`${baseUrl}/api/estimate-link/${shareToken}/share`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "T3339 Client", email: "t3339-client@t3339-client.dev" }),
    });
    const json = await res.json().catch(() => null);
    assert.equal(res.status, 200, `share returned ${res.status}: ${JSON.stringify(json)}`);
    assert.equal(capturedBodies.length, 1, "exactly one email should be sent");
    const html = String(capturedBodies[0]?.html ?? "");
    assert.ok(
      html.includes(`https://${ACTIVE_HOST}/e/${shareToken}`),
      `share email must link the ACTIVE custom domain; html link segment: ${html.match(/https:[^"']*\/e\/[^"']*/)?.[0] ?? "none found"}`,
    );
    assert.ok(!html.includes(`${SLUG}.makesvinyl.com`), "custom domain must win over the makesvinyl slug");
  } finally {
    globalThis.fetch = realFetch;
    process.env.NODE_ENV = prevEnv;
    process.env.RESEND_API_KEY = prevKey;
    await exec(sql`DELETE FROM press_estimates WHERE id = ${estId}`).catch(() => {});
  }
});

test("initial /send AND resend mint the estimate link on the ACTIVE custom domain", async () => {
  const { storage } = await import("./storage");
  const { QUOTE_SETUP_SERVICE_KEYS } = await import("@shared/quotePricing");

  // Operator auth (bearer) — passes requireAdmin/requirePressScope/requirePressEditor.
  const opId = randomUUID();
  const tag = opId.slice(0, 8);
  await exec(sql`
    INSERT INTO users (id, username, password, display_name, email, is_admin, role)
    VALUES (${opId}, ${"t3339sd_" + tag}, ${"x"}, ${"t3339 send op"}, ${"t3339sd_" + tag + "@example.test"}, true, 'super_admin')
  `);
  created.users.add(opId);
  const opTok = "t3339sdtok_" + randomUUID().replace(/-/g, "");
  await storage.createAuthToken(opTok, opId, "admin");

  // The send gate recomputes pricing from saved builder state — seed a fully
  // priced component set (mirrors pressEstimateSendGate.routes.db.test.ts).
  const flat = (key: string, kind: string, cents: number | null) =>
    ({ key, label: key, detail: "", kind, sizes: [], priceCents: cents, pricesBySize: {} });
  const rows = [
    { key: "type:black", label: "Black", detail: "", kind: "type", sizes: ['12"'], priceCents: null, pricesBySize: { '12"': 176 } },
    { key: "color:black:classic", label: "Classic Black", detail: "Black", kind: "color", sizes: ['12"'], priceCents: null, pricesBySize: { '12"': 176 } },
    flat("labels:blank", "labels", 8),
    flat("jackets:single", "jackets", 165),
    flat("sleeves:unprinted", "sleeves", 0),
    flat("service:assembly", "service", 11),
    flat("service:shrink", "service", 15),
    ...QUOTE_SETUP_SERVICE_KEYS.map((k: string) => flat(k, "service", k === "service:stampers" ? 0 : 10000)),
  ];
  await exec(sql`
    INSERT INTO press_components (press_id, component_key, config)
    VALUES (${activePressId}, 'pricing', ${JSON.stringify({ rows })}::jsonb)
    ON CONFLICT (press_id, component_key) DO UPDATE SET config = EXCLUDED.config
  `);
  await exec(sql`UPDATE manufacturers SET estimates_white_label_enabled = true, does_vinyl = true WHERE id = ${activePressId}`);

  const builderState = {
    sizeId: "12", discs: 1, qty: 1000, weightId: "140", colorId: "classic", colorKind: "black",
    colorName: "Classic Black", colorTierName: "Black",
    jacketId: "single", jacketVariantId: "standard", sleeveId: "unprinted", sleeveVariantId: "white",
    labelId: "blank", holeId: "small", insertId: "none", insertVariantId: "",
    stickerShapeId: "none", stickerSizeId: "",
    clientName: "T3339 Artist",
    done: ["size", "discs", "weight", "ctype", "color", "qty", "label", "jacket", "sleeve", "insert", "sticker"],
  };
  const estId = randomUUID();
  await exec(sql`
    INSERT INTO press_estimates (id, press_id, kind, title, status, payload)
    VALUES (${estId}, ${activePressId}, 'estimate', ${"T3339 Send Test"}, 'Draft',
            ${JSON.stringify({ builderState, source: "Builder" })}::jsonb)
  `);

  const realFetch = globalThis.fetch;
  const captured: any[] = [];
  const prevEnv = process.env.NODE_ENV;
  const prevKey = process.env.RESEND_API_KEY;
  process.env.NODE_ENV = "production";
  process.env.RESEND_API_KEY = "test-key-t3339";
  globalThis.fetch = (async (input: any, init?: any) => {
    const url = typeof input === "string" ? input : input?.url ?? String(input);
    if (url.includes("api.resend.com")) {
      captured.push(JSON.parse(String(init?.body ?? "{}")));
      return new Response(JSON.stringify({ id: "t3339" }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return realFetch(input, init);
  }) as any;
  try {
    const send = () =>
      globalThis.fetch(`${baseUrl}/api/press/${activePressId}/estimates/${estId}/send`, {
        method: "POST",
        headers: { authorization: `Bearer ${opTok}`, "content-type": "application/json" },
        body: JSON.stringify({ artistName: "T3339 Artist", recipients: [{ name: "R", email: "t3339-send@t3339-client.dev" }] }),
      });

    // Initial send
    const r1 = await send();
    const j1: any = await r1.json().catch(() => null);
    assert.equal(r1.status, 200, `send returned ${r1.status}: ${JSON.stringify(j1)}`);
    assert.ok(String(j1?.linkUrl ?? "").startsWith(`https://${ACTIVE_HOST}/e/`),
      `initial send linkUrl must live on the custom domain, got ${j1?.linkUrl}`);
    assert.ok(String(captured.at(-1)?.html ?? "").includes(`https://${ACTIVE_HOST}/e/`),
      "initial send email must link the custom domain");

    // Resend (already Sent) — same preference
    const r2 = await send();
    const j2: any = await r2.json().catch(() => null);
    assert.equal(r2.status, 200, `resend returned ${r2.status}: ${JSON.stringify(j2)}`);
    assert.equal(j2?.resend, true, "second send should be a resend");
    assert.ok(String(j2?.linkUrl ?? "").startsWith(`https://${ACTIVE_HOST}/e/`),
      `resend linkUrl must live on the custom domain, got ${j2?.linkUrl}`);
    assert.ok(!String(j2?.linkUrl ?? "").includes(`${SLUG}.makesvinyl.com`));
  } finally {
    globalThis.fetch = realFetch;
    process.env.NODE_ENV = prevEnv;
    process.env.RESEND_API_KEY = prevKey;
    await exec(sql`DELETE FROM press_estimates WHERE id = ${estId}`).catch(() => {});
    await exec(sql`DELETE FROM press_components WHERE press_id = ${activePressId}`).catch(() => {});
    await exec(sql`DELETE FROM auth_tokens WHERE token = ${opTok}`).catch(() => {});
  }
});
