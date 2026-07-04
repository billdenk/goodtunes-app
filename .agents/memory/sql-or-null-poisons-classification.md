---
name: SQL OR-predicate NULL poisons row classification
description: A nullable branch in a boolean OR predicate used to split rows into included/excluded can NULL-poison the whole expression, dropping rows from BOTH counts — wrap in COALESCE(..., FALSE).
---

# SQL OR-predicate NULL poisons row classification

When a SQL boolean predicate is used to *classify* rows into two buckets —
`COUNT(*) FILTER (WHERE NOT pred)` (kept) vs `COUNT(*) FILTER (WHERE pred)`
(excluded) — every branch of that predicate must be strictly TRUE/FALSE, never
NULL. In three-valued logic `NULL OR FALSE = NULL`, so a single nullable branch
makes the whole predicate NULL whenever no other branch is TRUE. A NULL row then
satisfies **neither** `NOT pred` nor `pred`, so it silently falls out of *both*
counts (kept + excluded < total).

Common NULL sources in such predicates:
- `(payload->>'key') = 'value'` → NULL when the JSON key is absent (not FALSE).
- `col IN (SELECT ...)` → NULL when `col` itself is NULL (e.g. anonymous
  analytics rows with `user_id IS NULL`).

**Fix:** wrap the entire returned expression in `COALESCE((... OR ...), FALSE)`
so an unclassifiable row folds to the *not-excluded* side (counts as genuine /
kept), rather than vanishing. Decide the fold direction deliberately —
fail-open toward "keep/count it" is right for a fan-listen count where an
unattributable listen should still count unless positively flagged non-fan.

**Why:** the fan-listen exclusion predicate (`nonFanListen()` in
server/artistReports.ts) shipped without the COALESCE and dropped every genuine
buyer + anonymous listen from BOTH `plays` and `excludedPlays` (kept=0,
excluded<total). A same-DB test that asserts `total == kept + excluded` is what
caught it; a test that only checked "excluded > 0" would have passed.

**How to apply:** any raw-SQL predicate feeding two complementary `FILTER
(WHERE pred)` / `FILTER (WHERE NOT pred)` aggregates (or a `WHERE pred` vs
`WHERE NOT pred` split) — always `COALESCE(..., FALSE)` the whole thing, and add
a conservation assertion (`kept + excluded == total`) to the test, not just a
one-sided "excluded is non-zero" check.
