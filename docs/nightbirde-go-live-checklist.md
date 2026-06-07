# Nightbirde "Hope" — Go-Live Checklist

Operator runbook for flipping `get.goodtunes.music/nightbirde/hope` from a staged
preview to a live, purchasable release. Bill runs this. Nightbirde's data is
**prod-only**, so every step is performed against production.

The fan-facing page and the Buy → shipping → tax → Stripe checkout flow are already
launch-polished (sold-out, tax-unavailable, no-shipping-quote, and staged/locked
states all render cleanly). What remains is operator/infra configuration that the
app can't set for itself.

## 1. Confirm the release is correct while still staged

Before un-staging, view it as a fan to catch anything data-specific:

- Open `https://get.goodtunes.music/nightbirde/hope` signed in as a full-access
  account — while `is_prepping = true` the admin slug still resolves so you can
  preview it.
- Append `?fan=1` (`/nightbirde/hope?fan=1`) to see the **locked** fan view exactly
  as the public will, including the "sales begin" pill and the gated OG/share state.
- Walk it on phone, iPad, and desktop widths. Confirm: artwork, tracklist/preview,
  the 7" SKU, the signed-cert add-on, the booklet add-on, and the "Gift of Hope"
  donation add-on all read correctly.

## 2. Confirm Stripe Tax is live in the Stripe Dashboard

The Buy sheet's "Sales tax" line and the final checkout charge both come from Stripe
Tax. If Tax isn't fully configured, the line legitimately hides and the fan only sees
tax at the Stripe checkout step — avoid that for launch.

In the Stripe Dashboard (production):

- **Enable Stripe Tax** (Settings → Tax).
- **Set the head-office / origin address.** Without it Stripe Tax can't compute a
  rate and the pre-checkout tax line stays hidden.
- **Register every jurisdiction** you're obligated to collect in (Settings → Tax →
  Registrations). Stripe only adds tax for jurisdictions you've registered.

Verify: on the staged page (or a generic release), enter a US shipping ZIP in a
registered jurisdiction and confirm the "Sales tax" line resolves to a real figure
(not "…" forever and not "At checkout").

## 3. Confirm shipping is quotable

Physical items refuse checkout (422) rather than ever charging $0 shipping. Confirm
the 7" has a working shipping rate to the destinations you intend to sell to, so fans
don't hit "Choose a shippable destination" for normal addresses.

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
