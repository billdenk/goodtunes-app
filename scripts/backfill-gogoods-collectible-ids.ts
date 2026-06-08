/**
 * Task #1514 — Legacy gogoods.com QR provenance bridge: collectible-id backfill.
 *
 * Fans who bought physical signed GoodDeed certificates in the gogoods.com era
 * hold printed QR codes that point at gogoods.com paths which resolve to
 * nothing today. The resolver (GET /legacy/g/:code in server/certificates.ts)
 * maps an old QR code back to the owned copy and forwards to its current
 * GoodTunes /g/:shortId provenance page.
 *
 * The QR encodes the gogoods `collectible` table's bigserial `id` — the only
 * stable per-copy identifier in the export (the dump also ships the pg_sqids
 * `sqids` schema, a strong hint old public URLs sqids-shortened that id, but no
 * sqids config/data was exported, so we key on the bare integer id; see the
 * migration doc for the verify-against-a-physical-cert caveat). This script
 * stamps `user_albums.legacy_gogoods_collectible_id` so the resolver can join
 * an old code → owned copy → cert.
 *
 * Mapping: each ACTIVE, owned (user_id != 0) collectible resolves to the
 * GoodTunes owned row via the legacy pointers stamped at import time —
 *   customer_users.legacy_gogoods_id  = gogoods user.id
 *   albums.legacy_gogoods_id          = gogoods release.id (uuid)
 *   user_albums.certificate_number    = collectible.index (copy number)
 * The existing user_albums (user_id, album_id) unique index meant the importer
 * kept only the LOWEST-index copy per (fan, album); extra copies have no owned
 * row and therefore no cert — their QR correctly lands on /find-gooddeed.
 *
 * IDEMPOTENT + non-destructive:
 *   - A `post_merge_data_backfills` marker row short-circuits re-runs per DB.
 *   - Only stamps rows where legacy_gogoods_collectible_id IS NULL.
 *   - Gated on gogoods data existing in THIS database: a fresh dev clone with
 *     no import finds nothing, writes nothing, and does NOT stamp the marker
 *     (so it re-checks cheaply on the next merge once data lands).
 *
 * Dev:   npx tsx scripts/backfill-gogoods-collectible-ids.ts
 * Prod:  DATABASE_URL="$PROD_DATABASE_URL" npx tsx scripts/backfill-gogoods-collectible-ids.ts
 */
import AdmZip from "adm-zip";
import path from "path";
import { sql } from "drizzle-orm";
import { db } from "../server/db";

const MARKER = "task_1514_gogoods_collectible_ids";
const ZIP_PATH = path.join(
  process.cwd(),
  "attached_assets",
  "gogoods_export_1779758914784.zip",
);
const COLLECTIBLE_ENTRY = "gogoods_export/collectible.csv";

function parseCsv(text: string): Record<string, string | null>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") {
        row.push(field);
        field = "";
      } else if (c === "\n") {
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
      } else if (c === "\r") {
        // swallow
      } else {
        field += c;
      }
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  const header = rows.shift() ?? [];
  return rows
    .filter((r) => r.length > 1 || (r.length === 1 && r[0] !== ""))
    .map((r) => {
      const obj: Record<string, string | null> = {};
      for (let i = 0; i < header.length; i++) {
        const v = r[i] ?? "";
        obj[header[i]] = v === "" ? null : v;
      }
      return obj;
    });
}

type GCollectible = {
  id: string;
  release_id: string;
  user_id: string;
  index: string;
  status: string;
};

async function main() {
  // 0) Marker table + short-circuit.
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS post_merge_data_backfills (
      name        text PRIMARY KEY,
      applied_at  timestamp NOT NULL DEFAULT now()
    )
  `);
  const marker = await db.execute(
    sql`SELECT 1 FROM post_merge_data_backfills WHERE name = ${MARKER}`,
  );
  if ((marker.rows?.length ?? 0) > 0) {
    console.log(
      `backfill-gogoods-collectible-ids: marker '${MARKER}' present — already applied, skipping`,
    );
    return;
  }

  // 1) Resolve legacy → live id maps from THIS database. If the gogoods import
  //    never ran here (fresh dev clone), these are empty → write nothing, do
  //    NOT stamp the marker.
  const customerRows = (await db.execute(
    sql`SELECT id, legacy_gogoods_id FROM customer_users WHERE legacy_gogoods_id IS NOT NULL`,
  )).rows as { id: string; legacy_gogoods_id: string }[];
  const albumRows = (await db.execute(
    sql`SELECT id, legacy_gogoods_id FROM albums WHERE legacy_gogoods_id IS NOT NULL`,
  )).rows as { id: string; legacy_gogoods_id: string }[];

  if (customerRows.length === 0 || albumRows.length === 0) {
    console.log(
      `backfill-gogoods-collectible-ids: no gogoods import detected in this DB ` +
        `(customers=${customerRows.length}, albums=${albumRows.length}) — nothing to backfill, marker left unset`,
    );
    return;
  }

  const customerByLegacy = new Map(
    customerRows.map((r) => [String(r.legacy_gogoods_id), r.id]),
  );
  const albumByLegacy = new Map(
    albumRows.map((r) => [String(r.legacy_gogoods_id), r.id]),
  );

  // 2) Load owned user_albums keyed by (userId, albumId, certificateNumber).
  const uaRows = (await db.execute(
    sql`SELECT id, user_id, album_id, certificate_number, legacy_gogoods_collectible_id
        FROM user_albums
        WHERE certificate_number IS NOT NULL`,
  )).rows as {
    id: string;
    user_id: string;
    album_id: string;
    certificate_number: number;
    legacy_gogoods_collectible_id: string | null;
  }[];
  const uaByKey = new Map<string, (typeof uaRows)[number]>();
  for (const r of uaRows) {
    uaByKey.set(`${r.user_id}::${r.album_id}::${Number(r.certificate_number)}`, r);
  }

  // 3) Read the gogoods collectible export from the committed zip.
  const zip = new AdmZip(ZIP_PATH);
  const entry = zip.getEntry(COLLECTIBLE_ENTRY);
  if (!entry) {
    throw new Error(`Could not find ${COLLECTIBLE_ENTRY} inside ${ZIP_PATH}`);
  }
  const collectibles = parseCsv(
    entry.getData().toString("utf8"),
  ) as unknown as GCollectible[];

  // 4) Match each owned collectible to its user_albums row. Deterministic on
  //    the lowest collectible id when two collectibles somehow resolve to the
  //    same owned row (kept-lowest-index dedup means this should not happen).
  const toStamp = new Map<string, string>(); // user_albums.id -> collectible.id
  let activeOwned = 0;
  let noOwnedRow = 0;
  let unresolved = 0;
  for (const c of collectibles) {
    if (c.status !== "ACTIVE") continue;
    if (c.user_id === "0") continue;
    activeOwned++;
    const customerId = customerByLegacy.get(String(c.user_id));
    const albumId = albumByLegacy.get(String(c.release_id));
    if (!customerId || !albumId) {
      unresolved++;
      continue;
    }
    const ua = uaByKey.get(`${customerId}::${albumId}::${Number(c.index)}`);
    if (!ua) {
      noOwnedRow++;
      continue;
    }
    if (ua.legacy_gogoods_collectible_id) continue; // already stamped
    const existing = toStamp.get(ua.id);
    if (!existing || Number(c.id) < Number(existing)) toStamp.set(ua.id, c.id);
  }

  // 5) Apply in chunked multi-row updates (prod proxy has a ~5min idle-in-txn
  //    cap; batch so a few thousand updates run in seconds).
  const pairs = [...toStamp.entries()];
  let written = 0;
  const CHUNK = 500;
  for (let i = 0; i < pairs.length; i += CHUNK) {
    const part = pairs.slice(i, i + CHUNK);
    const values = sql.join(
      part.map(([uaId, collId]) => sql`(${uaId}, ${collId})`),
      sql`, `,
    );
    const res = await db.execute(sql`
      UPDATE user_albums AS ua
      SET legacy_gogoods_collectible_id = v.coll_id
      FROM (VALUES ${values}) AS v(ua_id, coll_id)
      WHERE ua.id = v.ua_id
        AND ua.legacy_gogoods_collectible_id IS NULL
    `);
    written += res.rowCount ?? part.length;
  }

  // 6) Stamp the marker.
  await db.execute(
    sql`INSERT INTO post_merge_data_backfills (name) VALUES (${MARKER}) ON CONFLICT (name) DO NOTHING`,
  );

  console.log(
    `backfill-gogoods-collectible-ids: active-owned=${activeOwned} ` +
      `matched+stamped=${written} no-owned-row(extra copies / not minted)=${noOwnedRow} ` +
      `unresolved(customer/album not in this DB)=${unresolved}`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("backfill-gogoods-collectible-ids failed:", e);
    process.exit(1);
  });
