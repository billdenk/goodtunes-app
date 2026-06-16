// Task #2025 — Guard the auto-GoodSync-after-upload workflow (Task #2020)
// against silent regression.
//
// After a freshly-uploaded master finishes Mux ingestion, a background
// orchestrator auto-runs GoodSync: transcribe + time-align lyrics, find the
// chorus → previewStartMs, detect instrumental + explicit. The behavioural
// contract is subtle and easy to break in a refactor, so this file locks the
// five load-bearing guarantees:
//
//   1. FILL-BLANKS-ONLY (auto path): operator-set lyrics / synced cues /
//      preview / instrumental / explicit are NEVER overwritten when `force`
//      is off. (pure policy unit — server/lib/autoGoodSyncPolicy.ts)
//   2. FORCE (manual "Re-run GoodSync") DOES overwrite synced cues / preview
//      / flags, but STILL keeps operator-typed Plain lyrics (the
//      transcription only back-populates Plain lyrics when there were none —
//      `plainDraft` is undefined otherwise, even under force).
//   3. IDEMPOTENCY: the atomic claim flips `pending` → `processing` exactly
//      once; a second trigger is a no-op. (storage.claimSongForAutoGoodSync —
//      the single seam EVERY trigger callsite funnels through.)
//   4. GATING: only fresh-upload callsites stamp `pending`. A reconcile /
//      backfill "ready" transition never stamps it, so the claim is a no-op
//      on an unstamped catalog row — the back catalog is never auto-synced.
//   5. NEVER-THROW: a failing transcription (here: a song with no master
//      audio) leaves the song's content fields untouched and records a
//      `job_runs` row with jobType "auto-goodsync". Driven through the real
//      POST /api/admin/songs/:id/rerun-goodsync route.
//
// Real DB (DATABASE_URL), Node's built-in runner:
//
//   npx tsx --test server/autoGoodSync.db.test.ts
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
import {
  planAutoGoodSyncUpdates,
  decideInstrumental,
} from "./lib/autoGoodSyncPolicy";

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
    for (const id of created.jobRuns) await exec(sql`DELETE FROM job_runs WHERE id = ${id}`);
    for (const id of created.songs) await exec(sql`DELETE FROM songs WHERE id = ${id}`);
    for (const id of created.albums) await exec(sql`DELETE FROM albums WHERE id = ${id}`);
    for (const t of created.tokens) await exec(sql`DELETE FROM auth_tokens WHERE token = ${t}`);
    for (const id of created.users) await exec(sql`DELETE FROM users WHERE id = ${id}`);
  } finally {
    if (httpServer) await new Promise<void>((r) => httpServer!.close(() => r()));
    await pool.end();
  }
});

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

async function seedAlbum(): Promise<string> {
  const id = randomUUID();
  await exec(sql`
    INSERT INTO albums (id, title, artist, artwork)
    VALUES (${id}, ${"t2025 album"}, ${"t2025 artist"}, ${""})
  `);
  created.albums.add(id);
  return id;
}

// Seed a song. `autoGoodSyncStatus` mirrors the real lifecycle: a fresh
// upload stamps it "pending"; a reconcile/backfill row leaves it null.
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
      (${id}, ${opts.albumId}, ${"t2025 song"}, ${1},
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
    VALUES (${userId}, ${"t2025_" + tag}, ${"x"}, ${"t2025"},
            ${"t2025_" + tag + "@example.test"}, true, ${"super_admin"})
  `);
  created.users.add(userId);
  const token = "t2025tok_" + randomUUID().replace(/-/g, "");
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

// A fresh transcription that DIFFERS from the operator's state, so any
// overwrite shows up loudly.
const FRESH_CUES = [
  { timeMs: 0, endMs: 1000, text: "auto line one" },
  { timeMs: 1000, endMs: 2000, text: "auto chorus line" },
];

// ─── 1. Fill-blanks-only (auto path, force=false) ─────────────────────────

test("fill-blanks-only: the auto path never overwrites operator-set fields", () => {
  const plan = planAutoGoodSyncUpdates(
    /* force */ false,
    // The operator already set EVERYTHING.
    { hasLyrics: true, hasSynced: true, previewSet: true, instrumental: true, explicit: true },
    {
      filtered: FRESH_CUES,
      // plainDraft is undefined whenever the operator has Plain lyrics.
      plainDraft: undefined,
      explicitDetected: true,
      chorusMs: 1000,
    },
  );

  assert.equal(plan.updates.syncedLyrics, undefined, "operator synced cues must NOT be overwritten");
  assert.equal(plan.updates.lyrics, undefined, "operator Plain lyrics must NOT be overwritten");
  assert.equal(plan.updates.previewStartMs, undefined, "operator preview must NOT be overwritten");
  assert.equal(plan.updates.isExplicit, undefined, "operator explicit flag must NOT be re-proposed");
  assert.equal(plan.writeSynced, false);
  assert.equal(plan.explicitSet, false);
  assert.equal(plan.previewSet, null);
  assert.equal(Object.keys(plan.updates).length, 0, "a fully-populated song gets ZERO auto writes");
});

test("fill-blanks-only: blank fields ARE filled on the auto path", () => {
  const plan = planAutoGoodSyncUpdates(
    false,
    // Operator set nothing.
    { hasLyrics: false, hasSynced: false, previewSet: false, instrumental: false, explicit: false },
    {
      filtered: FRESH_CUES,
      plainDraft: "auto line one\nauto chorus line",
      explicitDetected: true,
      chorusMs: 1000,
    },
  );

  assert.deepEqual(plan.updates.syncedLyrics, FRESH_CUES, "blank synced cues get filled");
  assert.equal(plan.updates.lyrics, "auto line one\nauto chorus line", "blank Plain lyrics get back-populated");
  assert.equal(plan.updates.previewStartMs, 1000, "blank preview gets the chorus timestamp");
  assert.equal(plan.updates.isExplicit, true, "explicit flag is proposed ON when detected");
});

test("fill-blanks-only: instrumental is set only when the operator had no lyrics", () => {
  // No operator lyrics → safe to flag instrumental.
  const a = decideInstrumental(false, { hasLyrics: false, instrumental: false });
  assert.deepEqual(a, { setInstrumental: true, write: true });

  // Operator typed lyrics → a human says it HAS words; never auto-flag.
  const b = decideInstrumental(false, { hasLyrics: true, instrumental: false });
  assert.deepEqual(b, { setInstrumental: false, write: false });

  // Already flagged → no redundant write.
  const c = decideInstrumental(false, { hasLyrics: false, instrumental: true });
  assert.deepEqual(c, { setInstrumental: true, write: false });
});

// ─── 2. Force mode (manual "Re-run GoodSync") ─────────────────────────────

test("force overwrites cues/preview/flags but KEEPS operator-typed Plain lyrics", () => {
  const plan = planAutoGoodSyncUpdates(
    /* force */ true,
    // Operator set everything — force should blow past all of it EXCEPT
    // typed Plain lyrics.
    { hasLyrics: true, hasSynced: true, previewSet: true, instrumental: true, explicit: true },
    {
      filtered: FRESH_CUES,
      // Operator HAS Plain lyrics → plainDraft is undefined → never touched.
      plainDraft: undefined,
      explicitDetected: true,
      chorusMs: 4200,
    },
  );

  assert.deepEqual(plan.updates.syncedLyrics, FRESH_CUES, "force overwrites synced cues");
  assert.equal(plan.updates.previewStartMs, 4200, "force overwrites the preview");
  assert.equal(plan.updates.isExplicit, true, "force re-proposes the explicit flag");
  assert.equal(plan.updates.lyrics, undefined, "force STILL never overwrites operator-typed Plain lyrics");
  assert.ok(!("lyrics" in plan.updates), "no lyrics key at all when plainDraft is undefined");
});

test("force flags instrumental even over operator-typed lyrics, but not redundantly", () => {
  // Force overrides the "human said it has words" guard.
  const a = decideInstrumental(true, { hasLyrics: true, instrumental: false });
  assert.deepEqual(a, { setInstrumental: true, write: true });
  // Still no redundant write when already flagged.
  const b = decideInstrumental(true, { hasLyrics: true, instrumental: true });
  assert.deepEqual(b, { setInstrumental: true, write: false });
});

test("preview is left alone when no chorus was resolved, even under force", () => {
  const plan = planAutoGoodSyncUpdates(
    true,
    { hasLyrics: false, hasSynced: false, previewSet: false, instrumental: false, explicit: false },
    { filtered: FRESH_CUES, plainDraft: "x", explicitDetected: false, chorusMs: null },
  );
  assert.equal(plan.updates.previewStartMs, undefined, "no chorus → no preview write");
  assert.equal(plan.previewSet, null);
});

// ─── 3. Idempotency: the atomic claim flips pending → processing once ──────

test("claimSongForAutoGoodSync flips pending→processing exactly once", async () => {
  const albumId = await seedAlbum();
  const songId = await seedSong({ albumId, autoGoodSyncStatus: "pending" });

  const first = await storage.claimSongForAutoGoodSync(songId);
  assert.equal(first, true, "the first claim on a pending song wins");

  const after = await songContent(songId);
  assert.equal(after.auto_goodsync_status, "processing", "the claim flips the row to processing");

  // Mux can deliver its ready webhook more than once; the second trigger
  // must be a no-op so GoodSync never runs twice on one upload.
  const second = await storage.claimSongForAutoGoodSync(songId);
  assert.equal(second, false, "a second claim on an already-claimed song is a no-op");
});

// ─── 4. Gating: reconcile/backfill rows are never auto-GoodSync'd ──────────

test("an unstamped (reconcile/backfill) song cannot be claimed — no auto-GoodSync", async () => {
  const albumId = await seedAlbum();
  // A catalog row healed by the reconcile/backfill sweep is never stamped
  // `pending` (only the 3 fresh-upload callsites stamp it), so the claim —
  // the single seam every trigger funnels through — is a no-op.
  const songId = await seedSong({ albumId, autoGoodSyncStatus: null });

  const claimed = await storage.claimSongForAutoGoodSync(songId);
  assert.equal(claimed, false, "a never-stamped catalog row must not be claimable");

  const after = await songContent(songId);
  assert.equal(after.auto_goodsync_status, null, "the row is left untouched (still null)");
});

test("a fresh-upload stamp makes a song claimable; other statuses do not", async () => {
  const albumId = await seedAlbum();

  // A row mid-run ("processing"), done, or failed must not be re-claimable —
  // only the `pending` fresh-upload stamp wins.
  for (const status of ["processing", "done", "failed", "instrumental"]) {
    const id = await seedSong({ albumId, autoGoodSyncStatus: status });
    assert.equal(
      await storage.claimSongForAutoGoodSync(id),
      false,
      `claim must fail for status="${status}"`,
    );
  }

  const fresh = await seedSong({ albumId, autoGoodSyncStatus: "pending" });
  assert.equal(await storage.claimSongForAutoGoodSync(fresh), true, "a fresh pending upload is claimable");
});

// ─── 5. Never-throw: a failing transcription leaves the song untouched ─────

test("rerun-goodsync never throws on a song with no master, and records a job run", async () => {
  const { token } = await seedAdmin();
  const albumId = await seedAlbum();
  // Operator state we expect to survive a failed run untouched.
  const operatorSynced = [{ timeMs: 0, endMs: 500, text: "operator cue" }];
  const songId = await seedSong({
    albumId,
    audioUrl: null, // no master → transcription fails fast (before any AI cost)
    lyrics: "operator lyrics",
    syncedLyrics: operatorSynced,
    previewStartMs: 7777,
    instrumental: false,
    isExplicit: false,
  });

  const res = await post(`/api/admin/songs/${songId}/rerun-goodsync`, {}, {
    authorization: `Bearer ${token}`,
  });

  // The route resolves cleanly (never throws / 500s) and reports the failure.
  assert.equal(res.status, 200, "the route must resolve, not crash");
  assert.equal(res.json?.ok, false, "outcome is a reported failure, not a thrown error");
  assert.equal(res.json?.outcome, "failed");
  assert.ok(res.json?.errorMessage, "a human-readable error message is returned");

  // The song's CONTENT fields are untouched — only the status slot moves.
  const after = await songContent(songId);
  assert.equal(after.lyrics, "operator lyrics", "operator lyrics untouched on a failed run");
  assert.deepEqual(after.synced_lyrics, operatorSynced, "operator synced cues untouched on a failed run");
  assert.equal(after.preview_start_ms, 7777, "operator preview untouched on a failed run");
  assert.equal(after.instrumental, false, "instrumental untouched on a failed run");
  assert.equal(after.is_explicit, false, "explicit untouched on a failed run");
  assert.equal(after.auto_goodsync_status, "failed", "the status slot lands on failed");

  // A job_runs row is recorded for observability, tagged "auto-goodsync".
  const jr = rows(await exec(sql`
    SELECT id, job_type, status, error_message
      FROM job_runs WHERE song_id = ${songId} ORDER BY started_at DESC
  `));
  assert.ok(jr.length >= 1, "a job run must be recorded for the failed auto-goodsync attempt");
  for (const r of jr) created.jobRuns.add(r.id);
  assert.equal(jr[0].job_type, "auto-goodsync", 'the job run is tagged jobType "auto-goodsync"');
  assert.equal(jr[0].status, "failed", "the job run records the failure");
  assert.ok(jr[0].error_message, "the job run captures the error message");
});
