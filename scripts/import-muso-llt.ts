/**
 * Import the LOVE LIFE TRAGEDY muso.ai credits dump into our DB.
 *
 *   tsx scripts/import-muso-llt.ts           # DRY RUN — print plan, no writes
 *   tsx scripts/import-muso-llt.ts --apply   # actually write to DB
 *
 * Target album is `album-5` (dev) — 17 GoodTunes tracks. muso has 16 tracks
 * (their dataset omits "Cold Night (Winter Mix)" and may have a different
 * track-17 mapping); we match by `position` → `track_number`.
 *
 * The importer is idempotent: each run *clears* track_writers /
 * track_performers / track_mechanical_splits / track_publishing_splits for
 * every song it's about to write, then re-inserts from the muso JSON.
 * People + organizations are upserted (matched by muso UUID via the
 * `person_aliases` table, then by normalized name) so re-runs don't
 * fan-out duplicate humans.
 */

import fs from "node:fs";
import path from "node:path";
import { db } from "../server/db";
import {
  people,
  personAliases,
  organizations,
  songs,
  trackWriters,
  trackPerformers,
  trackMechanicalSplits,
  trackPublishingSplits,
} from "../shared/schema";
import { and, eq } from "drizzle-orm";
import { albums } from "../shared/schema";

// ── CLI ───────────────────────────────────────────────────────────────────
//   tsx scripts/import-muso-llt.ts \
//     --album-id <uuid|slug>                    (required)
//     [--apply]                                 actually write (default: dry run)
//     [--allow-name-fallback]                   permit matching existing People
//                                               by normalized name when no muso
//                                               alias exists. OFF by default in
//                                               --apply to avoid mis-merging
//                                               unrelated people in prod.
//     [--muso-file <path>]                      defaults to LLT dump
//     [--manifest-file <path>]                  defaults to LLT manifest
//     [--expect-title "<title>"]                preflight guard — refuse to run
//                                               if the album row's title differs
//     [--expect-artist "<artist>"]              preflight guard — same, for artist
//     [--min-matched-tracks N]                  preflight guard — refuse if
//                                               fewer than N muso tracks line up
//                                               with songs on the target album
function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(name);
  if (i === -1) return fallback;
  const v = process.argv[i + 1];
  if (!v || v.startsWith("--")) return fallback;
  return v;
}
const DRY_RUN = !process.argv.includes("--apply");
const ALLOW_NAME_FALLBACK = process.argv.includes("--allow-name-fallback");
const ALBUM_ID = arg("--album-id");
const MUSO_FILE = path.resolve(arg("--muso-file", "server/data/muso-love-life-tragedy.json")!);
const MANIFEST_FILE = path.resolve(arg("--manifest-file", "server/data/muso-people-manifest.json")!);
const EXPECT_TITLE = arg("--expect-title");
const EXPECT_ARTIST = arg("--expect-artist");
const MIN_MATCHED_TRACKS = Number(arg("--min-matched-tracks", "0"));

if (!ALBUM_ID) {
  console.error("ERROR: --album-id is required (e.g. --album-id album-5 or --album-id <uuid>).");
  process.exit(2);
}

// ── Canonical-name override map ───────────────────────────────────────────
// muso splits some humans across multiple UUIDs. The map (muso UUID → canonical
// name) is loaded from the manifest JSON's `personOverrides` block so non-
// engineers can edit it without touching code. Every variant UUID listed there
// is collapsed onto a single Person row carrying every variant as an alias.
const MUSO_PERSON_OVERRIDES: Record<string, string> = (() => {
  try {
    const raw = JSON.parse(fs.readFileSync(MANIFEST_FILE, "utf8"));
    return (raw.personOverrides ?? {}) as Record<string, string>;
  } catch {
    return {};
  }
})();

type MusoPerson = { id: string; name: string };
type MusoTrack = {
  position: number;
  id: string;
  title: string;
  duration?: string;
  credits: {
    Songwriters?: Record<string, MusoPerson[]>;
    Musicians?: Record<string, MusoPerson[]>;
    Producers?: Record<string, MusoPerson[]>;
    Engineers?: Record<string, MusoPerson[]>;
    Organizations?: Record<string, MusoPerson[]>;
    Visual?: Record<string, MusoPerson[]>;
  };
};
type MusoDump = { album: { title: string; artist: string }; tracks: MusoTrack[] };
type Manifest = {
  manifest: Record<string, { name: string; sourceUrl: string; localUrl: string; mime: string }>;
};

// ── Helpers ───────────────────────────────────────────────────────────────
const normName = (s: string) =>
  s.normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/["'"'`"„""]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

function canonicalName(p: MusoPerson): string {
  return MUSO_PERSON_OVERRIDES[p.id] ?? p.name.trim();
}

// The merge key decides which muso people collapse onto one Person row.
// - When an override exists, every muso UUID mapped to the same canonical
//   name collapses (this is how the four "Nick Carter" muso UUIDs merge).
// - When no override exists, the muso UUID itself is the key — so two
//   genuinely distinct humans who happen to share a display name stay
//   separate. (Earlier versions keyed on canonicalName alone and would
//   silently merge same-named strangers.)
function mergeKey(p: MusoPerson): string {
  return MUSO_PERSON_OVERRIDES[p.id] ?? `muso:${p.id}`;
}

// muso uses a small set of "unknown placeholder" rows when a credit is
// missing identity info — we drop them so they don't create junk People.
// "Inconnu Compositeur Auteur" = French for "Unknown Composer Lyricist".
const SKIP_NAMES = new Set(["inconnu compositeur auteur"]);
function shouldSkipPerson(p: MusoPerson): boolean {
  return SKIP_NAMES.has(normName(canonicalName(p)));
}

// Maps role groups in muso to which destination table+role our schema wants.
// "writer" → track_writers (Composer/Lyricist/Producer)
// "performer" → track_performers (Vocals, Background Vocals, Guitar, Bass, …)
// "engineer" → track_performers w/ role prefixed (Mixing Engineer, …) — kept
//   in performers for now since SuperCredits doesn't have an Engineer table.
function routeRole(group: string, role: string):
  | { kind: "writer"; role: string }
  | { kind: "performer"; role: string }
  | { kind: "skip" } {
  if (group === "Songwriters") return { kind: "writer", role }; // Composer / Lyricist
  if (group === "Producers") return { kind: "writer", role: "Producer" };
  if (group === "Musicians") return { kind: "performer", role };
  if (group === "Engineers") {
    const map: Record<string, string> = {
      Engineer: "Engineer",
      Mixing: "Mixing Engineer",
      Mastering: "Mastering Engineer",
    };
    return { kind: "performer", role: map[role] ?? role };
  }
  if (group === "Visual") return { kind: "skip" }; // photographer / cover designer — surface later
  return { kind: "skip" };
}

// Org "kind" inference from muso's role label.
function orgKindFor(role: string): string {
  const r = role.toLowerCase();
  if (r.includes("label")) return "label";
  if (r.includes("publisher")) return "publisher";
  if (r.includes("pro") || r.includes("society")) return "pro";
  if (r.includes("distrib")) return "distributor";
  return "other";
}

// ── Main ──────────────────────────────────────────────────────────────────
async function main() {
  const dump: MusoDump = JSON.parse(fs.readFileSync(MUSO_FILE, "utf8"));
  const manifest: Manifest = JSON.parse(fs.readFileSync(MANIFEST_FILE, "utf8"));

  console.log(`\n${DRY_RUN ? "🟡 DRY RUN" : "🟢 APPLY"} — album=${ALBUM_ID}`);
  console.log(`  source: ${path.basename(MUSO_FILE)}  (${dump.tracks.length} tracks)`);
  console.log(`  photos: ${Object.keys(manifest.manifest).length} muso person avatars staged in object storage`);
  console.log(`  name-fallback person matching: ${ALLOW_NAME_FALLBACK ? "ON" : "OFF (alias-only)"}`);

  // ── PREFLIGHT ─────────────────────────────────────────────────────────
  const [targetAlbum] = await db.select().from(albums).where(eq(albums.id, ALBUM_ID!));
  if (!targetAlbum) {
    console.error(`\n❌ Preflight failed: no album row with id="${ALBUM_ID}".`);
    process.exit(3);
  }
  console.log(`  album row:   "${targetAlbum.title}" — primaryArtistId=${targetAlbum.primaryArtistId ?? "(none)"}`);
  if (EXPECT_TITLE && normName(targetAlbum.title) !== normName(EXPECT_TITLE)) {
    console.error(`\n❌ Preflight failed: album title "${targetAlbum.title}" does not match --expect-title "${EXPECT_TITLE}".`);
    process.exit(3);
  }
  if (EXPECT_ARTIST) {
    // We don't denormalize artist name onto albums, so just log; the dump's
    // album.artist string is a softer check we surface to the user.
    if (normName(dump.album.artist) !== normName(EXPECT_ARTIST)) {
      console.error(`\n❌ Preflight failed: muso dump artist "${dump.album.artist}" does not match --expect-artist "${EXPECT_ARTIST}".`);
      process.exit(3);
    }
  }

  // 1. Build the global Person plan first (walk every track, collect unique
  //    canonical-named humans). This lets us upsert People once before we
  //    start writing credits, so every credit row gets a real personId.
  const personPlan = new Map<
    string, // canonical name
    {
      canonicalName: string;
      photoUrl: string | null;
      musoIds: { id: string; name: string }[]; // every variant we saw
    }
  >();
  const orgPlan = new Map<
    string, // muso org UUID
    { name: string; kind: string }
  >();

  for (const track of dump.tracks) {
    for (const [group, byRole] of Object.entries(track.credits ?? {})) {
      if (group === "Organizations") {
        for (const [role, list] of Object.entries(byRole ?? {})) {
          for (const o of list ?? []) {
            if (!orgPlan.has(o.id)) orgPlan.set(o.id, { name: o.name, kind: orgKindFor(role) });
          }
        }
        continue;
      }
      for (const list of Object.values(byRole ?? {})) {
        for (const p of list ?? []) {
          if (shouldSkipPerson(p)) continue;
          const key = mergeKey(p);
          const entry = personPlan.get(key) ?? {
            canonicalName: canonicalName(p),
            photoUrl: null as string | null,
            musoIds: [] as { id: string; name: string }[],
          };
          if (!entry.musoIds.some((m) => m.id === p.id)) entry.musoIds.push({ id: p.id, name: p.name });
          if (!entry.photoUrl) entry.photoUrl = manifest.manifest[p.id]?.localUrl ?? null;
          personPlan.set(key, entry);
        }
      }
    }
  }

  // 2. Per-track credit plan. Match by `position` → `track_number`.
  const dbSongs = await db.select().from(songs).where(eq(songs.albumId, ALBUM_ID!));
  const songByPos = new Map(dbSongs.map((s) => [s.trackNumber, s]));
  console.log(`  songs on album: ${dbSongs.length}`);

  type Planned = {
    songId: string;
    trackNumber: number;
    songTitle: string;
    writers: { mergeKey: string; canon: string; role: string }[];
    performers: { mergeKey: string; canon: string; role: string }[];
    orgRoles: { orgMusoId: string; role: string }[];
  };
  const trackPlans: Planned[] = [];
  const unmatched: string[] = [];
  const dedupKey = (k: string, role: string) => `${k}::${role}`;

  for (const track of dump.tracks) {
    const dbSong = songByPos.get(track.position);
    if (!dbSong) {
      unmatched.push(`muso#${track.position} "${track.title}" — no song at track_number=${track.position} on ${ALBUM_ID}`);
      continue;
    }
    const writersSeen = new Set<string>();
    const performersSeen = new Set<string>();
    const planned: Planned = {
      songId: dbSong.id,
      trackNumber: dbSong.trackNumber,
      songTitle: dbSong.title,
      writers: [],
      performers: [],
      orgRoles: [],
    };

    for (const [group, byRole] of Object.entries(track.credits ?? {})) {
      if (group === "Organizations") {
        for (const [role, list] of Object.entries(byRole ?? {})) {
          for (const o of list ?? []) planned.orgRoles.push({ orgMusoId: o.id, role });
        }
        continue;
      }
      for (const [role, list] of Object.entries(byRole ?? {})) {
        for (const p of list ?? []) {
          if (shouldSkipPerson(p)) continue;
          const decision = routeRole(group, role);
          if (decision.kind === "skip") continue;
          const key = mergeKey(p);
          const canon = canonicalName(p);
          const k = dedupKey(key, decision.role);
          if (decision.kind === "writer") {
            if (writersSeen.has(k)) continue;
            writersSeen.add(k);
            planned.writers.push({ mergeKey: key, canon, role: decision.role });
          } else {
            if (performersSeen.has(k)) continue;
            performersSeen.add(k);
            planned.performers.push({ mergeKey: key, canon, role: decision.role });
          }
        }
      }
    }
    trackPlans.push(planned);
  }

  // ── Plan summary ────────────────────────────────────────────────────────
  console.log(`\n── PEOPLE PLAN ──  ${personPlan.size} unique humans`);
  for (const [canon, entry] of personPlan) {
    const photo = entry.photoUrl ? "📷" : "  ";
    const variants =
      entry.musoIds.length > 1
        ? `  ↳ aliases: ${entry.musoIds.map((m) => `"${m.name}"`).join(", ")}`
        : "";
    console.log(`  ${photo} ${canon}  (${entry.musoIds.length} muso UUID${entry.musoIds.length > 1 ? "s" : ""})${variants}`);
  }

  console.log(`\n── ORGANIZATIONS PLAN ──  ${orgPlan.size} entities`);
  for (const [musoId, o] of orgPlan) {
    console.log(`  • ${o.name}  [kind=${o.kind}]  (muso ${musoId.slice(0, 8)}…)`);
  }

  let totalW = 0, totalP = 0, totalO = 0;
  console.log(`\n── PER-TRACK CREDITS PLAN ──  ${trackPlans.length} tracks`);
  for (const p of trackPlans) {
    totalW += p.writers.length;
    totalP += p.performers.length;
    totalO += p.orgRoles.length;
    console.log(
      `  #${String(p.trackNumber).padStart(2)} ${p.songTitle.padEnd(40)}  ` +
        `writers=${p.writers.length}  performers=${p.performers.length}  orgs=${p.orgRoles.length}`,
    );
  }
  console.log(`\n  Totals:  ${totalW} writer rows · ${totalP} performer rows · ${totalO} org credits`);

  if (unmatched.length) {
    console.log(`\n⚠️  ${unmatched.length} muso track(s) could not be matched on ${ALBUM_ID}:`);
    for (const u of unmatched) console.log("    " + u);
  }

  if (MIN_MATCHED_TRACKS > 0 && trackPlans.length < MIN_MATCHED_TRACKS) {
    console.error(`\n❌ Preflight failed: matched ${trackPlans.length} tracks but --min-matched-tracks=${MIN_MATCHED_TRACKS}.`);
    process.exit(3);
  }

  if (DRY_RUN) {
    console.log(`\n🟡 DRY RUN — no DB writes. Re-run with --apply to commit.\n`);
    return;
  }

  // ── APPLY (all-or-nothing) ──────────────────────────────────────────────
  console.log(`\n🟢 APPLY — writing to DB inside a single transaction…`);

  await db.transaction(async (tx) => {
    // 2a. Upsert people (match by muso UUID → person_aliases, then optionally
    //     by name when --allow-name-fallback is set).
    const mergeKeyToPersonId = new Map<string, string>();
    for (const [key, entry] of personPlan) {
      const canon = entry.canonicalName;
      let personId: string | undefined;
      // Try every known muso UUID for this canonical name against person_aliases.
      for (const variant of entry.musoIds) {
        const [hit] = await tx
          .select()
          .from(personAliases)
          .where(and(eq(personAliases.source, "muso"), eq(personAliases.sourceId, variant.id)));
        if (hit) { personId = hit.personId; break; }
      }
      // Optional fallback: case/diacritic-insensitive name match across
      // the whole people table. Off by default in prod to avoid mis-merging
      // unrelated humans who happen to share a name.
      if (!personId && ALLOW_NAME_FALLBACK) {
        const existing = await tx.select().from(people);
        const hit = existing.find((p) => normName(p.name) === normName(canon));
        if (hit) personId = hit.id;
      }
      // Create.
      if (!personId) {
        const [created] = await tx
          .insert(people)
          .values({
            name: canon,
            photoUrl: entry.photoUrl,
            musoId: entry.musoIds[0]?.id ?? null,
          } as any)
          .returning();
        personId = created.id;
      } else if (entry.photoUrl) {
        const [existing] = await tx.select().from(people).where(eq(people.id, personId));
        if (existing && !existing.photoUrl) {
          await tx.update(people).set({ photoUrl: entry.photoUrl }).where(eq(people.id, personId));
        }
      }
      mergeKeyToPersonId.set(key, personId);

      // Record every muso variant as an alias.
      for (const variant of entry.musoIds) {
        const [existsAlias] = await tx
          .select()
          .from(personAliases)
          .where(and(eq(personAliases.source, "muso"), eq(personAliases.sourceId, variant.id)));
        if (!existsAlias) {
          await tx.insert(personAliases).values({
            personId,
            name: variant.name,
            source: "muso",
            sourceId: variant.id,
          });
        }
      }
    }

    // 2b. Upsert organizations (match by muso UUID).
    const orgMusoToId = new Map<string, string>();
    for (const [musoId, o] of orgPlan) {
      const [hit] = await tx
        .select()
        .from(organizations)
        .where(eq(organizations.musoId, musoId));
      let id = hit?.id;
      if (!id) {
        const [created] = await tx
          .insert(organizations)
          .values({ name: o.name, kind: o.kind, musoId } as any)
          .returning();
        id = created.id;
      }
      orgMusoToId.set(musoId, id);
    }

    // 2c. Per-track: clear existing rows, then re-insert. The whole loop is
    //     in the same transaction as 2a/2b — a failure anywhere rolls back
    //     every change.
    for (const p of trackPlans) {
      await tx.delete(trackWriters).where(eq(trackWriters.songId, p.songId));
      await tx.delete(trackPerformers).where(eq(trackPerformers.songId, p.songId));
      await tx.delete(trackMechanicalSplits).where(eq(trackMechanicalSplits.songId, p.songId));
      await tx.delete(trackPublishingSplits).where(eq(trackPublishingSplits.songId, p.songId));

      let pos = 0;
      for (const w of p.writers) {
        const personId = mergeKeyToPersonId.get(w.mergeKey)!;
        await tx.insert(trackWriters).values({
          songId: p.songId,
          personId,
          name: w.canon,
          role: w.role,
          position: pos++,
        });
      }
      pos = 0;
      for (const perf of p.performers) {
        const personId = mergeKeyToPersonId.get(perf.mergeKey)!;
        await tx.insert(trackPerformers).values({
          songId: p.songId,
          personId,
          name: perf.canon,
          role: perf.role,
          position: pos++,
        });
      }
      // Org credits → split placeholder rows (percentBp=0, admin fills in
      // actual percentages later). Labels/distributors go to mechanical,
      // publishers/PROs/etc. go to publishing — broad master/composition split.
      let pubPos = 0, mechPos = 0;
      for (const oc of p.orgRoles) {
        const orgId = orgMusoToId.get(oc.orgMusoId)!;
        const [orgRow] = await tx.select().from(organizations).where(eq(organizations.id, orgId));
        const isMech = orgRow.kind === "label" || orgRow.kind === "distributor";
        if (isMech) {
          await tx.insert(trackMechanicalSplits).values({
            songId: p.songId,
            organizationId: orgId,
            name: orgRow.name,
            role: oc.role,
            percentBp: 0,
            position: mechPos++,
          });
        } else {
          await tx.insert(trackPublishingSplits).values({
            songId: p.songId,
            organizationId: orgId,
            name: orgRow.name,
            role: oc.role,
            percentBp: 0,
            position: pubPos++,
          });
        }
      }
    }
  });

  console.log(`✅ APPLY done — wrote credits for ${trackPlans.length} tracks (transactional).\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
