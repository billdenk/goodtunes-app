// Task #2034 — drive a SUCCESSFUL auto-GoodSync all the way through the real
// orchestrator (runAutoGoodSync, via POST /api/admin/songs/:id/rerun-goodsync)
// and assert the blank song fields actually get FILLED.
//
// The sibling suite (server/autoGoodSync.db.test.ts) locks the write-DECISION
// contract at the pure-policy layer (server/lib/autoGoodSyncPolicy.ts) and only
// exercises the orchestrator on the FAILURE path (a no-master song). Nothing
// drove a real, successful transcription through the route to prove the part
// fans actually see: synced cues written, Plain lyrics back-populated, the
// preview moved to the chorus, and the explicit flag raised — with the
// job_runs row landing on "success". That happy path can silently regress
// without any other test failing, so this file pins it end-to-end:
//
//   1. AUTO (fill-blanks, force=false): a fresh-upload song with EVERY content
//      field blank gets ALL of them filled exactly as planAutoGoodSyncUpdates
//      dictates — synced cues, back-populated Plain lyrics, previewStartMs from
//      the chorus, explicit flag ON — and records a job_runs row tagged
//      jobType "auto-goodsync", status "success".
//   2. FORCE (the manual "Re-run GoodSync" button, the route default): a song
//      with operator-set synced cues + preview + Plain lyrics gets its cues and
//      preview OVERWRITTEN, but the operator-TYPED Plain lyrics are KEPT (the
//      transcription only ever back-populates Plain lyrics when there were
//      none — `plainDraft` is undefined otherwise, even under force). This is
//      the through-the-route counterpart to what the pure-policy suite only
//      asserts in isolation.
//
// The transcription / audio dependencies are stubbed deterministically so the
// run is hermetic — NO ElevenLabs, NO object storage, NO real network, NO AI:
//   • `globalThis.fetch` is intercepted: the ElevenLabs speech-to-text endpoint
//     returns a fixed word list; the master-audio URL returns a few bytes of
//     fake WAV. Everything else (the loopback POST to our own test server)
//     falls through to the real fetch.
//   • The master URL is an IP-literal host (TEST-NET-3, 203.0.113.x — public,
//     non-private) so the orchestrator's SSRF guard resolves it WITHOUT a real
//     DNS query, and a `.wav` extension under the passthrough cap means ffmpeg
//     never runs.
//   • The fixed word list is crafted so the deterministic `[Chorus]`-marker
//     finder resolves the preview (no OpenAI fallback), and carries one
//     profanity so the explicit scan fires.
//
// Real DB (DATABASE_URL), Node's built-in runner:
//
//   npx tsx --test server/autoGoodSyncHappyPath.db.test.ts
//
// Every row seeded here is tracked and torn down in the `after` hook.
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
const rows = (r: any): any[] => (r as any)?.rows ?? [];

const created = {
  albums: new Set<string>(),
  songs: new Set<string>(),
  users: new Set<string>(),
  tokens: new Set<string>(),
  jobRuns: new Set<string>(),
};

let baseUrl = "";
let httpServer: HttpServer | undefined;
let realFetch: typeof globalThis.fetch;
let prevApiKey: string | undefined;

// An IP-literal host (TEST-NET-3 documentation range — public, never matches
// the orchestrator's private-IP guard) so the SSRF check resolves it without a
// real DNS query; `.wav` under the passthrough cap keeps ffmpeg out of it.
const MASTER_URL = "https://203.0.113.10/t2034-master.wav";

// The deterministic STT word list our stubbed ElevenLabs returns. Timed so
// `groupWordsIntoCues` produces exactly three lines — a verse, a bare
// "[Chorus]" marker line, and the first chorus line — which lets the
// deterministic chorus finder resolve the preview with NO AI call. The
// profanity ("shit") makes the explicit scan fire.
const STT_WORDS = [
  { text: "tell", start: 0.0, end: 0.3, type: "word" },
  { text: "me", start: 0.3, end: 0.6, type: "word" },
  { text: "the", start: 0.6, end: 0.9, type: "word" },
  { text: "truth", start: 0.9, end: 1.2, type: "word" },
  { text: "now", start: 1.2, end: 1.5, type: "word" },
  { text: "[Chorus]", start: 3.0, end: 3.3, type: "word" },
  { text: "this", start: 4.0, end: 4.3, type: "word" },
  { text: "damn", start: 4.3, end: 4.6, type: "word" },
  { text: "shit", start: 4.6, end: 4.9, type: "word" },
  { text: "is", start: 4.9, end: 5.2, type: "word" },
  { text: "real", start: 5.2, end: 5.5, type: "word" },
];

// What groupWordsIntoCues → refineAndFilterCues must produce from STT_WORDS.
const EXPECTED_CUES = [
  { timeMs: 0, endMs: 1500, text: "tell me the truth now" },
  { timeMs: 3000, endMs: 3300, text: "[Chorus]" },
  { timeMs: 4000, endMs: 5500, text: "this damn shit is real" },
];
// Back-populated Plain lyrics when the operator had none (cue text, one per line).
const EXPECTED_PLAIN = "tell me the truth now\n[Chorus]\nthis damn shit is real";
// The chorus's first sung line lands on the third cue → preview start.
const EXPECTED_PREVIEW_MS = 4000;

before(async () => {
  prevApiKey = process.env.ELEVENLABS_API_KEY;
  process.env.ELEVENLABS_API_KEY = "t2034-test-key";

  // Intercept only the two outbound calls the orchestrator makes; let the
  // loopback POST to our own server fall through to the real fetch.
  realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: any, init?: any) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : (input?.url ?? String(input));
    if (url.includes("api.elevenlabs.io")) {
      return new Response(JSON.stringify({ text: EXPECTED_PLAIN, words: STT_WORDS }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url.includes("203.0.113.10")) {
      // A few bytes of fake WAV — small enough to skip transcode, never
      // actually decoded because the STT call is stubbed too.
      const body = Buffer.alloc(2048, 1);
      return new Response(body, {
        status: 200,
        headers: { "content-type": "audio/wav", "content-length": String(body.length) },
      });
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
  const port = typeof addr === "object" && addr ? addr.port : 0;
  baseUrl = `http://127.0.0.1:${port}`;
});

after(async () => {
  try {
    for (const id of created.jobRuns) await exec(sql`DELETE FROM job_runs WHERE id = ${id}`);
    for (const id of created.songs) await exec(sql`DELETE FROM songs WHERE id = ${id}`);
    for (const id of created.albums) await exec(sql`DELETE FROM albums WHERE id = ${id}`);
    for (const t of created.tokens) await exec(sql`DELETE FROM auth_tokens WHERE token = ${t}`);
    for (const id of created.users) await exec(sql`DELETE FROM users WHERE id = ${id}`);
  } finally {
    if (realFetch) globalThis.fetch = realFetch;
    if (prevApiKey === undefined) delete process.env.ELEVENLABS_API_KEY;
    else process.env.ELEVENLABS_API_KEY = prevApiKey;
    if (httpServer) await new Promise<void>((r) => httpServer!.close(() => r()));
    await pool.end();
  }
});

async function post(
  path: string,
  body: any,
  headers: Record<string, string> = {},
): Promise<{ status: number; json: any }> {
  const res = await realFetch(`${baseUrl}${path}`, {
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

async function seedAlbum(): Promise<string> {
  const id = randomUUID();
  await exec(sql`
    INSERT INTO albums (id, title, artist, artwork)
    VALUES (${id}, ${"t2034 album"}, ${"t2034 artist"}, ${""})
  `);
  created.albums.add(id);
  return id;
}

async function seedSong(opts: {
  albumId: string;
  autoGoodSyncStatus?: string | null;
  lyrics?: string | null;
  syncedLyrics?: any;
  previewStartMs?: number | null;
  instrumental?: boolean;
  isExplicit?: boolean;
  audioUrl?: string | null;
}): Promise<string> {
  const id = randomUUID();
  await exec(sql`
    INSERT INTO songs
      (id, album_id, title, track_number, lyrics, synced_lyrics, preview_start_ms,
       instrumental, is_explicit, audio_url, auto_goodsync_status)
    VALUES
      (${id}, ${opts.albumId}, ${"t2034 song"}, ${1},
       ${opts.lyrics ?? null},
       ${opts.syncedLyrics != null ? JSON.stringify(opts.syncedLyrics) : null}::jsonb,
       ${opts.previewStartMs ?? null},
       ${opts.instrumental ?? false}, ${opts.isExplicit ?? false},
       ${opts.audioUrl ?? null},
       ${opts.autoGoodSyncStatus ?? null})
  `);
  created.songs.add(id);
  return id;
}

async function seedAdmin(): Promise<{ userId: string; token: string }> {
  const userId = randomUUID();
  const tag = userId.slice(0, 8);
  await exec(sql`
    INSERT INTO users (id, username, password, display_name, email, is_admin, role)
    VALUES (${userId}, ${"t2034_" + tag}, ${"x"}, ${"t2034"},
            ${"t2034_" + tag + "@example.test"}, true, ${"super_admin"})
  `);
  created.users.add(userId);
  const token = "t2034tok_" + randomUUID().replace(/-/g, "");
  await storage.createAuthToken(token, userId, "admin");
  created.tokens.add(token);
  return { userId, token };
}

async function songContent(id: string) {
  return rows(await exec(sql`
    SELECT lyrics, synced_lyrics, preview_start_ms, instrumental, is_explicit,
           auto_goodsync_status
      FROM songs WHERE id = ${id}
  `))[0];
}

async function latestJobRun(songId: string) {
  const jr = rows(await exec(sql`
    SELECT id, job_type, status, error_message, summary
      FROM job_runs WHERE song_id = ${songId} ORDER BY started_at DESC
  `));
  for (const r of jr) created.jobRuns.add(r.id);
  return jr[0];
}

// ─── 1. AUTO (fill-blanks): every blank field gets filled ─────────────────

test("a successful auto-GoodSync fills a blank song's lyrics, cues, preview, and explicit flag", async () => {
  const { token } = await seedAdmin();
  const albumId = await seedAlbum();
  // A fresh upload: master present, every content field blank.
  const songId = await seedSong({
    albumId,
    audioUrl: MASTER_URL,
    autoGoodSyncStatus: "pending",
    lyrics: null,
    syncedLyrics: null,
    previewStartMs: null,
    instrumental: false,
    isExplicit: false,
  });

  // force:false → the fill-blanks-only auto path. (On a blank song it fills
  // everything anyway, which is exactly what we assert.)
  const res = await post(`/api/admin/songs/${songId}/rerun-goodsync`, { force: false }, {
    authorization: `Bearer ${token}`,
  });

  assert.equal(res.status, 200, "the route resolves");
  assert.equal(res.json?.ok, true, "the run reports success");
  assert.equal(res.json?.outcome, "done", "outcome is the lyrics happy path");

  const after = await songContent(songId);
  assert.deepEqual(
    after.synced_lyrics,
    EXPECTED_CUES,
    "blank synced cues are written from the transcription",
  );
  assert.equal(after.lyrics, EXPECTED_PLAIN, "blank Plain lyrics are back-populated from the cues");
  assert.equal(
    after.preview_start_ms,
    EXPECTED_PREVIEW_MS,
    "blank preview is moved to the resolved chorus",
  );
  assert.equal(after.is_explicit, true, "the explicit flag is raised when profanity is detected");
  assert.equal(after.instrumental, false, "a track with real words is never flagged instrumental");
  assert.equal(after.auto_goodsync_status, "done", "the status slot lands on done");

  const jr = await latestJobRun(songId);
  assert.ok(jr, "a job run is recorded");
  assert.equal(jr.job_type, "auto-goodsync", 'the job run is tagged jobType "auto-goodsync"');
  assert.equal(jr.status, "success", "the job run records success");
  assert.equal(jr.error_message, null, "no error message on a clean run");
});

// ─── 2. FORCE (manual re-run): overwrite cues/preview, KEEP typed lyrics ───

test("force re-run overwrites operator cues + preview but keeps operator-typed Plain lyrics", async () => {
  const { token } = await seedAdmin();
  const albumId = await seedAlbum();
  // Operator-typed Plain lyrics that DO carry a [Chorus] marker (so the
  // deterministic chorus finder resolves without AI) and the operator's own
  // synced cues + preview that force must blow past.
  const operatorLyrics = "tell me the truth now\n[Chorus]\nthis damn shit is real";
  const operatorSynced = [{ timeMs: 0, endMs: 500, text: "operator cue" }];
  const songId = await seedSong({
    albumId,
    audioUrl: MASTER_URL,
    autoGoodSyncStatus: "done",
    lyrics: operatorLyrics,
    syncedLyrics: operatorSynced,
    previewStartMs: 7777,
    instrumental: false,
    isExplicit: false,
  });

  // No body → the route default is force=true (the manual "Re-run GoodSync"
  // button).
  const res = await post(`/api/admin/songs/${songId}/rerun-goodsync`, {}, {
    authorization: `Bearer ${token}`,
  });

  assert.equal(res.status, 200, "the route resolves");
  assert.equal(res.json?.ok, true, "the run reports success");
  assert.equal(res.json?.outcome, "done");

  const after = await songContent(songId);
  assert.deepEqual(
    after.synced_lyrics,
    EXPECTED_CUES,
    "force OVERWRITES the operator's synced cues with the fresh transcription",
  );
  assert.notDeepEqual(
    after.synced_lyrics,
    operatorSynced,
    "the operator's cues are gone (proves the overwrite, not a no-op)",
  );
  assert.equal(
    after.preview_start_ms,
    EXPECTED_PREVIEW_MS,
    "force OVERWRITES the operator's preview with the resolved chorus",
  );
  assert.equal(after.is_explicit, true, "force re-proposes the explicit flag");
  assert.equal(
    after.lyrics,
    operatorLyrics,
    "force STILL keeps the operator-typed Plain lyrics (never back-populated over them)",
  );
  assert.equal(after.auto_goodsync_status, "done");

  const jr = await latestJobRun(songId);
  assert.equal(jr.job_type, "auto-goodsync", 'the job run is tagged jobType "auto-goodsync"');
  assert.equal(jr.status, "success", "the job run records success");
});
