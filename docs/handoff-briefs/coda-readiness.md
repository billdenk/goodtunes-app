# Coda readiness — "Great, we're ready to plug in, just do this…"

Prepared Aug 22 2026 for the Monday MRP session. If MRP confirms their pricing
system of record is coda.io, this is the ask and the plan.

## What we tell MRP (the "just do this")
1. **Generate a read-only API token** — any account with access to the pricing
   doc: coda.io → Account settings → API settings → Generate token. Paste it to
   us through the Replit secrets flow (never email/chat).
2. **Send the link to the pricing doc** — the doc ID is in the URL
   (`coda.io/d/…_dXXXXXXXXXX`). Read access for the token holder is all we need.
3. **Fifteen minutes with whoever owns the tables** — walk us through which
   table/columns hold: item, format/size, price-break quantity rungs, unit
   price, setup fees. That mapping is the whole project.

## What GoodTunes does with it
- Coda's REST API is simple: list tables in the doc, page through rows as JSON.
  A read-only token can't touch their data.
- The connector is a translator: Coda rows → the exact same shape our existing
  CSV pricing import already consumes → normal import run, so **sync-lock and
  press hand-edits keep working unchanged** (locked rungs survive re-sync).
- Scheduled refresh (daily is plenty) + a "sync now" button in the press
  portal; every run logged, diffs visible before apply.
- Estimates keep snapshotting prices at creation — a Coda price change never
  rewrites an already-sent estimate.

## Boundary answers (for Ruby's questions)
- **Estimate numbers are GoodTunes-owned.** `press_estimates.display_id` is
  free-format text, unique per press — so each press keeps its own scheme
  (MRP's `071526-02` style fits as-is). We do not sync numbering with any
  external system.
- **Coda owns exactly one thing: the pricing source data.** GoodTunes owns the
  catalog, price snapshots, estimate records/numbers, customer links, and
  everything downstream.
