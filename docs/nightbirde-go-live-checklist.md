# Nightbirde "Hope" — Go-Live Checklist

Operator runbook for flipping `get.goodtunes.music/nightbirde/hope` from a staged
preview to a live, purchasable release. Bill runs this. Nightbirde's data is
**prod-only**, so every step is performed against production.

The fan-facing page and the Buy → shipping → tax → Stripe checkout flow are already
launch-polished (sold-out, tax-unavailable, no-shipping-quote, and staged/locked
states all render cleanly). What remains is operator/infra configuration that the
app can't set for itself.

## Decisions locked in (June 8 2026, with Bill)

- **Buy surface = the standard release page.** Fans buy Hope on
  `get.goodtunes.music/nightbirde/hope` (cover → previews → Buy → 7" + add-ons →
  shipping → tax → Stripe). The "Get Hope. Give Hope." walkthrough (`/hope`) is
  **not** the launch buy page; whether/how it becomes a buyable surface is the
  separate design decision Bill spun out as **task #1734 (GET locked-player
  landing)** — which generalizes the Hope.tsx offer-modal + locked-preview pattern
  onto the shared GET album surface (so every release inherits the MY player look
  with locked-down chrome, an auto-opening package modal, and the existing Buy
  sheet). That makes the campaign-walkthrough wiring (#1716) and #1734's durable
  landing **post-launch**, not launch-critical for today's teaser.
- **Get the page publicly UP today, but NOT buyable ("step one").** Bill wants the
  public landing experience live now — the dimmed page backdrop, the offer modal
  popping up, and (on dismiss) a preview of the page — with **Buy disabled and
  labelled "Coming today."** This is exactly the coming-soon campaign teaser at
  `get.goodtunes.music/nightbirde/hope` (the `CampaignPublic` surface in
  `client/src/pages/Hope.tsx`, `publicPreview: true` in the server's
  `CAMPAIGN_PREVIEWS`). It has **no working buy path anywhere** (every Buy/CTA is a
  disabled "Coming today" pill), so putting it up cannot take an order. See
  **section A** for how to make it live.
- **Sunrise DATE = today, June 8 2026; exact on-sale TIME is TBD.** Bill confirmed
  the sales-begin date is today. He just doesn't yet know the exact time today, and
  sales must **not** open to the public until Jane's family approves the copy +
  images. So today = the **non-buyable** teaser only (above). Opening real sales is a
  later, separate flip held until family sign-off — and lives with **task #1734
  (GET locked-player landing)**, since the slug currently renders the campaign
  teaser, not the standard buy page. Do **not** turn off `is_prepping` on the album
  today (sections 4–5 stay deferred).
- **Google Play (player-only) = land today if it flows, web is the priority.** This
  is an operator/Codemagic/console track — every in-repo prerequisite is already
  done (see `store-review-readiness.md`). Remaining steps are the Codemagic
  `android-internal` build + Play-console listing/data-safety/demo-account actions,
  which only Bill can run. It can proceed in tandem with the web launch.

## A. Step one — get the page up today (non-buyable)

This is the only action needed for today's goal. It puts the public landing
experience live with **no way to buy** — exactly the dimmed page + offer modal +
"Coming today" disabled Buy.

**What the public will see** at `get.goodtunes.music/nightbirde/hope`:
the offer modal ("Get Hope. Give Hope.") over a dimmed page; a "Let me hear the
previews" link that dismisses the modal to reveal the page with 30s track previews;
and every Buy/primary CTA rendered as a disabled **"Coming today"** pill. No
checkout, sign-in-to-pay, or order can happen — `publicPreview` resolves to the
preview tier, which has the buy flow turned off everywhere.

**Why it's safe:** the coming-soon teaser is purely a preview. The full
buy/give/pay flow is gated behind the family token / `/staging` link and is never
reachable from the bare public URL. The album also stays in Prepping, so the
standard buy page stays unresolvable to the public.

**The one action — Publish.** The teaser is already built and verified in dev, but
the **live prod bundle predates this campaign routing**: `get.goodtunes.music/
nightbirde/hope` currently shows "We couldn't find that album," which means prod is
serving an older build where `/nightbirde/hope` isn't yet recognized as a campaign.
Making it live = **publishing the app** (Replit Publish / Deploy). No prod data
change and no admin toggle is involved or wanted today.

After publishing, confirm: load `get.goodtunes.music/nightbirde/hope` logged out and
verify the modal + "Coming today" disabled CTA render, the previews play 30s, and
there is no working Buy. (If it still shows "We couldn't find that album," the new
build hasn't gone live yet — re-check the deploy.)

## 0. Verified prod state (read-only audit, June 8 2026)

**Canonical go-live album — use this one, nothing else:**

- 7" "Hope", id **`b250a5a5-98cc-4673-9903-ab39e5278d8c`**, `share_slug = hope`,
  `physical_format = seven_inch`, 12 songs, `is_prepping = true` (still staged).
- Sunrise / sales-begin (`good_tunes_release_date`) = **2026-06-08**.
- This is the album the server's `CAMPAIGN_PREVIEWS` mapping for `nightbirde/hope`
  resolves to, and (after this task) the album `STOREFRONT_LAUNCH_ALBUM_ID` points at.

**Confirmed already configured (verified in prod):**

- 7" SKU — $25.00, active, color "Rust Alloy", 500 planned.
- `signed_cert` add-on — $25.00, min $4.99, active.
- "Gift of Hope" custom add-on — $75.00 → **The Nightbirde Foundation**
  (org `a0ffcc21…`), attached to the Nightbirde person.
- NPO donation split — 100¢/unit → The Nightbirde Foundation (funded from margin).
- Shipping — quotable for the 7": US $6.87 + $1.00 markup, plus CA/GB/DE/FR/JP/MX/
  HN/INTL across all three bands. No false 422 for normal addresses.

**⚠️ Empty duplicate — do NOT touch:** prod also has a `single_lp` "Hope"
(`54d46505-2d23-4066-88f3-0337bb2e8b79`) with **0 songs, no SKU, no add-ons, no
slug**. Do not un-prep it, do not configure it, do not point anything at it. The
storefront constant used to point here — that's now fixed in code.

**GAP — booklet add-on not yet present.** Step 1 below and the fan walkthrough
mention a booklet add-on, but the 7" Hope currently has **no `booklet` add-on row**.
The 7" *is* booklet-eligible, so if you want to offer it, add it from the album's
Sell panel (the Booklet pill) before launch. If no booklet is intended for Hope,
skip it — nothing else depends on it.

## 1. Confirm the release is correct while still staged

Before un-staging, view it as a fan to catch anything data-specific:

- Open `https://get.goodtunes.music/nightbirde/hope` signed in as a full-access
  account — while `is_prepping = true` the admin slug still resolves so you can
  preview it.
- Append `?fan=1` (`/nightbirde/hope?fan=1`) to see the **locked** fan view exactly
  as the public will, including the "sales begin" pill and the gated OG/share state.
- Walk it on phone, iPad, and desktop widths. Confirm: artwork, tracklist/preview,
  the 7" SKU, the signed-cert add-on, and the "Gift of Hope" donation add-on all
  read correctly. (Booklet add-on is **not configured yet** — see the GAP note in
  section 0; add it first if you want to offer it.)

## 2. Confirm Stripe Tax is live in the Stripe Dashboard

The Buy sheet's "Sales tax" line and the final checkout charge both come from Stripe
Tax. If Tax isn't fully configured, the line legitimately hides and the fan only sees
tax at the Stripe checkout step — avoid that for launch.

Follow the full operator runbook in **[stripe-tax-enablement.md](./stripe-tax-enablement.md)**.
In short, in the Stripe Dashboard (production):

- **Enable Stripe Tax** (Settings → Tax).
- **Set the head-office / origin address.** Without it Stripe Tax can't compute a
  rate and the pre-checkout tax line stays hidden.
- **Register every jurisdiction** you're obligated to collect in (Settings → Tax →
  Registrations), and let Stripe's threshold monitoring flag new ones. Stripe only
  adds tax for jurisdictions you've registered.
- **Confirm the default tax behavior is Exclusive** and a tangible-goods default tax
  code is set (the app sends the right per-line code regardless).

Verify: on the staged page (or a generic release), enter a US shipping ZIP in a
registered jurisdiction and confirm the "Sales tax" line resolves to a real figure
(not "…" forever and not "At checkout").

## 3. Confirm shipping is quotable

Physical items refuse checkout (422) rather than ever charging $0 shipping. Confirm
the 7" has a working shipping rate to the destinations you intend to sell to, so fans
don't hit "Choose a shippable destination" for normal addresses.

Already verified in prod (section 0): the 7" quotes US $6.87 + $1.00 markup plus
CA/GB/DE/FR/JP/MX/HN/INTL across all bands. Just re-confirm coverage for any extra
destinations you plan to open at launch.

## 4. Take "Hope" out of Prepping

This is the actual go-live switch — it makes the release publicly resolvable.

- In Admin, open the "Hope" album and turn **off** Prepping (`is_prepping = false`).
- The **sunrise date** (sales-begin) still gates purchasing: until it arrives the
  page shows the locked "sales begin" state and the Buy CTA cannot enter a live
  "Buy" state (this holds even if the date is missing/malformed — the CTA fails
  safe to locked). Confirm the sunrise date is the intended public on-sale moment.

## 5. Post-launch smoke (the moment sales open)

Once the sunrise date passes:

- Load `https://get.goodtunes.music/nightbirde/hope` logged out / as a normal fan.
- Pick the 7", optionally add the signed cert + booklet + Gift of Hope, enter a real
  shipping address, and confirm the breakdown reads price → shipping → sales tax →
  total with no empty or `$NaN` lines, then that Stripe checkout opens with a
  matching total.
- Confirm the OG/share unfurl now renders (it's gated while staged).
