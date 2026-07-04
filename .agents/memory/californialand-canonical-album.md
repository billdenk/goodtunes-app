---
name: CALIFORNIALAND canonical release (Niina Soleil, prod-only)
description: Which prod CALIFORNIALAND row is real, and how the duplicate-shell reconciliation was applied.
---

# CALIFORNIALAND canonical album (prod-only)

Prod had THREE staged `CALIFORNIALAND` rows, all by artist **Niina Soleil**
(`people.artist_share_slug = 'niina-soleil'`), same Nightbirde-"Hope" decoy trap:
one real record with content, two empty shells, and an empty shell squatting the
clean `californialand` share slug while the record with songs was stuck on
`californialand-2`.

- **Canonical (keep):** the CALIFORNIALAND row that actually has songs (23) +
  the SKU + the two internal comp grants (`billdenk@mac.com`, `agshorty8@gmail.com`).
  It now owns the clean `californialand` share slug.
- **Empty shells (trashed):** the other two CALIFORNIALAND rows — no songs/orders/grants.

**How it was reconciled:** marker-guarded prod-data step in `scripts/post-merge.sh`
(`task_2454_reconcile_californialand`), keyed by IDENTITY not UUIDs — artist via
`artist_share_slug`, canonical = the non-trashed row WITH songs (must be exactly 1),
duplicates = the rest. Frees the clean slug from any squatting duplicate, soft-deletes
every non-canonical duplicate, then hands `californialand` to the canonical. Aborts
(RAISE EXCEPTION, no marker) if not exactly one canonical or if any duplicate gained
songs/orders/grants; self-gates to a no-op on any DB without the artist/release (all
dev clones — dev only has the unrelated "California Way").

**Prod status (verified 2026-07-04, still PENDING re-run):** the step FAILED SOFT on
the original merge — as of 2026-07-04 prod had NO marker, the canonical was still on
`californialand-2`, and one *trashed* empty shell still squatted the clean
`californialand` slug (the two empty shells were trashed manually on 07-02/07-03, on
different days, so they were NOT trashed by this reconcile). Because it fails soft
(WARNING, no marker, continue) a silent no-op is expected until it re-runs. The current
prod state now satisfies every guard (exactly 1 canonical-with-songs, 0 duplicates with
songs/orders/grants, no *live* row holding `californialand`), so the marker-absent,
idempotent step re-fires and completes on the NEXT post-merge run. Re-verify prod after
merge: marker present + canonical on `californialand` + shell slugs cleared.

**Why it's safe to hand the slug over even while a trashed shell still holds it:**
`albums_artist_share_slug_unique` is a PARTIAL unique `WHERE deleted_at IS NULL`, so a
soft-deleted shell doesn't block the live canonical. The step still clears the shell's
slug so a future restore can't collide.

**How to apply:** when picking a "CALIFORNIALAND" row in prod, trust the one WITH songs,
never the title alone. CALIFORNIALAND is NOT wired into `STOREFRONT_LAUNCH_ALBUM_ID`
(that's Nightbirde Hope) — no code pointer to touch, this was pure DB reconciliation.
