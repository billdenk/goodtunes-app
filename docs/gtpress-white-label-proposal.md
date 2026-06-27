# GTPress white-label (MRP) — scope & recommendation

**Status:** proposal for Bill to react to. **Nothing here is built.** This is an architecture/decision doc, not an implementation. (Task #1730.)

## The ask, in Bill's words

The MRP CEO wants a white-labeled version of what GoodTunes has built, so **MRP's own customers — who have never heard of GoodTunes — can log in and upload their releases under MRP's brand.** Bill's framing: not a fork of the codebase, but a "branch" that taps the same GoodTunes platform, with MRP living under a neutral, GoodTunes-owned umbrella domain — e.g. a generic `gtpress.com` where MRP sits at `mrp.gtpress.com`.

The headline recommendation: **we do not fork and we do not spin up a second app. We add a "press tenant" branding + scoping layer on top of the multi-tenant machinery this repo already has, and we expose it on a new umbrella domain.** Roughly 80% of what white-label needs is already shipped — host-based routing, per-scope data isolation, partner portals, the artist upload/quote sandbox, per-press catalogs and branding assets. What's genuinely new is a small "tenant" concept (which press owns this subdomain), per-tenant theming, and hiding the GoodTunes name on the tenant's surfaces.

---

## 1. What "white label" means here

White-label is a **presentation + entry-point** change, not a separate product. The same platform, the same database, the same operator (GoodTunes/Bill) behind the curtain — but an MRP customer only ever sees MRP.

### Surfaces MRP's customers see (branded as MRP)
These are the partner-facing surfaces that already exist and would be re-skinned per tenant:

- **Sign-in / sign-up** (`/admin/login`, invite-accept, `/finish-setup`, OAuth buttons) — MRP logo, MRP colors, "MRP" wordmark, no GoodTunes mark.
- **The upload / artist portal** — the scoped quote sandbox at `/admin/albums` (artists see only their own releases), the album editor (`AdminAlbum`), the Sell panel quote builder, master upload, credits/lyrics. This is the core of what MRP's CEO is picturing: "my customers log in and upload their releases."
- **The label / artist dashboards** (`/artist`, `/label`) — reporting + buyers, scoped to the partner.
- **Invite emails** — already templated with per-inviter branding (`resolveInviterBranding`); extend so a tenant press sends as "MRP," not "GoodTunes."
- **Transactional mail** the customer receives (signup code, password reset, payout notices) — branded MRP, sent from an MRP-aligned `MAIL_FROM`.

### What stays GoodTunes-operated, behind the scenes
- **The operator god-view** (`admin.goodtunes.music`) — platform pricing, payout release, the full press/label/vendor catalog, cross-tenant reporting. Bill still runs everything from here. MRP never sees this.
- **Payments, payouts, Stripe Connect, tax, fulfillment routing, GoodDeed printing** — the entire commercial backbone stays GoodTunes. (Who collects the money and who owns the customer relationship is the #1 open commercial question — see §7.)
- **The fan-facing player + storefront** (`my.`/`store.`/`get.goodtunes.music`) — this is GoodTunes' direct-to-fan product. **Recommendation: phase 1 white-label is the press-portal/upload side only.** Whether MRP also gets a branded *fan* storefront (its customers' fans buy on `mrp.gtpress.com`) is a much bigger lift and a separate phase — see §6.

### Where the GoodTunes brand is hidden vs. retained
- **Hidden** on every MRP-tenant surface: logo, wordmark, colors, email sender, page `<title>`, favicon, OAuth consent app name (this one has a real constraint — see §3).
- **Retained**: a quiet "Powered by GoodTunes" in a footer is a decision for Bill (some white-label deals want it, some forbid it). Internally everything is still GoodTunes — DB, code, operator shell.

---

## 2. Tenancy model — how MRP maps onto today's data model

**Key insight: a "press tenant" already mostly exists. It's a `manufacturers` (Press) row.** MRP is already modeled as a pressing plant. The white-label layer is "this Press row also owns a branded subdomain and a set of customers."

Today's relevant pieces (all shipped):

- **`manufacturers`** (Presses) — MRP is one row. Carries `name`, `domain`, `logoUrl`, capability flags, broker discount, and its own **catalog** (formats → color tiers → ladders → swatches). This is the natural anchor for a tenant's identity + branding.
- **`invited_by_press_id`** on `people` (artists) and `labels` — the provenance stamp set when a press invites a partner. This **already isolates a press's recruited customers** and soft-locks their Sell-panel pricing to that plant. An MRP-invited artist already only sees MRP's catalog and presses.
- **`memberships`** — one human can hold many scoped hats (artist on a label, teammate on a press). Access resolution (`getUserRole` / `findMembershipForScope`) narrows every gate, sidebar, album list, and report to the active hat. This is the isolation engine; it does not need to change for white-label.
- **`albums`** — owned via `label_id` / `primary_artist_id`; partner gates scope to the owner. `manufacturer_id` is the awarded press.

### What's new: a tenant concept
We need one small new idea — **"which Press owns this subdomain, and what does its brand look like."** Two options:

- **Option A (recommended): a `press_tenants` table** keyed `(subdomain, manufacturer_id)` carrying branding overrides (`brand_name`, `logo_url`, `wordmark_url`, `favicon_url`, `primary_color`, `accent_color`, `mail_from`, `powered_by_goodtunes` bool, `oauth_*` overrides). One row per white-label deal. Clean, queryable, lets a future second tenant (PMP, Hellbender) onboard with zero code.
- **Option B: hang the same columns directly on `manufacturers`.** Less ceremony, but conflates "is a pressing plant" with "runs a white-label storefront." Most presses will never be tenants, so a sidecar table (A) keeps `manufacturers` clean.

**Recommendation: Option A.** It makes "is this host a white-label tenant?" a single indexed lookup and keeps the door open for N tenants.

### How a tenant's customers attach
No new mechanism needed. An MRP-tenant invite is the existing press-invite carveout (a `manufacturer` caller with `invite_subusers` can invite Artist/Label, stamping `invited_by_press_id`). The only addition: invites minted *on the tenant host* default their referrer/branding to that tenant, and the accept flow lands them in the MRP-skinned portal.

---

## 3. Domain & routing strategy

The repo **already does host-based dual-shell routing and per-host OAuth** — this is the single biggest reason white-label is cheap here.

### Today (grounding)
- `server/auth/host.ts` `kindFromRequest` maps host → auth kind: `admin.goodtunes.music`→admin, `my./store./get.goodtunes.music`→customer. Unknown hosts fall back to path-based detection.
- `canonicalHostRedirect` 301s non-canonical `goodtunes.music` hosts to the canonical admin/customer host (exempts `/.well-known/*`).
- Session cookie is **host-only** (`sameSite=lax`, no `domain`), so each subdomain is its own auth island; cross-host handoff rides a bearer token in the URL **fragment**.
- `callbackOrigin` returns OAuth to the **exact** host the user started on so the `redirect_uri` matches registration; OAuth state is now a signed bag in the `state` param (stateless, no session cookie). New customer hosts must be registered as allowed redirect URIs with Google/Apple (documented in `auth-and-dual-shell.md`).

### Proposed
- Umbrella domain **`gtpress.com`** (GoodTunes-owned, neutral). Per-press subdomains: `mrp.gtpress.com`, later `pmp.gtpress.com`, etc.
- Add the tenant host pattern to `kindFromRequest`: `*.gtpress.com` resolves to the **admin/partner** auth kind (it's a portal, not a fan player), and the wildcard host is looked up against `press_tenants` to resolve *which* tenant.
- Attach the resolved tenant to the request (`req.tenant`) right after `authKindMiddleware`, the same way `req.authKind` is attached today.
- `canonicalHostRedirect` must **not** redirect `*.gtpress.com` to `admin.goodtunes.music` — add the umbrella domain to the exemption set (otherwise the whole point is lost).
- OAuth: `callbackOrigin` returns to the tenant host; **each tenant subdomain must be registered as an allowed redirect URI with Google + Apple.** This is per-subdomain console work and a real operational cost — flag for the rollout runbook. (Phase-1 can ship email/password + email-OTP only and defer per-tenant social login to avoid this.)
- DNS: a wildcard `*.gtpress.com` CNAME at the deployment plus the Replit custom-domain attachment. Apple/Google domain-association files served per host like today.

**Cookie/auth isolation is a feature, not a bug here:** because cookies are host-only, an MRP customer's session on `mrp.gtpress.com` never bleeds to `admin.goodtunes.music` or to another tenant. No new isolation code required.

---

## 4. Branding / theming

Today branding is **centralized** (CSS variables in `client/src/index.css` + `lib/brand-tokens.ts`, hard-coded logo in `GoodTunesLogo.tsx`) for GoodTunes itself, but the app **already renders per-partner logos + names** (`OperatorShell`, `PressPortal` pull `logoUrl`/`name` from the DB). White-label theming = "make the centralized GoodTunes tokens themselves tenant-overridable on tenant hosts."

Recommended approach (low-risk, no per-tenant CSS files):
- The server resolves `req.tenant` and injects a small **theme payload** (brand name, logo/wordmark/favicon URLs, primary/accent colors) into the served `index.html` (or a `/api/tenant/theme` boot fetch).
- The client sets the brand CSS variables from that payload at boot (the variables already exist — we just override their values per tenant instead of hard-coding GoodTunes).
- `GoodTunesLogo` becomes a `<BrandLogo>` that reads the tenant logo (falls back to GoodTunes on non-tenant hosts).
- Page `<title>`, favicon, meta, and email templates read the tenant brand name.

What's configurable vs. hard-coded (recommendation):
- **Configurable per tenant:** brand name, logo, wordmark, favicon, 2–3 brand colors, mail-from, "powered by" toggle.
- **Hard-coded / shared:** layout, component library, Apple-Music chrome, the design-system rules (`docs/design-system.md`). White-label changes the *paint*, not the *structure* — this keeps one codebase maintainable and avoids a per-tenant design-debt spiral. **Recommendation: do not promise MRP layout/UX customization in phase 1.** Colors + logo + name only.

---

## 5. Isolation & permissions

The hard part of multi-tenant — "tenant A can't see tenant B's data" — is **already enforced** by the membership/scope model and does not need a new mechanism:

- Every partner gate, report scope, sidebar, and album list narrows through `getUserRole` / `findMembershipForScope` to the caller's scope. An MRP artist sees only `primary_artist_id = their person`; a server-side guard (`artistAlbumScopeGuard`) 403s tampering on both `/api/admin/albums/:id` and `/api/albums/:id`.
- `invited_by_press_id` already scopes a press's recruited partners and locks their press picker to that plant — so MRP's customers naturally see MRP's catalog/colors, not the GoodTunes-wide press directory.
- The operator god-view stays super-admin-only behind explicit `requireRole("super_admin")` checks; partner verbs gate edits, not platform config.

The **one new isolation rule** white-label needs: **a request on a tenant host must be confined to that tenant.** Even though a user's membership already scopes their data, we should add a defense-in-depth check that the resolved `req.tenant` matches the caller's `invited_by_press_id` / press scope, so a stray cross-tenant link or shared login can't render tenant B's chrome around tenant A's data. This is a thin middleware, not a re-architecture.

Reused as-is: `partner_permissions` verbs (`edit_metadata`, `upload_masters`, `map_shopify`, `manage_payouts`, `invite_subusers`, `edit_credits_and_gear`), the invite sub-roles (identity/manager/team), the press owner/admin-vs-staff split, and the post-sale lock.

---

## 6. Phasing

### Phase 0 — decisions + domain (Bill, ~days, no code)
Settle the commercial questions in §7, register `gtpress.com`, decide phase-1 scope (upload portal only vs. also fan storefront), decide "Powered by GoodTunes" on/off.

### Phase 1 — minimal first slice: one tenant, one subdomain, branded upload portal (recommended starting point)
**Goal:** an MRP customer signs in at `mrp.gtpress.com`, sees MRP branding, uploads a release, builds a quote against MRP's catalog, and never sees the word "GoodTunes." Operator (Bill) still runs everything from `admin.goodtunes.music`.

Scope:
- `press_tenants` table + MRP row (branding + the MRP `manufacturer_id`).
- `kindFromRequest` recognizes `*.gtpress.com` → partner kind; `req.tenant` resolution middleware; `canonicalHostRedirect` exemption.
- Tenant theme payload + client brand-variable override + `<BrandLogo>` + title/favicon/email brand name.
- Tenant-confinement guard (defense-in-depth).
- Invites minted on the tenant host default to MRP branding/referrer; invite + signup + reset emails sent MRP-branded.
- Phase-1 auth: email/password + email-OTP (defer per-tenant social login to skip per-subdomain OAuth console registration).
- DNS + Replit custom domain + `.well-known` association files.

**Rough effort:** small-to-medium. Most of this is wiring + theming, not new subsystems — the data isolation, portals, and quote engine already exist.

### Phase 2 — multi-tenant hardening + social login
N tenants self-describe via `press_tenants` (PMP, Hellbender onboard with no code). Per-tenant Google/Apple OAuth (the per-subdomain console registration). Per-tenant mail domain verification. Admin UI for Bill to create/edit a tenant's branding.

### Phase 3 (optional, separate decision) — branded fan storefront
MRP's customers' *fans* buy on an MRP-branded storefront/player (`mrp.gtpress.com/store`, or a fan-subdomain). This is materially bigger — it pulls the whole purchase/checkout/player path under the white-label brand and reopens the "who owns the fan + the money" question. **Recommend treating as a distinct future phase, not bundled into the first MRP deal.**

### Biggest risks / unknowns
- **OAuth per-subdomain registration** — manual console work per tenant; mitigated by deferring social login to phase 2.
- **Email deliverability** — a new sending domain/subdomain per tenant needs SPF/DKIM/DMARC verified (the repo already has strict sender-reputation rules in `auth-and-dual-shell.md`). Sending MRP mail from a GoodTunes-aligned domain is simplest; a true `@mrp`-domain sender is more work.
- **"Powered by GoodTunes" / brand-leak audit** — finding every place the GoodTunes name/logo/`<title>`/OAuth-consent app name appears and making it tenant-aware. The OAuth *consent screen* app name is provider-owned and can't be fully white-labeled without a separate OAuth app per tenant — a real constraint to set expectations on.
- **Commercial model drives the build** — if MRP owns the customer + the money (reseller model) vs. GoodTunes owns them (referral model), the payments/payout wiring diverges. **This must be settled before phase 1** (see §7).
- **Support + "who do customers email"** — a white-label customer emailing "GoodTunes support" breaks the illusion; routing/branding of support is a process decision.

---

## 7. Open questions for the MRP conversation

Commercial + product questions Bill needs answered before phase 1 is locked:

1. **Who owns the customer relationship?** Are MRP's customers *MRP's* customers (MRP bills them, GoodTunes is invisible infrastructure) or *GoodTunes'* customers that MRP referred? This decides the whole money/payout model.
2. **Payments routing.** Who is the merchant of record? Does money flow MRP → GoodTunes, or GoodTunes → MRP (rev-share/margin)? Does MRP need its own Stripe Connect account, or does it ride GoodTunes' existing platform Connect?
3. **Pricing.** Does MRP set its own retail prices + margins, or inherit GoodTunes platform pricing? (MRP's per-press catalog already supports its own manufacturing rates; retail/platform-fee ownership is the open part.)
4. **Brand boundary.** Is "Powered by GoodTunes" acceptable, or must GoodTunes be fully invisible? Affects the OAuth-consent and email-sender constraints.
5. **Fan-facing or not?** Does phase 1 stop at the upload/partner portal, or does MRP also want a branded fan storefront (phase 3)?
6. **Support.** Who answers customer support, under whose name?
7. **Domain ownership.** Confirm GoodTunes owns/registers `gtpress.com` (Bill's call; not done here).
8. **Exclusivity / multi-tenant.** Is GTPress MRP-only, or the start of a multi-press white-label program? (The proposed `press_tenants` design assumes the latter is possible at no extra cost.)
9. **Data portability / exit.** If the MRP relationship ends, what happens to MRP's customers and their catalog? (Important to agree up front; the data is co-mingled in one DB by design.)

---

## Recommendation summary

- **Don't fork. Don't build a second app.** Add a thin tenant layer on the multi-tenant foundation that already exists.
- **Phase 1 = branded upload/partner portal for one tenant (MRP) on `mrp.gtpress.com`,** email/password auth, colors+logo+name theming, GoodTunes operator god-view unchanged behind the scenes.
- **Model the tenant as a `press_tenants` sidecar to the existing `manufacturers` (Press) row,** reusing `invited_by_press_id` + memberships for isolation (no new isolation engine).
- **Settle the commercial model (who owns the customer + the money) before building** — it's the only thing that can force a real architecture change.
- This is a scope doc only. Await Bill's reactions to §7 before any implementation task is opened.
