---
name: Partner portal active-tab in URL + super-admin badge
description: Why every tabbed partner portal must write ?tab= back to the URL, and how operator super-admin view is signalled
---

# Tabbed partner portals must mirror their active tab into the URL

Every tabbed partner portal (Press, Vendor, Printer, Label, Artist, NonProfit,
Manager — all built on `OperatorShell`) must, on tab change, write the active tab
back to the URL as `?tab=<id>` AND read it on mount in the `useState` initializer.

Pattern (history *replace*, not push, preserve other params):
```ts
const handleTabChange = (newTab) => {
  setTab(newTab);
  const sp = new URLSearchParams(window.location.search);
  sp.set("tab", newTab);
  history.replaceState(null, "", `${window.location.pathname}?${sp}`);
};
```

**Why:** `FeedbackLauncher` captures `window.location.href` at submit time so an
operator triaging a partner bug report can deep-link straight to the exact
sub-page the partner was on. If the portal never wrote the tab into the URL, the
captured href has no `?tab=` and the deep-link lands on the portal's default tab.
The scope params (labelId/personId/managerId/scopeId/scopeKind) already live in
the URL search string, so always *merge* into existing params, never clobber.

**How to apply:** when you add a NEW tabbed portal or a new tab, wire both the
read (initializer, validate against the known tab ids) and the write-back. Single-
tab portals (PublisherPortal) are exempt.

# Operator super-admin view = top-nav badge, not a duplicated header

`OperatorShell` has a `superAdminView?: boolean` prop. When true it renders an
elegant "Super-admin view" pill (soft brand-blue, inline `style` because Tailwind
can't alpha a CSS var — use `var(--brand-blue-soft)` bg + `var(--brand-blue)` text)
in the top nav strip (both `leftnav` and `tabs` layouts).

**Why:** the old approach baked "(super-admin view)" into the `roleLabel` eyebrow
and forced the content-header identity block to render just to show it — which
duplicated the entity name already in the rail (Bill flagged this as redundant).

**How to apply:** pass `superAdminView={isSuperAdminView}`, keep `roleLabel` clean
(no "(super-admin view)" suffix), and for portals whose rail already shows the
wordmark (Press) set `hideHeaderIdentity` always-on. Only Press + Printer carry an
explicit `isSuperAdminView` flag today; other portals can opt in the same way.

# AdminFeedback "Page" link for operators

In the feedback detail, when a scoped partner URL is available (super-admin), the
raw captured "Page" URL renders as reference TEXT (`text-detail-page-ref`), not a
clickable link — clicking the partner-relative URL in the operator's own context
routes to the global Resellers rollup. The clickable action is the scoped
"Open in portal" link (`link-detail-view-as-partner`), which carries `?tab` over.
