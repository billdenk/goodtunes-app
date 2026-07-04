---
name: Embedded AdminReports sub-tab param isolation
description: Why the shared AdminReports uses ?rtab= (not ?tab=) when embedded in a partner portal.
---

# Embedded AdminReports lives inside a portal shell that already owns `?tab=`

The shared `AdminReports` (client/src/pages/AdminReports.tsx) renders two ways:
- **God-view**: direct super-admin visit to `/admin/reports` inside the full
  AdminFrame. Its inner report sub-tabs (sales / plays / audience / …) sync to
  `?tab=` and the Tabs are **uncontrolled** (`defaultValue`).
- **Embedded** (`<AdminReports embedded />`): rendered as a normal section inside
  a partner portal shell (ArtistDashboard, LabelDashboard, PressPortal). The
  portal shell (OperatorShell) already owns the top-level `?tab=` param to pick
  the rail section. If the embedded report also wrote `?tab=`, its sub-tab and
  the portal's section selector would fight over the same URL param.

**Rule:** when `embedded`, AdminReports reads/writes its sub-tab through `?rtab=`
and drives the Tabs **controlled** (`value`/`onValueChange` → replaceState).
When not embedded it stays on `?tab=` + uncontrolled. Keep the two param names
disjoint per surface.

**Why:** portals are tabbed OperatorShells whose rail state lives in `?tab=`
(and they mirror later `?tab=` changes back into local state via a useSearch
effect). A shared inner component that also claimed `?tab=` would desync the
portal rail. This is the same reason PressPortal already embeds AdminReports.

**How to apply:** any time you embed a `?tab=`-driven admin surface inside a
portal shell, give the inner component its own param namespace and make its
tabs controlled only in embedded mode; leave the standalone god-view untouched.
Reports is added to the artist/label rail via a `reports` module row in
components/operator/registry.ts, not a navExtras link-out.
