/**
 * Nick Carter "Love Life Tragedy" — mechanical publishing splits backfill.
 *
 * Loads the authoritative songwriter/publisher splits for the pressed
 * GoodTunes releases so the admin Publishing view computes the real
 * mechanical settlement (units PRESSED × $0.127 × publisher share) instead
 * of $0. Source of truth is the attorney's final split sheet
 * (attached_assets/1_LOVE_LIFE_TRAGEDY_:_SONGWRITER_SPLIT_PERCENTAGES_FINAL-1…docx)
 * cross-checked against the publisher workbook
 * (20260116_Nick_Carter_Publishing…xlsx, which totals $1,777.99). The engine's
 * round-once-per-payee math reproduces that total to the penny across 18 payees.
 *
 * Scope (confirmed by Bill):
 *   - Double LP (0da0fccf) tracks 1–16, EXCLUDING the bonus "Take You with Me"
 *     (track 17 — no splits exist anywhere, intentionally left UNSPLIT/flagged).
 *   - The six pressed 7" singles, REAL composition rows only (master-file
 *     artifacts and typo/duplicate rows are excluded by song id below).
 *   - NOT the single-LP edition (4ee3d6b9): it was not pressed in this run.
 *   - 500 units pressed per release (offline run, never went through the
 *     in-app pressing_order_requests pipeline → recorded on
 *     albums.mechanical_units_pressed, the settlement-basis fallback).
 *
 * Administered-by routing: a publisher org carrying pay_to_org_id is CREDITED
 * on the composition but its money ROUTES to the administrator's payout
 * account — "Songs of Kaotic" → "Hipgnosis Songs Group, LLC" and
 * "Songs From Lenwood Music" → "Songs of Kobalt Publishing".
 *
 * IDEMPOTENT + non-destructive:
 *   - A `post_merge_data_backfills` marker row short-circuits re-runs per DB,
 *     so a later operator edit to a split is never clobbered on the next merge.
 *   - Publisher orgs are upserted by name; splits are only inserted for songs
 *     that have NO existing non-deleted split (extra defense alongside the
 *     marker).
 *   - Gated on the in-scope songs existing in THIS database: Nick's catalog is
 *     prod-only, so in dev the script finds nothing, writes nothing, and does
 *     not stamp the marker (keeps dev clean; re-checks cheaply each merge).
 *
 * Dev:   npx tsx scripts/backfill-nick-publishing.ts
 * Prod:  DATABASE_URL="$PROD_DATABASE_URL" npx tsx scripts/backfill-nick-publishing.ts
 */
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "../server/db";
import {
  albums,
  organizations,
  songs,
  trackPublishingSplits,
} from "@shared/schema";

const MARKER = "nick_carter_publishing_splits";
const UNITS_PRESSED = 500;

// In-scope album ids — the pressed releases. 500 units each.
const IN_SCOPE_ALBUM_IDS = [
  "0da0fccf-292f-4259-82d1-f95a59eb45c0", // Double LP
  "fcdf20a5-dc1e-444b-8e42-cbc869539391", // Cold Night single
  "ed620764-1164-42ad-bbd9-39afced5e2a1", // Hurts single
  "50606c9d-3111-424c-9dc0-bbaf5dff1067", // Never Break single
  "90370546-a278-4816-b734-9bc6f26cc29d", // Searchlight single
  "45387672-6d4e-46b5-82f7-0292e0c05406", // Storms single
  "20a7bab1-dcf6-4618-9962-f54f10ac0ea2", // Superman single
];

// Publisher registry. `payTo` names the administrator the money routes to.
type Pub = { pro: string; payTo?: string };
const PUBLISHERS: Record<string, Pub> = {
  "Songs of Kaotic": { pro: "ASCAP", payTo: "Hipgnosis Songs Group, LLC" },
  "Grumblyrumpus Music": { pro: "BMI" },
  "Bear North Music": { pro: "ASCAP" },
  "Carl and Christian Music": { pro: "ASCAP" },
  "Venditto Music": { pro: "ASCAP" },
  "Publishing Designee of Abraham Poythress": { pro: "BMI" },
  "Adrian Porter Publishing": { pro: "ASCAP" },
  "Publishing Designee of John Christian Frasca": { pro: "BMI" },
  "Red Lining Music": { pro: "SESAC" },
  "Songtrust Ave.": { pro: "ASCAP" },
  "Concord Music Publishing ANZ Pty Ltd": { pro: "APRA" },
  "Songs From Lenwood Music": { pro: "BMI", payTo: "Songs of Kobalt Publishing" },
  "God Can't Lie Publishing": { pro: "BMI" },
  "Woody Creek Music": { pro: "GMR" },
  "WC Music Corp": { pro: "BMI" },
  "Skellington Music": { pro: "SESAC" },
  "G Matt Music": { pro: "ASCAP" },
  "Liberty Street Music Publishing Co": { pro: "SESAC" },
};
// Administrator orgs that only RECEIVE (referenced via pay_to_org_id).
const ADMIN_ORGS = ["Hipgnosis Songs Group, LLC", "Songs of Kobalt Publishing"];

// Composition → publisher shares in basis points (each sums to 10000).
type Share = [pub: string, bp: number];
const COMPOSITIONS: Record<string, Share[]> = {
  MADE_FOR_US: [["Songs of Kaotic", 3333], ["Grumblyrumpus Music", 3333], ["Bear North Music", 3334]],
  NOTHING: [["Songs of Kaotic", 3333], ["Grumblyrumpus Music", 3333], ["Bear North Music", 3334]],
  GOOD_LOVE: [["Songs of Kaotic", 3334], ["Carl and Christian Music", 3333], ["Venditto Music", 3333]],
  HEY_KID: [["Songs of Kaotic", 3333], ["Grumblyrumpus Music", 3333], ["Bear North Music", 3334]],
  SEARCHLIGHT: [["Songs of Kaotic", 3333], ["Grumblyrumpus Music", 3333], ["Bear North Music", 3334]],
  NEVER_BREAK: [
    ["Songs of Kaotic", 4000], ["Carl and Christian Music", 1667], ["Venditto Music", 1667],
    ["Publishing Designee of Abraham Poythress", 1666], ["Adrian Porter Publishing", 500],
    ["Publishing Designee of John Christian Frasca", 500],
  ],
  EASY: [
    ["Songs of Kaotic", 3500], ["Carl and Christian Music", 2000], ["Venditto Music", 1500],
    ["Red Lining Music", 2000], ["Songtrust Ave.", 1000],
  ],
  HURTS: [["Songs of Kaotic", 3334], ["Concord Music Publishing ANZ Pty Ltd", 3333], ["Songs From Lenwood Music", 3333]],
  SUPERMAN: [
    ["Songs of Kaotic", 4000], ["Carl and Christian Music", 1667], ["Venditto Music", 1667],
    ["Publishing Designee of Abraham Poythress", 1666], ["Adrian Porter Publishing", 500],
    ["Publishing Designee of John Christian Frasca", 500],
  ],
  DIRTY_LAUNDRY: [["Woody Creek Music", 5000], ["WC Music Corp", 5000]],
  WILD_HEART: [
    ["Songs of Kaotic", 2375], ["Carl and Christian Music", 2375], ["Venditto Music", 2375],
    ["Publishing Designee of Abraham Poythress", 2375], ["Skellington Music", 500],
  ],
  COLD_ZERO: [["Songs of Kaotic", 3333], ["Carl and Christian Music", 3334], ["God Can't Lie Publishing", 3333]],
  STORMS: [["Songs of Kaotic", 3333], ["Grumblyrumpus Music", 3333], ["Bear North Music", 3334]],
  DONT_LET_GO: [["Songs of Kaotic", 3333], ["Grumblyrumpus Music", 3333], ["Bear North Music", 3334]],
  COLD_WINTER: [["Songs of Kaotic", 3333], ["Carl and Christian Music", 3334], ["God Can't Lie Publishing", 3333]],
  HELP_ME: [["G Matt Music", 5000], ["Liberty Street Music Publishing Co", 5000]],
};

// In-scope song id → composition. Double LP tracks 1–16 + the six singles'
// real composition rows. Duplicate / master-file / bonus rows are omitted.
const SONG_COMPOSITION: Record<string, keyof typeof COMPOSITIONS> = {
  // Double LP 0da0fccf, tracks 1–16 (track 17 bonus excluded)
  "ebf1a4f1-40c0-4a12-8965-b67b5e835c1a": "MADE_FOR_US",
  "d4f1f5ed-37c0-4960-8d65-e2f797514511": "NOTHING",
  "0fc7a5ed-f50d-4b43-b7f6-933c4fe03449": "GOOD_LOVE",
  "41e9228f-6345-4c33-b3c2-20d9538b310e": "HEY_KID",
  "0ff08902-c287-4d49-ba4e-5e18ace0a36c": "SEARCHLIGHT",
  "5fba1567-6e89-4064-baa1-a0f7ed8cca57": "NEVER_BREAK",
  "efc6315c-26a9-44ad-89f7-5b3534a350f4": "EASY",
  "539bb873-ece3-48a2-ba8c-b756bfaa8059": "HURTS",
  "5d39b48d-2838-429c-9356-c168442b45b5": "SUPERMAN",
  "b51f43f9-788c-42a1-923a-dc955f005b1f": "DIRTY_LAUNDRY",
  "e6cf8c5e-f514-4a20-a93d-b64c44687bf7": "WILD_HEART",
  "e8353bc0-d5e1-464f-8a09-c3ac76c2bef8": "COLD_ZERO",
  "42ef2996-fc0a-43f0-af4d-f277c45a49b7": "STORMS",
  "d21b2f55-0bc6-4a8d-835e-2f81efe80f54": "DONT_LET_GO",
  "fa327de3-22c3-4d9b-8a72-cfc388e3a2ec": "COLD_WINTER",
  "c386627e-e0d4-4c84-b97a-c1b78e00e4d1": "HELP_ME",
  // Singles (A/B sides, real composition rows only)
  "46fcc5de-b364-4bd8-ab3e-9518d65c68a9": "MADE_FOR_US",   // Superman single B
  "2b03946b-565d-4fae-99be-86dda690befe": "NOTHING",       // Never Break single B
  "e2da2113-8227-426c-8ddd-89935150eaa9": "HEY_KID",       // Hurts single B
  "3667b6d2-ebec-4c3a-af96-7f29895559e1": "SEARCHLIGHT",   // Searchlight single A
  "83ae7c9b-d0dd-49b7-8c4a-bab572377a5a": "NEVER_BREAK",   // Never Break single A
  "99c15f90-592d-4342-ac5c-c0b18de98ed5": "HURTS",         // Hurts single A (Remastered)
  "9189b881-effc-458a-9b7d-15b7e2ac8338": "SUPERMAN",      // Superman single A
  "441dc3b9-bfba-448b-a125-62b012863bcc": "WILD_HEART",    // Storms single B
  "5c6dd3a3-fc29-422f-a8e0-6c7b58d9854c": "COLD_ZERO",     // Cold Night single B
  "a5897fab-91ba-4213-8ea7-ef2eca6f1491": "STORMS",        // Storms single A
  "3170fb94-2030-45e3-995d-4b1ebeb11b8f": "DONT_LET_GO",   // Searchlight single B
  "db498c4d-0e53-4dc6-a2e7-f96cc8b38268": "COLD_WINTER",   // Cold Night single A
};

async function main() {
  // Validate every composition sums to 100% before touching the DB.
  for (const [comp, shares] of Object.entries(COMPOSITIONS)) {
    const total = shares.reduce((a, [, bp]) => a + bp, 0);
    if (total !== 10000) throw new Error(`Composition ${comp} sums to ${total} bp, expected 10000`);
  }

  const songIds = Object.keys(SONG_COMPOSITION);

  // Gate: only run where the in-scope songs actually exist (prod). Nick's
  // catalog is prod-only, so in dev this finds nothing and we exit cleanly.
  const present = await db
    .select({ id: songs.id })
    .from(songs)
    .where(inArray(songs.id, songIds));
  const presentIds = new Set(present.map((s) => s.id));
  if (presentIds.size === 0) {
    console.log("backfill-nick-publishing: no in-scope songs in this DB (expected in dev) — nothing to do");
    return;
  }
  if (presentIds.size !== songIds.length) {
    console.warn(
      `backfill-nick-publishing: WARNING — ${songIds.length - presentIds.size} in-scope song id(s) not found in this DB; ` +
        `attaching splits only to the ${presentIds.size} present.`,
    );
  }

  // Marker short-circuit (per DB).
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS post_merge_data_backfills (
      name       text PRIMARY KEY,
      applied_at timestamp NOT NULL DEFAULT now()
    )`);
  const marker = await db.execute(
    sql`SELECT 1 FROM post_merge_data_backfills WHERE name = ${MARKER}`,
  );
  if ((marker.rows?.length ?? 0) > 0) {
    console.log(`backfill-nick-publishing: marker '${MARKER}' present — already applied, skipping`);
    return;
  }

  // 1) Upsert publisher + administrator orgs by name; capture ids.
  const allOrgNames = [...Object.keys(PUBLISHERS), ...ADMIN_ORGS];
  const existingOrgs = await db
    .select({ id: organizations.id, name: organizations.name })
    .from(organizations)
    .where(inArray(organizations.name, allOrgNames));
  const orgIdByName = new Map(existingOrgs.map((o) => [o.name, o.id]));
  let orgsCreated = 0;
  for (const name of allOrgNames) {
    if (orgIdByName.has(name)) continue;
    const [row] = await db
      .insert(organizations)
      .values({ name, kind: "publisher" })
      .returning({ id: organizations.id });
    orgIdByName.set(name, row.id);
    orgsCreated += 1;
  }

  // 2) Administered-by routing on the credited publisher org.
  for (const [name, pub] of Object.entries(PUBLISHERS)) {
    if (!pub.payTo) continue;
    const orgId = orgIdByName.get(name)!;
    const payToId = orgIdByName.get(pub.payTo)!;
    await db.update(organizations).set({ payToOrgId: payToId }).where(eq(organizations.id, orgId));
  }

  // 3) Record the offline pressing run (500 units) on each in-scope album.
  await db
    .update(albums)
    .set({ mechanicalUnitsPressed: UNITS_PRESSED })
    .where(inArray(albums.id, IN_SCOPE_ALBUM_IDS));

  // 4) Insert publishing splits per in-scope song (skip songs that already
  //    carry a non-deleted split — defense alongside the marker).
  const existingSplitSongs = await db
    .selectDistinct({ songId: trackPublishingSplits.songId })
    .from(trackPublishingSplits)
    .where(and(inArray(trackPublishingSplits.songId, songIds), isNull(trackPublishingSplits.deletedAt)));
  const alreadySplit = new Set(existingSplitSongs.map((s) => s.songId));

  let splitsInserted = 0;
  let songsSplit = 0;
  for (const [songId, comp] of Object.entries(SONG_COMPOSITION)) {
    if (!presentIds.has(songId) || alreadySplit.has(songId)) continue;
    const rows = COMPOSITIONS[comp].map(([pub, bp], i) => ({
      songId,
      organizationId: orgIdByName.get(pub)!,
      name: pub,
      role: "Publisher",
      proAffiliation: PUBLISHERS[pub].pro,
      percentBp: bp,
      position: i,
    }));
    await db.insert(trackPublishingSplits).values(rows);
    splitsInserted += rows.length;
    songsSplit += 1;
  }

  // 5) Stamp the marker.
  await db.execute(
    sql`INSERT INTO post_merge_data_backfills (name) VALUES (${MARKER}) ON CONFLICT (name) DO NOTHING`,
  );

  console.log(
    `backfill-nick-publishing: applied — ${orgsCreated} org(s) created, ${songsSplit} song(s) split, ` +
      `${splitsInserted} split row(s) inserted, ${IN_SCOPE_ALBUM_IDS.length} album(s) set to ${UNITS_PRESSED} units.`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("backfill-nick-publishing: FAILED", err);
    process.exit(1);
  });
