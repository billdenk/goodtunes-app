// Task #2709 — one-word share link rich unfurl. The Share button hands out
// get.goodtunes.music/<slug>; the OG dispatcher must resolve a single
// non-reserved segment through injectAlbumOgBySlug so the one-word link
// unfurls with the album card exactly like the two-part link. Reserved /
// auth-walled single segments keep their current behavior (default card,
// noindex where applicable) and prepping/hidden releases stay on the
// neutral branded card.
//
// Real DB (DATABASE_URL), Node's built-in runner:
//   npx tsx --test server/ogShareSlug.db.test.ts
import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { db, pool } from "./db";
import { injectOgForUrl } from "./og";

const exec = (q: any) => db.execute(q);

const suffix = randomUUID().slice(0, 8);
const liveAlbumId = `og-slug-test-live-${suffix}`;
const prepAlbumId = `og-slug-test-prep-${suffix}`;
const hiddenAlbumId = `og-slug-test-hidden-${suffix}`;
const personId = `og-slug-test-person-${suffix}`;
const artistSlug = `og-test-artist-${suffix}`;
const liveSlug = `og-test-live-${suffix}`;
const prepSlug = `og-test-prep-${suffix}`;
const hiddenSlug = `og-test-hidden-${suffix}`;

const TEMPLATE = `<!DOCTYPE html><html><head><title>x</title></head><body></body></html>`;

function fakeReq(path: string): any {
  return {
    originalUrl: path,
    protocol: "https",
    headers: { "x-forwarded-proto": "https" },
    get: (h: string) => (h.toLowerCase() === "host" ? "get.goodtunes.music" : undefined),
  };
}

before(async () => {
  await exec(sql`
    INSERT INTO people (id, name, artist_share_slug)
    VALUES (${personId}, 'OG Test Artist', ${artistSlug})
  `);
  await exec(sql`
    INSERT INTO albums (id, title, artist, artwork, share_slug, is_prepping, is_hidden, primary_artist_id)
    VALUES
      (${liveAlbumId}, 'OG Live LP', 'OG Test Artist', '/objects/uploads/og-test-live.png', ${liveSlug}, false, false, ${personId}),
      (${prepAlbumId}, 'OG Prep LP', 'OG Test Artist', '/objects/uploads/og-test-prep.png', ${prepSlug}, true, false, ${personId}),
      (${hiddenAlbumId}, 'OG Hidden LP', 'OG Test Artist', '/objects/uploads/og-test-hidden.png', ${hiddenSlug}, false, true, ${personId})
  `);
});

after(async () => {
  await exec(sql`DELETE FROM albums WHERE id IN (${liveAlbumId}, ${prepAlbumId}, ${hiddenAlbumId})`);
  await exec(sql`DELETE FROM people WHERE id = ${personId}`);
  await pool.end();
});

test("live release one-word slug unfurls with the album's own OG card", async () => {
  const out = await injectOgForUrl(TEMPLATE, fakeReq(`/${liveSlug}`));
  assert.match(out, /OG Live LP by OG Test Artist — GoodTunes®/, "og:title carries the album");
  assert.match(out, /og-test-live\.png/, "og:image is the album art, not the default card");
  assert.match(out, /music\.album/, "og:type is music.album");
  assert.doesNotMatch(out, /og-card\.png/, "default card image must not appear");
});

test("prepping release one-word slug stays on the branded default card", async () => {
  const out = await injectOgForUrl(TEMPLATE, fakeReq(`/${prepSlug}`));
  assert.doesNotMatch(out, /OG Prep LP/, "staged release must not leak title");
  assert.doesNotMatch(out, /og-test-prep\.png/, "staged release must not leak art");
  assert.match(out, /og-card\.png/, "default card image used");
});

test("hidden release one-word slug stays on the branded default card", async () => {
  const out = await injectOgForUrl(TEMPLATE, fakeReq(`/${hiddenSlug}`));
  assert.doesNotMatch(out, /OG Hidden LP/, "hidden release must not leak title");
  assert.match(out, /og-card\.png/, "default card image used");
});

test("reserved auth-walled slug (/login) keeps default card + noindex", async () => {
  const out = await injectOgForUrl(TEMPLATE, fakeReq("/login"));
  assert.match(out, /og-card\.png/, "default card image used");
  assert.match(out, /noindex, nofollow/, "auth-walled path keeps noindex");
});

test("reserved slug (/staging) keeps the default card", async () => {
  const out = await injectOgForUrl(TEMPLATE, fakeReq("/staging"));
  assert.match(out, /og-card\.png/, "default card image used");
  assert.doesNotMatch(out, /music\.album/, "no album card for a reserved segment");
});

test("unknown one-word slug falls back to the default card", async () => {
  const out = await injectOgForUrl(TEMPLATE, fakeReq(`/no-such-slug-${suffix}`));
  assert.match(out, /og-card\.png/, "default card image used");
  assert.match(out, /index, follow/, "non-auth-walled unknown slug is not noindexed");
});

test("two-part artist/album link still rich-unfurls the live release (lockstep)", async () => {
  const out = await injectOgForUrl(TEMPLATE, fakeReq(`/${artistSlug}/${liveSlug}`));
  assert.match(out, /OG Live LP by OG Test Artist — GoodTunes®/, "og:title carries the album");
  assert.match(out, /og-test-live\.png/, "og:image is the album art");
  assert.match(out, /music\.album/, "og:type is music.album");
});

test("two-part artist/album link behavior unchanged (falls back cleanly when artist absent)", async () => {
  const out = await injectOgForUrl(TEMPLATE, fakeReq(`/no-artist-${suffix}/no-album-${suffix}`));
  assert.match(out, /og-card\.png/, "default card image used for unmatched two-part link");
});

test("malformed percent-encoding in a one-word path falls back to the default card", async () => {
  const out = await injectOgForUrl(TEMPLATE, fakeReq("/%E0%A4%A"));
  assert.match(out, /og-card\.png/, "default card image used, no throw");
});
