// Task #3275 — authorization regression for the release-level platform fee
// override on PATCH /api/admin/albums/:albumId/shopify-mappings/:id.
//
// The override is a FINANCIAL control (it changes what the wholesale ledger
// accrues), so it is operator-only even though the route itself is gated by
// the partner `map_shopify` verb for ordinary mapping edits. Locked-in:
//   - map-authorized partner PATCHing unitFeeOverrideCents (set OR null) → 403
//   - the same partner PATCHing WITHOUT the field → 200, fee untouched
//   - operator sets and clears the override → 200, persisted
//
// Same harness as shopifyAlbumReadScope.db.test.ts: full route tree on a
// loopback socket, Bearer tokens. Real DB; everything torn down in `after`.
//
//   GT_TEST=1 npx tsx --test server/shopifyMappingFeeAuth.routes.db.test.ts
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
  users: new Set<string>(),
  tokens: new Set<string>(),
  people: new Set<string>(),
  albums: new Set<string>(),
  stores: new Set<string>(),
};

let baseUrl = "";
let httpServer: HttpServer | undefined;

let scopeId = "";
let albumId = "";
let storeId = "";
let mappingId = "";
let partnerToken = "";
let operatorToken = "";

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

  const tag = randomUUID().slice(0, 8);
  scopeId = randomUUID();
  await exec(sql`INSERT INTO people (id, name) VALUES (${scopeId}, ${"T3275 Artist " + tag})`);
  created.people.add(scopeId);

  albumId = randomUUID();
  await exec(sql`
    INSERT INTO albums (id, title, artist, artwork, primary_artist_id)
    VALUES (${albumId}, ${"T3275 Album " + tag}, ${"T3275"}, ${"/album-placeholder.svg"}, ${scopeId})
  `);
  created.albums.add(albumId);

  storeId = randomUUID();
  await exec(sql`
    INSERT INTO shopify_stores (id, shop_domain, store_name, access_token, person_id)
    VALUES (${storeId}, ${"t3275-" + tag + ".myshopify.com"}, ${"T3275"}, ${"x"}, ${scopeId})
  `);
  created.stores.add(storeId);

  mappingId = randomUUID();
  await exec(sql`
    INSERT INTO shopify_product_mappings (id, store_id, shopify_product_id, album_id)
    VALUES (${mappingId}, ${storeId}, ${"991" + tag.replace(/\D/g, "")}, ${albumId})
  `);

  const partnerUser = await seedAdminUser("artist", scopeId, tag + "a");
  await exec(sql`
    INSERT INTO partner_permissions (scope_kind, scope_id, map_shopify)
    VALUES ('artist', ${scopeId}, true)
    ON CONFLICT (scope_kind, scope_id) DO UPDATE SET map_shopify = true
  `);
  partnerToken = await tokenFor(partnerUser);
  operatorToken = await tokenFor(await seedAdminUser("super_admin", null, tag + "b"));
});

async function seedAdminUser(role: string, roleScopeId: string | null, tag: string): Promise<string> {
  const id = randomUUID();
  await exec(sql`
    INSERT INTO users (id, username, password, display_name, email, is_admin, role, role_scope_id)
    VALUES (${id}, ${"t3275_" + tag}, ${"x"}, ${"t3275"}, ${"t3275_" + tag + "@example.test"},
            true, ${role}, ${roleScopeId})
  `);
  created.users.add(id);
  return id;
}

async function tokenFor(userId: string): Promise<string> {
  const token = "t3275tok_" + randomUUID().replace(/-/g, "");
  await storage.createAuthToken(token, userId, "admin");
  created.tokens.add(token);
  return token;
}

function patchMapping(token: string, body: Record<string, unknown>) {
  return fetch(`${baseUrl}/api/admin/albums/${albumId}/shopify-mappings/${mappingId}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function storedOverride(): Promise<number | null> {
  const r: any = await exec(sql`SELECT unit_fee_override_cents FROM shopify_product_mappings WHERE id = ${mappingId}`);
  return r.rows[0].unit_fee_override_cents;
}

test("map-authorized partner cannot SET the fee override (403, untouched)", async () => {
  const res = await patchMapping(partnerToken, { offerSignedCert: false, unitFeeOverrideCents: 0 });
  assert.equal(res.status, 403);
  assert.equal(await storedOverride(), null);
});

test("map-authorized partner cannot CLEAR the fee override either (null is still 403)", async () => {
  // Seed an operator-set override first so a sneaky clear would matter.
  await exec(sql`UPDATE shopify_product_mappings SET unit_fee_override_cents = 125 WHERE id = ${mappingId}`);
  const res = await patchMapping(partnerToken, { unitFeeOverrideCents: null });
  assert.equal(res.status, 403);
  assert.equal(await storedOverride(), 125);
});

test("partner mapping edit WITHOUT the fee field still works and leaves the fee alone", async () => {
  const res = await patchMapping(partnerToken, { offerSignedCert: false });
  assert.equal(res.status, 200);
  assert.equal(await storedOverride(), 125);
});

test("operator can set and clear the override", async () => {
  let res = await patchMapping(operatorToken, { unitFeeOverrideCents: 75 });
  assert.equal(res.status, 200);
  const body: any = await res.json();
  assert.equal(body.unitFeeOverrideCents, 75);
  assert.equal(body.effectiveUnitFeeSource, "release_override");
  assert.equal(await storedOverride(), 75);

  res = await patchMapping(operatorToken, { unitFeeOverrideCents: null });
  assert.equal(res.status, 200);
  assert.equal(await storedOverride(), null);
});

test("partner cannot smuggle a fee override through mapping CREATE (403)", async () => {
  const res = await fetch(`${baseUrl}/api/admin/albums/${albumId}/shopify-mappings`, {
    method: "POST",
    headers: { Authorization: `Bearer ${partnerToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ storeId, shopifyProductId: "9919999", unitFeeOverrideCents: 1 }),
  });
  assert.equal(res.status, 403);
});

test("partner cannot set or clear the STORE fee (403), operator can", async () => {
  const patchStore = (token: string, body: unknown) =>
    fetch(`${baseUrl}/api/admin/shopify/stores/${storeId}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  let res = await patchStore(partnerToken, { digitalUnitFeeCents: 0 });
  assert.equal(res.status, 403);
  res = await patchStore(partnerToken, { digitalUnitFeeCents: null });
  assert.equal(res.status, 403);
  res = await patchStore(operatorToken, { digitalUnitFeeCents: 200 });
  assert.equal(res.status, 200);
  const body: any = await res.json();
  assert.equal(body.digitalUnitFeeCents, 200);
  res = await patchStore(operatorToken, { digitalUnitFeeCents: null });
  assert.equal(res.status, 200);
});

after(async () => {
  for (const t of created.tokens) await exec(sql`DELETE FROM auth_tokens WHERE token = ${t}`);
  await exec(sql`DELETE FROM partner_permissions WHERE scope_kind='artist' AND scope_id = ${scopeId}`);
  await exec(sql`DELETE FROM shopify_product_mappings WHERE id = ${mappingId}`);
  for (const id of created.stores) await exec(sql`DELETE FROM shopify_stores WHERE id = ${id}`);
  for (const id of created.albums) await exec(sql`DELETE FROM albums WHERE id = ${id}`);
  for (const id of created.users) {
    await exec(sql`DELETE FROM memberships WHERE user_id = ${id}`);
    await exec(sql`DELETE FROM users WHERE id = ${id}`);
  }
  for (const id of created.people) await exec(sql`DELETE FROM people WHERE id = ${id}`);
  httpServer?.close();
  await pool.end().catch(() => {});
});
