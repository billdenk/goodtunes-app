# UPC purchase flow — design handoff for Ruby (Task #3249)

Written 2026-08-21. Companion research memo: `docs/upc-purchase-path.md`
(GS1 pathways, license-holder rules, press-fee mapping, recommendation).
Nothing here is built — this is the flow to mock. No engineering input should
be needed to mock it; where the answer isn't settled it's listed under Open
design questions.

## The one-paragraph story

An artist preparing a physical release is told (by the preflight/barcode
warning from the generator task) that their release has no UPC. From that
warning they open a "Get a UPC" flow: they see who supplies it (their press,
or GS1 US directly), the exact price, and the terms; they explicitly agree to
the charge; then the **press or a GoodTunes operator** — never the artist —
presses the actual submission button. When the code comes back it lands on
the release (the existing UPC row on release Details), and the barcode
artwork becomes available from the generator.

## Actors

- **Artist** — sees the need, reviews price + terms, gives explicit consent.
  Never submits the request themselves.
- **Press** — for a press-supplied UPC (e.g. MRP, $35): confirms the request
  with the plant, returns the assigned code.
- **Operator (GoodTunes)** — for the GS1-direct path, and as backstop on the
  press path: submits/records, enters the returned UPC.

## Two supply paths, one flow

- **Press path** (available when the release's press offers UPCs — MRP $35;
  other presses TBD): fee is a press service line item; charged with the
  pressing order money like any other add-on.
- **GS1 US direct path** (fallback / artist preference): a guided referral —
  we collect the product data, the artist pays **$30 to GS1 US on their own
  card** at gs1us.org, and the license is issued **in the artist's name**
  (their name shows publicly in the GS1 registry). Design the purchase step
  as a swappable panel: if GoodTunes later becomes a GS1 Channel Partner this
  step becomes an in-app purchase with no other screens changing.

## Screens & states

### 1. Preflight warning (entry point — generator task owns the trigger)
- Release Details / barcode surface shows: "No UPC on this release" +
  a quiet "Get a UPC" affordance (and "I already have one" → the existing
  UPC field).
- States: `no-upc` (warning), `upc-set` (no warning, barcode available),
  `request-in-flight` (see step 4 chip).

### 2. "Get a UPC" sheet — choose path + see price
- If the invited press supplies UPCs: lead with the press card —
  "‹Press› supplies UPC barcodes · $35 one-time per format". GS1-direct card
  beneath ("License your own UPC from GS1 US · $30, license in your name").
- One card per **format needing a code** (vinyl / CD / cassette are separate
  UPCs) — show which formats are covered and the multiplied total.
- Copy must state who the license holder is under each path (see Disclaimer
  copy below).

### 3. Agreement step (the consent record)
- Full price line ("1 UPC × $35 = $35"), the terms block, and an explicit
  affirmative action — a checkbox + a single earned-blue confirm ("Agree and
  request UPC"). Per canon: the confirm is the one solid-blue action.
- GS1 path adds the product-data mini-form first: brand/artist name as it
  should appear publicly, product title, format, and (optional) product
  image — prefilled from the release wherever we have it.
- On confirm the artist's part is DONE. State → `Requested`.

### 4. Request states (visible to artist on the release)
- `Requested` — "UPC requested · awaiting ‹Press›/GoodTunes" chip on the
  formats row; artist can withdraw before submission.
- `Submitted` — press/operator pressed the button; no more withdrawal.
- `Assigned` — UPC value lands in the existing Details UPC row, with
  provenance line ("Supplied by Memphis Record Pressing · Aug 21 2026" or
  "GS1 US license in your name"). Barcode artwork affordance unlocks.
- `Failed / needs attention` — honest error state with what to do next
  (e.g. GS1 form bounced, press can't supply for this format).

### 5. Press/operator side (submission button)
- Press portal & god view: a small queue row per request — artist, release,
  format(s), fee, consent timestamp. One action: "Submit to plant" /
  "Mark submitted", then an "Enter assigned UPC" field (validated as 12-digit
  UPC-A) that flips the artist state to `Assigned`.
- Operator god view mirrors it (operator mirror of portals rule).

### 6. Confirmation record (artist keeps)
- Details tab row + a confirmation email: UPC value, format, supplier, fee
  paid, date. Append-only — a replaced/corrected UPC keeps history.

## Disclaimer copy requirements (final wording w/ Bill + counsel)

1. **Charge consent** — per-UPC, its own line, never bundled silently:
   "You authorize a one-time charge of $35 for one UPC for ‹Album — Vinyl›."
2. **License holder** — GS1 path: "The GS1 license is issued to you; your
   name will appear publicly in the GS1 registry. GoodTunes assists with the
   application and is not the licensee." Press path: "This UPC is supplied by
   ‹Press›." (Marketplace caveat until each press answers the ownership
   questions — memo §2.2.)
3. **Non-affiliation** — "GoodTunes is not GS1 US."
4. **No refunds once submitted** — the GTIN issues immediately.
5. **No marketplace guarantee** — "A UPC does not guarantee acceptance by
   any retailer or marketplace."

## Open design questions

1. Where does the entry warning live besides release Details — the Sell
   panel? The pressing-order preflight? (Generator task decides the trigger;
   you decide the surface hierarchy.)
2. Multi-format: one combined agreement covering all formats, or one
   agreement per format? (Billing wants per-UPC lines either way.)
3. Press path billing moment: charged with the pressing-order balance
   (invisible until the milestone) vs. its own immediate charge? Engineering
   can do either.
4. Does the artist see the two paths side-by-side, or do we auto-pick
   (press path when available) with GS1 as a "prefer to own your license?"
   link?
5. GS1-direct hand-off moment: artist pays on gs1us.org — do we keep them in
   a "come back and paste your UPC" state, or does the operator complete the
   purchase live with the artist? (Memo recommends the guided-referral
   posture until Channel Partner status lands.)
6. What does `Failed` look like on the press path — does the press write the
   reason, or only operators?
7. Withdrawal window: exact copy + whether a withdrawn request refunds
   automatically (press path only — GS1 path charges nothing in-app).

## Out of scope for the mock

- Payment UI internals (existing Stripe patterns apply).
- The barcode artwork generator itself (separate task; assume an "artwork
  available" affordance appears at `Assigned`).
- GS1 Channel Partner embedded purchase (design the GS1 panel swappable).
