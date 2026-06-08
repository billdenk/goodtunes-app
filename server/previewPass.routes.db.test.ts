// Task #1770 — money-safety coverage for the staged-launch "preview pass"
// (Task #1766). The pass lets family / reviewers walk a not-yet-live release
// through the get-host page in read-only "review mode", but it must NEVER let
// them complete a charge, and it must NEVER reveal a release other than the one
// it was minted for. `server/previewPass.test.ts` already covers the
// sign/verify/read round-trip in isolation; this file drives the three real
// Express surfaces that consume a pass, so a regression in how the routes apply
// it fails loudly:
//
//   1. POST /api/checkout/session → 403 the moment a pass is present, BEFORE
//      any auth / SKU work (server/commerce.ts ~1945). A reviewer can never
//      reach Stripe. A control request with no pass must NOT 403 (it 401s on
//      the missing sign-in), proving the 403 is specifically the pass guard.
//   2. GET /api/albums/:id/buy-options (commerce.ts ~775) only widens to a
//      hidden release when the pass's albumId === the requested album id. A
//      pass for a DIFFERENT album leaves the hidden Buy sheet 404 (no leak).
//   3. GET /api/public/album-by-slug/:slug (routes.ts ~18296) re-resolves with
//      includeHidden and reveals the hidden release ONLY when the resolved
//      candidate id === the pass's albumId. A pass for a different album can
//      never reveal this hidden row through a guessed slug.
//
// We mount the full route tree exactly as server/index.ts does and exercise it
// over a real loopback socket (127.0.0.1 is an unknown host, so the host/kind
// boundary is skipped). Passes are minted directly via signPreviewPass — the
// mint endpoint is operator-gated and out of scope here.
//
// Real DB (DATABASE_URL), Node's built-in runner:
//
//   npx tsx --test server/previewPass.routes.db.test.ts
//
// Every row seeded here is tracked and torn down in the `after` hook.
import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer, type Server as HttpServer } from "node:http";
import { sql } from "drizzle-orm";
import express from "express";
import { db, pool } from "./db";
import { authKindMiddleware } from "./auth/host";
import { registerRoutes } from "./routes";
import { signPreviewPass } from "./previewPass";

const exec = (q: any) => db.execute(q);

const created = {
  albums: new Set<string>(),
  people: new Set<string>(),
};

let baseUrl = "";
let httpServer: HttpServer | undefined;

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
});

after(async () => {
  try {
    for (const id of created.albums) await exec(sql`DELETE FROM albums WHERE id = ${id}`);
    for (const id of created.people) await exec(sql`DELETE FROM people WHERE id = ${id}`);
  } finally {
    if (httpServer) await new Promise<void>((r) => httpServer!.close(() => r()));
    await pool.end();
  }
});

async function get(
  path: string,
  headers: Record<string, string> = {},
): Promise<{ status: number; json: any }> {
  const res = await fetch(`${baseUrl}${path}`, { headers });
  let json: any = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { status: res.status, json };
}

async function post(
  path: string,
  body: any,
  headers: Record<string, string> = {},
): Promise<{ status: number; json: any }> {
  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  let json: any = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { status: res.status, json };
}

async function seedPerson(): Promise<string> {
  const id = randomUUID();
  await exec(sql`INSERT INTO people (id, name) VALUES (${id}, ${"t1770 person " + id.slice(0, 8)})`);
  created.people.add(id);
  return id;
}

// A HIDDEN release: invisible to fans (is_hidden=true), so the by-slug and
// buy-options routes 404 it for the public path and only a matching pass can
// widen access via includeHidden re-resolve.
async function seedHiddenAlbum(opts: {
  primaryArtistId: string;
  shareSlug: string;
}): Promise<string> {
  const id = randomUUID();
  await exec(sql`
    INSERT INTO albums (id, title, artist, artwork, primary_artist_id, is_hidden, share_slug)
    VALUES (${id}, ${"t1770 album"}, ${"t1770 artist"}, ${""},
            ${opts.primaryArtistId}, ${true}, ${opts.shareSlug})
  `);
  created.albums.add(id);
  return id;
}

test("checkout/session returns 403 when a preview pass is present (before auth)", async () => {
  const pass = signPreviewPass(randomUUID());
  // A valid-looking body so we know the 403 is the pass guard, not validation.
  const body = { albumId: randomUUID(), skuFormat: "12_lp" };

  const withPass = await post("/api/checkout/session", body, { "x-preview-pass": pass });
  assert.equal(withPass.status, 403, "a request carrying a preview pass must be rejected");

  // Control: the SAME request with no pass must NOT 403 — it falls through to
  // the sign-in requirement (401). This proves the 403 is specifically the
  // preview-pass guard and not some unrelated rejection.
  const noPass = await post("/api/checkout/session", body);
  assert.notEqual(noPass.status, 403, "no pass → not the preview-mode rejection");
  assert.equal(noPass.status, 401, "no pass + no auth → sign-in required");
});

test("buy-options widens to a hidden album only for a matching pass", async () => {
  const artistId = await seedPerson();
  const hiddenId = await seedHiddenAlbum({
    primaryArtistId: artistId,
    shareSlug: "t1770-buy-" + hiddenId_slug(),
  });
  const otherId = randomUUID();

  // No pass → the hidden Buy sheet stays 404.
  const anon = await get(`/api/albums/${hiddenId}/buy-options`);
  assert.equal(anon.status, 404, "hidden album buy-options must 404 without a pass");

  // Pass for a DIFFERENT album → still 404 (the pass can't widen a release it
  // wasn't minted for).
  const wrong = await get(`/api/albums/${hiddenId}/buy-options`, {
    "x-preview-pass": signPreviewPass(otherId),
  });
  assert.equal(wrong.status, 404, "a wrong-album pass must not unlock the Buy sheet");

  // Matching pass → the Buy sheet resolves (read-only preview), proving the
  // widen is scoped to exactly the pass's album.
  const right = await get(`/api/albums/${hiddenId}/buy-options`, {
    "x-preview-pass": signPreviewPass(hiddenId),
  });
  assert.equal(right.status, 200, "a matching pass unlocks the Buy sheet");
  assert.equal(right.json?.albumId, hiddenId);
});

test("by-slug reveals a hidden album only when the pass id matches the resolved candidate", async () => {
  const artistId = await seedPerson();
  const slug = "t1770-slug-" + hiddenId_slug();
  const hiddenId = await seedHiddenAlbum({ primaryArtistId: artistId, shareSlug: slug });
  const otherId = randomUUID();

  // No pass → hidden release 404s for the public slug path.
  const anon = await get(`/api/public/album-by-slug/${slug}`);
  assert.equal(anon.status, 404, "hidden release must 404 by slug without a pass");

  // A pass for a DIFFERENT album must NOT reveal this hidden row even though the
  // slug resolves a real (hidden) candidate — the leak-safe re-resolve requires
  // candidate.id === pass.albumId.
  const wrong = await get(`/api/public/album-by-slug/${slug}`, {
    "x-preview-pass": signPreviewPass(otherId),
  });
  assert.equal(wrong.status, 404, "a wrong-album pass must never reveal a different hidden release");

  // The pass minted for THIS album reveals it.
  const right = await get(`/api/public/album-by-slug/${slug}`, {
    "x-preview-pass": signPreviewPass(hiddenId),
  });
  assert.equal(right.status, 200, "the album's own pass reveals it");
  assert.equal(right.json?.id, hiddenId);
});

// Short unique-ish slug fragment generator (share_slug is unique per artist).
function hiddenId_slug(): string {
  return randomUUID().slice(0, 8);
}
