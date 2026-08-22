---
name: Press paid-feature unveil gate
description: Per-press entitlement flag pattern hiding paid features (Estimates + White Label) from press logins until an operator unveils them.
---

# Press paid-feature unveil gate

Paid press features are gated by a per-press boolean on `manufacturers` (e.g. `estimates_white_label_enabled`, NOT NULL DEFAULT false), following the `doesVinyl` capability-flag pattern.

**Rules:**
- Server gates read the RAW `users.role` of the authenticated caller (raw SQL), NOT `getUserRole()` — deliberately bypassing the view-as ALS hat so a super admin using "View as press" keeps access (view-as tokens are mintable only by live super admins). Client mirrors this: staff = `isSuperAdminView || !!getViewAsToken() || flag`.
- The estimates CRUD routes are SHARED with Packages (`kind=package` saved builds) which must stay open — gate inline only when `kind === "estimate"`; estimate-only surfaces (send, branding GET/PUT, brand-suggest) use a `requireUnveiled` middleware.
- Public routes serving recipients/fans (`/api/estimate-link/:token`, `/api/whitelabel/branding`) stay ungated.
- The flag write on `PUT /api/admin/manufacturers/:id` is staff-only (requireAdmin admits partner bearers — a press must never self-toggle its paywall). Note: routes.ts `requireAdmin` stamps `req.session.userId`, not `req.adminUserId` (that's the commerce.ts variant).
- Operator toggle lives on AdminManufacturer Details tab (super-admin-only card).

**How to apply:** reuse this exact pattern for the next paid press feature — one flag column, /me exposure, client filter of registry modules + sub-tabs with deep-link degradation, fail-closed server gates, staff-only write.

**Default state (Aug 21 2026, Bill's call):** all presses existing at ship time were backfilled to unveiled=ON (marker `task_3291_unveil_existing_presses` in post_merge_data_backfills, dev+prod) so nothing changed for presses yet; operators flip a press OFF when pricing starts. NEW presses still default OFF — flip them on at creation until billing launches.
