# Shopify App Review — Submission Runbook

GoodTunes is submitted as a **public, unlisted** app so installs no longer show the
"unverified app" warning. The review bar is identical to a fully-listed app; every
section below must be addressed before flipping distribution to Public.

---

## Status board (source of truth — the task tracker auto-advances and is NOT authoritative)

**Phase gate rule — REVISED (Bill, 2026-07-24, end-of-chain gate is now the governing rule):**
Phases 5 and 6 run to completion without per-phase stops. Then, **before ANY other work**:
1. Deliver a **consolidated Phases 3–6 report** — per phase: what migrated, tests, architect-review flags, deviations — **plus** the two leftover "digital fee" wording fixes in `server/shopify.ts` (~lines 1116/1333, deferred to avoid conflicting with in-flight phase agents).
2. Run a **full `/shopify-app-store-review` re-run** with the delta versus the original audit.
3. **HARD STOP** until Bill has reviewed. Drafts #2851–2853 are outside approved scope — do not start them; Bill reviews after the Phase 6 report.

The tracker chain may auto-advance; ignore it — this table governs. (Historical note: the
original per-phase gate was overrun when Phase 4 auto-ran and merged without review.)

| Phase | Real status |
|-------|-------------|
| **1b — Checkout UI Extension** | **DONE — accepted by Bill 2026-07-24.** `goodtunes-5` released; `goodtunes-test` reconnected on the new expiring-token pair (it was the only installed legacy-token row). Full E2E green on test order #1002 (`NUDG9Z8WY`): `orders/paid` webhook → prod order row → redemption code → order metafield in the app-reserved namespace → redemption email → banner data path verified with a genuinely-signed session token (200 with code/URL; wrong confirmation 403; `/redeem/<code>` 200). Bill eyeballs the on-store banner himself. **Pending final cleanup:** order #1002's prod rows (order, order_items, redemption code, `delivered@resend.dev` stub customer) are retained ONLY so the banner poll works; delete them after Bill's eyeball. The Hope ownership grant + product mapping were already deleted. |
| **2 — Fee-ledger rename** | Merged (renames only, content pre-approved by Bill). |
| **3 — GraphQL migration (products/mappings)** | Merged (#2845, pre-gate-revision). |
| **4 — GraphQL migration (webhooks/orders/transactions)** | Merged (#2846). Auto-ran without per-phase review (gate overrun — acknowledged to Bill). 1094/1094 tests, hermetic-only at merge; the 2026-07-24 live E2E exercised its webhook + order paths against the real store successfully. |
| **5 — GraphQL migration (inventory/locations)** | Merged (#2847) under the end-of-chain gate. |
| **6 — Refunds GraphQL + remaining** | **DONE (#2848) — awaiting Bill's end-of-chain review.** Refund calculate/create migrated to `order.suggestedRefund` (advisory preview, never blocks) + `refundCreate`. `shopifyFetch` and the last REST calls removed; script-tag cleanup deleted (script tags never used on 2026-01). `orders/refunded` **confirmed absent from the 2026-01 `WebhookSubscriptionTopic` enum** — the dead registration attempt is dropped everywhere (map, register, reinstall-hooks, inspect); the webhook handler still accepts both `orders/refunded` and `refunds/create` payloads for safety. Expected webhook count is now **3**. Hermetic Phase 6 tests in `server/shopifyGraphqlPhase6.test.ts`. |

### Test hygiene rule (Bill, 2026-07-24)
**Never map a test to a real artist's album.** Real releases (especially Nightbirde's
*Hope* — estate reporting must stay pristine) are off-limits for test mappings, orders, or
grants. A dedicated hidden QA album exists on prod for all future Shopify test runs:
`albums.id = a0000000-0000-4000-8000-00000000e2e0` ("GoodTunes QA Test Album (do not sell)",
`is_hidden=true`, artist "GoodTunes QA"). Map test products to that album only.
Also learned: an order created *already-paid* via `orderCreate` fires no `orders/paid`
webhook — create PENDING then `orderMarkAsPaid` to exercise the real transition.

### Historical-order backfill — DESIGN ONLY (do not build until Niina's decision lands)
Niina Soleil's existing Shopify pre-orders are exactly the "already-paid, no webhook" case
above: they predate install/mapping, so they never minted codes. Spec (Bill, 2026-07-24):
- **Trigger:** on install (or on demand from the admin store page), for each mapped
  product with digital unlock, fetch historical PAID orders via the Admin GraphQL API
  (paginate `orders(query: "financial_status:paid")`, filter line items to mapped variants).
- **Mint:** for each matched order with no existing prod order row, materialize the order
  row + redemption code exactly as the webhook path does (idempotent on `shopify_order_id`).
- **Metafield:** write the redemption metafield on each historical order
  (app-reserved `$app:goodtunes` namespace, same JSON shape).
- **Email:** send access emails **per the artist's retroactive decision** — an explicit
  per-store/per-mapping flag (send-to-all vs. silent mint, codes surfaced only on the
  order-status page). Default OFF; no email without the artist's opt-in.
- **Blocked on:** Niina's decision. Scope only — no implementation yet.

### Pre-launch queue (Bill, 2026-07-24 — small items due before 8/14)
1. **Redeem email-mismatch 403 copy.** `/redeem/:code` claim rejects when the signed-in
   account's email ≠ the Shopify order's buyer email. Today that surfaces as a raw toast
   ("Signed-in account doesn't match the order's email"). Replace with helpful copy:
   *"This code belongs to the email used at purchase. Sign in with that email, or contact
   support@goodtunes.music and we'll sort it out."* Fans buy with PayPal emails and
   spouses' cards — some will hit this on launch day.
2. **Support re-attach procedure (manual, until tooling exists).** When a fan writes in
   because their GoodTunes account email differs from the Shopify buyer email:
   a. Verify the fan owns the purchase (order number / confirmation number / receipt from
      the Shopify store, and confirm the buyer email with them).
   b. Find the order: `SELECT id, customer_id, album_id FROM orders WHERE
      shopify_order_id = '<numeric id>'` (or via the redemption code →
      `shopify_redemption_codes.order_id`).
   c. Find the fan's real account id in `customer_users` by their GoodTunes email.
   d. Mirror what claim does: `UPDATE orders SET customer_id = '<fan id>' WHERE id = …;`
      then `INSERT INTO user_albums (id, user_id, album_id) VALUES (gen_random_uuid(),
      '<fan id>', '<album id>') ON CONFLICT DO NOTHING;` and stamp
      `shopify_redemption_codes.redeemed_at/redeemed_by_user_id` if unredeemed.
      (The webhook-created stub account under the buyer email can be left; it holds no
      password unless the fan set one.)
   **Two more week-one support scripts (Bill, 2026-07-24):**
   - **Apple "Hide My Email":** the fan's private-relay address won't match the Shopify
     buyer email → they hit the redeem mismatch path. Script: verify the purchase
     (order/confirmation number + buyer email), then run the re-attach above.
   - **Claimed stub + OAuth:** fan set a password on `/redeem`, later tries Google/Apple
     with the same email and sees the "sign in to link" guard. Script: sign in with your
     password first, then link the provider from Account settings. (Working as designed —
     the guard protects a credentialed account.)
3. **`external_paid` cert-PDF gap (Shopify+ / Niina).** ✅ **FIXED 2026-07-24** (approved
   as a gate exception by Bill). `external_paid` added to `FINALIZED_CERT_ORDER_STATUSES`
   in `server/certificates.ts`. All three uses of the set audited — cert PDF download,
   QR provenance (`/g/:shortId`) resolution, and the digital name-confirm endpoint — the
   one shared-set change correctly enables all three for Shopify+ unlock orders. Cert
   test suites re-run green (33/33).
4. **Checkout-editor block placement is per-store manual setup.** Both extension targets
   are `block.render` (thank-you + customer-account order status), so each store's admin
   must place the block once: Settings → Checkout → **Customize** (thank-you page) and
   the customer-accounts editor (order status page) → Add app block → GoodTunes
   Redemption → Save. This is a required step in Niina's store setup runbook.

### Post-launch queue (after 8/14 — decided by Bill 2026-07-24)
- **Sell-mode rename.** Internal `shopify_plus` sell mode collides with Shopify's "Plus"
  plan name. Proposed mapping: `direct` → `goodtunes_direct`, `shopify_plus` →
  `goodtunes_for_shopify`; legacy `shopify` mode to be decided (merge or kill — see the
  sell-mode inventory delivered with the consolidated Phases 3–6 report). No live-enum
  renames before launch; CALIFORNIALAND's row works today.
- **OAuth on /redeem (candidate).** Redeem page stays password-only for 8/14. Revisit
  with real launch data on whether fans stumble; the OAuth auto-link path (unclaimed stub
  → identity attach on provider-verified email) covers OAuth-preferring fans for launch.

---

## 1 — GDPR compliance webhooks (shipped)

Three mandatory endpoints are live in `server/shopify.ts`.  Configure these URLs
in the Partner Dashboard → App setup → GDPR mandatory webhooks:

| Webhook | URL |
|---------|-----|
| Customer data request | `https://my.goodtunes.music/api/webhooks/shopify/customers/data_request` |
| Customer redact | `https://my.goodtunes.music/api/webhooks/shopify/customers/redact` |
| Shop redact | `https://my.goodtunes.music/api/webhooks/shopify/shop/redact` |

All three endpoints:
- Verify `X-Shopify-Hmac-Sha256` against the raw body with `SHOPIFY_API_SECRET`; return `401` on failure (required by Shopify's automated check).
- Parse the JSON payload and log the operation.
- Process the request (data compilation / anonymization / deletion) as described below.

### What each webhook does

**`customers/data_request`** — Compiles all GoodTunes-side data we hold for the
customer that came through the requesting shop (orders, album unlock grants,
redemption codes) and logs it via `[shopify-gdpr] data_request compiled`.
The operator retrieves this from the server log and returns it to the data subject
within Shopify's required window (30 days). No data leaves via the webhook response.

**`customers/redact`** — Clears the `shopify_order_token` (the credential gating
the redemption endpoint) on the specified orders and deletes their one-time
redemption codes. If the affected customer has **no other orders** in GoodTunes
(i.e. their account was created solely from this Shopify store), their
`customer_users` row is anonymized in place: email/username replaced with a
`redacted-<id>@shopify-gdpr.invalid` marker, name/address/phone cleared. Accounts
with additional direct purchases are left intact (only the Shopify-specific PII is
cleared).

**`shop/redact`** — Fires ~48 h after uninstall. Clears all order tokens and
disassociates orders from the store (sets `shopify_store_id = NULL`), deletes
redemption codes for every store order, anonymizes accounts that have no non-store
orders, then **deletes the `shopify_stores` row** (which cascades to
`shopify_product_mappings` and `platform_wholesale_ledger`).

---

## 2 — Privacy policy gap analysis

**Existing pages:** `https://goodtunes.music/privacy` and `.../terms` (Webflow apex,
outside this repo). These pages already cover GoodTunes's direct fan data flows.
The Shopify listing requires the privacy policy to also cover merchant/Shopify-
specific data flows. Bill should add the following copy gaps to the Webflow site
before filing the Partner Dashboard "Protected customer data" application.

### Required additions to goodtunes.music/privacy

Add a **"Shopify merchant data"** section (suggested draft — Bill to review for
accuracy and legal style):

> **Shopify stores.** GoodTunes operates a Shopify app that allows record labels and
> artists to bundle a GoodTunes digital album unlock with their Shopify store
> purchases. When a fan purchases a qualifying product on a connected Shopify store,
> GoodTunes receives the following order data from that store via Shopify's webhook
> API: customer name, email address, shipping address, phone number, and the Shopify
> order ID. This data is used solely to create or locate the fan's GoodTunes account
> and deliver the digital album they purchased.
>
> **Retention and deletion.** GoodTunes retains order data for the lifetime of the
> associated account. If a merchant uninstalls the GoodTunes app, GoodTunes processes
> Shopify's mandatory GDPR redact webhooks: customer-level redact requests remove
> identifiable information from affected orders and, where the account was created
> solely from that merchant's orders, anonymize the account entirely. Shop redact
> requests (sent ~48 hours after uninstall) additionally delete the store's product
> mappings, pricing records, and access tokens.
>
> **Data subject rights.** Fans may request deletion of their GoodTunes account at
> any time from Account → Privacy → Delete My Account. Merchants may submit data
> subject access or deletion requests via the Shopify partner compliance flow.

---

## 3 — Protected customer data application + scope justification

File this in Partner Dashboard → API access → Protected customer data before flipping
to Public. Copy-paste the answers below.

### Fields accessed and why

| Field | Source | Purpose | Stored? | Retention |
|-------|--------|---------|---------|-----------|
| Customer first name | `order.customer.first_name` | Create/locate GoodTunes account; display name | Yes — `customer_users.display_name` | Lifetime of account; cleared on GDPR redact |
| Customer last name | `order.customer.last_name` | Same | Yes — `customer_users.display_name` | Same |
| Customer email | `order.customer.email` | Account identity; redemption code delivery | Yes — `customer_users.email` | Same |
| Phone number | `order.customer.phone` | Account creation fallback; optional notification | Yes — `customer_users.phone` | Same |
| Shipping address | `order.shipping_address` | Shipping label for physical vinyl (if applicable) | Yes — `customer_users.shipping_address` (jsonb) | Same |
| Billing address | `order.billing_address` | Fulfillment records | Yes — `customer_users.billing_address` (jsonb) | Same |
| Shopify order ID | `order.id` | Idempotency (prevents duplicate unlocks on webhook replay); order-status page lookup | Yes — `orders.shopify_order_id` | Same |
| Shopify order token | `order.token` | Gate the public redemption-by-order endpoint (so only the buyer on their own order page can pull the code) | Yes — `orders.shopify_order_token`; cleared on GDPR redact | Same |

### Where data is stored

- **Database:** Replit-hosted PostgreSQL (encrypted at rest, TLS in transit). Prod DB is separate from dev.
- **Application layer:** Express/Node.js on Replit Autoscale. No caching of PII outside the DB row.
- **No third-party sharing of Shopify customer PII.** The email is passed to Resend (transactional email) only to deliver the redemption code to the buyer.

### Scope justifications

| Scope | Justification |
|-------|---------------|
| `read_orders` | Required to access the orders/paid and refunds/create webhook payloads (customer identity, line items, totals, status) so GoodTunes can mint and revoke digital album unlocks. |
| `write_orders` | Required to stamp a `note_attribute` (the redemption URL) onto the Shopify order record so it appears in the merchant's order confirmation email Liquid template. |
| `read_products` | Required to enumerate the merchant's catalog in the admin product-mapping UI so the operator can link a Shopify product/variant to a GoodTunes album without typing product IDs by hand. |

---

## 4 — Install / uninstall / reinstall hygiene

The install→use→uninstall→reinstall flow is handled in `server/shopify.ts`:

- **Fresh install:** `upsertStore` inserts a new row; `registerWebhooks` registers the four merchant webhooks. Both are idempotent (Shopify deduplicates on address). Post-purchase display is handled by the Checkout UI Extension (`extensions/goodtunes-redemption`) — no ScriptTag is installed.
- **Uninstall (via app/uninstalled webhook):** Stamps `uninstalled_at`, clears `access_token`, `refresh_token`, and expiry timestamps. The store row is kept so historical order joins remain valid.
- **Reinstall:** `upsertStore` finds the existing row by `shop_domain` and overwrites the token fields + clears `uninstalled_at`. Re-runs webhook registration.
- **Shop redact (48h after uninstall):** The GDPR `shop/redact` webhook deletes the store row and cascades cleanup (see §1).

**No orphaned webhooks** — Shopify automatically deregisters app-level webhooks when the store uninstalls; reinstalling re-registers them via our callback.

### Step-by-step operator verification (run on a Shopify development store)

These steps use two admin API endpoints added specifically for this verification:

| Endpoint | Purpose |
|----------|---------|
| `GET /api/admin/shopify/stores/:id/inspect` | Live-checks Shopify API for expected webhooks; shows DB row state |
| `POST /api/admin/shopify/stores/:id/reinstall-hooks` | Re-registers webhooks; idempotent (safe to call on an already-healthy install) |

#### Prerequisites

- A **Shopify development store** (Partner Dashboard → Stores → Create development store). Do **not** use a production store.
- `SHOPIFY_API_KEY` and `SHOPIFY_API_SECRET` set in Replit Secrets (already done for prod).
- The app must be running at its public URL (`my.goodtunes.music` in prod, or your dev tunnel).
- An admin session (or Bearer token) for the `curl` calls below.

---

#### Step 1 — Fresh install

1. In the GoodTunes admin → Shopify page, click **Connect a Shopify store**, enter `<dev-store>.myshopify.com`, and complete the OAuth flow.
2. Shopify redirects back to `/admin/shopify?installed=<storeId>`. Note the `<storeId>` UUID.
3. **Verify via API:**
   ```sh
   curl -s -b 'YOUR_SESSION_COOKIE' \
     https://my.goodtunes.music/api/admin/shopify/stores/<storeId>/inspect | jq .
   ```
   Expected response shape (all must be true before continuing):
   ```json
   {
     "dbRow": { "hasAccessToken": true, "uninstalledAt": null, ... },
     "live": {
       "allWebhooksPresent": true,
       "webhookCount": 3,
       "foundTopics": ["app/uninstalled","orders/paid","refunds/create"],
       "missingTopics": [],
       "healthy": true
     }
   }
   ```
4. Capture a screenshot of the GoodTunes admin Shopify page showing the connected store (**§5 screenshot #1**).
5. Capture a screenshot of the Shopify OAuth consent screen from step 1 if you can re-run it in an incognito window (**§5 screenshot #2**).

---

#### Step 2 — Place a test order

1. In the Shopify dev store, create a free or $1 product and map it to a GoodTunes album via **Admin → Shopify → product mapping** (**§5 screenshot #3**).
2. Place an order for that product as a test customer (use Shopify's Bogus Gateway or a real test card with Stripe Test mode).
3. **Verify** the `orders/paid` webhook fired: check server logs for `[shopify-webhook] order <id> → GoodTunes order <id> code=<code>`.
4. Open the Shopify **Thank-you page** (immediately after checkout) and/or the **order status page** (order status URL in Shopify admin → Orders). The GoodTunes Checkout UI Extension block ("Your digital album is ready" banner with the "Get your music now" link) must appear. Note: the extension block only renders after the app version carrying it is **released** in the Partner Dashboard AND the merchant has added the block in the checkout editor (thank-you + order-status surfaces) (**§5 screenshot #4**).
5. Click the CTA → lands on `/redeem/<code>` (**§5 screenshot #5**).

---

#### Step 3 — Uninstall

1. In the Shopify dev store admin → Apps → Uninstall GoodTunes.
2. Wait ~10 seconds for the `app/uninstalled` webhook to arrive.
3. **Verify via API:**
   ```sh
   curl -s -b 'YOUR_SESSION_COOKIE' \
     https://my.goodtunes.music/api/admin/shopify/stores/<storeId>/inspect | jq .dbRow
   ```
   Expected: `"uninstalledAt": "<timestamp>"`, `"hasAccessToken": false`, `"hasRefreshToken": false`.
4. The `live` key will be `null` with `"note": "Store is uninstalled — Shopify API not queried"` — this is correct.
5. Verify **no orphaned webhooks** by checking Shopify admin → Settings → Notifications (Webhooks section) — it should be empty.

---

#### Step 4 — Reinstall

1. Re-run the install flow: GoodTunes admin → Shopify → Connect a store → same `<dev-store>.myshopify.com`.
2. **Verify via API** (same `<storeId>` as before — upsert should have found the existing row):
   ```sh
   curl -s -b 'YOUR_SESSION_COOKIE' \
     https://my.goodtunes.music/api/admin/shopify/stores/<storeId>/inspect | jq .
   ```
   Expected: `"uninstalledAt": null`, `"hasAccessToken": true`, `allWebhooksPresent: true`.
3. Verify **historical orders are still present**: the test order from Step 2 should still show in admin → Orders for that store.
4. If the inspect call shows `missingTopics` (e.g. a network blip during the callback), run:
   ```sh
   curl -s -X POST -b 'YOUR_SESSION_COOKIE' \
     https://my.goodtunes.music/api/admin/shopify/stores/<storeId>/reinstall-hooks | jq .
   ```
   Expected: `{ "ok": true, "webhooks": { ... "already_registered" ... } }`.

---

#### Checklist — all must be ✅ before submission

- [ ] Fresh install: `inspect` returns `healthy: true` (4 webhooks)
- [ ] Checkout UI Extension version released in Partner Dashboard (network-access capability approved first) and the block added in the checkout editor
- [ ] Uninstall: `dbRow.uninstalledAt` is set, `hasAccessToken: false`
- [ ] No orphaned webhooks remain in Shopify after uninstall
- [ ] Reinstall: `dbRow.uninstalledAt` is null, `inspect` returns `healthy: true`
- [ ] Historical test order still present after reinstall
- [ ] Test order thank-you and order-status pages show the GoodTunes extension banner
- [ ] `/redeem/<code>` landing page works end-to-end
- [ ] All 5 screenshots captured (see §5)

---

## 5 — Listing fields + Partner Dashboard pre-checks

### Listing content (to fill in Partner Dashboard)

| Field | Value / notes |
|-------|---------------|
| **App name** | GoodTunes |
| **Short description** (≤100 chars) | Bundle digital album unlocks with physical record orders. Fans get their music instantly. |
| **Long description** | GoodTunes connects your Shopify store to the GoodTunes digital music platform. When a fan buys a qualifying vinyl or physical product on your store, GoodTunes automatically delivers a digital album unlock — no extra steps for the merchant or the fan. The fan receives a unique redemption link on the order confirmation page and by email, clicks it, and their music is live in their GoodTunes library. Supports signed GoodDeed certificate add-ons for authenticated collectibles. |
| **App icon** | 1200×1200 px, navy #00062B background, GoodTunes "G" wordmark. **Bill to provide.** |
| **Support email** | **Bill to confirm** (e.g. support@goodtunes.music) |
| **Privacy policy URL** | https://goodtunes.music/privacy |
| **Terms of service URL** | https://goodtunes.music/terms |
| **Distribution** | Public — Unlisted (flip AFTER protected-data application is approved) |

### Screenshots required (install-to-redeem flow)

Capture these from a real dev-store install:
1. The GoodTunes admin "Connect a Shopify store" dialog.
2. Shopify's OAuth consent screen showing the four scopes.
3. The admin product-mapping UI (link a Shopify product to an album).
4. The Shopify thank-you / order-status page with the GoodTunes Checkout UI Extension banner ("Get your music now").
5. The GoodTunes `/redeem/:code` landing page (pre-filled email, one-click claim).

### Demo store + reviewer walkthrough

Provide a **development store** (not a real production store). In the "Test credentials" field in Partner Dashboard → App submission, add:

```
Demo store URL: https://<dev-store>.myshopify.com/admin
Login: <reviewer email> / <password>
GoodTunes admin: https://my.goodtunes.music/admin (login: <reviewer-admin-creds>)

Flow:
1. In the dev store, go to Apps → GoodTunes → already installed.
2. Open any order that contains the demo vinyl product.
3. Observe the order note attribute "goodtunes_redeem_url" was stamped.
4. Open the order status page — the GoodTunes extension banner appears.
5. Click "Get your music now" → lands on /redeem/:code → enter name + password → Library shows the album.
```

### Partner Dashboard pre-checks — known passing items

Run **Partner Dashboard → Apps → [your app] → App setup → Run automated checks** and clear all flags. Known items that must be green before submission:

- ✅ OAuth install completes (HMAC-verified, state nonce validated)
- ✅ All webhook topics respond 2xx within 5 seconds
- ✅ GDPR webhooks return 401 on bad HMAC, 200 on valid payload
- ✅ App uninstall clears tokens
- ✅ Privacy policy URL is reachable and returns 200

---

## 6 — Submission sequence (do not skip steps)

1. **Ship GDPR webhooks** (done — merged in this task).
2. **Register GDPR webhook URLs** in Partner Dashboard → App setup.
3. **Run automated pre-checks** — clear all flags.
4. **Add Shopify data flows to goodtunes.music/privacy** (Bill, on Webflow).
5. **File Protected customer data application** in Partner Dashboard → API access (use §3 above).
6. Wait for Protected customer data **approval** (typically 1–5 business days).
7. Flip distribution to **Public — Unlisted** (irreversible without contacting Shopify support).
8. Submit for app review; include demo store creds + reviewer walkthrough from §5.

> ⚠ Do NOT flip to Public before step 6. Shopify redacts customer PII from order
> payloads for apps without an approved protected-data application, which breaks
> order fulfillment for all connected stores.

## 7 — App Store requirements review (2026-07-24, post-Phase 6)

Ran the pre-submission compliance skill against the live requirements list
(fetched via `shopify doc fetch`, 2026-07 edition). 38 requirements evaluated
(Sections 1–3 in full + Group 5.6 Checkout customization); all other Section 5
groups skipped — no theme / payment / subscription / post-purchase /
sales-channel extensions exist in this repo.

**Summary: 34 pass · 2 warnings · 0 fails · 2 N/A.**

### ⚠️ Warnings (Bill to resolve before submission)

- **1.2.1 Billing** — the app is listed free and has no Billing API usage, but
  GoodTunes charges connected stores the per-unlock wholesale rate
  (`digitalUnitFeeCents`, default $3.50) off-platform. Shopify's rule:
  *"Charging merchants externally while listing the Shopify app as free is not
  allowed."* Options: (a) declare the wholesale fee in the listing's pricing
  section as an external charge and justify it in reviewer notes (it's a
  goods/wholesale cost, not an app charge — same model as print-on-demand
  apps, which Shopify allows), or (b) move billing to the Billing API. Reviewer
  notes should lead with the print-on-demand analogy.
- **2.3.1 Install initiation** — our operator admin (AdminShopify / label /
  person Shopify tabs) asks the operator to enter the store's
  `*.myshopify.com` domain to build the install link. The rule targets
  merchant-facing manual entry; ours is an internal operator tool and the
  merchant themselves lands on standard OAuth. Keep as-is, but when the app
  goes listed, install must also work from the App Store listing link
  (it does — `/api/shopify/install?shop=` is the standard entry). Mention in
  reviewer notes.

### Key passes (evidence)

- **1.1.15 Refunds** — refunds now flow exclusively through GraphQL
  `refundCreate` (advisory `order.suggestedRefund` first), to the original
  gateway. No gift-card/wallet refunds anywhere. (Phase 6.)
- **2.2.4 GraphQL-only** — the only two `/admin/api/` URLs in the codebase are
  both `graphql.json`. REST client, script_tags, and the legacy
  `orders/refunded` webhook are gone. (Phases 3–6.)
- **2.2.1 / 2.2.3** — Admin API used throughout; App Bridge N/A
  (`embedded = false`, app runs on our own admin host).
- **2.3.2–2.3.4 OAuth** — install route → `/admin/oauth/authorize` with our
  client_id; callback HMAC+state verified; reinstall re-registers webhooks and
  re-encrypts tokens.
- **3.2 Scopes** — only `read_orders, write_orders, read_products`; no
  `read_all_orders` or other flagged scopes.
- **5.6 Checkout UI extension** — thank-you/order-status blocks show the
  buyer's own redemption code only: no promotion, no countdowns, no order-total
  changes, no payment-info collection; `network_access` justified inline in
  the extension TOML.

### N/A

- **1.1.1 session tokens** — embedded-app rule; app is non-embedded. (The
  extension itself does use Shopify session tokens for our polling endpoint.)
- **3.1.1 TLS** — platform-managed HTTPS on all hosts (Replit + custom
  domains); no HTTP fallback exists to configure.
