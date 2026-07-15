---
name: Local edit state vs shared-query refetch re-seed
description: Why a panel that seeds local edit state from a shared query silently loses in-progress edits, and the guard that fixes it
---

An admin panel that mirrors a field of a **shared** query into local edit state
(e.g. the admin Person "Music credits" RolesPanel copying `person.roles` into a
`useState` for chip toggling) must NOT re-seed on every new value reference.

**Why:** the admin Person page (and pages like it) have many sibling panels that
all `invalidateQueries` the SAME person query on their own saves (this fixed a
"Music credits never saving" report). Each refetch
hands every panel a brand-new array/object reference with (often) unchanged
contents. A naive `useEffect(() => setLocal(server), [server])` fires on that
reference change and wipes the operator's unsaved in-progress edit. Symptom:
"the chip checks on but never persists" — because an unrelated save elsewhere
reset it before the operator hit Save.

**How to apply:** re-seed local state from the server value ONLY when
(a) you switched to a different entity — track the id in a `useRef` and compare —
or (b) there are no unsaved edits (`!dirty`). Keep `dirty` as a content compare
of local-vs-server; exclude it from the effect deps (eslint-disable
exhaustive-deps) so a toggle doesn't retrigger the effect. This preserves edits
across same-entity background refetches but still adopts a freshly-saved value.

**Save-side corollary — clearing `dirty` on save success:** the moment
`onSuccess` flips `dirty` to false, the re-seed effect adopts whatever the
shared cache holds RIGHT NOW. If the mutation invalidated the WRONG query key
(or one nobody reads), the cache still holds the pre-save value and the input
visibly reverts/blanks until a full page refresh — even though the save
persisted (this bit the Shopify-tab Sale URL: it invalidated an admin-prefixed
key while the panel's album prop reads a different key with staleTime
Infinity). Fix pattern: in `onSuccess`, `setQueryData` the saved (normalized)
value into the EXACT key the component reads BEFORE clearing `dirty`, then
invalidate that same key to reconcile with server truth. Verify the key by
finding the useQuery that feeds the prop — never trust the invalidation key
already in the file.

Related honesty seam on the same save path: partner accounts in **approval
mode** get edits queued as HTTP **202** (not applied). `apiRequest` treats every
2xx as success, so a bare `await apiRequest(...)` shows a false "Saved". Return
`{ diverted: res.status === 202 }` from the mutationFn, and on divert reset the
picker to the unchanged server value + toast "Sent for review" instead of
"Saved". The editable RolePicker/RolesPanel only render in god-view; the press
portal shows read-only credits (PressPersonOverview), so there's no press PUT.
