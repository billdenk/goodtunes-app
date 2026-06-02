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

### 2f. Live price breakdown — *always*

- A running breakdown the fan can read before committing: the format line
  (`format × quantity`, folding in "+ booklet" for the 7″ variant), a signed-cert
  line (`cert × count`) when any copies are signed, a separate booklet line for the
  cassette stacked add-on, and a bold **Total**.

### 2g. The checkout button — *always, label depends on auth*

The big button at the bottom changes its label based on state:

- **Not signed in:** reads **"Sign in to continue."** Tapping it sends the fan to
  the auth gate (Step 3).
- **Signed in:** reads **"Checkout — $Total."** Tapping it starts the Stripe session
  (Step 4); while it spins up it briefly reads **"Opening checkout…"**.
- It's disabled until a format is selected.

Small print under the button: *"Shipping & taxes calculated at checkout. Includes
instant digital access in the player."*

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
- **Shipping address** — required, restricted to the **9 supported countries**:
  US, Canada, UK, Australia, Germany, France, Netherlands, Ireland, Japan.
- **Billing address** — required.
- **Phone number** — collected.
- **Apple Pay / Google Pay** — **only on supported devices/browsers.** Stripe
  surfaces these express-pay buttons automatically when the device supports them
  (e.g. Apple Pay in Safari on an Apple device); fans on unsupported setups just see
  the card form. We don't add or remove these — they're device-driven.
- Tax is **not** auto-calculated (automatic tax is off); the small print's "taxes
  calculated at checkout" reflects whatever Stripe applies, not a GoodTunes tax
  engine.

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
6. **"Open my player"** button — saves the handle (if changed) and navigates to
   **`/album/:id`**, now with the album unlocked for instant digital listening.

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
