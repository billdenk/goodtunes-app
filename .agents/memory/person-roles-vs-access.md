---
name: Person creative-credit roles vs access grant
description: Why people.roles[] (creative credits) is a separate axis from users.role (access grant) and the per-affiliation business title, and how derived roles roll up.
---

# THREE role axes on a Person — keep them separate

The admin "add a person" / Person profile flow distinguishes **three unrelated
things** that operators used to conflate. Do not collapse them back into one.

There is a THIRD axis beyond access + creative credits: the **business title**
a person holds at a partner (CEO / A&R / CMO / Fulfillment…). It is stored on
the *affiliation row* — `entity_contacts.role` for label/press/maker/fulfillment,
`organization_people.role` for non-profits — edited inline on the Person
Overview via a single-select-plus-free-text picker, super_admin-only, through the
same per-partner `POST {base}/:id/people {personId, role}` contact endpoints. It
must NEVER be written into `people.roles[]`.

**Why:** a person can be partner staff *and* an artist (e.g. a label CEO who
also produces). Modeling the job title as a creative credit would flip their row
to artist shape and pollute the music-only catalog vocabulary. The artist-shape
predicate (`server/lib/personArtistShape.ts`) reads ONLY `people.roles[]` + real
music credits, so a business title is structurally incapable of flipping shape —
the guard holds by construction, not by a runtime check.

**How to apply:** keep business titles on the affiliation row, music hats in
`people.roles[]`, system access in `users.role` — three distinct fields, never
cross-written. The Person "Permissions" tab shows artist-scope content (the
"governs AS AN ARTIST" note, the artist permission matrix, the invite-to-artist
panel) ONLY for actual artists; gate on artist shape / promoted / `"artist"` in
`roles[]`, never render it for contact-shape partner staff (who get a partner
note that only deep-links to each attached partner's own page — that's where
their real access lives). **Why:** framing non-artist partner staff as artists
mislabels them and offers controls that don't apply. Caveat: keep the
ambassador toggle visible in BOTH branches — NPO ambassadors are contact-shape,
so gating it on artist status would strip their promotion control. Partner-scope
access is always managed on the partner's own page, never a duplicated editable
matrix on the Person page.

The other two axes:

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
