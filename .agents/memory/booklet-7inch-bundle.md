---
name: 7" booklet either/or bundle
description: The 7" booklet is a variant (one set price, single CC fee), cassette stays a stacked add-on; back-compat must never auto-stamp the default price on legacy rows.
---

On a **7" single** the booklet is an *either/or VARIANT* ("7" alone" vs "7" + booklet"
at one flat set price), NOT a stacked à-la-carte add-on. On **cassette** the booklet stays
the legacy togglable stacked add-on. Treat these two formats differently everywhere
(buy-options, checkout line items, fan BuySheet, admin pill).

**Why:** product decision — a 7" + booklet should read as a single purchase at a single
price (e.g. $25), not "$15 vinyl + $10 booklet" summed at checkout, so it carries ONE
credit-card fee and one line item.

**Back-compat rule (the one that bit us):** older 7" albums have a standalone booklet
add-on and NO stored bundle price. Resolution is `bundlePriceCents ?? skuPrice + addonPrice`,
so a null bundle price means "fan pays the sum" — that must be preserved. The admin pill
defaults a *fresh* addon's set price to $25, but it must NEVER persist that synthetic
default onto a legacy row just because the operator edited an unrelated field (artwork,
active, qty). Gate persistence on an explicit "operator typed in the set-price field"
flag; on every save send the bundle price as *undefined* (leave unchanged) unless the
operator actually edited it or the row is fresh/already-explicit. Otherwise unrelated
saves silently re-price legacy albums and double-charging/over-charging follows.

**Cost / profit rule:** one charge → one CC fee. The admin bundle-profit readout nets a
single CC fee on the set price against the 7" vinyl unit cost computed WITHOUT its own
standalone CC fee (mfg + publishing + GoodTunes margin only — not the all-in cost that
already folds payment processing) PLUS the booklet wholesale unit cost. Reusing the vinyl
row's all-in cost double-counts the fee.

**Per-copy:** order_copies records whether each physical copy includes the booklet, stamped
from the bundle metadata at materialize time.
