---
name: Press-portal scoped-surface checklist
description: When reusing a God-View admin surface inside a deny-walled press portal, every read source AND every write/destructive verb must be independently scoped + role-gated — not just the create endpoint.
---

Press partners (role==='manufacturer', isAdmin=true) are deny-walled off all
`/api/admin/people/*` by `pressGlobalDenyGuard`; their data flows ONLY through
`/api/press/:id/*` (requireAdmin + requirePressScope). When you reuse a
God-View component (e.g. `NewAlbumArtistDialog`, AdminPerson) inside the press
portal, each of these is a SEPARATE leak/authz surface and a code review will
reject if any one is missed:

1. **Create/scrape/mutation endpoints** — route through a press base
   (`personApiBase` prop) so they hit the scoped, force-homing endpoints.
2. **Local typeahead / list reads** — the lookup source itself leaks. A shared
   dialog's local catalog query (`/api/people`) enumerates the GLOBAL catalog;
   inject the source (`localPeopleApiBase` → `/api/press/:id/people`) so a press
   only ever sees its own roster. Bonus: a scoped roster only contains
   already-homed people, so "pick existing → associate" is a non-issue (it's
   plain navigation, nothing to re-home).
3. **Destructive verbs** — gate BOTH layers: server middleware
   (`requirePressEditor` / `pressUserCanEdit`, NOT scope-only) AND the UI button
   (hide when `/api/press/:id/me` `canEdit===false`). Read-only Staff have
   scope but must not mutate. requireAdmin/requirePressScope alone is NOT enough.
4. **Read-only profile fields** — disable inline edit affordances (e.g. the
   header photo-editor trigger) in press mode even though the server deny-walls
   the write; a live-but-dead button is a flagged UX dead-end.

**Why:** three separate code-review rejections on the same task each found a
different one of these (create scoped but typeahead global; remove endpoint
scope-only; photo trigger live). Scope = `default_press_id == :id` OR
primary_artist on a press-homed album (mirror `sqlPersonInPressScope`); do NOT
broaden to credited people — a featured guest would leak across presses.

## The press's album "Physical/Preflight" surface is NOT its own component
A press (role `manufacturer`) opens the SAME God-View album page
`/admin/albums/:id` "Physical" tab — `PressPanel` — as operators; there is no
separate press-portal album surface. (Don't confuse it with the QuickPrinter
`VendorScopeRouter → /api/printer/:id` preflight surface; that's a different
portal.) The press tab is hidden only for artist/label. So anything already in
PressPanel is visible to presses; to show press-only copy, thread a `pressMode`
prop down from AdminAlbum (true when role is `manufacturer`), the same pattern
`AlbumDashboardPanel` uses.

**Why:** a task assumed presses had a distinct printer-portal preflight surface
and nearly built a duplicate — the fix was a one-prop change to the shared
PressPanel. Note: `isGenericVendor(vendorId)` can only be true when a press name
is set but unmatched, so a resolved press name is always present alongside it
(generic badge + any press-name-dependent note co-appear, never one alone).
