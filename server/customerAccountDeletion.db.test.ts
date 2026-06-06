// Task #1497 — Guard in-app account deletion against silent regression.
//
// In-app account deletion is an App Store 5.1.1(v) + Google Play compliance
// requirement: a fan must be able to permanently delete their account from
// inside the app. The contract is anonymize-in-place (see
// .agents/memory/account-deletion-anonymize.md): `storage.deleteCustomerAccount`
// must, in ONE transaction —
//   * scrub every PII column on the `customer_users` row (email/username swap
//     to a deterministic `deleted-<id>` sentinel, password nulled, real name /
//     phone / addresses / contact fields cleared),
//   * delete every child row that could re-authenticate or re-identify the
//     account: bearer tokens, OAuth identities, song/artist favorites, the
//     fan's playlists (+ their songs), and library (user_albums),
//   * but KEEP the `customer_users` row itself (orders + financial/cert
//     history FK into it and are retained for legal/accounting reasons).
//
// It was verified once with a throwaway script but had no committed test — a
// future change to the delete transaction could silently drop one of these
// steps and leave a privacy gap or store-rejection risk. This test seeds a
// customer with one of every related row, runs the real
// `storage.deleteCustomerAccount`, then asserts anonymization + child-row
// removal + row retention. Any dropped step fails loudly naming what leaked.
//
// Real DB (DATABASE_URL), Node's built-in runner:
//
//   npx tsx --test server/customerAccountDeletion.db.test.ts
//
// Every row seeded here is tracked and torn down in the `after` hook.

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { db, pool } from "./db";
import { storage } from "./storage";

const exec = (q: any) => db.execute(q);
const rows = (r: any): any[] => (r as any)?.rows ?? [];

const created = {
  customers: new Set<string>(),
  albums: new Set<string>(),
};

after(async () => {
  try {
    for (const id of created.customers) {
      // Defensive teardown in case an assertion failed mid-test and left
      // child rows behind. The delete-under-test removes most of these; the
      // belt-and-suspenders deletes here keep teardown order-safe (children
      // first) and idempotent.
      await exec(sql`DELETE FROM auth_tokens WHERE customer_user_id = ${id}`);
      await exec(sql`DELETE FROM customer_identities WHERE user_id = ${id}`);
      await exec(sql`DELETE FROM song_favorites WHERE user_id = ${id}`);
      await exec(sql`DELETE FROM artist_favorites WHERE user_id = ${id}`);
      await exec(sql`DELETE FROM playlist_songs WHERE playlist_id IN (SELECT id FROM playlists WHERE user_id = ${id})`);
      await exec(sql`DELETE FROM playlists WHERE user_id = ${id}`);
      await exec(sql`DELETE FROM user_albums WHERE user_id = ${id}`);
      await exec(sql`DELETE FROM customer_users WHERE id = ${id}`);
    }
    // songs FK has no onDelete cascade, so drop them before their album.
    for (const id of created.albums) {
      await exec(sql`DELETE FROM songs WHERE album_id = ${id}`);
      await exec(sql`DELETE FROM albums WHERE id = ${id}`);
    }
  } finally {
    await pool.end();
  }
});

async function seedAlbumWithSong(): Promise<{ albumId: string; songId: string }> {
  const albumId = randomUUID();
  const songId = randomUUID();
  await exec(sql`
    INSERT INTO albums (id, title, artist, artwork)
    VALUES (${albumId}, ${"t1497 album"}, ${"t1497 artist"}, ${""})
  `);
  created.albums.add(albumId);
  await exec(sql`
    INSERT INTO songs (id, album_id, title, track_number)
    VALUES (${songId}, ${albumId}, ${"t1497 song"}, ${1})
  `);
  return { albumId, songId };
}

// Seed a fully-populated fan: PII fields set + one of every child row the
// delete transaction is responsible for clearing.
async function seedPopulatedCustomer(opts: {
  albumId: string;
  songId: string;
}): Promise<string> {
  const id = randomUUID();
  const uniq = id.slice(0, 8);
  await exec(sql`
    INSERT INTO customer_users
      (id, username, email, display_name, real_name, password, phone, phone_e164,
       handle, contact_email, contact_phone, favorite_streaming_service)
    VALUES
      (${id}, ${"t1497_" + uniq}, ${"t1497_" + uniq + "@example.test"}, ${"Real Display Name"},
       ${"Real Legal Name"}, ${"hashed-password"}, ${"+1 555 000 0000"}, ${"+15550000000"},
       ${"t1497handle_" + uniq}, ${"contact_" + uniq + "@example.test"}, ${"+15550000001"},
       ${"apple_music"})
  `);
  created.customers.add(id);

  // Bearer token (cached sign-in).
  await exec(sql`
    INSERT INTO auth_tokens (token, customer_user_id, kind)
    VALUES (${"tok_" + randomUUID()}, ${id}, ${"customer"})
  `);

  // OAuth identity (Google/Apple link).
  await exec(sql`
    INSERT INTO customer_identities (id, user_id, provider, provider_user_id, email)
    VALUES (${randomUUID()}, ${id}, ${"google"}, ${"sub_" + uniq}, ${"oauth_" + uniq + "@example.test"})
  `);

  // Song favorite + artist favorite.
  await exec(sql`
    INSERT INTO song_favorites (user_id, song_id) VALUES (${id}, ${opts.songId})
  `);
  await exec(sql`
    INSERT INTO artist_favorites (user_id, artist_name) VALUES (${id}, ${"t1497 artist"})
  `);

  // Playlist + a song in it.
  const playlistId = randomUUID();
  await exec(sql`
    INSERT INTO playlists (id, user_id, name) VALUES (${playlistId}, ${id}, ${"My Playlist"})
  `);
  await exec(sql`
    INSERT INTO playlist_songs (id, playlist_id, song_id, position)
    VALUES (${randomUUID()}, ${playlistId}, ${opts.songId}, ${0})
  `);

  // Library entitlement (owned album).
  await exec(sql`
    INSERT INTO user_albums (id, user_id, album_id, certificate_number)
    VALUES (${randomUUID()}, ${id}, ${opts.albumId}, ${1234})
  `);

  return id;
}

async function countChildRows(id: string) {
  const one = async (q: any) => Number(rows(await exec(q))[0]?.n ?? 0);
  return {
    authTokens: await one(sql`SELECT count(*) AS n FROM auth_tokens WHERE customer_user_id = ${id}`),
    identities: await one(sql`SELECT count(*) AS n FROM customer_identities WHERE user_id = ${id}`),
    songFavorites: await one(sql`SELECT count(*) AS n FROM song_favorites WHERE user_id = ${id}`),
    artistFavorites: await one(sql`SELECT count(*) AS n FROM artist_favorites WHERE user_id = ${id}`),
    playlists: await one(sql`SELECT count(*) AS n FROM playlists WHERE user_id = ${id}`),
    playlistSongs: await one(sql`SELECT count(*) AS n FROM playlist_songs WHERE playlist_id IN (SELECT id FROM playlists WHERE user_id = ${id})`),
    userAlbums: await one(sql`SELECT count(*) AS n FROM user_albums WHERE user_id = ${id}`),
  };
}

test("deleteCustomerAccount anonymizes the row, drops child rows, keeps the row", async () => {
  const { albumId, songId } = await seedAlbumWithSong();
  const id = await seedPopulatedCustomer({ albumId, songId });

  // Sanity: everything is present before deletion.
  const before = await countChildRows(id);
  assert.equal(before.authTokens, 1, "fixture: should have a bearer token before deletion");
  assert.equal(before.identities, 1, "fixture: should have an OAuth identity before deletion");
  assert.equal(before.songFavorites, 1, "fixture: should have a song favorite before deletion");
  assert.equal(before.artistFavorites, 1, "fixture: should have an artist favorite before deletion");
  assert.equal(before.playlists, 1, "fixture: should have a playlist before deletion");
  assert.equal(before.playlistSongs, 1, "fixture: should have a playlist song before deletion");
  assert.equal(before.userAlbums, 1, "fixture: should have a library row before deletion");

  await storage.deleteCustomerAccount(id);

  // 1) The row is RETAINED (orders/financial history FK into it).
  const row = rows(await exec(sql`
    SELECT username, email, display_name, real_name, password, phone, phone_e164,
           billing_address, shipping_address, handle, contact_email, contact_phone,
           favorite_streaming_service
      FROM customer_users WHERE id = ${id}
  `))[0];
  assert.ok(row, "customer_users row must be RETAINED after deletion (orders FK into it)");

  // 2) PII is scrubbed to the deterministic sentinel + nulls.
  assert.equal(row.username, `deleted-${id}`, "username must become the deterministic sentinel");
  assert.equal(row.email, `deleted-${id}@deleted.invalid`, "email must become the deterministic sentinel");
  assert.equal(row.display_name, "Deleted account", "display_name must be anonymized");
  assert.equal(row.real_name, null, "real_name must be nulled");
  assert.equal(row.password, null, "password must be nulled (account becomes sign-in-impossible)");
  assert.equal(row.phone, null, "phone must be nulled");
  assert.equal(row.phone_e164, null, "phone_e164 must be nulled");
  assert.equal(row.billing_address, null, "billing_address must be nulled");
  assert.equal(row.shipping_address, null, "shipping_address must be nulled");
  assert.equal(row.handle, null, "handle must be nulled");
  assert.equal(row.contact_email, null, "contact_email must be nulled");
  assert.equal(row.contact_phone, null, "contact_phone must be nulled");
  assert.equal(row.favorite_streaming_service, null, "favorite_streaming_service must be nulled");

  // 3) Every child row that could re-authenticate or re-identify is gone.
  const after = await countChildRows(id);
  assert.equal(after.authTokens, 0, "all bearer tokens must be revoked");
  assert.equal(after.identities, 0, "all OAuth identities must be removed");
  assert.equal(after.songFavorites, 0, "all song favorites must be removed");
  assert.equal(after.artistFavorites, 0, "all artist favorites must be removed");
  assert.equal(after.playlists, 0, "all playlists must be removed");
  assert.equal(after.playlistSongs, 0, "all playlist songs must be removed");
  assert.equal(after.userAlbums, 0, "all library (user_albums) rows must be removed");
});

test("deleteCustomerAccount is idempotent on a double-submit", async () => {
  const { albumId, songId } = await seedAlbumWithSong();
  const id = await seedPopulatedCustomer({ albumId, songId });

  await storage.deleteCustomerAccount(id);
  // Deterministic sentinel means a second call never collides on the unique
  // email/username indexes and is a safe no-op.
  await storage.deleteCustomerAccount(id);

  const row = rows(await exec(sql`
    SELECT username, email, password FROM customer_users WHERE id = ${id}
  `))[0];
  assert.ok(row, "row should still exist after a double delete");
  assert.equal(row.username, `deleted-${id}`, "username sentinel should be stable across re-delete");
  assert.equal(row.email, `deleted-${id}@deleted.invalid`, "email sentinel should be stable across re-delete");
  assert.equal(row.password, null, "password should remain nulled");
});
