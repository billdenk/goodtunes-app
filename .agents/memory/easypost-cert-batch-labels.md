---
name: EasyPost cert-batch labels
description: Durable rules for the cert signing round-trip shipping labels (EasyPost UPS).
---

# EasyPost cert-batch shipping labels

- Round-trip = outbound label (printer → artist for wet signatures) + prepaid return
  (`is_return: true`, EasyPost swaps to/from on the printed label) back to the hologram
  vendor when one is assigned, else the routed fulfillment partner. This "return label
  rides in the box" pattern is why EasyPost was chosen over Order Desk.
- **The key on this repl is a PRODUCTION key** — a "smoke test" purchase charges the real
  account; never buy speculatively. Missing key must be a reason-coded, operator-visible
  error; carrier/EasyPost failure messages surface verbatim.
- **Every mutation of the label snapshot shares ONE per-album lock** — not just the buy.
  **Why:** an address-save or local-pickup-skip that read "no labels yet" just before a
  purchase committed would overwrite the bought snapshot, and the next request would
  re-buy postage. Reviewers reject purchase-only locking here.
- **Money-moving external calls need a durable intent BEFORE the charge.** Creating an
  EasyPost shipment is free; persist its id (autocommit — a write inside an uncommitted
  transaction is NOT durable across a crash), then buy. On retry, retrieve the shipment
  and ADOPT an already-purchased label instead of re-buying; if EasyPost is unreachable,
  refuse to buy rather than risk a double charge. Skip/pickup is refused while an intent
  is outstanding (it may have charged).
- Partial-failure rule: the outbound leg persists durably before the return buy, so a
  retry only buys the missing leg. A stored purchased snapshot is always returned as-is.
- **The return-tracking mirror + partner heads-up run on EVERY successful label response,
  including stored-purchase retries.** **Why:** the snapshot commits before the mirror; a
  crash between them would otherwise strand tracking forever behind the "already
  purchased" early-return. Tracking write is idempotent; the one-shot notify claim
  (released on dispatch failure) keeps the email at-most-once — and saving the tracking
  without dispatching would consume that claim silently.
- Printer-driven flow (Bill's call): the operator only pre-saves the artist signing
  address; the PRINTER enters box size/weight in their portal and one click buys both
  labels (they know the packed box). Operator direct-buy is a backup. Open/unbuilt, in
  the Ruby design brief: printer payment, cost/service-speed threshold, per-printer
  "no A4" note.
- UPS rides EasyPost's UPSDAP carrier account (see easypost-labels-setup.md) — rate
  filtering must match the `UPSDAP` carrier string, not just `UPS`.
