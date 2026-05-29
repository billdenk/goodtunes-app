# Roles & Permissions

The single source of truth for "who can do what" on the admin/partner side of GoodTunes. If you're touching admin code that gates an action, read this first and then verify against the code it cites — the matrix here is built from what's actually enforced, not from memory.

Customer-side roles (fans) are intentionally out of scope. So is the gogoods.com-imported legacy welcome-back flow ([`docs/migrations/gogoods-welcome-back.md`](./migrations/gogoods-welcome-back.md)), which is purely a fan-side journey.

## Decisions captured this round

1. **GoodSync™ for artists — free for now, behind a feature flag.** Today GoodSync runs server-side from `server/routes.ts` (the `/api/admin/songs/:id/sync-lyrics` family) gated only by `requireAdmin` + the partner verbs that already protect the parent song row. **There is no billing feature flag yet** — see `GAP-1` below. When the flag ships it should live as a single boolean on the `payout_settings` singleton (mirrors the `cert_cost_cents` / `shopify_fee_cents` pattern in [`docs/admin-conventions.md`](./admin-conventions.md#platform-pricing--snapshot-dont-recompute)), default ON (free), and when flipped OFF the artist-side GoodSync button shows a "coming soon" disabled state instead of POSTing.
2. **Invites — anyone approved as a partner can invite Artists or Labels; Makers/Resellers deferred.** Today the invite gate is the `invite_subusers` partner-permission verb. Super-admin can invite into any role. The current server-side rule in `/api/admin/invites` (POST) is **stricter than Bill's policy**: every non-super-admin caller is force-pinned to their own role + scope (`role = callerRole.role; roleScopeId = callerRole.roleScopeId`), with **one carveout** — a `manufacturer` (press) caller with `invite_subusers` is allowed to invite Artist or Label and the new partner is stamped with `invitedByPressId` ([`docs/admin-conventions.md`](./admin-conventions.md#press-invited-partners--hard-locked-sell-panel-presses-surface)). So today a label can only invite a teammate into its own label scope, an artist only into its own artist scope, an NPO only into its own NPO scope, etc. — they **cannot** cross-invite Artist↔Label. Bill's decision expands the graph; see `GAP-2`.
3. **Referrals — same shape as invites; referral $1/unit payout is per-inviter, not automatic.** The capability to *send* an invite is the `invite_subusers` verb. The capability to *earn $1/unit on the referred artist's sales* is a separate decision encoded on the referrer's row: `people.referrer_per_unit_cents` (default 100¢) for artist/ambassador referrers and the same column on the org-side via `organizations` lookups. Press attribution is intentionally $0 (the press is paid via manufacturing margin) — `press_invited_albums` rows exist for reporting only. Artist→artist attribution has a swap-state layer (`artist_referrals.swap_state` ∈ `referrer_keeps_full`/`invitee_keeps_full`) frozen at first paid order. NPO referrers can optionally take a $1.50/unit cut when `referral_funding_config.invitee_charity_bonus_enabled = true` (default false, funded from GoodTunes margin).
4. **Soft-delete / 30-day restore — separate task.** Not built. This doc only links to it once it has a task number.

## Capability matrix

Rows = `users.role` (the closed `ADMIN_ROLES` enum from `shared/schema.ts`). Columns = the capabilities Bill enumerated. `✓` = enforced today; `–` = role does not have the capability; `GAP-N` = should exist but isn't yet (see bottom of doc); cells in parens cite the code path that enforces the cell.

| Role           | Edit own metadata             | Upload masters             | Map Shopify           | Manage payouts            | Invite sub-users (Identity / Manager / Team) | Send referrals¹                | Earn $1/unit referral²            | Post-sale lock applies to | Approval-queue divert | Reports scope                |
|----------------|-------------------------------|----------------------------|-----------------------|---------------------------|----------------------------------------------|--------------------------------|-----------------------------------|---------------------------|-----------------------|------------------------------|
| `super_admin`  | ✓ (always passes³)            | ✓                          | ✓                     | ✓                         | ✓ — any role, any scope                      | ✓ — any                        | – (operator role)                 | – (bypass via override)   | – (never diverted)    | Everything + impersonation⁴  |
| `admin`        | ✓ (always passes³)            | ✓                          | ✓                     | ✓                         | – (no invite UI access)                      | –                              | – (operator role)                 | – (bypass)                | – (never diverted)    | Unscoped god-view, no payout-recon |
| `label`        | ✓ if `edit_metadata`          | ✓ if `upload_masters`      | ✓ if `map_shopify`    | ✓ if `manage_payouts`     | Label-scope teammates only — Identity / Manager / Team if `invite_subusers`. **Cannot invite Artists today** (server force-pins to own scope) — GAP-2 | – today (server force-pins; Bill's policy expands to Artist+Label, GAP-2) | ✓ (`people.referrer_per_unit_cents` on label's representative Person) | edit_metadata only⁵       | edit_metadata when `metadata_edits_require_approval` | Own scope (own albums) |
| `artist`       | ✓ if `edit_metadata`          | ✓ if `upload_masters`      | ✓ if `map_shopify`    | ✓ if `manage_payouts`     | Artist-scope teammates only — Identity / Manager / Team if `invite_subusers`. **Cannot invite Labels today** (server force-pins to own scope) — GAP-2 | Artist→Artist today via inviting another artist into own scope is **not** the cross-invite Bill wants — GAP-2 | ✓ (artist↔artist via `artist_referrals` + swap-state) | edit_metadata only⁵ | edit_metadata when `metadata_edits_require_approval` | Own scope (own albums) |
| `non_profit`   | – (no album metadata to edit) | –                          | –                     | –                         | NPO-scope teammates if `invite_subusers`. Ambassador invites additionally require the Person row to have `can_invite_ambassadors=true` (super-admin-flipped) | ✓ (Artist/NPO referrers on invites; NPO can only credit its own ambassadors) | ✓ (`referral_credits` with referrer_kind='non_profit'; optional +$0.50 from `referral_funding_config`) | n/a                       | n/a                   | Own referred-artists roll-up |
| `manufacturer` (a.k.a. Press) | – (presses don't own album metadata) | – | – | – | **Artist + Label invites** (special carveout) and own-scope teammates — if `invite_subusers`; new partner is stamped with `invitedByPressId` | ✓ via invite — `referrerKind='manufacturer'` auto-pinned on Artist/Label invites | – $0 attribution (`press_invited_albums` is reporting-only; press earns via manufacturing margin) | n/a | n/a | Project-scoped: invited-artists' first-album rollup |
| `fulfillment`  | – | – | – | – | – | – | – | n/a | n/a | Own scope (currently minimal — fulfillment dashboards TBD, `GAP-3`) |
| `vendor`       | – (vendor doesn't touch album rows) | – | – | – | – | – | – | n/a | n/a | `/vendor` shell — single vendor's GoodDeed services pricing (super-admin OR matching `vendor` scope) |

¹ **Send referrals** = the referrer field on the `/admin/invites` form. The Zod schema allows `referrerKind ∈ {artist, non_profit, manufacturer, ambassador}` (`shared/schema.ts` `insertAdminInviteSchema`). The dropdown shown depends on caller role (see `GAP-2`).
² **Earn $1/unit referral** = a `referral_credits` row materializes on each paid unit. Per-unit amount is `people.referrer_per_unit_cents` (artist/ambassador) or the equivalent on the org row (NPO). Status starts `pending_payout` and flips to `paid` once the batched Stripe Connect payout transfer (Task #354) lands.
³ Super-admin and `admin` always pass `requirePartnerPermission` — see `server/auth/partnerPermissions.ts` `requirePartnerPermission` super-admin branch.
⁴ `super_admin` reports support `?asPartner=<id>&asPartnerKind=label|artist` impersonation via `resolveReportScope` in `server/auth/roles.ts`.
⁵ Post-sale lock semantics — see [`docs/admin-conventions.md`](./admin-conventions.md) (Vendor-managed GoodDeed pricing section): `manage_payouts`, `upload_masters`, `map_shopify` stay live after first sale by design. Only `edit_metadata` (and the credits-and-gear sub-verb) is hard-blocked unless a super-admin mints an `admin_overrides` row. Vendor pricing edits bypass the lock the same way `manage_payouts` does.

### Verbs (`PARTNER_PERMISSION_VERBS`)

Enforced by `server/auth/partnerPermissions.ts` `requirePartnerPermission` middleware (per-route) or `gateAlbumRoute` / `partnerEditGate` helpers (per-handler).

| Verb                     | Stored on                                                | Gates                                                                                                                |
|--------------------------|----------------------------------------------------------|----------------------------------------------------------------------------------------------------------------------|
| `edit_metadata`          | `partner_permissions.edit_metadata`                      | Album/song/credits/bio/Person edits. Post-sale lock applies. `metadata_edits_require_approval` diverts to queue.    |
| `upload_masters`         | `partner_permissions.upload_masters`                     | Master audio upload + transcode. Stays live post-sale (operational, not historical).                                |
| `map_shopify`            | `partner_permissions.map_shopify`                        | Shopify product mapping + "Push to Shopify" draft. Stays live post-sale.                                            |
| `manage_payouts`         | `partner_permissions.manage_payouts`                     | Payout splits + Stripe Connect bank wiring + vendor GoodDeed pricing. Stays live post-sale.                         |
| `invite_subusers`        | `partner_permissions.invite_subusers`                    | The `/admin/invites` form. Non-super inviters: see decision 2 + `GAP-2`.                                            |
| `edit_credits_and_gear`  | `partner_permissions.edit_credits_and_gear`              | Per-song credits + artist gear list. Implied by `edit_metadata` (one-way) via `getUserPermissionOverride`.          |

### Invite sub-roles (Task #351 — `INVITE_ROLES`)

Artist-scope invites carry a sub-role (`admin_invites.invite_role`) that grants per-(user, scope, verb) overrides at accept time, layered on top of the scope-wide `partner_permissions` row. See `server/routes.ts` around the accept handler.

| Sub-role   | Default override grants                                                                  | Use case                                          |
|------------|------------------------------------------------------------------------------------------|---------------------------------------------------|
| `identity` | None — inherits scope-wide row                                                           | "I am this artist"                                |
| `manager`  | Granted: `edit_metadata`, `edit_credits_and_gear`, `upload_masters`, `map_shopify`, `manage_payouts`, `invite_subusers` | "I manage this artist"                            |
| `team`     | Granted: `edit_credits_and_gear` only                                                    | "I'm a bandmate; let me fix credits + gear only" |

Overrides land in `partner_permission_overrides (scope_kind, scope_id, user_id, verb, granted)`. NULL row = inherit scope. Explicit `granted=false` row hard-denies the verb for that user even when the scope-wide row would have allowed it.

## Per-role detail

### `super_admin`
- **Mint via:** `/admin/invites` (role = `super_admin`) by another super-admin, or the founder bootstrap (`bootstrapAccessGuard()` in `server/index.ts` keeps `bill@gogoods.com` on `super_admin` at every boot — see [`docs/auth-and-dual-shell.md`](./auth-and-dual-shell.md#admin-access-guard--promote-from-customers-task-256)).
- **God-view.** `requirePartnerPermission` and `partnerEditGate` short-circuit to `allow` on `super_admin`. The only operations gated behind explicit super-admin checks (`requireRole("super_admin")`) are: Platform Pricing writes, Quickprinter routing defaults, partner-permissions writes, post-sale-lock overrides (`admin_overrides`), customer→admin promote, GoodDeed-pricing snapshot, ambassador toggle (`people.can_invite_ambassadors`), and the partner referral-summary read.
- **Payout release is Bill-only, not super-admin-wide.** `/admin/payouts-release` lists every held payout earmark; every other super-admin sees it read-only. Only the user whose id matches `BILL_USER_ID` (or whose email lower-cases to `bill@gogoods.com` as fallback) can hit `POST /api/admin/payout-earmarks/:id/release|reject|hold-longer` or trigger the on-demand digest. Mints (every Stripe transfer the platform would have fired — order royalty, press invoice, referral credits) are open to the rest of the platform; only the **release** verb funnels through Bill. See `server/payoutEarmarks.ts:isBill`.
- **Reporting.** `resolveReportScope` honors `?asPartner=<id>&asPartnerKind=label|artist` for read-through impersonation — useful for "what does this label see in their shell?" without holding their credentials.
- **Can:** invite any role, including super-admin.

### `admin`
- **Mint via:** `/admin/invites` (role = `admin`) by a super-admin.
- The "privileged non-super, non-partner ops tier". Identical post-sale-lock + partner-permissions bypass as `super_admin`, but **cannot** flip super-admin-gated routes (platform pricing, partner-perm writes, overrides). Sees the unscoped god-view reports (KPIs / revenue / top content / funnels) but not the sensitive cuts (payout reconciliation, raw event explorer).

### `label`
- **Scope:** `users.role_scope_id` → `labels.id`.
- **Owns:** every `albums` row with `label_id = role_scope_id`. Partner gates resolve `target.scope` to `{kind:"label", id:labelId}` whenever the album has a label set.
- **Lands on:** `/label` after sign-in.
- **Reports:** own scope only (`effectiveScopeFilter` returns `{kind:"label", id}` for label callers).
- **Invites:** can mint **label-scope teammates only** today if `partner_permissions.invite_subusers = true` — the server force-pins `role`/`roleScopeId` to the caller's own. Cross-invites into Artist scope are blocked. Bill's decision (decision 2) expands to Artist + Label; see `GAP-2`.
- **Referrals:** Artist and Label referrers per decision 3; payout per-unit per `people.referrer_per_unit_cents` (or the label-side equivalent on its representative Person).

### `artist`
- **Scope:** `users.role_scope_id` → `people.id` (the Person row that represents this artist).
- **Owns:** every `albums` row with `primary_artist_id = role_scope_id` and no `label_id`. When an album has a label set, the label scope wins for partner gating — by design.
- **Lands on:** `/artist` after sign-in. With `invite_role` of identity/manager/team, see the Task #351 fallback (lands on the most-recent album editor or `/welcome-invitee`).
- **Reports:** own scope only.
- **Invites:** **artist-scope teammates** plus **fresh-artist invites** (Task #546) gated on `invite_subusers`. Identity/Manager/Team sub-roles apply to teammate invites; fresh-artist invites are uncapped on shape but capped at `ARTIST_INVITE_OUTSTANDING_LIMIT` (5) outstanding per artist. The artist-portal wrapper `POST /api/artist/invites/artist` mints a placeholder Person for the invitee, forwards into `/api/admin/invites` with `referrer_kind='artist'`, and accept-time stamps `people.referred_by_person_id` so the $1/unit referral chain attaches without a separate ledger. Cannot cross-invite Labels — `GAP-2` covers the remaining Label expansion.
- **Referrals:** can refer other artists (creates `artist_referrals` rows; swap-state default `referrer_keeps_full`). Frozen at first paid order on the referred artist's first GoodTunes album.

### `non_profit`
- **Scope:** `users.role_scope_id` → `organizations.id` (where `kind = 'non_profit'`). Reusing `organizations` is deliberate so `people.referred_by_org_id` keeps pointing at one table.
- **Lands on:** `/non-profit` after sign-in.
- **Capabilities are referral-centric.** NPOs don't own albums; they earn `referral_credits` (referrer_kind='non_profit') on every paid unit of any artist they referred. Surfaces the per-artist rollup, KPIs, and outstanding invites.
- **Sub-roles (invite tree).** A `non_profit` user can hold an optional sub-role recorded as `admin_invites.invite_role` on the most-recent accepted non-profit invite (Task #545): `npo_ambassador`, `npo_staff`, or none (the plain NPO admin). The NPO admin can invite ambassadors, staff, and artists into its scope; ambassadors and staff can only invite artists. All routes live under the scoped NPO portal (`POST /api/non-profit/:id/invites`, `…/resend`, `DELETE …/invites/:id`, `GET …/tree`) gated by `requireNpoScope`, so a sub-role user can't reach into another NPO's queue. Artist invites always stamp `referrer_kind='non_profit'` + `referrer_scope_id=<npoId>` so the referral $1/unit ledger continues to credit the NPO regardless of which teammate sent the invite. The team tree (`GET …/tree`) is admin-only and shows NPO → ambassadors/staff → artists, attributed via `admin_invites.created_by_user_id`.
- **Person-row ambassadors are different.** The older `people.can_invite_ambassadors` flag (super-admin-flipped via `PUT /api/admin/people/:id/ambassador-toggle`) promotes an *artist Person* into an ambassador-of-artists for an NPO — it's a Person attribute, not a user account. The Task #545 sub-roles above are user-account sub-roles for non-artist teammates (ambassadors and staff). The two coexist.
- **Optional charity bonus.** `referral_funding_config.invitee_charity_bonus_enabled = true` adds $0.50/unit to the NPO credit (funded from GoodTunes margin). Default off, super-admin-only.

### `manufacturer` (Press)
- **Scope:** `users.role_scope_id` → `manufacturers.id` (labelled "Presses" in the UI — see [`docs/admin-conventions.md`](./admin-conventions.md#pressing-plants-are-presses-not-manufacturers)).
- **Capabilities are invite + catalog-centric.** Press doesn't edit album metadata. With `invite_subusers` it can invite an Artist or a Label, which stamps `people.invited_by_press_id` / `labels.invited_by_press_id` on the new partner — that stamp soft-locks the Sell-panel Presses surface to this press until first run ships ([`docs/admin-conventions.md`](./admin-conventions.md#press-invited-partners--hard-locked-sell-panel-presses-surface)).
- **Reporting.** Project-scoped: `press_invited_albums` rolls up paid units on the invitee's *first* album per press (subsequent albums on other presses don't carry through).
- **Referral attribution is $0.** Press is paid via manufacturing margin, not the $1/unit ledger.
- **Sub-roles (Owner/Admin vs Staff — Task #699).** When you add a teammate to a press from the Contacts panel ("Add Admin"), you pick **Owner/Admin** or **Staff**. Owner/Admin gets the full press scope (all five partner-permission verbs granted). **Staff** gets *view + invite-artists only* — `invite_subusers` is granted, and `edit_metadata`, `upload_masters`, `map_shopify`, `manage_payouts` are written as explicit **deny** overrides on the (user, manufacturer-scope, verb) row, so a Staff teammate can browse the portal and invite artists but cannot change profile/catalog/payouts/masters. Staff invites are stamped `admin_invites.invite_role = 'press_staff'` (`PRESS_INVITE_ROLES` in `shared/schema.ts`); accept-time replays the same deny overrides via the manufacturer branch of the invite-accept handler. The plain press admin (no sub-role) is Owner/Admin-equivalent. Enforcement is two-layer: `pressUserCanEdit()` + the `requirePressEditor` middleware 403 every editing endpoint server-side, and the Press Portal hides/disables editing controls (Profile Save, logo, inputs) and shows a read-only notice when `/me` returns `canEdit:false`. **Staff cannot themselves add admins** — adding a teammate is Owner/Admin-only: `POST /api/admin/partner-contacts` gates the manufacturer branch on `pressUserCanEdit()` and 403s a Staff caller, and the can-invite probe returns a separate `canAddAdmins` flag (owner/admin-only) so the Contacts "Add Admin" menu item is hidden for Staff while "Invite Artist" stays available (Staff keep `invite_subusers` for the `/api/admin/invites` artist flow).

### `fulfillment`
- **Scope:** `users.role_scope_id` → `fulfillment_partners.id`.
- **Capabilities today are minimal** — the role exists in `ADMIN_ROLES` and is a valid `PARTNER_SCOPE_KIND`, but no partner-permissions verbs route exclusively to fulfillment yet. See `GAP-3`.

### `vendor`
- **Scope:** `users.role_scope_id` → `vendors.id`.
- **Lands on:** `/vendor` after sign-in — a stripped-down shell mounting only the GoodDeed Services pricing tab for this one vendor.
- **Can:** read + edit `vendor_gooddeed_services` rows for its own vendor (super-admin can edit any vendor's). Pricing edits bypass the post-sale lock — operational routing has to stay live.
- **Cannot:** invite anyone, see albums, see other vendors.

## Gaps

Each gap is a candidate follow-up task. None of them are fixed in this doc — this is audit-only.

- **`GAP-1` — GoodSync™ "free for now" feature flag.** Decision 1 above. No flag exists today; `/api/admin/songs/:id/sync-lyrics` runs whenever the caller can edit the parent song. Spec: add a single boolean `goodsync_free` (default true) to the `payout_settings` singleton; on the artist-side button, when false, swap to a disabled "coming soon" state and 403 the API.
- **`GAP-2` — Expand non-super invite graph to match decision 2.** Today `/api/admin/invites` POST is *stricter* than Bill's policy: every non-super caller is force-pinned to their own role + scope (`role = callerRole.role; roleScopeId = callerRole.roleScopeId`), with only `manufacturer → artist|label` carved out. To match the decision, allow `label`/`artist`/`non_profit` callers with `invite_subusers` to also mint Artist + Label invites (and only Artist + Label — Maker/Reseller/Manufacturer/Fulfillment/Vendor/NPO/Super-admin stay super-admin-only). When the new invite leaves the caller's own scope, stamp the referrer chain (`referred_by_person_id`/`referred_by_org_id`) like the manufacturer carveout already does for press. UI dropdown in `/admin/invites` (currently super-admin-only) should mirror, and the future partner-shell invite surface (`GAP-5`) should expose only `["artist", "label"]` for non-super callers.
- **`GAP-3` — Define `fulfillment` capabilities.** The role + scope exist; no partner-side surface mounts for it yet. Either ship the fulfillment dashboard (ship-queue, claim/print/ship state, GoodDeed insertion-batch hand-off) or remove `fulfillment` from `ADMIN_ROLES` until we're ready.
- **`GAP-4` — Soft-delete / 30-day restore.** Per decision 4, covered in a separate task. Link the task number here once it lands.
- **`GAP-5` — Non-`super_admin` access to `/admin/invites` for partner inviters.** Today `/admin/invites` lists every outstanding invite in the system (super-admin-only). A `label`/`artist` partner with `invite_subusers` has no UI to *send* an invite from their own shell — the verb is enforced server-side but no surface exposes it. Either ship a per-shell "Invite a teammate" sheet or note this as deferred.
  - **Press is now complete.** `manufacturer` admins have an end-to-end Invite-an-Artist surface in the Press Portal (Customers tab CTA + Pipeline "Invited" column). The portal calls press-scoped `POST /api/press/:id/invite`, `POST /api/press/:id/invites/:inviteId/resend`, and `DELETE /api/press/:id/invites/:inviteId` — all gated by `requirePressScope` and matched against `default_press_id` so one press can't touch another's queue. Pending invites surface Resend / Revoke / Copy-link affordances inline, and the accept URL is returned on the scoped read so the operator can paste it into iMessage/Slack when email is flaky. Label/Artist/NPO partner-shell invite surfaces are still the open part of GAP-5.
