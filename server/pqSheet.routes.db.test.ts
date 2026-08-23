// PQ / cutting-master sheet route coverage over a real loopback socket +
// real DB (same hermetic pattern as the press estimate tests):
//
//   1. Unknown / malformed token -> 404.
//   2. A valid token with a tampered HMAC -> 404.
//   3. A seeded two-sided album returns the sanitized live-data payload:
//      titles, filenames, fixed 2s gaps, catalogue/matrix, honest artist
//      confirmations, and word+icon side verdicts.
//
// npx tsx --test server/pqSheet.routes.db.test.ts
import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer, type Server as HttpServer } from "node:http";
import { sql } from "drizzle-orm";
import express from "express";
import { db, pool } from "./db";
import { authKindMiddleware } from "./auth/host";
import { registerRoutes } from "./routes";
import { signPqToken, verifyPqToken } from "./pqSheet";

const exec = (q: any) => db.execute(q);
let httpServer: HttpServer | undefined;
let baseUrl = "";
const albumId = randomUUID();
const songAId = randomUUID();
const songBId = randomUUID();
const token = signPqToken(albumId);

before(async () => {
  const app = express();
  app.set("trust proxy", 1);
  app.use(authKindMiddleware);
  app.use(express.json({ limit: "10mb" }));
  httpServer = createServer(app);
  await registerRoutes(httpServer, app);
  await new Promise<void>((resolve) =>
    httpServer!.listen(0, "127.0.0.1", resolve),
  );
  const addr = httpServer!.address();
  baseUrl = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;

  await exec(sql`
    INSERT INTO albums (
      id, title, artist, artwork, physical_format, vinyl_format,
      vinyl_side_catalog_numbers, masters_approved_by_artist_at
    )
    VALUES (
      ${albumId}, ${"PQ Test Album"}, ${"PQ Test Artist"}, ${"/test.jpg"},
      ${"single_lp"}, ${"12_33_single"},
      ${JSON.stringify({ A: "PQT-001-A", B: "PQT-001-B" })}::jsonb,
      ${new Date("2026-08-20T12:00:00Z")}
    )
  `);
  await exec(sql`
    INSERT INTO songs (
      id, album_id, title, track_number, duration, vinyl_side, vinyl_order,
      audio_url, audio_source_url, audio_format, audio_bit_depth,
      mux_playback_id, mux_status
    )
    VALUES
      (
        ${songAId}, ${albumId}, ${"Opening Song"}, 1, 152, ${"A"}, 1,
        ${"/objects/uploads/opening.flac"},
        ${"/objects/uploads/01_Opening_24-48.wav"},
        ${"flac"}, 24, NULL, NULL
      ),
      (
        ${songBId}, ${albumId}, ${"Closing Song"}, 2, 181, ${"B"}, 1,
        ${"/objects/uploads/closing.flac"},
        ${"/objects/uploads/02_Closing_24-48.wav"},
        ${"flac"}, 24, NULL, NULL
      )
  `);
});

after(async () => {
  try {
    await exec(sql`DELETE FROM songs WHERE album_id = ${albumId}`);
    await exec(sql`DELETE FROM albums WHERE id = ${albumId}`);
  } finally {
    if (httpServer)
      await new Promise<void>((resolve) => httpServer!.close(() => resolve()));
    await pool.end();
  }
});

async function get(path: string): Promise<{
  status: number;
  json: any;
  headers: Headers;
  bytes: number;
  body: Buffer;
}> {
  const res = await fetch(`${baseUrl}${path}`);
  const buf = Buffer.from(await res.arrayBuffer());
  let json: any = null;
  try {
    json = JSON.parse(buf.toString("utf8"));
  } catch {}
  return {
    status: res.status,
    json,
    headers: res.headers,
    bytes: buf.length,
    body: buf,
  };
}

test("token verification rejects malformed and tampered signatures", async () => {
  assert.equal(verifyPqToken(token), albumId);
  assert.equal(verifyPqToken("not-a-pq-token"), null);
  const tampered = token.slice(0, -1) + (token.endsWith("a") ? "b" : "a");
  assert.equal(verifyPqToken(tampered), null);

  const bad = await get("/api/pq/not-a-pq-token");
  assert.equal(bad.status, 404);
  const changed = await get(`/api/pq/${tampered}`);
  assert.equal(changed.status, 404);
});

test("seeded album returns the sanitized live PQ payload shape", async () => {
  const r = await get(`/api/pq/${token}`);
  assert.equal(r.status, 200);
  assert.deepEqual(
    Object.keys(r.json).sort(),
    [
      "album",
      "artist",
      "catalog",
      "confirmations",
      "cutSpeed",
      "date",
      "format",
      "formatKind",
      "gap",
      "matrix",
      "notes",
      "press",
      "project",
      "reference",
      "sides",
      "tokenLink",
    ].sort(),
  );
  assert.equal(r.json.album, "PQ Test Album");
  assert.equal(r.json.artist, "PQ Test Artist");
  assert.equal(r.json.gap, "2 seconds");
  assert.equal(r.json.matrix, "PQT-001-A / PQT-001-B");
  assert.deepEqual(r.json.reference, { loud: 17, average: 20, lower: 25 });
  assert.equal(r.json.sides.length, 2);
  assert.equal(r.json.sides[0].tracks[0].title, "Opening Song");
  assert.equal(r.json.sides[0].tracks[0].file, "01_Opening_24-48.wav");
  assert.equal(r.json.sides[0].tracks[0].start, "0:00");
  assert.equal(r.json.sides[0].tracks[0].end, "2:32");
  assert.deepEqual(
    r.json.confirmations.map((c: any) => [c.key, c.confirmed]),
    [
      ["lossless", true],
      ["levels", false],
      ["approved", true],
    ],
  );
  assert.equal(r.json.sides[0].verdict.icon, "check");
  assert.match(r.json.sides[0].verdict.text, /Within the loud-level guide/);
  // No raw audio URL / Mux id may leak in the public payload.
  const raw = JSON.stringify(r.json);
  assert.equal(raw.includes("audio_url"), false);
  assert.equal(raw.includes("mux_playback_id"), false);
});

test("PDF twin is a non-empty two-page PDF", async () => {
  const r = await get(`/api/pq/${token}/pdf`);
  assert.equal(r.status, 200);
  assert.match(r.headers.get("content-type") ?? "", /^application\/pdf/);
  assert.ok(r.bytes > 2_000, `expected a rendered PDF, got ${r.bytes} bytes`);
  const pages = r.body.toString("latin1").match(/\/Type\s*\/Page\b/g) ?? [];
  assert.equal(pages.length, 2);
});
