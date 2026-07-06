---
name: drizzle ANY(${jsArray}::type[]) is broken — use pgArray()
description: Embedding a JS array in a drizzle sql template spreads it into scalar placeholders, 500ing with "malformed array literal" (22P02); the fix + remaining landmine call sites.
---

Embedding a JS array directly in a drizzle `sql` template — `ANY(${ids}::varchar[])`
— does NOT bind a Postgres array. Drizzle spreads each element into its own
placeholder: `ANY(($2)::varchar[])` for one element, `ANY(($2,$3)::varchar[])` for
two. Postgres then tries to cast a bare scalar / row-expression to an array and
throws `malformed array literal: "<uuid>"`, SQLSTATE `22P02` → a 500.

**Why it looks intermittent / "only after X":** these queries are usually guarded by
`if (arr.length > 0)`. The array is empty until the relevant set is populated (e.g. a
referral subtree gains its first invite), so the call path is skipped and the bug
hides — then suddenly every call 500s once the list is non-empty. The triggering
*input* (a `+alias` email, a specific user) is often a red herring; the real trigger
is "the array became non-empty."

**Fix:** use the existing helper `server/lib/pgArray.ts`:
`= ANY(${pgArray(ids, "varchar")})` → emits `ARRAY[$1,$2]::varchar[]`, binds for any
length. (`IN (${sql.join(ids.map(v=>sql`${v}`), sql`, `)})` also works but pgArray is
the house convention.) Keep the `length > 0` guard — `ARRAY[]::t[]` is valid but the
roundtrip is pointless.

**How to apply:** grep `rg 'ANY\(\$\{[^}]+\}::(varchar|text|uuid)\[\]\)' server`
before trusting any raw-array query. As of this writing the invite-send dup-guard,
`GET /api/admin/invite-tree/...` overlay, and the admin invites *Pending-list* NPO
org lookup (`SELECT … FROM organizations WHERE id = ANY(…)` — 500'd the whole
pending panel the moment any pending invite had an NPO referrer/scope) were fixed.
Still-un-migrated landmine sites remain: `server/storage.ts` (kinds::text[]),
`server/payoutEarmarks.ts` (ids::varchar[] ×2), and `server/referralPayouts.ts`
(creditIds/claimedIds ×4). They will 500 the moment their array goes non-empty —
migrate to pgArray when touching those flows.

**Guard test:** `server/anyArraySpread.test.ts` mechanically scans server/+shared for any
`ANY(${...})` not wrapped in `pgArray(` (whitespace-tolerant, skips comment lines) — the
whole codebase was swept clean in the NPO-analytics 500 fix, so any new offender fails the
test workflow.
