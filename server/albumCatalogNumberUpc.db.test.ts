// Task #3178 — Catalog Number and UPC fields on albums.
//
// Coverage:
//   • PUT /api/admin/albums/:id round-trips catalogNumber and upc (both saved,
//     both returned on the subsequent GET).
//   • PUT with empty/null values clears the fields.
//   • POST /api/admin/albums/:id/pressing-order is blocked (400) when the
//     album has no catalogNumber.
//   • POST /api/admin/albums/:id/pressing-order is blocked (400) when the
//     catalogNumber is blank / whitespace-only.
//   • POST /api/admin/albums/:id/pressing-order proceeds past the catalog-
//     number gate when catalogNumber is set (may still fail at later gates,
//     but NOT for the catalog-number reason).
//
// Same harness as artistLabelAlbumTrackWrite.db.test.ts: full route tree
// over a loopback socket, bearer-token auth. Real DB (DATABASE_URL):
//
//   npx tsx --test server/albumCatalogNumberUpc.db.test.ts
//
// Every row seeded here is torn down in the `after` hook.
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
const uid = (p: string) => `t3178-${p}-${randomUUID().slice(0, 8)}`;

const operatorId = uid("op");
const albumId = uid("album");
const albumWithCatId = uid("album-cat");

let baseUrl = "";
let httpServer: HttpServer | undefined;
let operatorToken = "";

async function apiRequest(method: string, path: string, body?: unknown) {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${operatorToken}`,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  let json: any = null;
  try {
    json = await res.json();
  } catch {}
  return { status: res.status, json };
}

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

  // Seed operator (super_admin, unscoped)
  const uniq = operatorId.slice(-8);
  await exec(sql`
    INSERT INTO users (id, username, password, display_name, email, is_admin, role)
    VALUES (${operatorId}, ${"t3178_" + uniq}, ${"x"}, ${"t3178 op"},
            ${"t3178_" + uniq + "@example.test"}, true, 'super_admin')
  `);
  await exec(sql`
    INSERT INTO memberships (user_id, role, scope_kind, scope_id, sub_role)
    VALUES (${operatorId}, 'super_admin', NULL, NULL, NULL)
  `);
  operatorToken = "t3178tok_" + randomUUID().replace(/-/g, "");
  await storage.createAuthToken(operatorToken, operatorId, "admin");

  // Album without a catalog number (used for pressing-order gate tests)
  await exec(sql`
    INSERT INTO albums (id, title, artist, artwork, is_goodtunes_release, is_prepping)
    VALUES (${albumId}, ${"t3178 album"}, ${"t3178 artist"}, ${""}, true, true)
  `);

  // Album with a catalog number and an active SKU (so the pressing-order
  // gets past SKU validation and reaches the preflight gate, NOT the
  // catalog-number gate — confirming that gate is cleared).
  await exec(sql`
    INSERT INTO albums (id, title, artist, artwork, is_goodtunes_release, is_prepping, catalog_number)
    VALUES (${albumWithCatId}, ${"t3178 album cat"}, ${"t3178 artist"}, ${""}, true, true, ${"GT-001"})
  `);
});

after(async () => {
  try {
    if (httpServer) await new Promise<void>((resolve) => httpServer!.close(() => resolve()));
    await exec(sql`DELETE FROM pressing_order_requests WHERE album_id IN (${albumId}, ${albumWithCatId})`);
    await exec(sql`DELETE FROM album_skus WHERE album_id IN (${albumId}, ${albumWithCatId})`);
    await exec(sql`DELETE FROM albums WHERE id IN (${albumId}, ${albumWithCatId})`);
    await exec(sql`DELETE FROM auth_tokens WHERE token = ${operatorToken}`);
    await exec(sql`DELETE FROM memberships WHERE user_id = ${operatorId}`);
    await exec(sql`DELETE FROM users WHERE id = ${operatorId}`);
  } finally {
    await pool.end();
  }
});

// ── Album PUT round-trip ───────────────────────────────────────────────────

test("PUT /api/admin/albums/:id saves catalogNumber and upc and returns them", async () => {
  const put = await apiRequest("PUT", `/api/admin/albums/${albumId}`, {
    catalogNumber: "GT-999",
    upc: "012345678901",
  });
  assert.equal(put.status, 200, `PUT failed: ${JSON.stringify(put.json)}`);
  assert.equal(put.json?.catalogNumber, "GT-999");
  assert.equal(put.json?.upc, "012345678901");

  // Confirm values persist on subsequent GET
  const get = await apiRequest("GET", `/api/albums/${albumId}`);
  assert.equal(get.status, 200, `GET failed: ${JSON.stringify(get.json)}`);
  assert.equal(get.json?.catalogNumber, "GT-999");
  assert.equal(get.json?.upc, "012345678901");
});

test("PUT /api/admin/albums/:id trims whitespace from catalogNumber and upc", async () => {
  const put = await apiRequest("PUT", `/api/admin/albums/${albumId}`, {
    catalogNumber: "  GT-TRIM  ",
    upc: "  098765432109  ",
  });
  assert.equal(put.status, 200, `PUT failed: ${JSON.stringify(put.json)}`);
  assert.equal(put.json?.catalogNumber, "GT-TRIM");
  assert.equal(put.json?.upc, "098765432109");
});

test("PUT /api/admin/albums/:id clears catalogNumber and upc when empty string sent", async () => {
  // First set them
  await apiRequest("PUT", `/api/admin/albums/${albumId}`, {
    catalogNumber: "GT-WILL-CLEAR",
    upc: "000000000000",
  });
  // Then clear
  const put = await apiRequest("PUT", `/api/admin/albums/${albumId}`, {
    catalogNumber: "",
    upc: "",
  });
  assert.equal(put.status, 200, `PUT failed: ${JSON.stringify(put.json)}`);
  assert.equal(put.json?.catalogNumber, null, "catalogNumber should be null after empty string");
  assert.equal(put.json?.upc, null, "upc should be null after empty string");
});

// ── Pressing-order gate ────────────────────────────────────────────────────

test("POST /api/admin/albums/:id/pressing-order returns 400 when album has no catalogNumber", async () => {
  // Ensure the album has no catalog number
  await apiRequest("PUT", `/api/admin/albums/${albumId}`, { catalogNumber: "" });

  const res = await apiRequest("POST", `/api/admin/albums/${albumId}/pressing-order`);
  assert.equal(res.status, 400, `expected 400, got ${res.status}: ${JSON.stringify(res.json)}`);
  assert.ok(
    (res.json?.message ?? "").includes("Catalog Number"),
    `expected catalog-number message, got: ${JSON.stringify(res.json)}`,
  );
});

test("PUT /api/admin/albums/:id stores null (not empty string) for whitespace-only catalogNumber and upc", async () => {
  const put = await apiRequest("PUT", `/api/admin/albums/${albumId}`, {
    catalogNumber: "   ",
    upc: "  \t  ",
  });
  assert.equal(put.status, 200, `PUT failed: ${JSON.stringify(put.json)}`);
  assert.equal(put.json?.catalogNumber, null, "whitespace-only catalogNumber should store null");
  assert.equal(put.json?.upc, null, "whitespace-only upc should store null");

  // Confirm null persists on subsequent GET
  const get = await apiRequest("GET", `/api/albums/${albumId}`);
  assert.equal(get.status, 200, `GET failed: ${JSON.stringify(get.json)}`);
  assert.equal(get.json?.catalogNumber, null);
  assert.equal(get.json?.upc, null);
});

test("POST /api/admin/albums/:id/pressing-order returns 400 when catalogNumber is whitespace-only", async () => {
  // Set whitespace via the PUT route (which should store null), then verify gate fires
  await apiRequest("PUT", `/api/admin/albums/${albumId}`, { catalogNumber: "   " });

  const res = await apiRequest("POST", `/api/admin/albums/${albumId}/pressing-order`);
  assert.equal(res.status, 400, `expected 400, got ${res.status}: ${JSON.stringify(res.json)}`);
  assert.ok(
    (res.json?.message ?? "").includes("Catalog Number"),
    `expected catalog-number message, got: ${JSON.stringify(res.json)}`,
  );
});

test("POST /api/admin/albums/:id/pressing-order passes catalog-number gate when catalogNumber is set", async () => {
  // albumWithCatId already has catalog_number='GT-001' from seed.
  // It has no SKU, so we expect a 400 about the package (not catalog number)
  // — confirming the catalog-number gate was cleared.
  const res = await apiRequest("POST", `/api/admin/albums/${albumWithCatId}/pressing-order`);
  assert.equal(res.status, 400, `expected 400 (package), got ${res.status}: ${JSON.stringify(res.json)}`);
  assert.ok(
    !(res.json?.message ?? "").includes("Catalog Number"),
    `should NOT fail on catalog-number when it is set, got: ${JSON.stringify(res.json)}`,
  );
  // The failure should be about the package/price/quantity
  assert.ok(
    (res.json?.message ?? "").toLowerCase().includes("package") ||
    (res.json?.message ?? "").toLowerCase().includes("price") ||
    (res.json?.message ?? "").toLowerCase().includes("quantity"),
    `expected package message, got: ${JSON.stringify(res.json)}`,
  );
});
