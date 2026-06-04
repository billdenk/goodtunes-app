/**
 * Task #398 — Import the gogoods.com PostgreSQL export into GoodTunes.
 *
 *   tsx scripts/import-gogoods.ts                            # DRY RUN
 *   tsx scripts/import-gogoods.ts --apply                    # actually write
 *   tsx scripts/import-gogoods.ts --dir /path/to/csv-folder  # default: /tmp/gogoods_export/gogoods_export
 *
 * Eight CSVs (artist, artist_release, release, recording, user, collectible,
 * collectible_transaction, collectible_transaction_collectible) are parsed
 * into memory, validated, and walked into GoodTunes tables. Every write is
 * keyed on `legacy_gogoods_id` (or canonical (artist,title) for album
 * dedup, lowercased email for fan dedup) so the script is a no-op on a
 * second run.
 *
 * Out of scope (separate follow-up tasks):
 *   • Re-host tinifycdn.com images into Object Storage (covers/icons stay
 *     pointed at tinify URLs; importer marks each one with a note).
 *   • Reconcile/relink Mux assets — songs land with the legacy stream_id
 *     copied in and `muxStatus='preparing'` so the existing boot reconcile
 *     sweep claims them.
 *   • Singles / standalone Video releases — imported as hidden albums
 *     with `isGoodTunesRelease=false`. Promotion is editorial.
 *
 * The script writes a Markdown report to
 * `docs/migrations/gogoods-import-<YYYY-MM-DD>.md` summarising creates,
 * dedupes, and skips. The Markdown file is generated on apply runs only.
 */
import fs from "node:fs";
import path from "node:path";
import { sql, eq } from "drizzle-orm";
import { db } from "../server/db";
import {
  people,
  albums,
  songs,
  albumVideos,
  customerUsers,
  userAlbums,
  orders,
} from "../shared/schema";

// ── CLI ────────────────────────────────────────────────────────────────────
const APPLY = process.argv.includes("--apply");
function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(name);
  if (i === -1) return fallback;
  const v = process.argv[i + 1];
  if (!v || v.startsWith("--")) return fallback;
  return v;
}
const DIR = path.resolve(arg("--dir", "/tmp/gogoods_export/gogoods_export"));

// ── Minimal CSV parser (handles quoted fields with embedded newlines + "" escape) ──
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

function readCsv(name: string): Record<string, string | null>[] {
  const p = path.join(DIR, `${name}.csv`);
  return parseCsv(fs.readFileSync(p, "utf8"));
}

// ── Types matching the gogoods CSV shapes ─────────────────────────────────
type GArtist = {
  id: string;
  apple_id: string | null;
  description: string | null;
  cover: string | null;
  icon: string | null;
  name: string;
  status: string;
};
type GArtistRelease = { artist_id: string; release_id: string; index: string };
type GRelease = {
  id: string;
  cover: string | null;
  duration: string | null;
  title: string;
  description: string | null;
  genre: string | null;
  isrc: string | null;
  released_at: string | null;
  type: string;
  status: string;
  price: string | null;
  currency: string | null;
};
type GRecording = {
  id: string;
  release_id: string;
  type: string;
  title: string;
  index: string;
  duration: string;
  source_url: string | null;
  source_preview_url: string | null;
  stream_id: string | null;
  stream_preview_id: string | null;
};
type GUser = {
  id: string;
  email: string;
  cognito_id: string | null;
  first_name: string | null;
  last_name: string | null;
  status: string;
  created_at: string | null;
};
type GCollectible = {
  id: string;
  release_id: string;
  user_id: string;
  index: string;
  status: string;
  created_at: string | null;
};
type GTxn = {
  id: string;
  payment_id: string | null;
  user_id: string;
  release_id: string;
  payment_status: string;
  amount_cents: string;
  quantity: string;
  total_amount_cents: string;
  currency: string;
  created_at: string | null;
};
type GTxnColl = { collectible_transaction_id: string; collectible_id: string };

const norm = (s: string | null | undefined) =>
  (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");

function parseTs(s: string | null): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return Number.isFinite(d.getTime()) ? d : null;
}

function mapReleaseType(t: string): "LP" | "EP" | "Single" {
  if (t === "ALBUM") return "LP";
  if (t === "EP") return "EP";
  return "Single";
}

// ── Report harness ─────────────────────────────────────────────────────────
type ReportLine = { kind: string; detail: string };
const report = {
  artistsCreate: [] as ReportLine[],
  artistsExisting: [] as ReportLine[],
  albumsCreate: [] as ReportLine[],
  albumsDedupe: [] as ReportLine[],
  albumsHiddenNonRelease: [] as ReportLine[],
  albumsSuspectedDup: [] as ReportLine[],
  songsCreate: [] as ReportLine[],
  songsSkipped: [] as ReportLine[],
  videosCreate: [] as ReportLine[],
  customersCreate: [] as ReportLine[],
  customersExisting: [] as ReportLine[],
  userAlbumsCreate: [] as ReportLine[],
  userAlbumsSkipped: [] as ReportLine[],
  ordersCreate: [] as ReportLine[],
  ordersSkipped: [] as ReportLine[],
  warnings: [] as ReportLine[],
};

// ── Main ───────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n${APPLY ? "🟢 APPLY" : "🟡 DRY RUN"} — dir=${DIR}\n`);
  if (!fs.existsSync(DIR)) {
    console.error(`❌ CSV folder not found: ${DIR}`);
    process.exit(2);
  }

  const gArtists = readCsv("artist") as unknown as GArtist[];
  const gArtistReleases = readCsv("artist_release") as unknown as GArtistRelease[];
  const gReleases = readCsv("release") as unknown as GRelease[];
  const gRecordings = readCsv("recording") as unknown as GRecording[];
  const gUsers = readCsv("user") as unknown as GUser[];
  const gCollectibles = readCsv("collectible") as unknown as GCollectible[];
  const gTxns = readCsv("collectible_transaction") as unknown as GTxn[];
  const gTxnColls = readCsv(
    "collectible_transaction_collectible",
  ) as unknown as GTxnColl[];

  console.log(
    `  parsed: artists=${gArtists.length} artist_release=${gArtistReleases.length} ` +
      `releases=${gReleases.length} recordings=${gRecordings.length} ` +
      `users=${gUsers.length} collectibles=${gCollectibles.length} ` +
      `txns=${gTxns.length} txn_coll=${gTxnColls.length}\n`,
  );

  // Referential-integrity validation.
  const releaseIds = new Set(gReleases.map((r) => r.id));
  const artistIds = new Set(gArtists.map((a) => a.id));
  const userIds = new Set(gUsers.map((u) => u.id));
  const collIds = new Set(gCollectibles.map((c) => c.id));
  const txnIds = new Set(gTxns.map((t) => t.id));

  for (const ar of gArtistReleases) {
    if (!artistIds.has(ar.artist_id))
      report.warnings.push({
        kind: "ref",
        detail: `artist_release → unknown artist_id=${ar.artist_id}`,
      });
    if (!releaseIds.has(ar.release_id))
      report.warnings.push({
        kind: "ref",
        detail: `artist_release → unknown release_id=${ar.release_id}`,
      });
  }
  for (const r of gRecordings) {
    if (!releaseIds.has(r.release_id))
      report.warnings.push({
        kind: "ref",
        detail: `recording#${r.id} → unknown release_id=${r.release_id}`,
      });
  }
  for (const c of gCollectibles) {
    if (!releaseIds.has(c.release_id))
      report.warnings.push({
        kind: "ref",
        detail: `collectible#${c.id} → unknown release_id=${c.release_id}`,
      });
    if (c.user_id !== "0" && !userIds.has(c.user_id))
      report.warnings.push({
        kind: "ref",
        detail: `collectible#${c.id} → unknown user_id=${c.user_id}`,
      });
  }
  for (const tc of gTxnColls) {
    if (!txnIds.has(tc.collectible_transaction_id))
      report.warnings.push({
        kind: "ref",
        detail: `txn_coll → unknown txn_id=${tc.collectible_transaction_id}`,
      });
    if (!collIds.has(tc.collectible_id))
      report.warnings.push({
        kind: "ref",
        detail: `txn_coll → unknown collectible_id=${tc.collectible_id}`,
      });
  }

  // Build lookups.
  // Primary artist = the artist_release row with the lowest `index` for a
  // release. Most rows use 0 but a handful (single-artist releases that
  // were edited in-place) only have index=1+, so picking strictly "0"
  // mis-labels them as Unknown Artist.
  const primaryArtistIdxByRelease = new Map<string, number>();
  const primaryArtistByRelease = new Map<string, string>();
  for (const ar of gArtistReleases) {
    const n = Number(ar.index);
    const cur = primaryArtistIdxByRelease.get(ar.release_id);
    if (cur === undefined || n < cur) {
      primaryArtistIdxByRelease.set(ar.release_id, n);
      primaryArtistByRelease.set(ar.release_id, ar.artist_id);
    }
  }
  const releaseById = new Map(gReleases.map((r) => [r.id, r]));
  const artistById = new Map(gArtists.map((a) => [a.id, a]));
  const userById = new Map(gUsers.map((u) => [u.id, u]));
  const collById = new Map(gCollectibles.map((c) => [c.id, c]));
  const collsByTxn = new Map<string, GCollectible[]>();
  for (const tc of gTxnColls) {
    const c = collById.get(tc.collectible_id);
    if (!c) continue;
    const list = collsByTxn.get(tc.collectible_transaction_id) ?? [];
    list.push(c);
    collsByTxn.set(tc.collectible_transaction_id, list);
  }

  // Suspected within-export album duplicates (same artist+title, different
  // release_id) — surface for operator review, don't auto-collapse.
  const byKey = new Map<string, GRelease[]>();
  for (const r of gReleases) {
    const aId = primaryArtistByRelease.get(r.id);
    const aName = aId ? artistById.get(aId)?.name ?? "?" : "?";
    const k = `${norm(aName)}::${norm(r.title)}`;
    const list = byKey.get(k) ?? [];
    list.push(r);
    byKey.set(k, list);
  }
  for (const [k, list] of byKey) {
    if (list.length > 1) {
      report.albumsSuspectedDup.push({
        kind: "dup",
        detail: `${k}  →  ${list.map((r) => `${r.id} (${r.type})`).join(" | ")}`,
      });
    }
  }

  // ── Pre-load existing GoodTunes state ────────────────────────────────────
  const existingAlbums = await db
    .select({
      id: albums.id,
      title: albums.title,
      artist: albums.artist,
      legacyGogoodsId: albums.legacyGogoodsId,
    })
    .from(albums);
  const albumByLegacy = new Map<string, string>();
  const albumByKey = new Map<string, string>();
  for (const a of existingAlbums) {
    if (a.legacyGogoodsId) albumByLegacy.set(a.legacyGogoodsId, a.id);
    albumByKey.set(`${norm(a.artist)}::${norm(a.title)}`, a.id);
  }

  const existingPeople = await db
    .select({
      id: people.id,
      name: people.name,
      legacyGogoodsId: people.legacyGogoodsId,
    })
    .from(people);
  const personByLegacy = new Map<string, string>();
  const personByName = new Map<string, string>();
  for (const p of existingPeople) {
    if (p.legacyGogoodsId) personByLegacy.set(p.legacyGogoodsId, p.id);
    if (!personByName.has(norm(p.name))) personByName.set(norm(p.name), p.id);
  }

  const existingCustomers = await db
    .select({
      id: customerUsers.id,
      email: customerUsers.email,
      username: customerUsers.username,
      legacyGogoodsId: customerUsers.legacyGogoodsId,
    })
    .from(customerUsers);
  const customerByLegacy = new Map<string, string>();
  const customerByEmail = new Map<string, string>();
  const usedUsernames = new Set<string>();
  for (const c of existingCustomers) {
    if (c.legacyGogoodsId) customerByLegacy.set(c.legacyGogoodsId, c.id);
    customerByEmail.set(c.email.toLowerCase(), c.id);
    usedUsernames.add(c.username.toLowerCase());
  }

  const existingOrders = await db
    .select({ id: orders.id, legacyGogoodsId: orders.legacyGogoodsId })
    .from(orders);
  const orderByLegacy = new Map<string, string>();
  for (const o of existingOrders) {
    if (o.legacyGogoodsId) orderByLegacy.set(o.legacyGogoodsId, o.id);
  }

  // ── PEOPLE plan ──────────────────────────────────────────────────────────
  type PlannedPerson = {
    legacyId: string;
    name: string;
    bio: string | null;
    photoUrl: string | null;
    coverUrl: string | null;
    existingId?: string;
  };
  const peoplePlan: PlannedPerson[] = [];
  for (const a of gArtists) {
    const existingId =
      personByLegacy.get(a.id) ?? personByName.get(norm(a.name));
    const plan: PlannedPerson = {
      legacyId: a.id,
      name: a.name.trim(),
      bio: a.description || null,
      photoUrl: a.icon || a.cover || null,
      coverUrl: a.cover || null,
      existingId,
    };
    peoplePlan.push(plan);
    if (existingId) {
      report.artistsExisting.push({
        kind: "existing",
        detail: `${a.name} (legacy#${a.id}) — matches GT person ${existingId}; will stamp legacyId`,
      });
    } else {
      report.artistsCreate.push({
        kind: "create",
        detail: `${a.name} (legacy#${a.id}, status=${a.status})`,
      });
    }
  }

  // ── ALBUMS plan ──────────────────────────────────────────────────────────
  type PlannedAlbum = {
    legacyId: string;
    title: string;
    artistName: string;
    primaryArtistLegacyId?: string;
    cover: string | null;
    description: string | null;
    genre: string | null;
    isrc: string | null;
    releasedAt: string | null;
    type: "LP" | "EP" | "Single";
    isGoodTunesRelease: boolean;
    isHidden: boolean;
    existingId?: string;
    sourceType: string;
  };
  const albumsPlan: PlannedAlbum[] = [];
  for (const r of gReleases) {
    const primaryArtistLegacyId = primaryArtistByRelease.get(r.id);
    const artistName = primaryArtistLegacyId
      ? artistById.get(primaryArtistLegacyId)?.name ?? "Unknown Artist"
      : "Unknown Artist";
    const isAudioRelease = r.type === "ALBUM" || r.type === "EP";
    const existingId =
      albumByLegacy.get(r.id) ?? albumByKey.get(`${norm(artistName)}::${norm(r.title)}`);
    const plan: PlannedAlbum = {
      legacyId: r.id,
      title: r.title.trim(),
      artistName: artistName.trim(),
      primaryArtistLegacyId,
      cover: r.cover || null,
      description: r.description || null,
      genre: r.genre || null,
      isrc: r.isrc || null,
      releasedAt: r.released_at ? r.released_at.slice(0, 10) : null,
      type: mapReleaseType(r.type),
      isGoodTunesRelease: isAudioRelease,
      isHidden: !isAudioRelease,
      existingId,
      sourceType: r.type,
    };
    albumsPlan.push(plan);
    if (existingId) {
      report.albumsDedupe.push({
        kind: "dedupe",
        detail: `${artistName} — ${r.title}  (legacy#${r.id} → GT album ${existingId})`,
      });
    } else if (!isAudioRelease) {
      report.albumsHiddenNonRelease.push({
        kind: "hidden",
        detail: `${artistName} — ${r.title}  [${r.type}, hidden + isGoodTunesRelease=false]`,
      });
    } else {
      report.albumsCreate.push({
        kind: "create",
        detail: `${artistName} — ${r.title}  (legacy#${r.id}, ${r.type}→${plan.type})`,
      });
    }
  }

  // ── SONGS + VIDEOS plan (depends on album resolution after apply) ────────
  let plannedAudio = 0;
  let plannedVideo = 0;
  for (const rec of gRecordings) {
    if (rec.type === "AUDIO") plannedAudio++;
    else if (rec.type === "VIDEO") plannedVideo++;
  }

  // ── CUSTOMERS plan ───────────────────────────────────────────────────────
  type PlannedCustomer = {
    legacyId: string;
    email: string;
    displayName: string;
    realName: string | null;
    createdAt: Date | null;
    existingId?: string;
  };
  const customersPlan: PlannedCustomer[] = [];
  for (const u of gUsers) {
    if (u.id === "0") continue;
    if (!u.cognito_id) continue; // skip non-cognito legacy rows per task spec
    const email = (u.email || "").trim().toLowerCase();
    if (!email) continue;
    const existingId =
      customerByLegacy.get(u.id) ?? customerByEmail.get(email);
    const display =
      [u.first_name, u.last_name].filter(Boolean).join(" ").trim() ||
      email.split("@")[0];
    customersPlan.push({
      legacyId: u.id,
      email,
      displayName: display,
      realName: [u.first_name, u.last_name].filter(Boolean).join(" ").trim() || null,
      createdAt: parseTs(u.created_at),
      existingId,
    });
    if (existingId) {
      report.customersExisting.push({
        kind: "existing",
        detail: `${email} (legacy#${u.id}) — matches GT customer ${existingId}; will stamp legacyId`,
      });
    } else {
      report.customersCreate.push({
        kind: "create",
        detail: `${email} (legacy#${u.id})`,
      });
    }
  }

  // ── COLLECTIBLES plan ────────────────────────────────────────────────────
  // Filtered to ACTIVE + owned-by-real-user; resolution to (customer, album)
  // happens at apply time when ids exist.
  let plannedUserAlbums = 0;
  const ownedByUserAlbum = new Map<string, GCollectible>(); // key=`${legacyUserId}::${legacyReleaseId}`
  for (const c of gCollectibles) {
    if (c.status !== "ACTIVE") {
      report.userAlbumsSkipped.push({
        kind: "skip",
        detail: `collectible#${c.id} status=${c.status}`,
      });
      continue;
    }
    if (c.user_id === "0") {
      report.userAlbumsSkipped.push({
        kind: "skip",
        detail: `collectible#${c.id} user_id=0 (reserved inventory)`,
      });
      continue;
    }
    const k = `${c.user_id}::${c.release_id}`;
    const existing = ownedByUserAlbum.get(k);
    // Enforce existing user_albums (userId, albumId) uniqueness — keep the
    // lowest index. Matches the schema's unique index.
    if (existing) {
      if (Number(c.index) < Number(existing.index)) ownedByUserAlbum.set(k, c);
      continue;
    }
    ownedByUserAlbum.set(k, c);
    plannedUserAlbums++;
  }

  // ── ORDERS plan ──────────────────────────────────────────────────────────
  let plannedOrders = 0;
  for (const t of gTxns) {
    if (t.payment_status !== "complete") {
      report.ordersSkipped.push({
        kind: "skip",
        detail: `txn#${t.id} status=${t.payment_status}`,
      });
      continue;
    }
    if (t.user_id === "0" || !userById.has(t.user_id)) {
      report.ordersSkipped.push({
        kind: "skip",
        detail: `txn#${t.id} user_id=${t.user_id} (no fan)`,
      });
      continue;
    }
    if (!releaseIds.has(t.release_id)) {
      report.ordersSkipped.push({
        kind: "skip",
        detail: `txn#${t.id} unknown release`,
      });
      continue;
    }
    plannedOrders++;
  }

  // ── Print plan ───────────────────────────────────────────────────────────
  console.log(`── PLAN ──`);
  console.log(
    `  People:     create=${report.artistsCreate.length}  existing-link=${report.artistsExisting.length}`,
  );
  console.log(
    `  Albums:     create=${report.albumsCreate.length}  dedupe=${report.albumsDedupe.length}  hidden(non-release)=${report.albumsHiddenNonRelease.length}  suspected-within-export-dups=${report.albumsSuspectedDup.length}`,
  );
  console.log(
    `  Songs:      audio=${plannedAudio}  video=${plannedVideo}`,
  );
  console.log(
    `  Customers:  create=${report.customersCreate.length}  existing-link=${report.customersExisting.length}`,
  );
  console.log(`  UserAlbums: create=${plannedUserAlbums}  skipped=${report.userAlbumsSkipped.length}`);
  console.log(`  Orders:     create=${plannedOrders}  skipped=${report.ordersSkipped.length}`);
  if (report.warnings.length) {
    console.log(`\n  ⚠️  ${report.warnings.length} referential warning(s):`);
    for (const w of report.warnings.slice(0, 20))
      console.log(`     • ${w.detail}`);
    if (report.warnings.length > 20)
      console.log(`     … and ${report.warnings.length - 20} more`);
  }

  if (report.albumsCreate.length) {
    console.log(`\n── Albums to CREATE (${report.albumsCreate.length}) ──`);
    for (const a of report.albumsCreate) console.log(`  + ${a.detail}`);
  }
  if (report.albumsDedupe.length) {
    console.log(`\n── Albums to DEDUPE onto existing GT row (${report.albumsDedupe.length}) ──`);
    for (const a of report.albumsDedupe) console.log(`  ~ ${a.detail}`);
  }
  if (report.albumsSuspectedDup.length) {
    console.log(`\n── Within-export suspected duplicates (operator review) ──`);
    for (const a of report.albumsSuspectedDup) console.log(`  ? ${a.detail}`);
  }

  if (!APPLY) {
    console.log(`\n🟡 DRY RUN — no DB writes. Re-run with --apply.\n`);
    return;
  }

  // ── APPLY ────────────────────────────────────────────────────────────────
  console.log(`\n🟢 APPLY — writing to DB (transaction)…\n`);

  // Bulk inserts are batched into multi-row statements. The prod DB sits behind
  // a proxy with a ~68ms round-trip and a 5-minute idle-in-transaction cap, so
  // ~9,000 sequential single-row inserts (the naive path) run ~10min and get
  // torn down mid-transaction. Chunked multi-row inserts cut that to seconds.
  const chunk = <T>(arr: T[], n: number): T[][] => {
    const out: T[][] = [];
    for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
    return out;
  };

  const personLegacyToId = new Map<string, string>();
  const albumLegacyToId = new Map<string, string>();
  const customerLegacyToId = new Map<string, string>();
  const songLegacyToId = new Map<string, string>();

  await db.transaction(async (tx) => {
    // 1. People
    for (const p of peoplePlan) {
      if (p.existingId) {
        await tx
          .update(people)
          .set({ legacyGogoodsId: p.legacyId })
          .where(eq(people.id, p.existingId));
        personLegacyToId.set(p.legacyId, p.existingId);
      } else {
        const [created] = await tx
          .insert(people)
          .values({
            name: p.name,
            bio: p.bio,
            photoUrl: p.photoUrl,
            coverUrl: p.coverUrl,
            // Lock photos so the rehost follow-up is the only thing that
            // overwrites them — and the design-system auto-enrichment
            // jobs skip them.
            photoLocked: true,
            coverLocked: true,
            legacyGogoodsId: p.legacyId,
          } as any)
          .returning();
        personLegacyToId.set(p.legacyId, created.id);
      }
    }

    // 2. Albums
    for (const a of albumsPlan) {
      const primaryArtistId = a.primaryArtistLegacyId
        ? personLegacyToId.get(a.primaryArtistLegacyId)
        : undefined;
      if (a.existingId) {
        // Only stamp legacy id; do not overwrite curated fields.
        await tx
          .update(albums)
          .set({ legacyGogoodsId: a.legacyId })
          .where(eq(albums.id, a.existingId));
        albumLegacyToId.set(a.legacyId, a.existingId);
      } else {
        const [created] = await tx
          .insert(albums)
          .values({
            title: a.title,
            artist: a.artistName,
            artwork: a.cover ?? "",
            year: a.releasedAt ? Number(a.releasedAt.slice(0, 4)) : null,
            type: a.type,
            description: a.description,
            goodTunesReleaseDate: a.releasedAt,
            genre: a.genre,
            primaryArtistId: primaryArtistId ?? null,
            isHidden: a.isHidden,
            isGoodTunesRelease: a.isGoodTunesRelease,
            sellMode: "direct",
            legacyGogoodsId: a.legacyId,
          } as any)
          .returning();
        albumLegacyToId.set(a.legacyId, created.id);
      }
    }

    // 3. Songs + videos. For each recording, resolve to its album. If the
    //    album was deduped onto an existing GT album, only add the legacy
    //    song row when there isn't already a song with the same title
    //    (case-insensitive) — protects manually-added song rows.
    const existingSongsByAlbum = new Map<string, Set<string>>(); // albumId → set of normName(title)
    const existingSongIdByLegacy = new Map<string, string>();
    {
      const allSongs = await tx
        .select({
          id: songs.id,
          albumId: songs.albumId,
          title: songs.title,
          legacyGogoodsId: songs.legacyGogoodsId,
        })
        .from(songs);
      for (const s of allSongs) {
        const set = existingSongsByAlbum.get(s.albumId) ?? new Set<string>();
        set.add(norm(s.title));
        existingSongsByAlbum.set(s.albumId, set);
        if (s.legacyGogoodsId) existingSongIdByLegacy.set(s.legacyGogoodsId, s.id);
      }
    }

    const audioByRelease = new Map<string, GRecording[]>();
    const videoByRelease = new Map<string, GRecording[]>();
    for (const r of gRecordings) {
      if (!releaseIds.has(r.release_id)) continue;
      const target = r.type === "AUDIO" ? audioByRelease : videoByRelease;
      const list = target.get(r.release_id) ?? [];
      list.push(r);
      target.set(r.release_id, list);
    }

    const songInserts: any[] = [];
    for (const [releaseId, list] of audioByRelease) {
      const albumId = albumLegacyToId.get(releaseId);
      if (!albumId) continue;
      const seenTitles =
        existingSongsByAlbum.get(albumId) ?? new Set<string>();
      const sorted = [...list].sort(
        (a, b) => Number(a.index) - Number(b.index),
      );
      // Decide track-number mode ONCE per album:
      //  • fresh album (no pre-existing songs) → trust the gogoods
      //    `recording.index` exactly, so track ordering stays faithful
      //    to the source.
      //  • append mode (album was deduped onto a pre-existing GT album
      //    with its own songs) → start above the highest existing track
      //    number and increment, so we never collide with curated tracks.
      const appendMode = seenTitles.size > 0;
      let nextTrack = 0;
      const usedTracks = new Set<number>();
      if (appendMode) {
        const rows = await tx
          .select({ trackNumber: songs.trackNumber })
          .from(songs)
          .where(eq(songs.albumId, albumId));
        for (const r of rows) {
          nextTrack = Math.max(nextTrack, r.trackNumber);
          usedTracks.add(r.trackNumber);
        }
      }
      for (const rec of sorted) {
        if (existingSongIdByLegacy.has(rec.id)) {
          songLegacyToId.set(rec.id, existingSongIdByLegacy.get(rec.id)!);
          continue;
        }
        if (seenTitles.has(norm(rec.title))) {
          report.songsSkipped.push({
            kind: "skip",
            detail: `song "${rec.title}" already on album ${albumId}`,
          });
          continue;
        }
        // Source-fidelity track number with collision safety. In fresh-
        // album mode we trust `recording.index`; one gogoods release
        // ("Rec Collection: The Best of Rec 2007-2020") has a duplicate
        // index 12, so if the desired slot is already taken bump to the
        // next free integer instead of letting two songs share a track.
        let desired = appendMode ? ++nextTrack : Number(rec.index);
        while (usedTracks.has(desired)) desired++;
        usedTracks.add(desired);
        if (!appendMode) nextTrack = Math.max(nextTrack, desired);
        const trackNumber = desired;
        // songLegacyToId is never read downstream, so we don't need the
        // generated id back — collect and batch-insert below.
        songInserts.push({
          albumId,
          title: rec.title.trim(),
          trackNumber,
          duration: Number(rec.duration) || 180,
          audioUrl: rec.source_url || null,
          muxAssetId: null,
          muxPlaybackId: rec.stream_id || null,
          muxStatus: rec.stream_id ? "preparing" : null,
          legacyGogoodsId: rec.id,
        });
        seenTitles.add(norm(rec.title));
        report.songsCreate.push({
          kind: "create",
          detail: `${rec.title} → album ${albumId} (track ${trackNumber})`,
        });
      }
    }
    for (const part of chunk(songInserts, 500)) {
      await tx.insert(songs).values(part as any);
    }

    for (const [releaseId, list] of videoByRelease) {
      const albumId = albumLegacyToId.get(releaseId);
      if (!albumId) continue;
      // Skip if the parent is a VIDEO-type standalone release per task spec
      // (still imported as hidden album; videos there would orphan).
      const planAlbum = albumsPlan.find((a) => a.legacyId === releaseId);
      if (planAlbum?.sourceType === "VIDEO") continue;
      const sorted = [...list].sort(
        (a, b) => Number(a.index) - Number(b.index),
      );
      // Skip videos already on the album with the same title.
      const existing = await tx
        .select({ title: albumVideos.title })
        .from(albumVideos)
        .where(eq(albumVideos.albumId, albumId));
      const seen = new Set(existing.map((v) => norm(v.title)));
      let position = existing.length;
      for (const rec of sorted) {
        if (seen.has(norm(rec.title))) continue;
        await tx.insert(albumVideos).values({
          albumId,
          title: rec.title.trim(),
          videoUrl: rec.source_url || "",
          sourceUrl: rec.source_url || null,
          position: position++,
        } as any);
        report.videosCreate.push({
          kind: "create",
          detail: `${rec.title} → album ${albumId}`,
        });
      }
    }

    // 4. Customers
    const customerInserts: any[] = [];
    for (const c of customersPlan) {
      if (c.existingId) {
        await tx
          .update(customerUsers)
          .set({ legacyGogoodsId: c.legacyId })
          .where(eq(customerUsers.id, c.existingId));
        customerLegacyToId.set(c.legacyId, c.existingId);
        continue;
      }
      // Username derivation — emails are unique in the gogoods export, so
      // base the username on the email local-part and disambiguate on
      // collision.
      let base = c.email
        .split("@")[0]
        .toLowerCase()
        .replace(/[^a-z0-9_]+/g, "")
        .slice(0, 24);
      if (!base) base = `fan_${c.legacyId}`;
      let username = base;
      let n = 2;
      while (usedUsernames.has(username)) username = `${base}${n++}`;
      usedUsernames.add(username);
      customerInserts.push({
        username,
        email: c.email,
        displayName: c.displayName,
        realName: c.realName,
        password: null,
        emailVerifiedAt: c.createdAt ?? new Date(),
        legacyGogoodsId: c.legacyId,
      });
    }
    // Batch-insert and rebuild the legacyId→id map from RETURNING. Each created
    // customer carries a unique legacyGogoodsId, so we correlate on that rather
    // than relying on RETURNING row order.
    for (const part of chunk(customerInserts, 500)) {
      const rows = await tx
        .insert(customerUsers)
        .values(part as any)
        .returning({
          id: customerUsers.id,
          legacyGogoodsId: customerUsers.legacyGogoodsId,
        });
      for (const r of rows) {
        if (r.legacyGogoodsId) customerLegacyToId.set(r.legacyGogoodsId, r.id);
      }
    }

    // 5. UserAlbums — only for resolved (customer × album) pairs.
    const existingUserAlbums = await tx
      .select({ userId: userAlbums.userId, albumId: userAlbums.albumId })
      .from(userAlbums);
    const ownedSet = new Set(
      existingUserAlbums.map((r) => `${r.userId}::${r.albumId}`),
    );
    const userAlbumInserts: any[] = [];
    for (const [, c] of ownedByUserAlbum) {
      const customerId = customerLegacyToId.get(c.user_id);
      const albumId = albumLegacyToId.get(c.release_id);
      if (!customerId || !albumId) {
        report.userAlbumsSkipped.push({
          kind: "skip",
          detail: `collectible#${c.id} unresolved (customer=${!!customerId}, album=${!!albumId})`,
        });
        continue;
      }
      const k = `${customerId}::${albumId}`;
      if (ownedSet.has(k)) continue;
      userAlbumInserts.push({
        userId: customerId,
        albumId,
        certificateNumber: Number(c.index),
        acquiredAt: parseTs(c.created_at) ?? new Date(),
      });
      ownedSet.add(k);
      report.userAlbumsCreate.push({
        kind: "create",
        detail: `customer ${customerId} → album ${albumId} #${c.index}`,
      });
    }
    for (const part of chunk(userAlbumInserts, 500)) {
      await tx.insert(userAlbums).values(part as any);
    }

    // 6. Orders
    //
    // Two prod unique constraints must be respected, and the gogoods source
    // violates both:
    //   • orders_album_good_deed_number_uniq — partial unique on
    //     (album_id, good_deed_number) WHERE good_deed_number IS NOT NULL.
    //     Resold collectibles mean the same GoodDeed number can appear across
    //     several complete txns on one album. We keep the MOST RECENT complete
    //     txn (the sale of record, consistent with the current owner captured
    //     in user_albums) and skip the older duplicates. Orders with no
    //     collectibles (good_deed_number = null) never collide (partial index).
    //   • orders_stripe_payment_intent_id_unique — full unique on
    //     stripe_payment_intent_id. Postgres treats NULLs as distinct, so the
    //     many legacy orders with no payment id are fine; for the rare repeated
    //     non-null payment id we null the duplicate ref (keeping the order) so
    //     the import never drops a purchase over a stale Stripe linkage.
    // Both seen-sets are seeded from existing prod orders so re-runs stay
    // idempotent.
    const existingOrderKeys = await tx
      .select({
        albumId: orders.albumId,
        goodDeedNumber: orders.goodDeedNumber,
        stripePaymentIntentId: orders.stripePaymentIntentId,
      })
      .from(orders);
    const usedGoodDeed = new Set(
      existingOrderKeys
        .filter((r) => r.goodDeedNumber != null)
        .map((r) => `${r.albumId}::${r.goodDeedNumber}`),
    );
    const usedPaymentIntent = new Set(
      existingOrderKeys
        .map((r) => r.stripePaymentIntentId)
        .filter((p): p is string => !!p),
    );

    type OrderCandidate = {
      albumId: string;
      goodDeed: number | null;
      createdAt: Date;
      txnId: string;
      values: Record<string, unknown>;
    };
    const orderCandidates: OrderCandidate[] = [];
    for (const t of gTxns) {
      if (t.payment_status !== "complete") continue;
      if (orderByLegacy.has(t.id)) continue;
      const customerId = customerLegacyToId.get(t.user_id);
      const albumId = albumLegacyToId.get(t.release_id);
      if (!customerId || !albumId) {
        report.ordersSkipped.push({
          kind: "skip",
          detail: `txn#${t.id} unresolved`,
        });
        continue;
      }
      const colls = (collsByTxn.get(t.id) ?? []).slice().sort(
        (a, b) => Number(a.index) - Number(b.index),
      );
      const goodDeed = colls.length ? Number(colls[0].index) : null;
      const buyerEmail = userById.get(t.user_id)?.email ?? null;
      const createdAt = parseTs(t.created_at) ?? new Date();
      orderCandidates.push({
        albumId,
        goodDeed,
        createdAt,
        txnId: t.id,
        values: {
          customerId,
          albumId,
          totalCents: Number(t.total_amount_cents),
          currency: (t.currency || "usd").toLowerCase(),
          status: "complete",
          stripePaymentIntentId: t.payment_id || null,
          buyerEmail,
          goodDeedNumber: goodDeed,
          origin: "legacy:gogoods",
          skuKind: "gooddeed",
          legacyGogoodsId: t.id,
          createdAt,
        },
      });
    }
    // Most recent complete txn wins each (album, GoodDeed) slot and each
    // non-null payment-intent id.
    orderCandidates.sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
    );
    const orderInserts: any[] = [];
    for (const cand of orderCandidates) {
      if (cand.goodDeed != null) {
        const key = `${cand.albumId}::${cand.goodDeed}`;
        if (usedGoodDeed.has(key)) {
          report.ordersSkipped.push({
            kind: "skip",
            detail: `txn#${cand.txnId} → album ${cand.albumId} GoodDeed #${cand.goodDeed} already taken (resale/dup) — kept most recent`,
          });
          continue;
        }
        usedGoodDeed.add(key);
      }
      const pid = cand.values.stripePaymentIntentId as string | null;
      if (pid) {
        if (usedPaymentIntent.has(pid)) {
          cand.values.stripePaymentIntentId = null;
          report.ordersSkipped.push({
            kind: "skip",
            detail: `txn#${cand.txnId} duplicate payment_id ${pid} — kept order, nulled Stripe ref`,
          });
        } else {
          usedPaymentIntent.add(pid);
        }
      }
      orderInserts.push(cand.values);
      report.ordersCreate.push({
        kind: "create",
        detail: `txn#${cand.txnId} → order on album ${cand.albumId} (GoodDeed #${cand.goodDeed ?? "n/a"})`,
      });
    }
    for (const part of chunk(orderInserts, 500)) {
      await tx.insert(orders).values(part as any);
    }
  });

  console.log(`✅ APPLY done.\n`);
  console.log(
    `  people     created/linked: ${peoplePlan.length} (created=${report.artistsCreate.length}, linked=${report.artistsExisting.length})`,
  );
  console.log(
    `  albums     created/linked: ${albumsPlan.length} (created=${report.albumsCreate.length}, deduped=${report.albumsDedupe.length}, hidden=${report.albumsHiddenNonRelease.length})`,
  );
  console.log(`  songs      created: ${report.songsCreate.length}  videos: ${report.videosCreate.length}`);
  console.log(
    `  customers  created/linked: ${customersPlan.length} (created=${report.customersCreate.length}, linked=${report.customersExisting.length})`,
  );
  console.log(`  user_albums created: ${report.userAlbumsCreate.length}`);
  console.log(`  orders      created: ${report.ordersCreate.length}`);

  // Write markdown report.
  const today = new Date().toISOString().slice(0, 10);
  const reportPath = path.resolve(
    process.cwd(),
    `docs/migrations/gogoods-import-${today}.md`,
  );
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  const lines: string[] = [];
  lines.push(`# gogoods.com Import — ${today}`);
  lines.push("");
  lines.push(`Source: \`${DIR}\``);
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(`| Entity | Created | Linked / Deduped | Hidden | Skipped |`);
  lines.push(`|---|---:|---:|---:|---:|`);
  lines.push(
    `| People | ${report.artistsCreate.length} | ${report.artistsExisting.length} | — | — |`,
  );
  lines.push(
    `| Albums | ${report.albumsCreate.length} | ${report.albumsDedupe.length} | ${report.albumsHiddenNonRelease.length} | — |`,
  );
  lines.push(
    `| Songs (audio) | ${report.songsCreate.length} | — | — | ${report.songsSkipped.length} |`,
  );
  lines.push(
    `| Album videos | ${report.videosCreate.length} | — | — | — |`,
  );
  lines.push(
    `| Customers | ${report.customersCreate.length} | ${report.customersExisting.length} | — | — |`,
  );
  lines.push(
    `| user_albums | ${report.userAlbumsCreate.length} | — | — | ${report.userAlbumsSkipped.length} |`,
  );
  lines.push(
    `| Orders | ${report.ordersCreate.length} | — | — | ${report.ordersSkipped.length} |`,
  );
  lines.push("");
  if (report.albumsDedupe.length) {
    lines.push("## Deduped onto existing GoodTunes albums");
    for (const l of report.albumsDedupe) lines.push(`- ${l.detail}`);
    lines.push("");
  }
  if (report.albumsHiddenNonRelease.length) {
    lines.push("## Imported as hidden non-GoodTunes-releases (Singles / Videos)");
    for (const l of report.albumsHiddenNonRelease) lines.push(`- ${l.detail}`);
    lines.push("");
  }
  if (report.albumsSuspectedDup.length) {
    lines.push("## Suspected within-export duplicates (operator review)");
    for (const l of report.albumsSuspectedDup) lines.push(`- ${l.detail}`);
    lines.push("");
  }
  if (report.warnings.length) {
    lines.push("## Referential warnings");
    for (const l of report.warnings.slice(0, 100)) lines.push(`- ${l.detail}`);
    if (report.warnings.length > 100)
      lines.push(`- … and ${report.warnings.length - 100} more`);
    lines.push("");
  }
  lines.push("## Follow-ups");
  lines.push(
    "- Re-host every `tinifycdn.com` image (artist photos/covers, album artwork) into Object Storage. Photos were imported with `photoLocked=true` so only the rehost job touches them.",
  );
  lines.push(
    "- Reconcile / re-link the legacy Mux assets. Songs were imported with `muxPlaybackId` carrying the gogoods `stream_id` and `muxStatus='preparing'` so the boot reconcile sweep will claim them; if the gogoods Mux account is not the same one wired into GoodTunes today, those will need to be re-uploaded.",
  );
  fs.writeFileSync(reportPath, lines.join("\n") + "\n");
  console.log(`\n  📝 report written to ${reportPath}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
