---
name: Artist-owner phase-based edit access (requestOnly vs requiresApproval)
description: Why getAlbumEditAccess.requestOnly must stay a PURE owner-phase divert, orthogonal to requiresApproval, or byte-for-byte non-owner/operator parity breaks.
---

An `artist` on their OWN artist scope (membership on that scope, `sub_role` NULL) edits their own release in the SAME scoped operator editor (`AdminAlbum.tsx`) — reuse, don't fork. Operator-only chrome hidden + copy reworded; the phase model governs what happens to a metadata edit.

`getAlbumEditAccess` (server/auth/partnerPermissions.ts) surfaces `requestOnly` as a **pure owner-phase divert**:
`isOwner && canEditMetadata ? (locked ? !hasActiveOverride : !isPrepping) : false`
- prepping → false (save direct)
- released pre-sale (`first_sold_at` NULL, not prepping) → true (divert → 202 pending_changes, "Sent for review")
- post-sale (`first_sold_at` set) → true unless an active super-admin `admin_overrides` row exists (never a hard 403)

**Why:** `requestOnly` must stay orthogonal to the scope-wide `metadata_edits_require_approval` (surfaced SEPARATELY as `requiresApproval`). An earlier version OR'd `|| requiresApproval` into `requestOnly` — that changes what non-owner partners and operators see, breaking the task's hard constraint that operator/super_admin + ALL non-owner partner paths stay byte-for-byte unchanged.

**How to apply:** If you touch `requestOnly`, keep it gated on `isOwner && canEditMetadata` and never fold `requiresApproval` back in. Client consumers: `AlbumEditAccessChip` early-returns only when `canEdit && !requiresApproval && !requestOnly`; `EditablePanel` treats a 202 save as "Sent for review" (skips onSaved), 200 as a real save. Operational verbs (`upload_masters`/`map_shopify`/`manage_payouts`) stay live in every phase; masters never enter the metadata queue. Regression-pinned by `server/artistOwnerSelfServe.db.test.ts`. Full rules in docs/roles-and-permissions.md `### artist` section.
