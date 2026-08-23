# Billing tab — artist release detail (approved Aug 22, 2026)

Bill approved this mock as the canon "You owe / Pay" surface. Otis: restyle
the pay moment to THIS, replacing the accepted-page-grammar interim styling.

## What this is

`ArtistBillingTab.tsx` — the release-detail **Billing** tab, verbatim
replacement source. Copy the layout, spacing, type, and states exactly;
swap the MOCK_ consts for real data. Do not treat it as a loose reference.

Model (from Bill's brief):

- Two clearly separated ledgers under one tab — never one mixed table:
  - **You owe** — press invoices (AP). Always present. On a
    GoodTunes-funded project the press bill reads "Paid by GoodTunes
    presale" (word + icon) — the $0-out-of-pocket promise in the artist's
    own books.
  - **You've earned** — presale/GoodTunes proceeds (AR). The section only
    exists when GoodTunes is in play; a press-only artist never sees an
    empty earnings section.
- The tab badge carries the AMOUNT DUE (attention signal), never earnings.
  Earnings are good news shown big inside, top right.
- ONE filled action: the blue "Pay $X" pill → Stripe checkout (the same
  checkout already live on /e/:token/accepted). Stripe caption under it.

## Must work

- [ ] Amounts come from the estimate/invoice records — never client math.
- [ ] "Pay $X" opens the existing Stripe checkout; paid state flips to
      "Paid ✓" (word + icon), pill disappears.
- [ ] Press-only artist: no "You've earned" section rendered at all.
- [ ] GoodTunes-funded project: press invoice status "Paid by GoodTunes
      presale", no pay pill.
- [ ] Dollar amounts with commas; "estimate" never "quote"; statuses are
      word + icon, never color alone.
- [ ] Assets referenced (logo, artist photo, cover) are mock stand-ins —
      map to the app's real assets.
