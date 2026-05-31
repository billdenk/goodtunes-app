---
name: Person creative-credit roles vs access grant
description: Why people.roles[] (creative credits) is a separate axis from users.role (access grant), and how derived roles roll up.
---

# Two role axes on a Person — keep them separate

The admin "add a person" / Person profile flow distinguishes **two unrelated
things** that operators used to conflate. Do not collapse them back into one.

- **Access role** — single-select. Granting/inviting *system access*
  (admin / label / artist / ambassador) writes `users.role` (lives in the DB,
  not in `shared/schema.ts` — see `admin-roles-out-of-table.md`). One person
  gets at most one access grant per scope.
- **Creative credits** — multi-select. The "hats" a person wears
  (Artist / Producer / Writer / Performer / any catalog credit). Stored as
  `people.roles text[]` (default `'{}'`, NOT NULL). Free-text add allowed.

**Why:** the old UX was "add as admin, then reopen the Person and convert to
artist" — a dead-end because access-grant and creative-identity were the same
field. Splitting them lets an operator mark someone an Artist *and* grant them
admin in one step, and lets a pure session player carry Producer/Writer tags
with no system access at all.

## Derived rollup (read-only)
`GET /api/admin/people/:id` returns `derivedRoles` = the UNION of roles pulled
from the person's REAL credits (`track_writers`, `track_performers`,
`album_credits`) plus a prepended `"Artist"` when the person's shape resolves to
artist. These are shown as read-only chips alongside the hand-set `roles`. The
person's shape flips to `"artist"` when stored `roles` contain `"artist"` (case-
insensitive) — that is what replaces the old explicit promote step.

**How to apply:** when reading/writing person roles, write only to
`people.roles` (via `sanitizeRoles` on create + PUT). Never write derived roles
back to the column — they are computed each read. The shared RolePicker
(`client/src/components/admin/RolePicker.tsx`) is the single UI for both axes;
reuse it on every Person add surface rather than re-inventing role inputs.
