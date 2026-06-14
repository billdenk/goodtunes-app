---
name: Admin order search deep-link
description: How global admin search opens a specific fan/pressing order, and the per-status fetch gotcha
---

Global admin search (`/api/admin/search` href builder in server/routes.ts) deep-links
order results with `?orderId=<id>`: `fanOrder` → `/admin/fan-orders?orderId=…`,
`pressingOrder` → `/admin/pressing-orders?orderId=…`. Both pages derive the target order
from the **reactive wouter `useSearch()`** string (not a one-time `window.location.search`
read), open/expand that order, then scroll+ring the matching row.

**Reactivity gotcha:** AdminSearchBar navigates with wouter's client-side `navigate(href)`.
If the operator is *already* on `/admin/fan-orders` (or pressing-orders) and searches a
DIFFERENT order, the href differs only in the query string — same pathname — so the
component never remounts and wouter's path-only `useLocation` won't re-render it. A
one-time `useState(() => readWindowSearch())` initializer therefore misses the new order.
Fix = subscribe via `useSearch()` and a `useEffect([linkedOrderId])` that re-opens +
re-arms focus (resets `didFocus`, flips tab/status back to "all"). Mirrors AdminOrders.tsx.

**Gotcha:** AdminPressingOrders fetches rows **per status** (`?status=pending|approved|…`).
A deep-linked order can be any status, so the page MUST default `status` to `"all"` when an
`orderId` is present, or the row is filtered out server-side and never appears to expand.
AdminFanOrders is safe because its default tab is already "all" and it filters client-side.

**Why:** matches the existing focus pattern on AdminOrders.tsx (physical orders). Fan orders
use a slide-out OrderDetailSheet (openOrderId state); pressing orders have no sheet — the
"detail" is the exclusive-disclosure accordion card, so deep-link calls disclosure.setOpen.
