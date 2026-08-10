---
name: Soft-retire (archive) boundary fan-out
description: Adding an archived_at soft-retire flag requires filtering EVERY active mutation path, not just the main read — completion review will hunt each one.
---

The rule: when a table gains an `archived_at` soft-retire flag whose contract is
"hidden from active use, retained for historical snapshot resolution", filtering
the main catalog/list GET is maybe 20% of the work. Every path that *matches,
counts, mutates, or cascades over* those rows must treat archived rows as
absent, and every hard-delete path must refuse to touch them.

**Why:** press-catalog archive (types/colors) went through FOUR completion-review
rejections, each finding another live path: (1) create/mirror/sync routes still
matched archived rows as "existing" (blocking same-named replacements) or wrote
into archived tiers; (2) legacy DELETE routes could hard-delete archived history;
(3) format-disable cascaded a hard delete through archived tiers, and the CSV
import updated/deleted archived colors; (4) the Hellbender/MRP importers and the
Hellbender pricing sync (in routes.ts + hellbenderPricingSync.ts, NOT the
feature's own file) still indexed archived rows.

**How to apply:** before submitting, grep for every `from(<table>)` /
raw-SQL read of the table across the WHOLE repo (importers, syncs, CSV
apply, format/parent toggles, legacy delete routes live far from the feature
file) and decide per site: filter archived, 404/409 it, or deliberately leave
it unfiltered (historical resolvers like resolveCatalogIdentity). Hard deletes
on a soft-retired table should 409 when the row (or a cascading child) is
archived. Name-uniqueness/"already exists" checks must exclude archived rows so
replacements with the same name work — including sibling/mirror lookups.
