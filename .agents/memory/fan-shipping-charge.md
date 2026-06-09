---
name: Fan shipping charge (Spinney rate card)
description: How real shipping is priced/charged at fan checkout and the invariants future shipping work must keep.
---

# Fan shipping charge

Vinyl checkout charges real shipping looked up server-side from a `shipping_rates`
rate card (one row per fulfillment_partner × destination × band). The default
fulfillment partner (Spinney) carries the seeded April-2026 card; US + 7 named
countries get their own band1/2/3 rate, everything else resolves to an `INTL`
catch-all band. Band comes from estimated record weight (7"→band1, single
12" LP→band2, double/180g/deluxe→band3) with overflow chunks for big orders.

## Invariants — keep these or commerce silently breaks

- **base vs markup stored separately.** `orders.shipping_base_cents` is the
  partner's own rate; `shipping_markup_cents` is the flat GoodTunes fudge ($1.00).
  `shipping_charged_cents = base + markup`. Keep them separate columns so the
  margin stays visible — never collapse to one "shipping" number.
- **Markup applies once per order**, not per unit/chunk. base scales with chunks,
  markup does not.
- **Recompute server-side, never trust the client.** The amount charged is
  recomputed in POST `/api/checkout/session` from server inputs; the client only
  sends the destination country. The live BuySheet quote (`GET
  /api/checkout/shipping-quote`) is display-only.
- **Physical order with no quote → REFUSE (422), never $0.** Because every
  destination resolves via the INTL fallback, a null quote means the partner has
  no rate card. Returning $0 shipping is an undercharge bug — reject the checkout.
- **Lock Stripe to the picked country.** `shipping_address_collection.allowed_countries`
  is `[shipCountry]` for physical orders so the collected address can't diverge
  from the rate we charged. (Digital orders carry no shipping and skip all this.)
- **Persist the breakdown in BOTH materialize paths.** The base/markup/charged/band
  fields must be written on the insert path AND the pending→paid update path, same
  fan-out trap as other order fields.
- **`shipping_charged_cents` must derive from Stripe's collected `amount_shipping`
  whenever ANY shipping applies — vinyl rate-card quote OR a per-box custom add-on
  charge — not gated on the vinyl quote alone.** Per-box add-on shipping (e.g.
  "Gift of Hope", `customAddons.shipping_cents` × qty) folds into the SINGLE Stripe
  shipping option, so a DIGITAL purchase + box has NO vinyl quote (`gt_ship_base`
  empty) yet Stripe still charges shipping. Gating `shipChargedCents` on
  `shipBaseCents !== null` dropped that to NULL on the order. Detect "shipping
  applies" via `shipBaseCents !== null || shipCustomAddonCents > 0` (the box portion
  is stamped in metadata as `gt_ship_custom_addon`), then prefer Stripe's
  `total_details.amount_shipping`. Pure-digital (no box) stays NULL.

**Why:** "real shipping" is a money-correctness promise; any silent $0/NULL path or
client-trusted amount is an undercharge or a broken receipt/refund-reconcile. The
architect flagged the $0-fallback, country-lock, and digital+box NULL-persist gaps
during review — they're fixed, keep them fixed.
