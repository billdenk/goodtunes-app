// Task #3257 — white-label branding route coverage over a real loopback
// socket + real DB (same harness as previewPass.routes.db.test.ts —
// 127.0.0.1 is an unknown host so the host/kind boundary is skipped):
//
//   1. GET /api/estimate-link/:token returns EXACTLY the sanitized public
//      allowlist including the new `brand` block — never shareToken,
//      pressId, or the raw payload.
//   2. The branding read/write endpoints are gated: unauthenticated PUT
//      /api/press/:id/branding and POST /api/press/:id/brand-suggest 401.
//   3. GET /api/invites/:token on a press-referred invite carries a
//      sanitized pressBrand (name/logos/accent/corner only — no press id),
//      and null when no press referrer is stamped.
//
//   npx tsx --test server/pressBranding.routes.db.test.ts
import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer, type Server as HttpServer } from "node:http";
import { sql } from "drizzle-orm";
import express from "express";
import { db, pool } from "./db";
import { authKindMiddleware } from "./auth/host";
import { registerRoutes } from "./routes";

const exec = (q: any) => db.execute(q);

const created = {
  manufacturers: new Set<string>(),
  pressEstimates: new Set<string>(),
  adminInvites: new Set<string>(),
};

let baseUrl = "";
let httpServer: HttpServer | undefined;
let pressId = "";
const shareToken = "t3257-" + randomUUID().replace(/-/g, "") + randomUUID().slice(0, 8);
const inviteToken = "t3257inv" + randomUUID().replace(/-/g, "");
const plainInviteToken = "t3257plain" + randomUUID().replace(/-/g, "");

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

  // Seed a press with full white-label branding configured.
  pressId = randomUUID();
  await exec(sql`
    INSERT INTO manufacturers (id, name, logo_url, light_logo_url,
                               brand_accent_color, brand_corner_style, brand_contact_line)
    VALUES (${pressId}, ${"t3257 Press"}, ${"/objects/uploads/t3257-dark.png"},
            ${"/objects/uploads/t3257-light.png"}, ${"#B3282D"}, ${"square"},
            ${"1 Test Ave · Testville · t3257.example"})
  `);
  created.manufacturers.add(pressId);

  // A sent estimate with a share token in the payload.
  const estId = randomUUID();
  await exec(sql`
    INSERT INTO press_estimates (id, press_id, kind, display_id, title, status, payload)
    VALUES (${estId}, ${pressId}, ${"estimate"}, ${"T3257-01"}, ${"t3257 client"}, ${"Sent"},
            ${JSON.stringify({ shareToken, clientName: "t3257 client", totalCents: 837500, sentAt: new Date().toISOString() })}::jsonb)
  `);
  created.pressEstimates.add(estId);

  // A press-referred invite + a plain (no-press) invite.
  for (const [tok, dpid] of [[inviteToken, pressId], [plainInviteToken, null]] as const) {
    const invId = randomUUID();
    await exec(sql`
      INSERT INTO admin_invites (id, email, role, token, expires_at, created_by_user_id, default_press_id)
      VALUES (${invId}, ${`t3257-${invId.slice(0, 8)}@example.com`}, ${"artist"}, ${tok},
              ${new Date(Date.now() + 86400000)}, ${"t3257-test-user"}, ${dpid})
    `);
    created.adminInvites.add(invId);
  }
});

after(async () => {
  try {
    for (const id of created.pressEstimates) await exec(sql`DELETE FROM press_estimates WHERE id = ${id}`);
    for (const id of created.adminInvites) await exec(sql`DELETE FROM admin_invites WHERE id = ${id}`);
    for (const id of created.manufacturers) await exec(sql`DELETE FROM manufacturers WHERE id = ${id}`);
  } finally {
    if (httpServer) await new Promise<void>((r) => httpServer!.close(() => r()));
    await pool.end();
  }
});

async function get(path: string): Promise<{ status: number; json: any }> {
  const res = await fetch(`${baseUrl}${path}`);
  let json: any = null;
  try { json = await res.json(); } catch { json = null; }
  return { status: res.status, json };
}

test("estimate-link returns exactly the sanitized allowlist incl. brand — no token/press-id leak", async () => {
  const r = await get(`/api/estimate-link/${shareToken}`);
  assert.equal(r.status, 200);
  assert.deepEqual(
    Object.keys(r.json).sort(),
    ["brand", "build", "builderState", "clientName", "createdAt", "displayId",
     "preparedBy", "pressName", "sentAt", "size", "status", "title", "totalCents"].sort(),
    "public payload must be the exact allowlist — nothing extra",
  );
  assert.equal(r.json.pressName, "t3257 Press");
  assert.deepEqual(
    Object.keys(r.json.brand).sort(),
    ["accentColor", "contactLine", "cornerStyle", "lightLogoUrl", "logoUrl"].sort(),
  );
  assert.equal(r.json.brand.accentColor, "#B3282D");
  assert.equal(r.json.brand.cornerStyle, "square");
  assert.equal(r.json.brand.contactLine, "1 Test Ave · Testville · t3257.example");
  const raw = JSON.stringify(r.json);
  assert.ok(!raw.includes(shareToken), "shareToken must never appear in the public payload");
  assert.ok(!raw.includes(pressId), "press id must never appear in the public payload");
});

test("branding write + scrape endpoints are auth-gated", async () => {
  const put = await fetch(`${baseUrl}/api/press/${pressId}/branding`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ accentColor: "#123456" }),
  });
  assert.equal(put.status, 401, "unauthenticated branding PUT must 401");

  const suggest = await fetch(`${baseUrl}/api/press/${pressId}/brand-suggest`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url: "https://example.com" }),
  });
  assert.equal(suggest.status, 401, "unauthenticated brand-suggest must 401");

  // Read gate too — the branding GET is press-scoped, not public.
  const read = await fetch(`${baseUrl}/api/press/${pressId}/branding`);
  assert.equal(read.status, 401, "unauthenticated branding GET must 401");

  // Confirm the 401s didn't sneak a write in.
  const row = await exec(sql`SELECT brand_accent_color FROM manufacturers WHERE id = ${pressId}`);
  assert.equal(((row as any).rows ?? [])[0]?.brand_accent_color, "#B3282D");
});

test("invite lookup carries sanitized pressBrand for press-referred invites only", async () => {
  const branded = await get(`/api/invites/${inviteToken}`);
  assert.equal(branded.status, 200);
  assert.ok(branded.json.pressBrand, "press-referred invite must carry pressBrand");
  assert.deepEqual(
    Object.keys(branded.json.pressBrand).sort(),
    ["accentColor", "cornerStyle", "lightLogoUrl", "logoUrl", "pressName"].sort(),
    "pressBrand must be display-only fields — never the press id",
  );
  assert.equal(branded.json.pressBrand.pressName, "t3257 Press");
  assert.equal(branded.json.pressBrand.accentColor, "#B3282D");
  assert.ok(!JSON.stringify(branded.json).includes(pressId), "press id must not leak on the invite payload");

  const plain = await get(`/api/invites/${plainInviteToken}`);
  assert.equal(plain.status, 200);
  assert.equal(plain.json.pressBrand, null, "no press referrer → pressBrand null");
});
