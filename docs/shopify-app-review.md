# Shopify App Review — Submission Runbook

GoodTunes is submitted as a **public, unlisted** app so installs no longer show the
"unverified app" warning. The review bar is identical to a fully-listed app; every
section below must be addressed before flipping distribution to Public.

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
`shopify_product_mappings` and `shopify_digital_fee_ledger`).

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
| `read_orders` | Required to access the orders/paid and orders/refunded webhook payloads (customer identity, line items, totals, status) so GoodTunes can mint and revoke digital album unlocks. |
| `write_orders` | Required to stamp a `note_attribute` (the redemption URL) onto the Shopify order record so it appears in the merchant's order confirmation email Liquid template. |
| `read_products` | Required to enumerate the merchant's catalog in the admin product-mapping UI so the operator can link a Shopify product/variant to a GoodTunes album without typing product IDs by hand. |
| `write_script_tags` | Required to inject the order-status-page script that displays a "Get your music" CTA and redemption code on the Shopify order confirmation page. Migration to a Checkout UI Extension is planned; `write_script_tags` is used for the current implementation. |

---

## 4 — Install / uninstall / reinstall hygiene

The install→use→uninstall→reinstall flow is handled in `server/shopify.ts`:

- **Fresh install:** `upsertStore` inserts a new row; `registerWebhooks` registers the four merchant webhooks; `installScriptTag` installs the order-status-page script. All three are idempotent (Shopify deduplicates on address/src).
- **Uninstall (via app/uninstalled webhook):** Stamps `uninstalled_at`, clears `access_token`, `refresh_token`, and expiry timestamps. The store row is kept so historical order joins remain valid.
- **Reinstall:** `upsertStore` finds the existing row by `shop_domain` and overwrites the token fields + clears `uninstalled_at`. Re-runs webhook and script tag registration.
- **Shop redact (48h after uninstall):** The GDPR `shop/redact` webhook deletes the store row and cascades cleanup (see §1).

**No orphaned webhooks** — Shopify automatically deregisters app-level webhooks when the store uninstalls; reinstalling re-registers them via our callback.

### Step-by-step operator verification (run on a Shopify development store)

These steps use two admin API endpoints added specifically for this verification:

| Endpoint | Purpose |
|----------|---------|
| `GET /api/admin/shopify/stores/:id/inspect` | Live-checks Shopify API for expected webhooks + script tag; shows DB row state |
| `POST /api/admin/shopify/stores/:id/reinstall-hooks` | Re-registers webhooks + script tag; idempotent (safe to call on an already-healthy install) |

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
       "webhookCount": 4,
       "foundTopics": ["app/uninstalled","orders/paid","orders/refunded","refunds/create"],
       "missingTopics": [],
       "scriptTagInstalled": true,
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
4. Open the Shopify order confirmation page (order status URL in Shopify admin → Orders). The GoodTunes "Get your music" CTA injected by the script tag must appear (**§5 screenshot #4**).
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
   Expected: `"uninstalledAt": null`, `"hasAccessToken": true`, `allWebhooksPresent: true`, `scriptTagInstalled: true`.
3. Verify **historical orders are still present**: the test order from Step 2 should still show in admin → Orders for that store.
4. If the inspect call shows `missingTopics` (e.g. a network blip during the callback), run:
   ```sh
   curl -s -X POST -b 'YOUR_SESSION_COOKIE' \
     https://my.goodtunes.music/api/admin/shopify/stores/<storeId>/reinstall-hooks | jq .
   ```
   Expected: `{ "ok": true, "webhooks": { ... "already_registered" ... }, "scriptTag": "already_installed" }`.

---

#### Checklist — all must be ✅ before submission

- [ ] Fresh install: `inspect` returns `healthy: true` (4 webhooks + script tag)
- [ ] Uninstall: `dbRow.uninstalledAt` is set, `hasAccessToken: false`
- [ ] No orphaned webhooks remain in Shopify after uninstall
- [ ] Reinstall: `dbRow.uninstalledAt` is null, `inspect` returns `healthy: true`
- [ ] Historical test order still present after reinstall
- [ ] Test order status page shows GoodTunes "Get your music" block
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
4. The Shopify order confirmation page with the GoodTunes "Get your music" CTA block injected by the script tag.
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
4. Open the order status page — the GoodTunes "Get your music" block appears.
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
