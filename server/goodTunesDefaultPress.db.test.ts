import test, { after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { db, pool } from "./db";
import { pgArray } from "./lib/pgArray";
import {
  assignGoodTunesDefaultPressAtArtistGrant,
  backfillEligibleGoodTunesArtists,
  resolveGoodTunesDefaultPressId,
  withGoodTunesDefaultPress,
} from "./goodTunesDefaultPress";
import { resolvePortalPressId } from "./artistPortal";

const personIds: string[] = [];
const albumIds: string[] = [];
const markerName = `t3467_${randomUUID()}`;

async function seedPerson(values: Record<string, unknown>) {
  const id = randomUUID();
  personIds.push(id);
  await db.execute(sql`
    INSERT INTO people (id, name, is_artist_promoted, invited_by_press_id, default_press_id)
    VALUES (
      ${id},
      ${`t3467 ${id.slice(0, 8)}`},
      ${Boolean(values.isArtistPromoted)},
      ${values.invitedByPressId ? String(values.invitedByPressId) : null},
      ${values.defaultPressId ? String(values.defaultPressId) : null}
    )
  `);
  return id;
}

test("creation helper defaults to canonical MRP and preserves another press", async () => {
  const mrpId = await resolveGoodTunesDefaultPressId();
  assert.equal((await withGoodTunesDefaultPress({ name: "Direct" })).defaultPressId, mrpId);
  assert.deepEqual(
    await withGoodTunesDefaultPress({ invitedByPressId: "origin", defaultPressId: "origin" }),
    { invitedByPressId: "origin", defaultPressId: "origin" },
  );
});

test("backfill is safe, GoodTunes-artist-only, marker-guarded, and idempotent", async () => {
  const mrpId = await resolveGoodTunesDefaultPressId();
  const eligible = await seedPerson({ isArtistPromoted: true });
  const attributed = await seedPerson({ isArtistPromoted: true, invitedByPressId: "other-press" });
  const assigned = await seedPerson({ isArtistPromoted: true, defaultPressId: "operator-choice" });
  const contact = await seedPerson({});
  const importedCreditOnly = await seedPerson({});
  const skuPressBacked = await seedPerson({ isArtistPromoted: true });
  const orderPressBacked = await seedPerson({ isArtistPromoted: true });
  const otherPressId = `t3467-other-${randomUUID()}`;
  await db.execute(sql`
    UPDATE people SET roles = ARRAY['Guitar']::text[] WHERE id = ${importedCreditOnly}
  `);
  for (const [personId, suffix] of [
    [skuPressBacked, "sku"],
    [orderPressBacked, "order"],
  ] as const) {
    const albumId = randomUUID();
    albumIds.push(albumId);
    await db.execute(sql`
      INSERT INTO albums (id, title, artist, artwork, primary_artist_id, is_goodtunes_release)
      VALUES (
        ${albumId},
        ${`t3467 ${suffix} press-backed`},
        ${`t3467 ${suffix} press-backed`},
        '/album-placeholder.svg',
        ${personId},
        true
      )
    `);
    if (suffix === "sku") {
      await db.execute(sql`
        INSERT INTO album_skus (id, album_id, format, price_cents, press_id)
        VALUES (${randomUUID()}, ${albumId}, 'vinyl', 3000, ${otherPressId})
      `);
    } else {
      await db.execute(sql`
        INSERT INTO pressing_order_requests
          (id, album_id, status, package_snapshot, quantity, unit_cents, total_cents)
        VALUES (
          ${randomUUID()},
          ${albumId},
          'approved',
          ${JSON.stringify({ pressId: otherPressId })}::jsonb,
          100,
          1000,
          100000
        )
      `);
    }
  }

  await backfillEligibleGoodTunesArtists(markerName);
  assert.equal(await backfillEligibleGoodTunesArtists(markerName), 0);
  assert.equal(await assignGoodTunesDefaultPressAtArtistGrant(skuPressBacked), false);
  assert.equal(await assignGoodTunesDefaultPressAtArtistGrant(orderPressBacked), false);

  const result: any = await db.execute(sql`
    SELECT id, invited_by_press_id, default_press_id
      FROM people
     WHERE id = ANY(${pgArray(personIds)})
  `);
  const rows = new Map(((result as any).rows ?? []).map((row: any) => [row.id, row]));
  assert.equal(rows.get(eligible).default_press_id, mrpId);
  assert.equal(rows.get(attributed).invited_by_press_id, "other-press");
  assert.equal(rows.get(attributed).default_press_id, null);
  assert.equal(rows.get(assigned).default_press_id, "operator-choice");
  assert.equal(rows.get(contact).default_press_id, null);
  assert.equal(rows.get(importedCreditOnly).default_press_id, null);
  assert.equal(rows.get(skuPressBacked).default_press_id, null);
  assert.equal(rows.get(orderPressBacked).default_press_id, null);
  assert.equal(
    resolvePortalPressId(
      {
        artist_invited_press_id: null,
        label_invited_press_id: null,
        artist_default_press_id: rows.get(skuPressBacked).default_press_id,
        label_default_press_id: null,
      },
      [{ press_id: otherPressId }],
    ),
    otherPressId,
  );
});

after(async () => {
  if (albumIds.length) {
    await db.execute(sql`DELETE FROM albums WHERE id = ANY(${pgArray(albumIds)})`);
  }
  if (personIds.length) {
    await db.execute(sql`DELETE FROM people WHERE id = ANY(${pgArray(personIds)})`);
  }
  await db.execute(sql`DELETE FROM post_merge_data_backfills WHERE name = ${markerName}`);
  await pool.end();
});