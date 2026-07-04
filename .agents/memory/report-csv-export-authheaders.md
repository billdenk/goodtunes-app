---
name: Report CSV export must carry authHeaders
description: Why report CSV downloads can't be plain <a href> anchors under view-as impersonation
---
# Report CSV export must carry authHeaders (view-as safety)

The report JSON fetches all route through `fetchJson` (AdminErrorBoundary.tsx) which
sends `authHeaders()` — Bearer + `X-Preview-Pass` + `X-View-As-Token`. The view-as
token lives in sessionStorage and is a *header*, so the server (activeMembership.ts)
only injects the impersonated partner hat when the header is present.

**Rule:** A CSV/binary export to `/api/partner/reports/*` (or `/api/admin/reports/*`)
MUST be fetched with `authHeaders()` and turned into a blob download — use the
`fetchBlob` helper from `lib/queryClient.ts`, then create an object URL + click a
temporary `<a download>`. Never use a bare `<a href={csvUrl}>` navigation.

**Why:** A browser navigation from an anchor sends cookies but NOT custom headers, so
`X-View-As-Token` is dropped. An operator impersonating a partner via "View as" would
then download the CSV under their real super_admin god-view scope and leak every
partner's data — the exact leak the JSON fetch fix (view-as header) was meant to close.

**How to apply:** The shared `ExportLink` in `client/src/pages/AdminReports.tsx` now
does the blob download; reuse it for any new report export rather than adding a raw
anchor. A regression test guards this: reverting the export trigger to a header-less
anchor (dropping the view-as token) fails the client component test — don't remove
that guard when refactoring the export affordance.
