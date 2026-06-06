---
name: Person projection read-back + shared people query key
description: Why a person column can save but "revert", and the shared ["/api/people", id] cache-key race in the admin album editor.
---

# Person GET projection is the single read path

`toPublicPerson` (server/routes.ts) is the projection used by BOTH `/api/people/:id`
(public) and `/api/admin/people/:id` (spread + extras). If a `people` column is
written by `PUT /api/admin/people/:id` but is NOT in `toPublicPerson`, the UI can
never read it back — the save persists but the field re-reads a stale/empty value
and looks like it "reverted" (this was the `artistShareSlug` save-revert bug).

**How to apply:** any new editable `people` column needs a matching line in
`toPublicPerson`, or its admin field will silently appear to not save.

# Shared ["/api/people", id] cache key races

The admin album editor (AdminAlbum.tsx) has several panels — ShareLinkPanel,
AlbumLineupPanel, SellPanel — that each `useQuery({ queryKey: ["/api/people", id] })`.
Under the app-wide `staleTime: Infinity`, observers with DIFFERENT custom `queryFn`s
on the same key race: whichever last set the queryFn wins, so a panel can be served a
wrong-shape record. Fix is to have them all use the **shared default fetcher** (omit
`queryFn`) so there's one cache entry / one source of truth.

**Why:** different queryFns under one key + infinite staleTime = nondeterministic data.
**How to apply:** when multiple components read the same person, drop bespoke queryFns
and rely on the default fetcher; don't invent a second queryFn for the same key.

# 2xx ≠ saved (partner approval divert)

`apiRequest` resolves on ANY 2xx. `PUT /api/admin/people/:id` returns **202** when the
partner-edit gate diverts an approval-mode edit to the review queue (nothing written).
A mutation `onSuccess` that toasts "saved" unconditionally lies. Branch on `r.status`:
202 → "sent for review" (leave the draft as the still-unsaved value), 200 → "saved" +
invalidate/refetch.
