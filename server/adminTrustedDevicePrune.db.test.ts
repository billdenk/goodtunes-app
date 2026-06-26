// Task #2255 — coverage for the trusted-device prune/cap that runs on every
// successful mint. Nothing else ever deletes admin_trusted_devices rows, so
// without this an admin who signs in regularly accumulates an unbounded pile of
// stale (expired or just old) hash rows. createAdminTrustedDevice now calls
// pruneAdminTrustedDevices(userId), which (1) deletes every globally-expired
// row and (2) caps the user's live rows to the N most recent.
//
// This file drives the storage layer directly (no HTTP) against the real DB and
// asserts both behaviors. Every row it writes is bound to throwaway users that
// are torn down in `after`.
//
// Real DB (DATABASE_URL), Node's built-in runner:
//
//   npx tsx --test server/adminTrustedDevicePrune.db.test.ts

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { db, pool } from "./db";
import { storage } from "./storage";

const exec = (q: any) => db.execute(q);
const created = { users: new Set<string>() };

// Keep in lockstep with ADMIN_TRUSTED_DEVICE_MAX_PER_USER in server/storage.ts.
const MAX_PER_USER = 10;
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

after(async () => {
  try {
    for (const id of created.users) {
      await exec(sql`DELETE FROM admin_trusted_devices WHERE user_id = ${id}`);
      await exec(sql`DELETE FROM users WHERE id = ${id}`);
    }
  } finally {
    await pool.end();
  }
});

async function seedAdmin(): Promise<string> {
  const id = randomUUID();
  const tag = id.slice(0, 8);
  await exec(sql`
    INSERT INTO users (id, username, password, display_name, email, is_admin, factor_pref)
    VALUES (${id}, ${"t2255_" + tag}, ${"x"}, ${"t2255"},
            ${"t2255_" + tag + "@example.test"}, true, ${"totp"})
  `);
  created.users.add(id);
  return id;
}

// Insert a row directly with an explicit expiry + createdAt, bypassing the
// prune so we can stage a dirty table before exercising it.
async function rawDevice(userId: string, expiresAt: Date, createdAt: Date): Promise<string> {
  const hash = createHash("sha256").update(randomBytes(16)).digest("hex");
  await exec(sql`
    INSERT INTO admin_trusted_devices (user_id, token_hash, expires_at, created_at)
    VALUES (${userId}, ${hash}, ${expiresAt}, ${createdAt})
  `);
  return hash;
}

async function liveCount(userId: string): Promise<number> {
  const rows: any = await exec(sql`SELECT count(*)::int AS n FROM admin_trusted_devices WHERE user_id = ${userId}`);
  return (rows.rows ?? rows)[0].n;
}

test("a fresh mint prunes the minting user's expired rows", async () => {
  const userId = await seedAdmin();
  // Stage three already-expired rows for this user.
  for (let i = 0; i < 3; i++) {
    await rawDevice(userId, new Date(Date.now() - (i + 1) * 60_000), new Date(Date.now() - (i + 1) * 60_000));
  }
  assert.equal(await liveCount(userId), 3, "staged expired rows exist before the mint");

  const liveHash = createHash("sha256").update(randomBytes(16)).digest("hex");
  await storage.createAdminTrustedDevice(userId, liveHash, new Date(Date.now() + THIRTY_DAYS_MS));

  // Only the just-minted live row should survive.
  assert.equal(await liveCount(userId), 1, "expired rows are pruned, the new live row remains");
  const remaining = await storage.getAdminTrustedDevice(liveHash);
  assert.ok(remaining, "the freshly minted row is still readable");
});

test("a mint prunes globally-expired rows for OTHER users too", async () => {
  const minter = await seedAdmin();
  const stranger = await seedAdmin();
  // The stranger never signs in again but left an expired row behind.
  await rawDevice(stranger, new Date(Date.now() - 60_000), new Date(Date.now() - 60_000));
  // ...and one still-live row that must be left alone.
  const strangerLive = createHash("sha256").update(randomBytes(16)).digest("hex");
  await exec(sql`
    INSERT INTO admin_trusted_devices (user_id, token_hash, expires_at, created_at)
    VALUES (${stranger}, ${strangerLive}, ${new Date(Date.now() + THIRTY_DAYS_MS)}, ${new Date()})
  `);

  // A different admin signs in.
  await storage.createAdminTrustedDevice(
    minter,
    createHash("sha256").update(randomBytes(16)).digest("hex"),
    new Date(Date.now() + THIRTY_DAYS_MS),
  );

  assert.equal(await liveCount(stranger), 1, "stranger's expired row is gone, live row stays");
  assert.ok(await storage.getAdminTrustedDevice(strangerLive), "stranger's live row survives");
});

test("a user's live rows are capped at the most-recent N", async () => {
  const userId = await seedAdmin();
  // Stage MAX_PER_USER live rows already at the cap, all older than the mint.
  for (let i = 0; i < MAX_PER_USER; i++) {
    await rawDevice(
      userId,
      new Date(Date.now() + THIRTY_DAYS_MS),
      new Date(Date.now() - (MAX_PER_USER - i) * 60_000),
    );
  }
  assert.equal(await liveCount(userId), MAX_PER_USER, "staged exactly the cap");

  // The (cap + 1)th mint must evict the oldest, holding the table at the cap.
  const newestHash = createHash("sha256").update(randomBytes(16)).digest("hex");
  await storage.createAdminTrustedDevice(userId, newestHash, new Date(Date.now() + THIRTY_DAYS_MS));

  assert.equal(await liveCount(userId), MAX_PER_USER, "table stays at the cap after an over-cap mint");
  assert.ok(await storage.getAdminTrustedDevice(newestHash), "the newest minted row is always kept");
});
