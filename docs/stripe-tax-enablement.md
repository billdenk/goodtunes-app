# Stripe Tax — Enablement Runbook (operator)

Bill runs this in the **Stripe Dashboard**. There is **no code change** here — the
checkout already calls Stripe Tax for both the pre-checkout "Sales tax" line in the
Buy sheet and the final charge at checkout, so the two can never diverge. But Stripe
Tax only returns a real number once it's **enabled and configured in the Dashboard**.
Until then the tax line legitimately hides and fans see tax only at the Stripe
checkout step (or nothing). This runbook is exactly what to turn on so the line
resolves to a real amount.

Do every step in **production** (live mode). The same steps apply in test mode if you
want to rehearse first — Stripe Tax is configured per-mode, so enabling it in test
does **not** enable it in live.

## How the app already uses Stripe Tax (context, not action)

You don't need to change any of this — it's here so the Dashboard settings make sense.

- The embedded checkout session sets `automatic_tax: { enabled: true }` and
  `customer_update: { address: "auto" }`, so Stripe computes municipal/state tax from
  the address the fan types. If Stripe **can't** resolve tax for a taxable address it
  **blocks** completion — a fan can never accidentally pay $0 tax in a jurisdiction
  you're registered in.
- The pre-checkout Buy-sheet line calls `stripe.tax.calculations.create`
  (`GET /api/checkout/tax-quote`) with the **same per-line tax codes** as checkout, so
  the preview matches the charge. With too little address info (e.g. a US destination
  with no ZIP) it returns `available: false` and the UI just holds the line until the
  fan types more — that is expected, not a bug.
- Tax is applied **on top of** our listed prices (`tax_behavior: "exclusive"`) — we do
  **not** bake tax into the sticker price.
- Per-line tax codes the app sends (you only need to confirm these exist as defaults,
  see step 4):
  - Physical records, signed certs, booklets → `txcd_99999999` (General — Tangible Goods)
  - Digital-only format → `txcd_10401000` (Digital Audio Works, streamed, limited rights)
  - "Gift of Hope" / custom donation add-ons → `txcd_90000001` (Cash Donation, non-taxable)

## Steps in the Stripe Dashboard

### 1. Enable Stripe Tax
- Go to **Settings → Tax** (or **More → Tax**).
- Turn Stripe Tax **on**. Stripe will walk you through an onboarding panel that
  collects steps 2–4 below; you can also revisit each later from the same Tax settings.

### 2. Set the business head-office / origin address (required)
- In **Settings → Tax → "Your business" / origin address**, enter GoodTunes'
  head-office address (the address your business operates from).
- This is **mandatory**: without an origin address Stripe Tax cannot compute a rate,
  the `tax.calculations.create` call fails, and the pre-checkout "Sales tax" line stays
  hidden (`available: false`). This is the single most common reason the line never
  appears.

### 3. Register the jurisdictions where you collect (and watch thresholds)
- Go to **Settings → Tax → Registrations**.
- Add a registration for **every** state/jurisdiction where GoodTunes has a tax
  obligation (nexus). **Stripe only adds tax for jurisdictions you've registered** — an
  unregistered state returns $0 tax by design, which is correct (you shouldn't collect
  where you're not registered) but means the line can read $0 for those buyers.
- **Thresholds:** Stripe **monitors** your sales against each US state's economic-nexus
  threshold and flags when you're approaching or have crossed one (Settings → Tax →
  **Monitoring / Thresholds**). Monitoring tells you *where you may now owe*; it does
  **not** auto-register you. When Stripe flags a threshold, you (or your accountant)
  register with that state, then add the registration here so Stripe starts collecting.
- Start with the state of your origin address plus any state where you have physical
  nexus; expand as monitoring surfaces new thresholds.

### 4. Confirm the default product tax behavior + tax code
- In **Settings → Tax → "Tax behavior" / preset**, confirm the account default tax
  behavior is **Exclusive** (tax added on top). The app sends `tax_behavior: "exclusive"`
  explicitly per line, so this is belt-and-suspenders, but keep the account default
  aligned so anything created in the Dashboard behaves the same way.
- Confirm a **default tax code** is set for products that don't carry one (Stripe
  suggests "General — Tangible Goods" `txcd_99999999`). The app sets the right code per
  line item, so the default is only a fallback — but setting it to tangible goods means
  a hand-created Dashboard product also defaults sensibly. No special per-product setup
  is required for our records: the code rides on each checkout line item from the app.

## Verify it's working (executor checks this, then closes the plate)

After Bill confirms steps 1–4 are done in **production**:

1. On the live Hope page (`get.goodtunes.music/nightbirde/hope`, once purchasable —
   see `nightbirde-go-live-checklist.md`), pick the 7", enter a **US shipping address
   with a ZIP in a registered jurisdiction**.
2. The Buy sheet should show a **"Sales tax"** line with a **real dollar amount**
   (not "…" forever, not "At checkout", not absent).
3. Continue into Stripe Embedded Checkout with the **same** address and confirm the
   tax shown there **matches** the Buy-sheet line and the totals reconcile.

If the line stays hidden:
- A US destination needs a **ZIP** before Stripe can resolve a rate — type a full ZIP.
- If it's still hidden with a complete US address, re-check **step 2** (origin address
  missing is the usual cause) and that the destination's state is **registered** (step 3).
- A $0 tax line for an **unregistered** state is correct, not a failure.

> This plate stays open ("hang in") until the verification above passes on the live
> Hope page. The only thing blocking it is Bill completing the Dashboard steps —
> there's nothing left to change in code.
