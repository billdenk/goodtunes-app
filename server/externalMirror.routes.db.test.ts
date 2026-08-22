// Task #3260 — mirror-at-save for pasted external file links.
//
// Platform rule: an external http(s) file URL saved through any admin
// URL-accepting boundary is downloaded into OUR object storage at save; the
// row only ever points at /objects/…, and a failed fetch FAILS the save
// (422) instead of silently persisting the raw pointer. Tracks additionally
// record the original link as operator-only provenance (songs.source_url),
// which every fan-facing song read strips.
//
// Hermetic external-fetch pattern (see autoGoodSyncHappyPath.db.test.ts):
// `globalThis.fetch` is stubbed; the external host is a PUBLIC IP LITERAL
// (the classifier now blocks TEST-NET documentation space along with every
// other special-purpose range, so the fixture host must be genuinely public;
// no packets ever leave — the stub intercepts it) so the mirror module's
// SSRF guard resolves it without DNS. The loopback POST
// to our own test server and the object-storage sidecar/GCS calls fall
// through to the real fetch (this workspace has a real dev bucket). The
// audio fixture is an .mp3 — a passthrough extension, so ffmpeg never runs.
// Mux env is cleared for the run so no real ingest fires on URL changes.
//
//   npx tsx --test server/externalMirror.routes.db.test.ts
import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer, type Server as HttpServer } from "node:http";
import { sql } from "drizzle-orm";
import express from "express";
import { db, pool } from "./db";
import { ExternalFetchError, makeGuardedLookup, isNonPublicAddress, armMirrorOrphanCleanup } from "./externalFileMirror";
import { storage } from "./storage";
import { authKindMiddleware } from "./auth/host";
import { registerRoutes } from "./routes";

const exec = (q: any) => db.execute(q);
const rows = (r: any): any[] => (r as any)?.rows ?? [];

const created = {
  albums: new Set<string>(),
  songs: new Set<string>(),
  users: new Set<string>(),
  tokens: new Set<string>(),
  photos: new Set<string>(),
};

let baseUrl = "";
let httpServer: HttpServer | undefined;
let realFetch: typeof globalThis.fetch;
const prevEnv: Record<string, string | undefined> = {};

const EXT_HOST = "https://34.117.5.44"; // public GCP space; stubbed, never dialed
let extFetchCount = 0;
const LIVE_MP3_URL = `${EXT_HOST}/t3260-master.mp3`;
const DEAD_URL = `${EXT_HOST}/t3260-dead.mp3`;
const LIVE_PNG_URL = `${EXT_HOST}/t3260-photo.png`;
const HTML_URL = `${EXT_HOST}/t3260-page.mp3`; // returns text/html — Dropbox dl=0 trap

// Minimal VALID 1×1 PNG (the image pipeline sniffs/derives for real).
const PNG_1PX = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);
// .mp3 is a PASSTHROUGH extension in the transcode pipeline, so the bytes
// are never decoded — arbitrary content is fine for the mirror test.
const MP3_BYTES = Buffer.alloc(4096, 7);
// video/mp4 uploads verbatim (no transcode); poster extraction on garbage
// bytes fails best-effort (warn only), which is fine for these tests.
const MP4_BYTES = Buffer.alloc(4096, 9);
const LIVE_MP4_URL_PATH = "/t3260-video.mp4";

before(async () => {
  // No real Mux ingest on audio-URL changes during this suite.
  for (const k of ["MUX_TOKEN_ID", "MUX_TOKEN_SECRET", "MUX_SIGNING_KEY_ID", "MUX_SIGNING_KEY_PRIVATE"]) {
    prevEnv[k] = process.env[k];
    delete process.env[k];
  }
  realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: any, init?: any) => {
    const url =
      typeof input === "string" ? input
        : input instanceof URL ? input.toString()
          : (input?.url ?? String(input));
    if (url.startsWith(`${EXT_HOST}/`)) extFetchCount++;
    if (url.startsWith(`${EXT_HOST}/t3260-redirect-private.mp3`)) {
      return new Response(null, {
        status: 302,
        headers: { location: "http://169.254.169.254/latest/meta-data" },
      });
    }
    if (url.startsWith(`${EXT_HOST}/t3260-redirect-malformed.mp3`)) {
      // 3xx whose Location can't parse as a URL — must surface as a clean
      // 422 ("invalid destination"), never a native TypeError → 500.
      return new Response(null, {
        status: 302,
        headers: { location: "http://" },
      });
    }
    if (url.startsWith(`${EXT_HOST}/t3260-master.mp3`)) {
      return new Response(MP3_BYTES, {
        status: 200,
        headers: { "content-type": "audio/mpeg", "content-length": String(MP3_BYTES.length) },
      });
    }
    if (url.startsWith(`${EXT_HOST}/t3260-photo.png`)) {
      return new Response(PNG_1PX, {
        status: 200,
        headers: { "content-type": "image/png", "content-length": String(PNG_1PX.length) },
      });
    }
    if (url.startsWith(`${EXT_HOST}/t3260-video.mp4`)) {
      return new Response(MP4_BYTES, {
        status: 200,
        headers: { "content-type": "video/mp4", "content-length": String(MP4_BYTES.length) },
      });
    }
    if (url.startsWith(`${EXT_HOST}/t3260-page.mp3`)) {
      return new Response("<html>share page</html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      });
    }
    if (url.startsWith(`${EXT_HOST}/`)) {
      return new Response("not found", { status: 404 });
    }
    return realFetch(input, init);
  }) as typeof globalThis.fetch;

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
});

after(async () => {
  try {
    for (const id of created.photos) await exec(sql`DELETE FROM album_photos WHERE id = ${id}`);
    for (const id of created.songs) await exec(sql`DELETE FROM songs WHERE id = ${id}`);
    for (const id of created.albums) await exec(sql`DELETE FROM albums WHERE id = ${id}`);
    for (const t of created.tokens) await exec(sql`DELETE FROM auth_tokens WHERE token = ${t}`);
    for (const id of created.users) await exec(sql`DELETE FROM users WHERE id = ${id}`);
  } finally {
    if (realFetch) globalThis.fetch = realFetch;
    for (const [k, v] of Object.entries(prevEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    if (httpServer) await new Promise<void>((r) => httpServer!.close(() => r()));
    await pool.end();
  }
});

async function call(method: string, path: string, body: any, token: string) {
  const res = await realFetch(`${baseUrl}${path}`, {
    method,
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  let json: any = null;
  try { json = await res.json(); } catch { /* empty */ }
  return { status: res.status, json };
}

async function seedAdmin(): Promise<string> {
  const userId = randomUUID();
  const tag = userId.slice(0, 8);
  await exec(sql`
    INSERT INTO users (id, username, password, display_name, email, is_admin, role)
    VALUES (${userId}, ${"t3260_" + tag}, ${"x"}, ${"t3260"},
            ${"t3260_" + tag + "@example.test"}, true, ${"super_admin"})
  `);
  created.users.add(userId);
  const token = "t3260tok_" + randomUUID().replace(/-/g, "");
  await storage.createAuthToken(token, userId, "admin");
  created.tokens.add(token);
  return token;
}

async function seedAlbum(): Promise<string> {
  const id = randomUUID();
  await exec(sql`
    INSERT INTO albums (id, title, artist, artwork)
    VALUES (${id}, ${"t3260 album"}, ${"t3260 artist"}, ${""})
  `);
  created.albums.add(id);
  return id;
}

async function seedSong(albumId: string, audioUrl: string | null): Promise<string> {
  const id = randomUUID();
  await exec(sql`
    INSERT INTO songs (id, album_id, title, track_number, audio_url)
    VALUES (${id}, ${albumId}, ${"t3260 song"}, ${1}, ${audioUrl})
  `);
  created.songs.add(id);
  return id;
}

async function songRow(id: string) {
  return rows(await exec(sql`
    SELECT audio_url, audio_source_url, source_url FROM songs WHERE id = ${id}
  `))[0];
}

// ── 1. Mirror-on-save + provenance ─────────────────────────────────────────

test("PUT song with a live external audio link mirrors into /objects/ and stamps provenance", async () => {
  const token = await seedAdmin();
  const albumId = await seedAlbum();
  const songId = await seedSong(albumId, null);

  const res = await call("PUT", `/api/admin/songs/${songId}`, { audioUrl: LIVE_MP3_URL }, token);
  assert.equal(res.status, 200, `save succeeds (${JSON.stringify(res.json)})`);

  const after1 = await songRow(songId);
  assert.match(after1.audio_url, /^\/objects\/uploads\//, "audio_url points ONLY at our storage");
  assert.equal(after1.source_url, LIVE_MP3_URL, "the pasted link is kept as provenance");
  assert.equal(after1.audio_source_url, null, "mp3 passthrough keeps no separate archival original");
});

// ── 2. Rejection on fetch failure — save fails, nothing persisted ──────────

test("PUT song with a dead external link 422s and leaves the row untouched", async () => {
  const token = await seedAdmin();
  const albumId = await seedAlbum();
  const songId = await seedSong(albumId, "/objects/uploads/t3260-prior.mp3");

  const res = await call("PUT", `/api/admin/songs/${songId}`, { audioUrl: DEAD_URL, title: "renamed" }, token);
  assert.equal(res.status, 422, "the save FAILS instead of storing the raw URL");
  assert.match(String(res.json?.message ?? ""), /was not saved/i);

  const after2 = await songRow(songId);
  assert.equal(after2.audio_url, "/objects/uploads/t3260-prior.mp3", "audio_url unchanged");
  assert.equal(after2.source_url, null, "no provenance written on a failed save");
  const titleRow = rows(await exec(sql`SELECT title FROM songs WHERE id = ${songId}`))[0];
  assert.equal(titleRow.title, "t3260 song", "the whole save failed — even the metadata part");
});

test("an external link that serves an HTML share page 422s (Dropbox dl=0 trap)", async () => {
  const token = await seedAdmin();
  const albumId = await seedAlbum();
  const songId = await seedSong(albumId, null);
  const res = await call("PUT", `/api/admin/songs/${songId}`, { audioUrl: HTML_URL }, token);
  assert.equal(res.status, 422);
  assert.match(String(res.json?.message ?? ""), /web page/i, "the error names the real problem");
  assert.equal((await songRow(songId)).audio_url, null, "nothing persisted");
});

// ── 3. /objects/ passthrough — no fetch, saved verbatim ────────────────────

test("an /objects/ audio URL passes through untouched with no external fetch", async () => {
  const token = await seedAdmin();
  const albumId = await seedAlbum();
  const songId = await seedSong(albumId, null);

  const res = await call("PUT", `/api/admin/songs/${songId}`, { audioUrl: "/objects/uploads/t3260-direct.mp3" }, token);
  assert.equal(res.status, 200);
  const after3 = await songRow(songId);
  assert.equal(after3.audio_url, "/objects/uploads/t3260-direct.mp3", "stored verbatim");
  assert.equal(after3.source_url, null, "a direct upload has no import provenance");
});

// ── 4. Provenance is operator-only — fan reads strip it ────────────────────

test("fan-facing album read strips songs.sourceUrl; admin read keeps it", async () => {
  const token = await seedAdmin();
  const albumId = await seedAlbum();
  const songId = await seedSong(albumId, null);
  await exec(sql`
    UPDATE songs SET audio_url = ${"/objects/uploads/t3260-x.mp3"}, source_url = ${LIVE_MP3_URL}
     WHERE id = ${songId}
  `);

  // Admin sees the provenance.
  const adminRes = await realFetch(`${baseUrl}/api/albums/${albumId}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  const adminJson: any = await adminRes.json();
  assert.equal(adminRes.status, 200);
  assert.equal(adminJson.songs?.[0]?.sourceUrl, LIVE_MP3_URL, "admins see Imported-from");

  // Anonymous fan read of the same route: field is stripped entirely.
  const fanRes = await realFetch(`${baseUrl}/api/albums/${albumId}`);
  const fanJson: any = await fanRes.json();
  assert.equal(fanRes.status, 200);
  assert.ok(fanJson.songs?.length >= 1, "fan still gets the songs");
  assert.equal("sourceUrl" in fanJson.songs[0], false, "provenance never ships fan-side");
});

// ── 5. SSRF: connection-time DNS guard (no rebinding TOCTOU) ────────────────

test("guarded lookup rejects a private DNS answer at connection time", async () => {
  // A rebinding host answers public for a pre-check and private for the real
  // connect; the guard runs INSIDE the socket's lookup, so the private answer
  // kills the connection itself.
  const fakeLookup = ((_h: string, _o: any, cb: any) =>
    cb(null, [{ address: "192.168.1.5", family: 4 }])) as any;
  const guarded = makeGuardedLookup(fakeLookup);
  const err = await new Promise<any>((resolve) =>
    guarded("rebind.example", {}, (e: any) => resolve(e)),
  );
  assert.ok(err instanceof ExternalFetchError, "private answer is rejected");
  assert.match(err.message, /private address/i);

  // Sanity: a public answer passes through untouched.
  const okLookup = ((_h: string, _o: any, cb: any) =>
    cb(null, [{ address: "34.117.5.9", family: 4 }])) as any;
  const ok = await new Promise<any[]>((resolve) =>
    makeGuardedLookup(okLookup)("fine.example", {}, (e: any, addr: any, fam: any) =>
      resolve([e, addr, fam]),
    ),
  );
  assert.equal(ok[0], null);
  assert.equal(ok[1], "34.117.5.9");
});

test("address classifier blocks every non-public IPv4/IPv6 range", () => {
  const nonPublic = [
    "0.1.2.3", "10.0.0.1", "100.64.0.1", "100.127.255.254", // CGNAT shared
    "127.0.0.1", "169.254.169.254", "172.16.0.1", "172.31.255.255",
    "192.0.0.8", "192.0.2.1", "192.88.99.1", "192.168.1.1",
    "198.18.0.1", "198.19.255.255", "198.51.100.7", "203.0.113.44",
    "224.0.0.1", "240.0.0.1", "255.255.255.255",
    "::1", "::", "fc00::1", "fd12::1",
    "fe80::1", "fe90::1", "febf::1",            // ALL of fe80::/10
    "ff02::1", "2001:db8::1", "2001::1", "2002:0a00::1", // doc/Teredo/6to4
    "::ffff:10.0.0.1", "::ffff:169.254.1.1", "::ffff:a9fe:a9fe",
    "64:ff9b::0a00:0001",                        // NAT64 embedding 10.0.0.1
    "not-an-ip",
  ];
  for (const ip of nonPublic) {
    assert.equal(isNonPublicAddress(ip), true, `${ip} must be blocked`);
  }
  const publicIps = ["8.8.8.8", "34.117.5.44", "93.184.216.34", "1.1.1.1",
    "2600:1901::1", "2a00:1450:4009::8a", "::ffff:8.8.8.8"];
  for (const ip of publicIps) {
    assert.equal(isNonPublicAddress(ip), false, `${ip} must be allowed`);
  }
});

test("a redirect hop to a link-local metadata address is rejected (422, nothing stored)", async () => {
  const token = await seedAdmin();
  const albumId = await seedAlbum();
  const songId = await seedSong(albumId, null);
  const res = await call(
    "PUT",
    `/api/admin/songs/${songId}`,
    { audioUrl: `${EXT_HOST}/t3260-redirect-private.mp3` },
    token,
  );
  assert.equal(res.status, 422, `redirect to private space fails the save (${JSON.stringify(res.json)})`);
  assert.equal((await songRow(songId)).audio_url, null, "nothing persisted");
});

test("a redirect hop with a malformed Location fails the save as 422, not a 500", async () => {
  const token = await seedAdmin();
  const albumId = await seedAlbum();
  const songId = await seedSong(albumId, null);
  const res = await call(
    "PUT",
    `/api/admin/songs/${songId}`,
    { audioUrl: `${EXT_HOST}/t3260-redirect-malformed.mp3` },
    token,
  );
  assert.equal(res.status, 422, `malformed redirect destination fails the save cleanly (${JSON.stringify(res.json)})`);
  assert.match(String(res.json?.message ?? ""), /invalid destination/i);
  const after = await songRow(songId);
  assert.equal(after.audio_url, null, "nothing persisted");
  assert.equal(after.source_url, null, "no provenance persisted either");
});

test("bracketed IPv6 literals are rejected before any transport connection", async () => {
  // URL.hostname keeps the brackets ("[::1]") so a naive net.isIP() check
  // misses them and node http.request would connect directly, skipping the
  // guarded lookup entirely. Each of these must 422 with zero fetches and
  // zero lookups (a real connection to ::1 would hit our own test server).
  const albumId = await seedAlbum();
  const token = await seedAdmin();
  for (const literal of ["http://[::1]/x.mp3", "https://[::ffff:127.0.0.1]/x.mp3", "http://[fe80::1]/x.mp3", "https://[fd00::1]/x.mp3"]) {
    const songId = await seedSong(albumId, null);
    const beforeCount = extFetchCount;
    const res = await call("PUT", `/api/admin/songs/${songId}`, { audioUrl: literal }, token);
    assert.equal(res.status, 422, `${literal} rejected (${JSON.stringify(res.json)})`);
    assert.match(String(res.json?.message ?? ""), /private address/i, `${literal} classified as private, not a network error`);
    assert.equal(extFetchCount, beforeCount, `${literal}: no fetch`);
    assert.equal((await songRow(songId)).audio_url, null, `${literal}: nothing persisted`);
  }
});

// ── 5b. Authorization runs BEFORE any external fetch ────────────────────────

test("an unauthenticated caller triggers no external fetch at all", async () => {
  const albumId = await seedAlbum();
  const songId = await seedSong(albumId, null);
  const beforeCount = extFetchCount;
  const res = await realFetch(`${baseUrl}/api/admin/songs/${songId}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ audioUrl: LIVE_MP3_URL }),
  });
  assert.ok(res.status === 401 || res.status === 403, `rejected (${res.status})`);
  assert.equal(extFetchCount, beforeCount, "no fetch happened for an unauthorized caller");
});

test("a partner without upload_masters is denied BEFORE the external fetch", async () => {
  // Label member with edit_metadata=true but upload_masters=false: the
  // master-swap gate must fire before the mirror download, so an
  // unauthorized partner can't trigger remote fetches or storage writes.
  const labelId = `t3260-lbl-${randomUUID().slice(0, 8)}`;
  const partnerUserId = randomUUID();
  await exec(sql`INSERT INTO labels (id, name) VALUES (${labelId}, ${"t3260 label"})`);
  const uniq = partnerUserId.slice(0, 8);
  await exec(sql`
    INSERT INTO users (id, username, password, display_name, email, is_admin, role, role_scope_id)
    VALUES (${partnerUserId}, ${"t3260p_" + uniq}, ${"x"}, ${"t3260 partner"},
            ${"t3260p_" + uniq + "@example.test"}, true, ${"label"}, ${labelId})
  `);
  created.users.add(partnerUserId);
  await exec(sql`
    INSERT INTO memberships (user_id, role, scope_kind, scope_id, sub_role)
    VALUES (${partnerUserId}, ${"label"}, ${"label"}, ${labelId}, ${null})
  `);
  await exec(sql`
    INSERT INTO partner_permissions (scope_kind, scope_id, edit_metadata, upload_masters, metadata_edits_require_approval)
    VALUES ('label', ${labelId}, true, false, false)
  `);
  const token = "t3260ptok_" + randomUUID().replace(/-/g, "");
  await storage.createAuthToken(token, partnerUserId, "admin");
  created.tokens.add(token);
  const albumId = randomUUID();
  await exec(sql`
    INSERT INTO albums (id, title, artist, artwork, label_id, is_prepping)
    VALUES (${albumId}, ${"t3260 lbl album"}, ${"t3260 artist"}, ${""}, ${labelId}, true)
  `);
  created.albums.add(albumId);
  const songId = await seedSong(albumId, null);

  try {
    const beforeCount = extFetchCount;
    const res = await call("PUT", `/api/admin/songs/${songId}`, { audioUrl: LIVE_MP3_URL }, token);
    assert.equal(res.status, 403, `master swap denied (${JSON.stringify(res.json)})`);
    assert.equal(extFetchCount, beforeCount, "denial happened with ZERO external fetches");
    assert.equal((await songRow(songId)).audio_url, null, "nothing persisted");

    // Same partner, create path: POST with audio is denied fetch-free too.
    const beforePost = extFetchCount;
    const post = await call("POST", "/api/admin/songs",
      { albumId, title: "t3260 new", trackNumber: 9, audioUrl: LIVE_MP3_URL }, token);
    assert.equal(post.status, 403, `create with master denied (${JSON.stringify(post.json)})`);
    assert.equal(extFetchCount, beforePost, "create denial also fetch-free");
  } finally {
    await exec(sql`DELETE FROM memberships WHERE user_id = ${partnerUserId}`);
    await exec(sql`DELETE FROM partner_permissions WHERE scope_kind = 'label' AND scope_id = ${labelId}`);
    await exec(sql`DELETE FROM songs WHERE album_id = ${albumId}`);
    await exec(sql`DELETE FROM albums WHERE id = ${albumId}`);
    created.albums.delete(albumId);
    await exec(sql`DELETE FROM labels WHERE id = ${labelId}`);
  }
});

test("legacy mirror-audio-to-storage endpoint uses the shared pipeline", async () => {
  const albumId = await seedAlbum();
  const token = await seedAdmin();

  // Success: an external audio_url is mirrored into /objects/ and the
  // original link lands as operator-only provenance.
  const okSong = await seedSong(albumId, null);
  await exec(sql`UPDATE songs SET audio_url = ${LIVE_MP3_URL} WHERE id = ${okSong}`);
  const ok = await call("POST", `/api/admin/songs/${okSong}/mirror-audio-to-storage`, {}, token);
  assert.equal(ok.status, 200, `mirrored (${JSON.stringify(ok.json)})`);
  assert.match(String(ok.json?.url), /^\/objects\/uploads\//);
  const okRow = await songRow(okSong);
  assert.match(String(okRow.audio_url), /^\/objects\/uploads\//);
  assert.equal(okRow.source_url, LIVE_MP3_URL, "provenance recorded");

  // Dead link → honest 422, row untouched.
  const deadSong = await seedSong(albumId, null);
  const deadUrl = `${EXT_HOST}/t3260-nope.mp3`;
  await exec(sql`UPDATE songs SET audio_url = ${deadUrl} WHERE id = ${deadSong}`);
  const dead = await call("POST", `/api/admin/songs/${deadSong}/mirror-audio-to-storage`, {}, token);
  assert.equal(dead.status, 422, `dead link is a 422, not 5xx (${JSON.stringify(dead.json)})`);
  assert.equal((await songRow(deadSong)).audio_url, deadUrl, "row untouched on failure");
});

test("legacy mirror endpoint gates upload_masters BEFORE fetching", async () => {
  const labelId = `t3260-leg-${randomUUID().slice(0, 8)}`;
  const partnerUserId = randomUUID();
  await exec(sql`INSERT INTO labels (id, name) VALUES (${labelId}, ${"t3260 legacy label"})`);
  const uniq = partnerUserId.slice(0, 8);
  await exec(sql`
    INSERT INTO users (id, username, password, display_name, email, is_admin, role, role_scope_id)
    VALUES (${partnerUserId}, ${"t3260g_" + uniq}, ${"x"}, ${"t3260 legacy partner"},
            ${"t3260g_" + uniq + "@example.test"}, true, ${"label"}, ${labelId})
  `);
  created.users.add(partnerUserId);
  await exec(sql`
    INSERT INTO memberships (user_id, role, scope_kind, scope_id, sub_role)
    VALUES (${partnerUserId}, ${"label"}, ${"label"}, ${labelId}, ${null})
  `);
  await exec(sql`
    INSERT INTO partner_permissions (scope_kind, scope_id, edit_metadata, upload_masters, metadata_edits_require_approval)
    VALUES ('label', ${labelId}, true, false, false)
  `);
  const token = "t3260gtok_" + randomUUID().replace(/-/g, "");
  await storage.createAuthToken(token, partnerUserId, "admin");
  created.tokens.add(token);
  const albumId = randomUUID();
  await exec(sql`
    INSERT INTO albums (id, title, artist, artwork, label_id)
    VALUES (${albumId}, ${"t3260 legacy album"}, ${"t3260 artist"}, ${""}, ${labelId})
  `);
  created.albums.add(albumId);
  const songId = await seedSong(albumId, null);
  await exec(sql`UPDATE songs SET audio_url = ${LIVE_MP3_URL} WHERE id = ${songId}`);

  try {
    const before = extFetchCount;
    const res = await call("POST", `/api/admin/songs/${songId}/mirror-audio-to-storage`, {}, token);
    assert.equal(res.status, 403, `denied (${JSON.stringify(res.json)})`);
    assert.equal(extFetchCount, before, "denial happened with ZERO external fetches");
    assert.equal((await songRow(songId)).audio_url, LIVE_MP3_URL, "row untouched");
  } finally {
    await exec(sql`DELETE FROM memberships WHERE user_id = ${partnerUserId}`);
    await exec(sql`DELETE FROM partner_permissions WHERE scope_kind = 'label' AND scope_id = ${labelId}`);
    await exec(sql`DELETE FROM songs WHERE album_id = ${albumId}`);
    await exec(sql`DELETE FROM albums WHERE id = ${albumId}`);
    created.albums.delete(albumId);
    await exec(sql`DELETE FROM labels WHERE id = ${labelId}`);
  }
});

test("legacy from-URL image and video importers use the shared guarded pipeline", async () => {
  const token = await seedAdmin();

  // Image: success mirrors into /objects/; private literal + private
  // redirect are rejected 422 without connecting.
  const okImg = await call("POST", "/api/admin/fetch-image-from-url", { url: LIVE_PNG_URL }, token);
  assert.equal(okImg.status, 200, `image mirrored (${JSON.stringify(okImg.json)})`);
  assert.match(String(okImg.json?.url), /^\/objects\/uploads\//);

  let before = extFetchCount;
  const privImg = await call("POST", "/api/admin/fetch-image-from-url", { url: "http://[::1]/wall.png" }, token);
  assert.equal(privImg.status, 422, `private image literal rejected (${JSON.stringify(privImg.json)})`);
  assert.match(String(privImg.json?.message ?? ""), /private address/i);
  assert.equal(extFetchCount, before, "no fetch for a private image literal");

  const redirImg = await call("POST", "/api/admin/fetch-image-from-url", { url: `${EXT_HOST}/t3260-redirect-private.mp3` }, token);
  assert.equal(redirImg.status, 422, `redirect-to-private image rejected (${JSON.stringify(redirImg.json)})`);

  // Video: same three behaviors on /api/admin/upload-video/from-url.
  const okVid = await call("POST", "/api/admin/upload-video/from-url", { url: `${EXT_HOST}${LIVE_MP4_URL_PATH}` }, token);
  assert.equal(okVid.status, 200, `video mirrored (${JSON.stringify(okVid.json)})`);
  assert.match(String(okVid.json?.url), /^\/objects\/uploads\//);
  assert.equal(okVid.json?.sourceUrl, `${EXT_HOST}${LIVE_MP4_URL_PATH}`);

  before = extFetchCount;
  const privVid = await call("POST", "/api/admin/upload-video/from-url", { url: "http://169.254.169.254/latest.mp4" }, token);
  assert.equal(privVid.status, 422, `private video literal rejected (${JSON.stringify(privVid.json)})`);
  assert.equal(extFetchCount, before, "no fetch for a private video literal");

  const redirVid = await call("POST", "/api/admin/upload-video/from-url", { url: `${EXT_HOST}/t3260-redirect-private.mp3` }, token);
  assert.equal(redirVid.status, 422, `redirect-to-private video rejected (${JSON.stringify(redirVid.json)})`);
});

test("post-merge repair mirrors with the PUBLIC object ACL and cleans up on a stale row", async () => {
  const { mirrorOneExternalSong } = await import("../scripts/mirror-external-song-audio");
  const { objectStorageClient, getObjectAclPolicy } = await import(
    "./replit_integrations/object_storage"
  );
  const albumId = await seedAlbum();

  // Success: row is repaired to /objects/, provenance stamped, and the
  // uploaded object carries the SAME public ACL normal uploads get (the
  // public /objects/ read path refuses to serve it otherwise).
  const okSong = await seedSong(albumId, null);
  await exec(sql`UPDATE songs SET audio_url = ${LIVE_MP3_URL} WHERE id = ${okSong}`);
  const ok = await mirrorOneExternalSong(pool as any, { id: okSong, audio_url: LIVE_MP3_URL });
  assert.equal(ok.status, "mirrored");
  const okRow = await songRow(okSong);
  assert.equal(okRow.audio_url, (ok as any).objectPath);
  assert.equal(okRow.source_url, LIVE_MP3_URL);
  const privateDir = (process.env.PRIVATE_OBJECT_DIR || "").replace(/^\/|\/$/g, "");
  const slash = privateDir.indexOf("/");
  const bucketName = slash === -1 ? privateDir : privateDir.slice(0, slash);
  const prefix = slash === -1 ? "" : privateDir.slice(slash + 1);
  const objectId = String((ok as any).objectPath).replace("/objects/uploads/", "");
  const file = objectStorageClient
    .bucket(bucketName)
    .file(`${prefix ? `${prefix}/` : ""}uploads/${objectId}`);
  const acl = await getObjectAclPolicy(file);
  assert.equal(acl?.visibility, "public", "repaired object is publicly readable");
  try { await file.delete(); } catch { /* test cleanup, best-effort */ }

  // Stale row: the DB value changed after the sweep read it (operator
  // re-upload racing the repair) — the conditional update must miss and the
  // freshly uploaded object must be removed, leaving the operator's value.
  const staleSong = await seedSong(albumId, null);
  await exec(sql`UPDATE songs SET audio_url = ${"/objects/uploads/operator-newer.mp3"} WHERE id = ${staleSong}`);
  const stale = await mirrorOneExternalSong(pool as any, { id: staleSong, audio_url: LIVE_MP3_URL });
  assert.equal(stale.status, "skipped-stale");
  const staleRow = await songRow(staleSong);
  assert.equal(staleRow.audio_url, "/objects/uploads/operator-newer.mp3", "operator's newer value untouched");
  assert.equal(staleRow.source_url, null, "no provenance stamped on a skipped row");
});

test("provenance is stripped for PARTNER reads (operator-only, not merely admin-only)", async () => {
  // Every partner role carries isAdmin=true, so a bare isAdminUser() gate
  // would hand original external import links (possibly signed/private
  // URLs) to labels/artists/vendors. Only operators may see sourceUrl.
  const labelId = `t3260-prv-${randomUUID().slice(0, 8)}`;
  const partnerUserId = randomUUID();
  await exec(sql`INSERT INTO labels (id, name) VALUES (${labelId}, ${"t3260 prov label"})`);
  const uniq = partnerUserId.slice(0, 8);
  await exec(sql`
    INSERT INTO users (id, username, password, display_name, email, is_admin, role, role_scope_id)
    VALUES (${partnerUserId}, ${"t3260v_" + uniq}, ${"x"}, ${"t3260 prov partner"},
            ${"t3260v_" + uniq + "@example.test"}, true, ${"label"}, ${labelId})
  `);
  created.users.add(partnerUserId);
  await exec(sql`
    INSERT INTO memberships (user_id, role, scope_kind, scope_id, sub_role)
    VALUES (${partnerUserId}, ${"label"}, ${"label"}, ${labelId}, ${null})
  `);
  const token = "t3260vtok_" + randomUUID().replace(/-/g, "");
  await storage.createAuthToken(token, partnerUserId, "admin");
  created.tokens.add(token);
  const albumId = randomUUID();
  await exec(sql`
    INSERT INTO albums (id, title, artist, artwork, label_id)
    VALUES (${albumId}, ${"t3260 prov album"}, ${"t3260 artist"}, ${""}, ${labelId})
  `);
  created.albums.add(albumId);
  const songId = await seedSong(albumId, null);
  await exec(sql`UPDATE songs SET source_url = ${"https://external.example/master.mp3"} WHERE id = ${songId}`);
  // Direct (non-divert) metadata edit access so the PUT below exercises the
  // mutation-response projection rather than the permission gate.
  await exec(sql`
    INSERT INTO partner_permissions (scope_kind, scope_id, edit_metadata, metadata_edits_require_approval)
    VALUES (${"label"}, ${labelId}, true, false)
  `);

  try {
    const album = await call("GET", `/api/albums/${albumId}`, undefined, token);
    assert.equal(album.status, 200);
    for (const s of album.json?.songs ?? []) {
      assert.ok(!("sourceUrl" in s), "album read: partner never sees sourceUrl");
    }
    const catalog = await call("GET", "/api/songs", undefined, token);
    assert.equal(catalog.status, 200);
    for (const s of catalog.json ?? []) {
      assert.ok(!("sourceUrl" in s), "catalog read: partner never sees sourceUrl");
    }
    const one = await call("GET", `/api/songs/${songId}`, undefined, token);
    assert.equal(one.status, 200);
    assert.ok(!("sourceUrl" in (one.json ?? {})), "per-song read: partner never sees sourceUrl");

    // MUTATION responses apply the same projection: a metadata-only PUT by
    // a partner must not echo back the stored external source link.
    const put = await call(
      "PUT",
      `/api/admin/songs/${songId}`,
      { title: "t3260 prov song renamed" },
      token,
    );
    assert.equal(put.status, 200, `partner metadata PUT succeeds (${JSON.stringify(put.json)})`);
    assert.ok(!("sourceUrl" in (put.json ?? {})), "PUT response: partner never sees sourceUrl");

    // sourceUrl is SERVER-DERIVED only: a caller-supplied value (e.g. a
    // stored-XSS javascript: link aimed at the operator chip) must be
    // ignored — the stored provenance stays exactly what the mirror wrote.
    const xss = await call(
      "PUT",
      `/api/admin/songs/${songId}`,
      { title: "t3260 prov song xss", sourceUrl: "javascript:alert(1)" },
      token,
    );
    assert.equal(xss.status, 200, `PUT with client sourceUrl still succeeds (${JSON.stringify(xss.json)})`);
    const afterXss = await songRow(songId);
    assert.equal(afterXss.source_url, "https://external.example/master.mp3", "client-supplied sourceUrl ignored");

    // Sanity: an operator DOES see it (the chip has to render for ops).
    const opToken = await seedAdmin();
    const opOne = await call("GET", `/api/songs/${songId}`, undefined, opToken);
    assert.equal(opOne.status, 200);
    assert.equal(opOne.json?.sourceUrl, "https://external.example/master.mp3", "operator still sees provenance");
  } finally {
    await exec(sql`DELETE FROM partner_permissions WHERE scope_kind = ${"label"} AND scope_id = ${labelId}`);
    await exec(sql`DELETE FROM memberships WHERE user_id = ${partnerUserId}`);
    await exec(sql`DELETE FROM songs WHERE album_id = ${albumId}`);
    await exec(sql`DELETE FROM albums WHERE id = ${albumId}`);
    created.albums.delete(albumId);
    await exec(sql`DELETE FROM labels WHERE id = ${labelId}`);
  }
});

test("APPROVAL-DIVERT partner without upload_masters: master-bearing edits are 403'd fetch-free", async () => {
  // metadata_edits_require_approval=true would divert metadata edits to the
  // review queue — but masters are NEVER approval-queue work, so an edit
  // that carries audioUrl/audioSourceUrl must be hard-denied BEFORE any
  // external fetch, not diverted with side effects already performed.
  const labelId = `t3260-dvl-${randomUUID().slice(0, 8)}`;
  const partnerUserId = randomUUID();
  await exec(sql`INSERT INTO labels (id, name) VALUES (${labelId}, ${"t3260 divert label"})`);
  const uniq = partnerUserId.slice(0, 8);
  await exec(sql`
    INSERT INTO users (id, username, password, display_name, email, is_admin, role, role_scope_id)
    VALUES (${partnerUserId}, ${"t3260d_" + uniq}, ${"x"}, ${"t3260 divert partner"},
            ${"t3260d_" + uniq + "@example.test"}, true, ${"label"}, ${labelId})
  `);
  created.users.add(partnerUserId);
  await exec(sql`
    INSERT INTO memberships (user_id, role, scope_kind, scope_id, sub_role)
    VALUES (${partnerUserId}, ${"label"}, ${"label"}, ${labelId}, ${null})
  `);
  await exec(sql`
    INSERT INTO partner_permissions (scope_kind, scope_id, edit_metadata, upload_masters, metadata_edits_require_approval)
    VALUES ('label', ${labelId}, true, false, true)
  `);
  const token = "t3260dtok_" + randomUUID().replace(/-/g, "");
  await storage.createAuthToken(token, partnerUserId, "admin");
  created.tokens.add(token);
  const albumId = randomUUID();
  await exec(sql`
    INSERT INTO albums (id, title, artist, artwork, label_id, is_prepping)
    VALUES (${albumId}, ${"t3260 divert album"}, ${"t3260 artist"}, ${""}, ${labelId}, true)
  `);
  created.albums.add(albumId);
  const songId = await seedSong(albumId, null);

  try {
    const beforePut = extFetchCount;
    const put = await call("PUT", `/api/admin/songs/${songId}`, { audioUrl: LIVE_MP3_URL }, token);
    assert.equal(put.status, 403, `diverted-mode master swap hard-denied (${JSON.stringify(put.json)})`);
    assert.equal(extFetchCount, beforePut, "PUT denial happened with ZERO external fetches");
    assert.equal((await songRow(songId)).audio_url, null, "nothing persisted");
    const pendingPut = rows(await exec(sql`SELECT count(*)::int AS n FROM pending_changes WHERE album_id = ${albumId}`))[0];
    assert.equal(pendingPut.n, 0, "no pending change minted either");

    const beforePost = extFetchCount;
    const post = await call("POST", "/api/admin/songs",
      { albumId, title: "t3260 divert new", trackNumber: 8, audioUrl: LIVE_MP3_URL }, token);
    assert.equal(post.status, 403, `diverted-mode create with master hard-denied (${JSON.stringify(post.json)})`);
    assert.equal(extFetchCount, beforePost, "POST denial also fetch-free");
    const pendingPost = rows(await exec(sql`SELECT count(*)::int AS n FROM pending_changes WHERE album_id = ${albumId}`))[0];
    assert.equal(pendingPost.n, 0, "no pending change minted");

    // Metadata-only edit DOES divert (202). Its response — and the partner's
    // own pending-change list — must never expose sourceUrl provenance,
    // even when a hostile client tries to smuggle one into the patch body.
    // (Server-side provenance stays in the stored patch for operator apply.)
    const divert = await call("PUT", `/api/admin/songs/${songId}`,
      { title: "t3260 diverted title", sourceUrl: "https://evil.example/secret-share-link" }, token);
    assert.equal(divert.status, 202, `metadata-only edit diverts (${JSON.stringify(divert.json)})`);
    const patch = divert.json?.pendingChange?.patch ?? {};
    assert.ok(!("sourceUrl" in patch), "202 divert response patch carries no sourceUrl");
    assert.ok(!JSON.stringify(divert.json).includes("evil.example"), "no external URL echoed at all");
    const storedPatch = rows(await exec(sql`SELECT patch FROM pending_changes WHERE album_id = ${albumId}`))[0].patch as any;
    assert.ok(!("sourceUrl" in (storedPatch ?? {})), "client-smuggled sourceUrl never stored either");

    const list = await call("GET", `/api/admin/albums/${albumId}/my-change-requests`, undefined, token);
    assert.equal(list.status, 200, `partner pending-change list loads (${JSON.stringify(list.json)})`);
    assert.ok(Array.isArray(list.json) && list.json.length >= 1, "diverted row listed");
    for (const r of list.json) {
      assert.ok(!("sourceUrl" in (r.patch ?? {})), "list patch carries no sourceUrl");
    }
  } finally {
    await exec(sql`DELETE FROM pending_changes WHERE album_id = ${albumId}`);
    await exec(sql`DELETE FROM memberships WHERE user_id = ${partnerUserId}`);
    await exec(sql`DELETE FROM partner_permissions WHERE scope_kind = 'label' AND scope_id = ${labelId}`);
    await exec(sql`DELETE FROM songs WHERE album_id = ${albumId}`);
    await exec(sql`DELETE FROM albums WHERE id = ${albumId}`);
    created.albums.delete(albumId);
    await exec(sql`DELETE FROM labels WHERE id = ${labelId}`);
  }
});

// ── 5c. Video boundary — dead link rejection ────────────────────────────────

test("orphan cleanup deletes every collected object on a 4xx finish, none on success", async () => {
  const { EventEmitter } = await import("node:events");
  const makeRes = (statusCode: number) =>
    Object.assign(new EventEmitter(), { statusCode }) as any;

  const deletedFail: string[] = [];
  const resFail = makeRes(404);
  const sinkFail = armMirrorOrphanCleanup(resFail, async (p) => { deletedFail.push(p); });
  sinkFail.push("/objects/uploads/t3260-a.mp4", "/objects/uploads/t3260-a.jpg");
  resFail.emit("finish");
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(deletedFail.sort(), ["/objects/uploads/t3260-a.jpg", "/objects/uploads/t3260-a.mp4"],
    "all partial-stage uploads deleted on failed save");

  const deletedOk: string[] = [];
  const resOk = makeRes(201);
  const sinkOk = armMirrorOrphanCleanup(resOk, async (p) => { deletedOk.push(p); });
  sinkOk.push("/objects/uploads/t3260-b.mp4");
  resOk.emit("finish");
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(deletedOk, [], "successful save keeps its objects");
});

test("updating a NONEXISTENT video id with a live external URL 404s after mirroring (cleanup armed)", async () => {
  const token = await seedAdmin();
  const missingId = randomUUID();
  const before = extFetchCount;
  const res = await call("PUT", `/api/admin/album-videos/${missingId}`,
    { videoUrl: `${EXT_HOST}${LIVE_MP4_URL_PATH}` }, token);
  assert.equal(res.status, 404, `nonexistent id 404s (${JSON.stringify(res.json)})`);
  assert.ok(extFetchCount > before, "the external file WAS fetched — exactly the orphan case the cleanup covers");
});

test("video mirrors OK but a dead external poster fails the whole save (422, no row)", async () => {
  const token = await seedAdmin();
  const albumId = await seedAlbum();
  const before = extFetchCount;
  const res = await call("POST", `/api/admin/albums/${albumId}/videos`,
    { title: "t3260 multi-stage", videoUrl: `${EXT_HOST}${LIVE_MP4_URL_PATH}`,
      posterUrl: `${EXT_HOST}/t3260-missing.png` }, token);
  assert.equal(res.status, 422, `dead poster fails the save (${JSON.stringify(res.json)})`);
  assert.ok(extFetchCount >= before + 2, "both stages fetched — video upload happened before the poster failed");
  const count = rows(await exec(sql`SELECT count(*)::int AS n FROM album_videos WHERE album_id = ${albumId}`))[0];
  assert.equal(count.n, 0, "no video row persisted");
});

test("bonus video POST with a dead external link 422s and persists nothing", async () => {
  const token = await seedAdmin();
  const albumId = await seedAlbum();
  const res = await call("POST", `/api/admin/albums/${albumId}/videos`,
    { title: "t3260 video", videoUrl: `${EXT_HOST}/t3260-missing.mp4` }, token);
  assert.equal(res.status, 422, `dead video link fails the save (${JSON.stringify(res.json)})`);
  const count = rows(await exec(sql`SELECT count(*)::int AS n FROM album_videos WHERE album_id = ${albumId}`))[0];
  assert.equal(count.n, 0, "no video row persisted");
});

test("guarded lookup propagates DNS failures (they become a 422, never a 500)", async () => {
  const failLookup = ((_h: string, _o: any, cb: any) =>
    cb(Object.assign(new Error("getaddrinfo ENOTFOUND"), { code: "ENOTFOUND" }))) as any;
  const err = await new Promise<any>((resolve) =>
    makeGuardedLookup(failLookup)("gone.example", {}, (e: any) => resolve(e)),
  );
  assert.ok(err, "DNS failure surfaces as a connection error");
});

test("PUT song with an unresolvable hostname 422s instead of 500ing", async () => {
  // .invalid is RFC-2606-reserved — DNS deterministically fails; the mirror
  // helper must wrap that into ExternalFetchError so the route answers 422.
  const token = await seedAdmin();
  const albumId = await seedAlbum();
  const songId = await seedSong(albumId, null);
  const res = await call(
    "PUT",
    `/api/admin/songs/${songId}`,
    { audioUrl: "https://t3260-does-not-exist.invalid/master.mp3" },
    token,
  );
  assert.equal(res.status, 422, `DNS failure fails the save honestly (${JSON.stringify(res.json)})`);
  assert.equal((await songRow(songId)).audio_url, null, "nothing persisted");
});

// ── 6. Image boundaries — mirror + rejection ────────────────────────────────

test("album photo POST mirrors an external image and 422s a dead link", async () => {
  const token = await seedAdmin();
  const albumId = await seedAlbum();

  const ok = await call("POST", `/api/admin/albums/${albumId}/photos`, { photoUrl: LIVE_PNG_URL }, token);
  assert.equal(ok.status, 201, `photo save succeeds (${JSON.stringify(ok.json)})`);
  created.photos.add(ok.json.id);
  assert.match(ok.json.photoUrl, /^\/objects\//, "stored photo points ONLY at our storage");

  const dead = await call("POST", `/api/admin/albums/${albumId}/photos`, { photoUrl: `${EXT_HOST}/t3260-missing.png` }, token);
  assert.equal(dead.status, 422, "dead image link fails the save");
  const count = rows(await exec(sql`SELECT count(*)::int AS n FROM album_photos WHERE album_id = ${albumId}`))[0];
  assert.equal(count.n, 1, "no row persisted for the failed save");
});
