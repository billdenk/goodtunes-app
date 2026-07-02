/**
 * Mirror Memphis Record Pressing's FULL public color catalog into the Memphis
 * press catalog.
 *
 * Source of truth: scripts/data/memphis-colors.json — every color on
 * https://memphisrecordpressing.com/all-vinyl-colors/ grouped by MRP's code
 * prefix into 16 categories, each with the page's product-photo URL. Counts
 * match the live site exactly (315 colors).
 *
 * Two relationships per category:
 *   - NEW tiers (Standard/Deluxe/Double Double/Shimmer/Glitter/Ghostly/Torrent/
 *     Color In Color/Half): created per vinyl format, CLONED from that format's
 *     "Metallic Blends" tier (price_ladder, masters_prep, every jacket ladder)
 *     so they price exactly like Metallic — a placeholder estimate Bill can edit
 *     per the press-pricing flow. Then all the category's colors are inserted.
 *   - EXISTING tiers (Opaque/Neon/Translucent/Smoke/Cream/Metallic/Splatter):
 *     ADDITIVE only. Each manifest color is matched to a current row (by code,
 *     then by normalized name); a match UPGRADES that row's swatch image to the
 *     high-res mirror (never renames); a miss INSERTS the color appended at the
 *     end. Current rows that match nothing are KEPT and logged as operator
 *     extras — we never delete. (Splatter exists but is empty, so all of its
 *     colors are inserted.)
 *
 * A/B two-sided codes (Double Double, Torrent): the A image is the swatch; the
 * B-side URL stays in the manifest (importSourceUrlB) for audit only.
 *
 * High-res: the page often serves a -<w>x<h> thumbnail. mirrorImage() tries the
 * size-suffix-stripped original first and only falls back to the given URL.
 *
 * Idempotent + one-time per DB:
 *   - Phase 1 mirrors each photo into the shared Object Storage bucket ONCE
 *     (resolves in dev + prod); the resulting /objects/uploads/<id> URL persists
 *     back into the manifest so prod and fresh clones reuse it.
 *   - Phase 2 (one transaction) does all tier/color writes, VERIFIES every
 *     manifest color is present-with-photo, and only then stamps the
 *     post_merge_data_backfills marker. A failed verify rolls the whole txn back
 *     and leaves the marker unset. A second run skips on the marker (operator
 *     curation is then left alone); --force re-runs (still no-dup / no-rename).
 *
 * Hard-fails BEFORE any write if the manifest's per-category counts drift from
 * the authoritative site counts — a truncated manifest must never lock a partial
 * set in behind the one-time marker.
 *
 * Memphis's press id + tier ids drift across dev/prod, so the press is resolved
 * by live identity (domain/name) and tiers by (press_id, format, name).
 *
 * Dev:   npx tsx scripts/seed-memphis-colors.ts
 * Prod:  DATABASE_URL="$PROD_DATABASE_URL" npx tsx scripts/seed-memphis-colors.ts
 * Dry:   add --dry    (no uploads, no writes — reports the plan)
 * Force: add --force  (re-run even if the marker is present)
 */
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { sql } from "drizzle-orm";
import { db, pool } from "../server/db";
import { objectStorageClient } from "../server/replit_integrations/object_storage/objectStorage";
import { setObjectAclPolicy } from "../server/replit_integrations/object_storage/objectAcl";

const DRY = process.argv.includes("--dry");
const FORCE = process.argv.includes("--force");
const FORMATS = ["7_inch", "12_lp", "12_double"] as const;
const MANIFEST = "scripts/data/memphis-colors.json";
const MARKER = "memphis_mrp_color_catalog_v1";

// Authoritative MRP site counts (verified against the high-res page). The
// manifest must match these EXACTLY before any write so a regenerated/truncated
// manifest can never lock a partial set in behind the one-time marker.
const EXPECTED: Record<string, number> = {
  Opaque: 24,
  "Neon/Glow": 6,
  Translucent: 15,
  "Smoke Blends": 13,
  "Cream Blends": 13,
  "Metallic Blends": 35,
  "Standard Blends": 33,
  "Deluxe Blends": 69,
  "Double Double": 28,
  "Shimmer Blends": 22,
  "Glitter Blends": 15,
  "Ghostly Effect": 14,
  "Torrent Effect": 5,
  "Color In Color": 4,
  Half: 7,
  Splatter: 12,
};
const EXPECTED_TOTAL = 315;

type Color = {
  code: string;
  name: string;
  importSourceUrl: string;
  importSourceUrlB?: string;
  position: number;
  publicUrl?: string;
};
type Category = {
  tierName: string;
  existing: boolean;
  sourceTier: string | null;
  colors: Color[];
};
type Manifest = {
  press: { domain: string; name: string };
  source: string;
  marker: string;
  note: string;
  categories: Category[];
};

type Row = { id: string; name: string; position: number; swatch_image_url: string | null };

// ---- name matching (existing tiers) -----------------------------------------
// Category abbreviations + filler words to drop so a manifest color matches the
// way Memphis named the same color (e.g. MRP "Cocoa Cream" <-> Memphis
// "CB Cocoa", MRP "Metallic Gold" <-> Memphis "Metallic Gold").
const STOP = new Set([
  "cb", "sb", "hb", "mb", "md", "dd", "shm", "shb", "hg", "ge", "tor", "trh",
  "cic", "hh", "spl", "cream", "blend", "blends", "smoke", "w",
]);
const parseCode = (name: string): string | null => {
  const m = name.match(/^([A-Za-z]{1,4}\d+)/);
  return m ? m[1].toUpperCase() : null;
};
// Normalized comparison key: drop a leading code ("SB12 Sea Blue" -> "Sea Blue"),
// category abbreviations/filler words, and pure numbers, so MRP names match the
// way Memphis already named the same color even when the code numbering drifted
// (MRP "Sea Blue Smoke" / SB14 <-> Memphis "SB12 Sea Blue").
const tokenKey = (name: string): string =>
  name
    .toLowerCase()
    .replace(/^[a-z]{1,4}\d+\s*/i, "")
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((t) => t && !STOP.has(t) && !/^\d+$/.test(t))
    .sort()
    .join(" ");
/** First current row that matches by code, then by normalized name. */
const findRow = (c: Color, rows: Row[], used?: Set<string>): Row | null => {
  const code = c.code.toUpperCase();
  for (const r of rows) {
    if (used?.has(r.id)) continue;
    if (parseCode(r.name) === code) return r;
  }
  const mk = tokenKey(c.name);
  if (mk) {
    for (const r of rows) {
      if (used?.has(r.id)) continue;
      if (tokenKey(r.name) === mk) return r;
    }
  }
  return null;
};

// ---- high-res image mirroring -----------------------------------------------
/** Candidate URLs, highest-res first: strip the -WxH thumbnail suffix (and a
 *  trailing -N dedup / _REV variant), falling back to the given URL last. */
const candidates = (url: string): string[] => {
  const out: string[] = [];
  const push = (u: string) => {
    if (u && !out.includes(u)) out.push(u);
  };
  const a = url.replace(/-\d+x\d+/i, "");
  push(a);
  const b = a.replace(/-\d+(?=\.\w+$)/i, "");
  push(b);
  push(a.replace(/_REV(?=\.\w+$)/i, ""));
  push(b.replace(/_REV(?=\.\w+$)/i, ""));
  push(url);
  return out;
};

/** Bounded-concurrency map (mirroring 315 images serially is too slow). */
async function mapPool<T>(items: T[], n: number, fn: (t: T, i: number) => Promise<void>) {
  let idx = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (true) {
        const i = idx++;
        if (i >= items.length) break;
        await fn(items[i], i);
      }
    }),
  );
}

const fetchWithTimeout = async (url: string, ms = 12000): Promise<Response> => {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  try {
    return await fetch(url, { signal: ac.signal, redirect: "follow" });
  } finally {
    clearTimeout(t);
  }
};

async function mirrorImage(url: string): Promise<string> {
  let lastErr: unknown;
  for (const cand of candidates(url)) {
    try {
      const resp = await fetchWithTimeout(cand);
      if (!resp.ok) {
        lastErr = new Error(`${cand} -> ${resp.status}`);
        continue;
      }
      const mime = (resp.headers.get("content-type") || "").split(";")[0].trim();
      if (!mime.startsWith("image/")) {
        lastErr = new Error(`${cand} -> ${mime || "no content-type"}`);
        continue;
      }
      const buf = Buffer.from(await resp.arrayBuffer());
      if (buf.length < 1000) {
        lastErr = new Error(`${cand} -> ${buf.length}b (too small)`);
        continue;
      }
      const ext =
        mime === "image/png" ? ".png" : mime === "image/jpeg" ? ".jpg" : mime === "image/webp" ? ".webp" : ".png";
      const id = `${crypto.randomUUID()}${ext}`;
      const privateDir = (process.env.PRIVATE_OBJECT_DIR || "").replace(/\/$/, "");
      const trimmed = privateDir.startsWith("/") ? privateDir.slice(1) : privateDir;
      const firstSlash = trimmed.indexOf("/");
      const bucketName = firstSlash === -1 ? trimmed : trimmed.slice(0, firstSlash);
      const prefix = firstSlash === -1 ? "" : trimmed.slice(firstSlash + 1);
      const objectName = `${prefix ? `${prefix}/` : ""}uploads/${id}`;
      const file = objectStorageClient.bucket(bucketName).file(objectName);
      await file.save(buf, {
        contentType: mime,
        metadata: { cacheControl: "public, max-age=31536000, immutable" },
        resumable: false,
      });
      await setObjectAclPolicy(file as any, { owner: "admin", visibility: "public" } as any);
      return `/objects/uploads/${id}`;
    } catch (e) {
      lastErr = e;
    }
  }
  throw new Error(`mirrorImage failed for ${url}: ${String(lastErr)}`);
}

// ---- plan (reads only) ------------------------------------------------------
type Plan =
  | { kind: "create"; tierName: string; format: string; sourceTierId: string; colors: Color[] }
  | {
      kind: "additive";
      tierName: string;
      format: string;
      tierId: string;
      upgrades: { id: string; color: Color }[];
      inserts: Color[];
      startPos: number;
      extras: string[];
    }
  | { kind: "skip"; tierName: string; format: string; reason: string; fatal: boolean };

async function tierByName(pressId: string, fmt: string, name: string) {
  const r = await db.execute<{ id: string }>(
    sql`SELECT id FROM press_color_tiers WHERE press_id = ${pressId} AND format = ${fmt} AND name = ${name} LIMIT 1`,
  );
  return r.rows[0] ?? null;
}

async function buildPlan(pressId: string, manifest: Manifest): Promise<Plan[]> {
  const plan: Plan[] = [];
  for (const cat of manifest.categories) {
    for (const fmt of FORMATS) {
      const tier = await tierByName(pressId, fmt, cat.tierName);
      if (!cat.existing) {
        if (tier) {
          // Benign idempotency: we already created this specialty tier on a prior
          // committed run (tier + marker land in one txn, so this is only seen
          // under --force). Not a missing prerequisite — never fatal.
          plan.push({ kind: "skip", tierName: cat.tierName, format: fmt, reason: "tier already present", fatal: false });
          continue;
        }
        const src = cat.sourceTier ? await tierByName(pressId, fmt, cat.sourceTier) : null;
        if (!src) {
          plan.push({
            kind: "skip",
            tierName: cat.tierName,
            format: fmt,
            reason: `no "${cat.sourceTier}" template tier to clone pricing from`,
            fatal: true,
          });
          continue;
        }
        plan.push({ kind: "create", tierName: cat.tierName, format: fmt, sourceTierId: src.id, colors: cat.colors });
      } else {
        if (!tier) {
          plan.push({ kind: "skip", tierName: cat.tierName, format: fmt, reason: "existing tier absent for this format", fatal: true });
          continue;
        }
        const rows = (
          await db.execute<Row>(
            sql`SELECT id, name, position, swatch_image_url FROM press_colors WHERE tier_id = ${tier.id} ORDER BY position`,
          )
        ).rows;
        const used = new Set<string>();
        const upgrades: { id: string; color: Color }[] = [];
        const inserts: Color[] = [];
        for (const c of cat.colors) {
          const m = findRow(c, rows, used);
          if (m) {
            used.add(m.id);
            upgrades.push({ id: m.id, color: c });
          } else {
            inserts.push(c);
          }
        }
        const extras = rows.filter((r) => !used.has(r.id)).map((r) => r.name);
        const startPos = rows.reduce((mx, r) => Math.max(mx, r.position), -1) + 1;
        plan.push({ kind: "additive", tierName: cat.tierName, format: fmt, tierId: tier.id, upgrades, inserts, startPos, extras });
      }
    }
  }
  return plan;
}

// ---- main -------------------------------------------------------------------
async function main() {
  const manifest: Manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));

  // Hard-fail BEFORE anything: manifest must match the authoritative site counts.
  if (manifest.marker !== MARKER) throw new Error(`manifest marker ${manifest.marker} != ${MARKER}`);
  let total = 0;
  for (const cat of manifest.categories) {
    const exp = EXPECTED[cat.tierName];
    if (exp === undefined) throw new Error(`unknown category "${cat.tierName}" in manifest`);
    if (cat.colors.length !== exp)
      throw new Error(`category "${cat.tierName}" has ${cat.colors.length} colors (expected ${exp}) — manifest drift, refusing to seed`);
    for (const c of cat.colors) if (!c.importSourceUrl) throw new Error(`"${cat.tierName}/${c.name}" missing importSourceUrl`);
    total += cat.colors.length;
  }
  if (total !== EXPECTED_TOTAL) throw new Error(`manifest has ${total} colors total (expected ${EXPECTED_TOTAL})`);

  // Resolve Memphis by live identity (id drifts dev<->prod). Exclude soft-deleted
  // rows so a dead duplicate can't be picked. Self-gate if absent.
  const press = (
    await db.execute<{ id: string; name: string }>(sql`
      SELECT id, name FROM manufacturers
      WHERE deleted_at IS NULL
        AND (domain = ${manifest.press.domain} OR name ILIKE ${"%" + manifest.press.name + "%"})
      ORDER BY (domain = ${manifest.press.domain}) DESC, name
      LIMIT 1`)
  ).rows[0];
  if (!press) {
    console.log("Memphis Record Pressing not found in this DB — nothing to do.");
    return;
  }
  const pressId = press.id;
  const envLabel = process.env.DATABASE_URL === process.env.PROD_DATABASE_URL ? "prod" : "dev";
  console.log(`Target: ${envLabel} DB · press ${press.name} (${pressId})${DRY ? " · DRY RUN" : ""}${FORCE ? " · FORCE" : ""}`);

  // ---- Marker (per-DB one-time) — checked BEFORE the backup so a no-op
  // post-merge run (marker already present) returns immediately instead of
  // littering scripts/backups with a fresh snapshot on every merge. ----
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS post_merge_data_backfills (
      name text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`);
  const markerPresent =
    (await db.execute<{ one: number }>(sql`SELECT 1 AS one FROM post_merge_data_backfills WHERE name = ${MARKER}`)).rows
      .length > 0;
  if (markerPresent && !FORCE) {
    console.log(`seed-memphis-colors: marker '${MARKER}' present — already applied, skipping (use --force to re-run).`);
    return;
  }

  // ---- Backup (before any write) ----
  const backup = await db.execute(sql`
    SELECT
      (SELECT jsonb_agg(to_jsonb(t)) FROM press_color_tiers t WHERE t.press_id = ${pressId}) AS tiers,
      (SELECT jsonb_agg(to_jsonb(c)) FROM press_colors c
         JOIN press_color_tiers t ON t.id = c.tier_id WHERE t.press_id = ${pressId}) AS colors,
      (SELECT jsonb_agg(to_jsonb(j)) FROM press_tier_jacket_ladders j
         JOIN press_color_tiers t ON t.id = j.tier_id WHERE t.press_id = ${pressId}) AS jacket_ladders
  `);
  mkdirSync("scripts/backups", { recursive: true });
  const backupPath = `scripts/backups/memphis-catalog-${envLabel}-latest.json`;
  writeFileSync(backupPath, JSON.stringify({ pressId, snapshot: backup.rows[0] }, null, 2));
  console.log(`Backup written: ${backupPath}`);

  // ---- Phase 1: mirror images (idempotent via manifest publicUrl) ----
  const allColors = manifest.categories.flatMap((c) => c.colors);
  const need = allColors.filter((c) => !c.publicUrl);
  console.log(`\nImages: ${allColors.length} total, ${need.length} to mirror.`);
  if (!DRY) {
    let done = 0;
    await mapPool(need, 8, async (c) => {
      c.publicUrl = await mirrorImage(c.importSourceUrl);
      done++;
      if (done % 20 === 0 || done === need.length) console.log(`  mirrored ${done}/${need.length}`);
      writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + "\n"); // persist progress (sync = no interleave)
    });
  } else if (need.length) {
    console.log(`  [DRY] would mirror ${need.length} images.`);
  }

  // ---- Plan (reads only) ----
  const plan = await buildPlan(pressId, manifest);
  const sum = { create: 0, colorsNew: 0, upgrades: 0, inserts: 0, extras: 0, skips: 0 };
  for (const p of plan) {
    if (p.kind === "create") {
      sum.create++;
      sum.colorsNew += p.colors.length;
      console.log(`  CREATE  ${p.format.padEnd(9)} ${p.tierName} — clone pricing + ${p.colors.length} colors`);
    } else if (p.kind === "additive") {
      sum.upgrades += p.upgrades.length;
      sum.inserts += p.inserts.length;
      sum.extras += p.extras.length;
      console.log(
        `  ADD     ${p.format.padEnd(9)} ${p.tierName} — upgrade ${p.upgrades.length} image(s), insert ${p.inserts.length}, keep ${p.extras.length} extra(s)`,
      );
      if (p.extras.length) console.log(`            operator extras kept: ${p.extras.join(", ")}`);
    } else {
      sum.skips++;
      console.log(`  SKIP    ${p.format.padEnd(9)} ${p.tierName} — ${p.reason}${p.fatal ? " [FATAL: missing prerequisite]" : ""}`);
    }
  }
  console.log(
    `\nPlan: create ${sum.create} tier(s) w/ ${sum.colorsNew} colors · upgrade ${sum.upgrades} image(s) · insert ${sum.inserts} · keep ${sum.extras} extra(s) · skip ${sum.skips}.`,
  );

  if (DRY) {
    console.log("\n[DRY] no changes written (marker not stamped).");
    return;
  }

  // A FATAL skip means a prerequisite is missing in THIS DB — an existing
  // category tier we additively fill, or the "Metallic Blends" template we clone
  // pricing + jacket ladders from. Stamping the marker now would permanently lock
  // in a partial catalog on a fresh clone, so bail before writing: the marker
  // stays unset and a later post-merge retries once the catalog is whole.
  // Benign "tier already present" skips (idempotent --force re-runs) are ignored.
  // (The legitimate "no Memphis press here" case already self-gated above.)
  const fatalSkips = plan.filter((p): p is Extract<Plan, { kind: "skip" }> => p.kind === "skip" && p.fatal);
  if (fatalSkips.length > 0) {
    const reasons = [...new Set(fatalSkips.map((p) => p.reason))].join("; ");
    throw new Error(
      `Refusing to write: ${fatalSkips.length} tier(s) skipped for a missing prerequisite (${reasons}). ` +
        `Marker left unstamped so a later post-merge retries once the catalog is whole.`,
    );
  }

  // Every color we'll touch must have a mirrored image.
  for (const c of allColors) if (!c.publicUrl) throw new Error(`"${c.name}" has no publicUrl after mirroring`);

  // ---- Phase 2: apply + verify + stamp (one transaction) ----
  await db.transaction(async (tx) => {
    for (const p of plan) {
      if (p.kind === "skip") continue;
      if (p.kind === "create") {
        const src = (
          await tx.execute<{ price_ladder: unknown; masters_prep_cost_cents: number }>(
            sql`SELECT price_ladder, masters_prep_cost_cents FROM press_color_tiers WHERE id = ${p.sourceTierId}`,
          )
        ).rows[0];
        const position =
          (
            await tx.execute<{ next: number }>(
              sql`SELECT COALESCE(MAX(position), -1) + 1 AS next FROM press_color_tiers WHERE press_id = ${pressId} AND format = ${p.format}`,
            )
          ).rows[0]?.next ?? 0;
        const tierId = (
          await tx.execute<{ id: string }>(sql`
            INSERT INTO press_color_tiers (press_id, format, name, position, price_ladder, masters_prep_cost_cents)
            VALUES (${pressId}, ${p.format}, ${p.tierName}, ${position},
                    ${JSON.stringify(src?.price_ladder ?? [])}::jsonb, ${src?.masters_prep_cost_cents ?? 0})
            RETURNING id`)
        ).rows[0].id;
        await tx.execute(sql`
          INSERT INTO press_tier_jacket_ladders (tier_id, jacket_id, price_ladder)
          SELECT ${tierId}, jacket_id, price_ladder FROM press_tier_jacket_ladders WHERE tier_id = ${p.sourceTierId}`);
        let pos = 0;
        for (const c of p.colors) {
          await tx.execute(sql`
            INSERT INTO press_colors (tier_id, name, swatch_hex, swatch_image_url, position, import_source_url)
            VALUES (${tierId}, ${c.name}, NULL, ${c.publicUrl}, ${pos}, ${c.importSourceUrl})`);
          pos++;
        }
      } else {
        // additive: upgrade matched images (never rename), append the rest.
        for (const u of p.upgrades) {
          await tx.execute(sql`
            UPDATE press_colors SET swatch_image_url = ${u.color.publicUrl}, import_source_url = ${u.color.importSourceUrl}
            WHERE id = ${u.id}`);
        }
        let pos = p.startPos;
        for (const c of p.inserts) {
          await tx.execute(sql`
            INSERT INTO press_colors (tier_id, name, swatch_hex, swatch_image_url, position, import_source_url)
            VALUES (${p.tierId}, ${c.name}, NULL, ${c.publicUrl}, ${pos}, ${c.importSourceUrl})`);
          pos++;
        }
      }
    }

    // ---- Verify (inside txn) — every manifest color present WITH a photo ----
    for (const cat of manifest.categories) {
      for (const fmt of FORMATS) {
        const acted = plan.find(
          (p) => p.tierName === cat.tierName && p.format === fmt && p.kind !== "skip",
        );
        if (!acted) continue; // skipped format (e.g. existing tier absent) — nothing to verify
        const tier = (
          await tx.execute<{ id: string }>(
            sql`SELECT id FROM press_color_tiers WHERE press_id = ${pressId} AND format = ${fmt} AND name = ${cat.tierName} LIMIT 1`,
          )
        ).rows[0];
        if (!tier) throw new Error(`verify: "${cat.tierName}" (${fmt}) missing after write`);
        const rows = (
          await tx.execute<Row>(
            sql`SELECT id, name, position, swatch_image_url FROM press_colors WHERE tier_id = ${tier.id}`,
          )
        ).rows;
        if (!cat.existing && rows.length !== cat.colors.length)
          throw new Error(`verify: "${cat.tierName}" (${fmt}) has ${rows.length} colors, expected ${cat.colors.length}`);
        const ladders =
          (
            await tx.execute<{ n: number }>(
              sql`SELECT COUNT(*)::int AS n FROM press_tier_jacket_ladders WHERE tier_id = ${tier.id}`,
            )
          ).rows[0]?.n ?? 0;
        if (!cat.existing && ladders === 0)
          throw new Error(`verify: "${cat.tierName}" (${fmt}) has no jacket ladders (clone failed)`);
        for (const c of cat.colors) {
          const r = findRow(c, rows);
          if (!r) throw new Error(`verify: "${cat.tierName}/${c.name}" (${fmt}) not present after write`);
          if (!r.swatch_image_url) throw new Error(`verify: "${cat.tierName}/${c.name}" (${fmt}) has no swatch image`);
        }
      }
    }

    await tx.execute(sql`INSERT INTO post_merge_data_backfills (name) VALUES (${MARKER}) ON CONFLICT (name) DO NOTHING`);
  });
  console.log(`\nDone. Marker '${MARKER}' stamped.`);

  // ---- Post-txn summary ----
  const after = await db.execute<{ format: string; tier: string; colors: number; img: number; ladders: number }>(sql`
    SELECT t.format, t.name AS tier, COUNT(DISTINCT c.id)::int AS colors,
           COUNT(DISTINCT c.swatch_image_url)::int AS img, COUNT(DISTINCT j.id)::int AS ladders
    FROM press_color_tiers t
    LEFT JOIN press_colors c ON c.tier_id = t.id
    LEFT JOIN press_tier_jacket_ladders j ON j.tier_id = t.id
    WHERE t.press_id = ${pressId}
    GROUP BY t.format, t.id, t.name, t.position
    ORDER BY t.format, t.position`);
  console.log(`\nMemphis catalog now (colors / photos / jacket-ladders):`);
  let f = "";
  for (const r of after.rows) {
    if (r.format !== f) {
      f = r.format;
      console.log(`  [${f}]`);
    }
    console.log(`    ${r.tier.padEnd(18)} ${r.colors} / ${r.img} / ${r.ladders}`);
  }
}

main()
  .then(() => pool.end())
  .catch((err) => {
    console.error(err);
    pool.end();
    process.exit(1);
  });
