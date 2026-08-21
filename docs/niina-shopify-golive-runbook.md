# Niina Soleil Shopify go-live runbook (Task #3259)

One-time operator sequence for connecting a store that already has historical
sales (Niina's `71gsth-ev.myshopify.com`, CALIFORNIALAND) without stranding
past purchasers or letting the first new webhook order grab GoodDeed #1.

## Why a backfill exists

Only post-connection `orders/paid` webhooks mint GoodDeed numbers. The
backfill pulls the store's **historical paid orders from Shopify**, filters to
mapped products, and mints them through the *same* materializer as the
webhook path — stub customers, unlocks, redemption codes, platform-fee ledger,
NPO credits — but **strictly in original order-date sequence** (earliest
purchaser gets #1) and with **redemption emails held** until the operator
releases them, so Niina can announce first.

## Operator sequence

1. **Connect the store** — Admin → Shopify → connect card. Niina's domain is
   on the custom-app bridge, so the normal install link routes through the
   custom app automatically.
2. **Set the $1.50/unit fee** — on the store row, click the `$X.XX/unit` fee
   and save `1.50` (this is the existing per-store `digitalUnitFeeCents`; the
   backfill and all future webhook orders accrue at whatever rate is set
   *at mint time*, so set it BEFORE running the backfill).
3. **Map products** — Album → Sell → Shopify mapping (map every product/
   variant that should mint; unmapped products are skipped by both webhook
   and backfill).
4. **Configure the EndoFound beneficiary** — album NPO beneficiary split
   ($1.00/unit to EndoFound). Do this BEFORE the backfill: NPO credits mint
   at materialization time (idempotent per order+org, so a late config only
   covers future orders).
5. **Dry-run preview** — store row → `History` → **Preview (dry run)**.
   Verify: count, order-date range, projected GoodDeed numbers (earliest
   order = #1), refunded/cancelled/unmapped counts look right. Nothing is
   written.
6. **Run the backfill** — **Backfill N orders** (confirm dialog). Sequential
   mint in date order; idempotent on Shopify order id, so re-running after a
   partial failure is safe. NO emails are sent; each order is stamped
   `redemption_email_held_at`. New webhook orders arriving during/after the
   backfill number above the backfilled floor (shared MAX+1 + collision
   retry).
7. **Niina announces.**
8. **Release the emails** — same `History` panel → **Release N emails**
   (count confirmation). The batch runs under a store-scoped lock (two
   concurrent releases can't interleave); each email is sent first and marked
   released only after the provider accepts it, so failed sends stay held and
   a re-release retries just those (at-least-once — a crash mid-batch can at
   worst duplicate one email, never silently lose one). Refunded orders never
   release.

## Notes / guarantees

- Backfilled orders keep their **original Shopify order date** as
  `orders.created_at` (reports show the true purchase timeline).
- Backfill skips: cancelled orders, refunded/voided orders, orders with no
  email, unmapped products, already-imported orders.
- Backfill never writes back to Shopify (no metafield / note_attributes) and
  never enters fulfillment (these orders shipped long ago).
- Email test-send: Album → Email appearance → preview → the recipient box
  accepts a named address (e.g. Ruby); the send stays `[Test]`-stamped with a
  placeholder code.
