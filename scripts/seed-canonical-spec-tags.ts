// Task #3394 — seed canonical spec dictionary tags (cross-press import).
//
// Fills press_color_tiers / press_colors / press_jackets `canonical_attrs`
// with name-derived canonical values for every row where it is still NULL.
// Operator-confirmed mappings (confirmed:true, set from the god-view review
// surface) are NEVER overwritten — this only backfills the untagged rows so
// the translation engine has a starting vocabulary for the currently
// onboarded presses. Idempotent; safe to run on every merge, dev and prod.
//
// NOTE: seeded rows are stamped confirmed:false so the god-view surface can
// distinguish "heuristic guess" from "operator reviewed". No pricing is
// read or written anywhere here.
import pg from "pg";
import {
  deriveEffectFamily,
  deriveColorFamily,
  deriveJacketConstruction,
} from "../shared/crossPressImport";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL not set");
  const pool = new pg.Pool({ connectionString: url, max: 2 });
  try {
    let tiers = 0;
    let colors = 0;
    let jackets = 0;

    const tRows = await pool.query(
      `SELECT id, name FROM press_color_tiers WHERE canonical_attrs IS NULL`,
    );
    for (const r of tRows.rows) {
      const effectFamily = deriveEffectFamily(String(r.name));
      await pool.query(
        `UPDATE press_color_tiers SET canonical_attrs = $2::jsonb
         WHERE id = $1 AND canonical_attrs IS NULL`,
        [r.id, JSON.stringify({ effectFamily, confirmed: false })],
      );
      tiers++;
    }

    const cRows = await pool.query(
      `SELECT id, name, swatch_hex FROM press_colors WHERE canonical_attrs IS NULL`,
    );
    for (const r of cRows.rows) {
      const colorFamily = deriveColorFamily(String(r.name), r.swatch_hex ?? null);
      // A null family is an honest unknown — leave the row NULL so a rerun
      // (or a smarter heuristic later) can still fill it, and the operator
      // surface shows it as untagged.
      if (colorFamily == null) continue;
      await pool.query(
        `UPDATE press_colors SET canonical_attrs = $2::jsonb
         WHERE id = $1 AND canonical_attrs IS NULL`,
        [r.id, JSON.stringify({ colorFamily, confirmed: false })],
      );
      colors++;
    }

    const jRows = await pool.query(
      `SELECT id, name FROM press_jackets WHERE canonical_attrs IS NULL`,
    );
    for (const r of jRows.rows) {
      const construction = deriveJacketConstruction(String(r.name));
      await pool.query(
        `UPDATE press_jackets SET canonical_attrs = $2::jsonb
         WHERE id = $1 AND canonical_attrs IS NULL`,
        [r.id, JSON.stringify({ construction, confirmed: false })],
      );
      jackets++;
    }

    console.log(
      `seed-canonical-spec-tags: tagged ${tiers} tier(s), ${colors} color(s), ${jackets} jacket(s)`,
    );
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("seed-canonical-spec-tags: FATAL", err);
  process.exit(1);
});
