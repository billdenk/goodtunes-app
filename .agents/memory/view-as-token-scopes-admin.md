---
name: View-as token silently scopes admin (god-view) pages
description: Why an operator loses operator-only album tabs (Shopify/Physical/Customers) while the sidebar still shows full operator nav — a stale "View as this partner/artist" session, not a tab-logic bug.
---

# View-as token silently scopes admin pages

The production **"View as this partner / this Artist"** lens mints an HMAC token
(`POST /api/admin/view-as/mint`), carries it across subdomains in the URL
**fragment** (`#viewas=<token>&viewaslabel=<enc>`), and `main.tsx` stashes it in
**tab-scoped `sessionStorage`** (`gt:viewAsToken` / `gt:viewAsLabel`).
`queryClient` then attaches it as the `X-View-As-Token` header on **every**
request.

`getUserRole` (server/auth/roles.ts) checks `getViewAsHat()` **FIRST** — if the
token is present, the whole app resolves to that hat's role, **including
`/api/me/role`**.

## The trap
`ViewAsBanner` (the "Exit view" button that calls `clearViewAsSession()`) is
mounted **only in `OperatorShell`** (the partner portal), NOT in the admin
god-view shell. So a super-admin who opens a view-as portal tab and then
navigates **back into `/admin/...` in that same tab** stays artist/label-scoped:

- `AdminAlbum.visibleTabsFor` reads `/api/me/role` → `role==="artist"` →
  `isArtist`/`hidePress` true → it drops the operator-only **Physical / Shopify /
  Customers / Early-access** tabs. A `shopify_plus` album then shows only
  Dashboard / Overview / Package / Digital (+ Payments if `canManagePayouts`).
- There is **no visible indicator or exit** on admin pages, because the banner
  lives in `OperatorShell`.

The **sidebar still shows full operator nav** (Partners, Queues, Reports)
because the admin shell gates on the real session `user.isAdmin`, NOT on
`/api/me/role`. That mismatch is the tell.

## How to recognize / fix
- Symptom: "operator can't find the Shopify (or Physical / Customers) tab" while
  the sidebar is still the full operator shell = **stale view-as session**, not a
  `visibleTabsFor` bug. Check for an active view-as token before touching tab
  logic.
- The token is **tab-scoped**: opening the album in a **fresh tab** (or
  `clearViewAsSession()`, or the "Exit view" button back in the portal tab)
  restores full operator view and the operator-only tabs.

**Why:** view-as is meant to be portal-only, but nothing scrubs the token when
you leave the portal shell, and admin surfaces honor `/api/me/role`.

**How to apply:** if surfacing an exit affordance, the durable fix is to render
the view-as indicator/exit in the admin shell too (or scrub the token when
entering a non-portal admin route).
