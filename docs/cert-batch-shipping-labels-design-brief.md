# Design brief — Cert signing round-trip shipping labels (for Ruby)

**Requested:** 2026-08-12 · **Interim UI is live but minimal** — final UI ships to your mocks.

## What this feature is

After a printer prints a GoodDeed cert batch, GoodTunes pays to ship the stack
to the artist/manager for wet signatures. A **prepaid return label rides inside
the box** so the signed stack comes back to the next destination — the printer
again when they also do the hologram/shrinkwrap leg, otherwise the fulfillment
warehouse. Labels are bought via EasyPost on the GoodTunes UPS account, only on
an explicit operator action. Local pickup is a first-class case: no labels,
and the UI says so honestly.

## Surfaces that need design

### 1. Operator — Admin album → Sell tab → Cert sale window panel
Current interim UI: a "Signing round-trip shipping labels" card with an inline
address form + weight, a Buy button, a Skip (local pickup) button, and rows
showing label PDF links + tracking once purchased.

Design needs:
- Generate-labels flow: confirm the artist/manager **signing address**
  (freeform today; consider address book / recent addresses), package weight,
  and a clear summary of **where the return label points** before buying.
- Purchased state: outbound + return label cards (carrier, service, cost,
  tracking, download PDF), with the "return goes to X" destination explicit.
- Partial-failure state: outbound bought, return failed — retry affordance
  that makes clear nothing gets double-bought.
- Error states: carrier/EasyPost messages shown verbatim (bad address, UPS
  account problem). Never a silent failure.
- Local pickup: skip + undo, copy that says nothing ships.

### 2. Printer portal — Print Queue tab
Current interim UI: a "Shipping labels" card above the cert print queue with
per-album download links (outbound + prepaid return) and the return
destination name.

Design needs: the labels should read as part of the batch's print packet —
"print the certs, print these two labels, return label goes IN the box."
One place, no hunting.

### 3. Fulfillment portal — inbound signed batches
Data now exposed (`GET /api/fulfillment/:id/cert-batches`): albums whose
prepaid return targets this warehouse, with return carrier + tracking and the
batch stage timestamps (returned / hologram / shipped). Needs a small inbound
list view (no label PDFs — the warehouse only needs tracking).

## Bill's intended end-to-end flow (2026-08-12) — design to this

1. Platform notifies the printer a batch is ready.
2. Printer gets paid (mechanics TBD) and gets the print files — US Letter and
   A4 when both exist. **Note for printers that don't do A4** (we start US-only;
   the queue already splits Letter/A4 batch downloads).
3. Printer downloads + prints. After packing they enter box basics (size +
   weight) and click **one button to auto-create both labels** — outbound to
   the artist, prepaid return to the next destination. (The operator pre-saves
   the artist signing address so the printer never needs it.)
4. Printer prints both labels: affixes the artist one, puts the return one
   inside the box.

### Open questions (not built yet — flag in mocks)
- Printer payment for the print job ("we'll talk about that").
- Shipping-cost threshold / service-level choice: e.g. cap at ~$50, or pick a
  slower service when the artist is traveling and won't be reachable for X
  days — why pay overnight? Needs a "when does it need to arrive" input or
  operator guidance. v1 buys the cheapest UPS rate.
- Per-printer "doesn't do A4" capability note.

## Constraints
- UPS only (single carrier account v1); no rate shopping.
- Labels are EasyPost-hosted PDFs (4x6 style); download/open in new tab.
- Light admin slate theme (partner portals are light-only).
- Reuses super-admin components per docs/design-system.md.
