/**
 * One-off operational merge: consolidate Bill's two super-admin accounts.
 * Keep   bill@goodtunes.music (b154f76c-...) as the single account.
 * Retire bill@gogoods.com     (b261426d-...): re-point its history onto the
 * keeper, drop duplicate/ephemeral rows, then delete the row.
 *
 * Safe by construction: runs in ONE transaction, re-scans for the retired id
 * afterwards, and ROLLBACKs unless every reference is gone.
 *
 * Run once:  tsx scripts/merge-bill-accounts.ts
 * A full prod scan confirmed the retired id appears ONLY in the columns
 * touched below (plus users.id itself).
 */
import { Pool } from "pg";

const KEEP = "b154f76c-4a76-455f-b1a6-e9a3463758ce"; // bill@goodtunes.music
const DROP = "b261426d-1959-4cc2-ad8c-7439e646b278"; // bill@gogoods.com

const REPOINT: Array<[string, string]> = [
  ["songs", "deleted_by_user_id"],
  ["albums", "deleted_by_user_id"],
  ["analytics_events", "user_id"],
  ["admin_invites", "created_by_user_id"],
  ["album_npo_beneficiaries", "allocated_by_user_id"],
  ["partner_permissions", "updated_by_user_id"],
  ["playlists", "user_id"],
];

// Unique-constraint collisions + ephemeral rows: delete rather than re-point.
const DELETE_ROWS: Array<[string, string]> = [
  ["user_albums", "user_id"],              // all 3 albums already owned by KEEP
  ["memberships", "user_id"],              // KEEP already has identical super_admin row
  ["auth_tokens", "admin_user_id"],        // retired account sessions
  ["admin_password_reset_tokens", "user_id"], // stale reset tokens
];

// Every column the comprehensive prod scan found the DROP id in.
const SCAN: Array<[string, string]> = [
  ["songs", "deleted_by_user_id"],
  ["albums", "deleted_by_user_id"],
  ["analytics_events", "user_id"],
  ["admin_invites", "created_by_user_id"],
  ["album_npo_beneficiaries", "allocated_by_user_id"],
  ["partner_permissions", "updated_by_user_id"],
  ["playlists", "user_id"],
  ["user_albums", "user_id"],
  ["memberships", "user_id"],
  ["auth_tokens", "admin_user_id"],
  ["admin_password_reset_tokens", "user_id"],
];

async function main() {
  const url = process.env.PROD_DATABASE_URL;
  if (!url) throw new Error("PROD_DATABASE_URL not set");
  const pool = new Pool({ connectionString: url });
  const c = await pool.connect();
  try {
    // Pre-flight: confirm both rows + the keeper's email.
    const pre = await c.query(
      `SELECT id, email FROM users WHERE id = ANY($1)`,
      [[KEEP, DROP]],
    );
    const keep = pre.rows.find((r) => r.id === KEEP);
    const drop = pre.rows.find((r) => r.id === DROP);
    if (!keep) throw new Error("keeper row (goodtunes.music) not found — aborting");
    if (keep.email !== "bill@goodtunes.music")
      throw new Error(`keeper email is ${keep.email}, expected bill@goodtunes.music — aborting`);
    if (!drop) {
      console.log("Nothing to do — gogoods.com row already gone.");
      return;
    }
    console.log(`Keeper: ${keep.email} (${KEEP})`);
    console.log(`Retire: ${drop.email} (${DROP})`);

    await c.query("BEGIN");

    for (const [t, col] of REPOINT) {
      const r = await c.query(
        `UPDATE "${t}" SET "${col}" = $1 WHERE "${col}"::text = $2`,
        [KEEP, DROP],
      );
      console.log(`re-point ${t}.${col}: ${r.rowCount}`);
    }
    for (const [t, col] of DELETE_ROWS) {
      const r = await c.query(
        `DELETE FROM "${t}" WHERE "${col}"::text = $1`,
        [DROP],
      );
      console.log(`delete   ${t}.${col}: ${r.rowCount}`);
    }

    const delUser = await c.query(`DELETE FROM users WHERE id = $1`, [DROP]);
    console.log(`delete   users row: ${delUser.rowCount}`);

    // Verify: the retired id must be gone from every known column.
    let leftover = 0;
    for (const [t, col] of SCAN) {
      const r = await c.query(
        `SELECT COUNT(*)::int AS n FROM "${t}" WHERE "${col}"::text = $1`,
        [DROP],
      );
      const n = r.rows[0].n as number;
      if (n > 0) {
        leftover += n;
        console.error(`LEFTOVER ${t}.${col}: ${n}`);
      }
    }
    const stillUser = await c.query(`SELECT COUNT(*)::int AS n FROM users WHERE id = $1`, [DROP]);
    if (stillUser.rows[0].n > 0) {
      leftover += stillUser.rows[0].n;
      console.error(`LEFTOVER users.id: ${stillUser.rows[0].n}`);
    }

    if (leftover > 0) {
      await c.query("ROLLBACK");
      throw new Error(`Found ${leftover} leftover references — ROLLED BACK, no changes made.`);
    }

    await c.query("COMMIT");
    console.log("COMMIT — gogoods.com retired, everything merged onto goodtunes.music.");

    // Post-state sanity: keeper still owns its album grants.
    const ua = await c.query(`SELECT COUNT(*)::int AS n FROM user_albums WHERE user_id = $1`, [KEEP]);
    console.log(`goodtunes.music user_albums: ${ua.rows[0].n}`);
  } catch (e) {
    try { await c.query("ROLLBACK"); } catch {}
    throw e;
  } finally {
    c.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error("MERGE FAILED:", e.message);
  process.exit(1);
});
