# Fan checkout — screen-by-screen walkthrough

A plain-language, screen-by-screen map of what a fan actually goes through to buy
a record on GoodTunes **today**. Written for Bill so the live flow can be reviewed
without reading code. This documents the *current* behaviour, conditionals and all
— not the roadmap.

The whole flow is: **album page → Buy sheet → (sign in if needed) → Stripe checkout
inside the sheet → `/welcome` confirmation → back into the player.** The fan never
leaves the app to a hosted Stripe page; checkout is embedded in the same sheet.

> Honesty note: several things below only appear *sometimes*. Those conditionals
> are called out inline with **"Only when…"** so this doc doesn't oversell what
> every fan sees.

---

## Step 1 — Entry point: the album page

**Where the fan is:** an album page at `/album/:id` (e.g. `/album/abc123`).

There are two layouts, chosen by screen width:

- **Phone (< 768px):** the mobile album surface.
- **Tablet / desktop (≥ 768px, and only when the album is buyable):** the desktop
  album view. Below 768px, or when buy is not enabled, the mobile surface renders.

**What's tappable to start a purchase:**

- **Phone:** a pill button reading **"Buy $X"** (the album's base price) sits in the
  hero action row, next to Play.
  - **Only when:** the fan does **not** already own a copy *and* the album has a
    price set. If the fan already owns it, the Buy button is replaced by their
    GoodDeed ownership state and there's nothing to buy here.
- **Desktop:** an equivalent buy price control in the hero.
  - The desktop hero also exposes a **signed-certificate chip**. Tapping/choosing it
    pre-arms the signed-cert add-on so the Buy sheet opens with it already selected.

**Tapping Buy** opens the **Buy sheet** (a slide-up panel over the album page). The
fan stays on `/album/:id` — the URL doesn't change to a new page.

**The `?buy=1` shortcut:** the album page auto-opens the Buy sheet when the URL
carries `?buy=1`. This is how the fan lands *back* on the sheet after signing in
(see Step 3) — the login bounce-back returns them to `/album/:id?buy=1` and the
sheet re-opens automatically.

---

## Step 2 — The Buy sheet

**Where the fan is:** still on `/album/:id`, with the Buy sheet open over it. Data
comes from `GET /api/albums/:id/buy-options`.

The sheet is built top-to-bottom from these sections. Several are conditional.

### 2a. Format picker — *required*

- Lists every format the artist has enabled for this album (e.g. 12″ vinyl, 7″
  vinyl, cassette), each with its price.
- The fan must pick one. It drives everything below it.
- **Sold-out state:** a format whose stock has hit zero shows as **sold out and is
  disabled** — it can't be selected.

### 2b. "You'll get" vinyl preview — *vinyl formats only*

- **Only when** the selected format is a vinyl SKU: a `VinylPreview` renders the
  actual disc colour and jacket upgrade the fan will receive, against the album art.
- Non-vinyl formats (e.g. cassette) show no vinyl preview — just the format label.

### 2c. Quantity — *required, defaults to 1*

- The fan can buy **1 to 10 copies** in one checkout (the per-checkout cap is 10).
- The quantity ceiling is also limited by **remaining stock** when the format
  tracks stock — the fan can't select more copies than are left.

### 2d. Signed-certificate add-on — *only when offered, per copy*

- **Only when** the album has an active signed-certificate add-on.
- It's a **per-copy** choice: each copy gets its own "add a signed certificate"
  toggle, so the fan can mix signed and unsigned copies in the same order
  (e.g. 4 copies, copies 1/3/4 signed). With a single copy it reads as one toggle.
- Each toggled copy adds the signed-cert price (shown as **"+ $X"**).
- **Limited / sold-out states:**
  - Signed copies are a finite, numbered run. The number the fan can toggle on is
    capped by how many signed slots remain.
  - When the signed run is fully claimed, the toggles show **"All signed copies
    claimed"** and are disabled.

### 2e. Booklet — *only on 7″ vinyl or cassette, and only when offered*

The booklet behaves **differently by format** — this is the trickiest conditional:

- **7″ vinyl → either/or *variant* (not a stacked add-on).** The fan picks one of
  two mutually-exclusive options:
  - **"7″ alone"** at the plain 7″ price, or
  - **"7″ + booklet"** at a single **flat set price** (not "7″ price + booklet
    price" — it's one bundled number).
  - Picking one deselects the other. The chosen option's price becomes the format
    line price.
- **Cassette → legacy stacked toggle.** A single on/off "add the booklet" toggle
  that adds **one booklet to the order** (one per order, regardless of copy count),
  shown as **"+ $X"** on its own line.
- **Only when** the album actually has a 7″ or cassette SKU *and* an active booklet
  add-on. On a 12″-only release the booklet section is hidden entirely.

### 2f. Ship-to country + live price breakdown — *always*

- **"Ship to" country picker** *(physical formats only)*: a dropdown above the
  breakdown, defaulting to **US**. US plus Canada, the UK, France, Germany, Japan,
  Mexico, and Honduras have their own rate; every other listed destination falls
  back to the international ("INTL") average. Digital-only selections hide the
  picker — no shipping applies.
- Below the "Ship to" picker is a plain **ZIP / Postal code** field (kept low-key —
  no "for tax estimate" labelling). It's optional for placing the order — Stripe
  re-collects the full address at the card step — but it's what lets the sales-tax
  figure resolve and fold into the total below.
- A running breakdown the fan can read before committing: the format line
  (`format × quantity`, folding in "+ booklet" for the 7″ variant), a signed-cert
  line (`cert × count`) when any copies are signed, a separate booklet line for the
  cassette stacked add-on, a **Shipping** line, a **Sales tax** line, and a
  bold **Total**.
- The **Shipping** line is a live server quote (`GET /api/checkout/shipping-quote`,
  re-fetched whenever the format, country, quantity, or signed-cert/booklet counts
  change). It's the fulfillment partner's (Spinney) published rate for the chosen
  country and record weight **plus a flat $1.00**, and it's already folded into the
  **Total** — so the postage isn't a surprise at the card step. While the quote is
  in flight the line shows a brief loading state.
  - **Only when:** if shipping to the chosen country can't be priced, the line
    shows an "unavailable" message and the checkout button is disabled until the
    fan picks a serviceable country.
- The **Sales tax** line (Task #1636) is a live server quote
  (`GET /api/checkout/tax-quote`), shown once the fan has typed a postal code
  (≥3 chars). It's computed by **Stripe Tax** (`stripe.tax.calculations.create`)
  from the server-resolved line prices + the **same per-line `tax_code`
  classification** the session-create path uses, so it can't be tampered with from
  the browser. It's deliberately **low-key** — a plain "Sales tax" line that just
  folds into the **Total** (no "estimate" labelling, no "Estimated total" relabel),
  because the same Stripe Tax engine confirms the exact charge at the card step, so
  the number doesn't move.
  - **Only when:** if Stripe can't resolve a jurisdiction for the entered address
    (or Stripe Tax isn't configured for the account yet — needs a head-office
    address + registrations in the Dashboard), the endpoint returns
    `{ available: false }` and the line simply doesn't render. The order still goes
    through; tax is just confirmed at the card step. Digital-only carts get their
    correct (often $0) figure too.

### 2g. The checkout button — *always, label depends on auth*

The big button at the bottom changes its label based on state:

- **Not signed in:** reads **"Sign in to continue."** Tapping it sends the fan to
  the auth gate (Step 3).
- **Signed in:** reads **"Checkout — $Total."** Tapping it starts the Stripe session
  (Step 4); while it spins up it briefly reads **"Opening checkout…"**.
- It's disabled until a format is selected.

Small print under the button stays low-key: once the tax line is present it reads
*"Includes shipping and sales tax. Instant digital access in the player."* Otherwise
it reads *"Shipping shown above; sales tax is added at checkout. Instant digital
access in the player."* (Shipping for the chosen country is already in the breakdown
before the fan commits.)

---

## Step 3 — Auth gate (only for fans who aren't signed in)

**Skipped entirely** if the fan is already signed in as a customer — they go
straight from Step 2 to Step 4.

**Where the fan is:** the login page at `/login?next=/album/:id?buy=1`.

- The **"Sign in to continue"** button in the Buy sheet navigates here, carrying a
  `next` parameter pointing back at the album page with `?buy=1`.
- **What they can do:**
  - Create a customer account / sign in with **email + a 6-digit verification code
    + password**, or
  - **Continue with Google** or **Continue with Apple** (OAuth).
- **After auth:** the `next` parameter returns them to `/album/:id?buy=1`, which
  **auto-re-opens the Buy sheet** (Step 1's `?buy=1` shortcut). Their format /
  quantity / add-on choices are re-made in the freshly opened sheet, and the button
  now reads "Checkout — $Total."

---

## Step 4 — Stripe Embedded Checkout (inside the sheet)

**Where the fan is:** **still in the same Buy sheet** on `/album/:id`. The product
selector is replaced in-place by Stripe's embedded checkout form. The fan does
**not** get redirected to a hosted Stripe page.

**What happens under the hood:** tapping Checkout calls `POST /api/checkout/session`,
which returns a client secret; the sheet mounts Stripe's `EmbeddedCheckout` with it.

**What the fan sees / fills in (handled by Stripe):**

- **Card details** — required.
- **Shipping address** — required, and **locked to the single country the fan
  picked** in the Buy sheet's "Ship to" selector. Because shipping was priced
  server-side for that one country, Stripe's `allowed_shipping_countries` is set to
  just that country — so the address the fan enters always matches the postage they
  were quoted (no switching to a cheaper/pricier country at the card step).
- **Billing address** — required.
- **Phone number** — collected.
- **Apple Pay / Google Pay** — **only on supported devices/browsers.** Stripe
  surfaces these express-pay buttons automatically when the device supports them
  (e.g. Apple Pay in Safari on an Apple device); fans on unsupported setups just see
  the card form. We don't add or remove these — they're device-driven.
- **Sales tax is auto-calculated by Stripe Tax** (Task #1629). `automatic_tax` is
  enabled on the session and every line declares a `tax_code` + `tax_behavior:
  "exclusive"`: records / signed cert / booklet are tangible goods
  (`txcd_99999999`), the digital-only format is a streamed digital audio work
  (`txcd_10401000`), and the Gift of Hope / custom add-on is a cash donation
  (`txcd_90000001`, non-taxable). Stripe computes municipal + state tax from the
  address the fan enters in the embedded form and adds it on top of our prices. If
  Stripe can't determine tax for that address it **blocks completion in the embedded
  UI** — the fan can never accidentally pay $0 tax in a taxable jurisdiction. The
  computed tax is stored on `orders.tax_cents` and shown as a "Tax" line on the
  `/welcome` summary, the "Your orders" detail, and the receipt email.
  > **Operator dependency (Bill):** Stripe Tax only collects where GoodTunes is
  > **registered**. Bill must add the tax registrations (and the head-office /
  > origin address) in the Stripe Dashboard → Tax settings for each state/locale
  > GoodTunes is obligated to collect in. Until a jurisdiction is registered, Stripe
  > reports $0 tax there (a real computed zero, not an error). This is out of scope
  > for the codebase.

**Stock / signed-copy safety at this moment:** the session call re-checks
availability. If stock ran out, or the last signed slots were claimed by another
buyer in the meantime, the fan gets an error (e.g. "Sold out", "Only N left in
stock", "All signed copies claimed", "Only N signed copies left") instead of a
session — signed slots are briefly reserved (30 min) so two simultaneous buyers
can't oversell the run.

**On successful payment:** Stripe redirects to the return URL
`/welcome?session_id={CHECKOUT_SESSION_ID}` (Step 5).

---

## Step 5 — `/welcome` confirmation ("You're in.")

**Where the fan is:** the confirmation page at `/welcome?session_id=…`.

> Note: this is `Welcome.tsx`, the post-purchase confirmation. It is **not**
> `WelcomeBack.tsx`, which is a separate legacy onboarding flow for imported
> gogoods.com fans and is unrelated to checkout.

**First moment — a brief loading state:** the page reads the session id from the URL
and polls `GET /api/checkout/session/:id` until the order materializes (the payment
webhook may land a beat after the redirect). The fan sees a spinner with
**"Finishing up your order…"** for a moment.

**Once the order is ready, the fan sees:**

1. **"You're in."** with *"Your album is unlocked and your record is on its way."*
2. **GoodDeed number(s):**
   - **Single hero number** (large `#NNNN`) for a one-copy order, or an order with
     just one signed cert — *"Numbered for life. Refundable up until shipping."*
   - **Multiple numbers** shown together **only when** the order has two or more
     signed copies — each copy is its own numbered entitlement.
3. **Order summary card:** for each vinyl line item, the coloured vinyl preview that
   matches what they bought; then a per-copy breakdown (Copy 1, Copy 2… with a
   **"Signed · #NNNN"** tag on signed copies) or, for older orders, a line-item
   list; and a **Total**.
4. **Gift toggle — *optional*.** A **"This is a gift"** checkbox. **Only when**
   ticked, it expands to: recipient first/last name (required to send),
   email-or-phone contact (required), an optional message, and an optional
   **"Deliver on"** date. Submitting mints a **shareable one-time claim link** the
   buyer copies and sends; when the recipient claims it, the album + GoodDeed move
   to their account.
5. **"Pick your handle" — *optional*.** A `@username` field pre-filled from the
   fan's email local-part. They can change it or leave it; it's saved when they tap
   the final button.
6. **"Open my player"** button — saves the handle (if changed) and hands the fan
   to the album with the album unlocked for instant digital listening.
   - **On the same host** (dev, `*.replit.app`, or the main fan host) this is an
     in-app navigation to **`/album/:id?gtwelcome=1`**.
   - **On the preview + purchase funnel** (`get.goodtunes.music` /
     `store.goodtunes.music`) the fan must be re-authed on the player host
     (`my.goodtunes.music`) — the session cookie and the localStorage bearer
     token are both host-scoped, so neither crosses subdomains. The funnel mints
     a fresh customer bearer token (`POST /api/checkout/player-handoff`,
     `requireCustomer`) and redirects to
     **`https://my.goodtunes.music/album/:id#token=<bearer>&gtwelcome=1`**. The
     token rides in the URL **fragment** (never sent to the server, so it never
     hits an access log); `main.tsx` consumes it before React mounts, stores it,
     scrubs the fragment, and leaves `?gtwelcome=1` behind. If the mint fails the
     funnel falls back to a same-host navigation (the album is already unlocked
     for the current session).
   - The `gtwelcome=1` flag pops a **dismissible thank-you modal** on the album
     (`PurchaseThankYouModal` in `AlbumDetail.tsx`) confirming the music, videos,
     and photos are unlocked now and pointing at the free, personalized, numbered
     GoodDeed certificate download behind the album's **⋯ menu**. It shows
     **once** — the flag is stripped from the URL the instant it's read and a
     per-album `gt:welcome-seen:<albumId>` localStorage key guards against a
     shared/bookmarked URL re-popping it.

**A receipt also lands in their inbox.** The moment the order materializes from the
paid Stripe session (the same event that powers this page), GoodTunes sends **one
branded order-receipt email** to the buyer — order summary (format, quantity,
add-ons, total), the GoodDeed number(s), a **"Play on the web"** button that
deep-links into `/album/:id`, and — **only when** the app-store URLs are configured
(`IOS_APP_STORE_URL` / `ANDROID_PLAY_STORE_URL`) — **Download on the App Store** and
**Get it on Google Play** buttons. It's sent exactly once (an atomic claim guards
the webhook-vs-this-page race) and is best-effort, so a mail hiccup never blocks the
order or the fan's instant access. This is the *GoodTunes* receipt — Stripe's own
card receipt, if enabled, is a separate email.

---

## Step 6 — After checkout (where the purchase lives)

- The album is immediately playable on its `/album/:id` page (digital access is
  instant; the physical record ships separately).
- The order, GoodDeed certificate, and digital access appear on the fan's
  **"Your orders"** page at **`/orders`** (also linked from `/account`), where they
  can confirm the name to print on a signed certificate, download the certificate
  PDF, and manage a gift.

---

## Quick conditional cheat-sheet

| Thing the fan sees | Appears only when |
| --- | --- |
| "Buy $X" button on album | Fan doesn't already own it **and** album has a price |
| Desktop signed-cert pre-arm chip | Desktop (≥768px) hero, album offers signed cert |
| "You'll get" vinyl preview | Selected format is vinyl |
| Quantity above 1 | Stock (if tracked) allows it; hard cap is 10 |
| Per-copy signed-cert toggles | Album has an active signed-cert add-on |
| "All signed copies claimed" (disabled) | The numbered signed run is fully claimed |
| 7″ "alone" vs "+ booklet" variant | Album has a 7″ SKU **and** an active booklet add-on |
| Cassette stacked booklet toggle | Album has a cassette SKU **and** an active booklet add-on |
| Booklet section hidden entirely | No 7″/cassette SKU, or no booklet add-on |
| "Sign in to continue" button | Fan isn't signed in |
| Apple Pay / Google Pay | Fan's device/browser supports it |
| Multiple GoodDeed numbers on `/welcome` | Order has 2+ signed copies |
| Gift fields | Fan ticks "This is a gift" |
