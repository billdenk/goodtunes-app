# Briefs for Ruby — four MRP SOW design asks (Bill, Aug 22 2026)

These are **needs, not solutions** — the design is yours. All four live in the
press quote builder / client estimate world (MRP skin, gold accent). House rules
apply: sentence case, "estimate" never "quote" in customer-facing copy, one
filled accent pill per screen, real ® char.

## 1. Short Run package quantities (#1–3) — Bill already asked you for this
A preset package (e.g. Short Run) sells at a fixed quantity like 100. Need:
the package card can be **limited to its preset number**, and optionally let
the customer **add another quantity block** (e.g. "+250") without opening the
whole builder. Mock both states.

## 2. Free quantity entry (#5)
**The need:** MRP's customer-service team quotes odd runs — 700, 1,400 —
every day. Our fixed quantity cards (100 / 250 / 500 / 1,000) force those
customers into the wrong size, which reads as a downgrade from a phone call.
Customers must be able to ask for **any quantity from 100 to 5,000 in steps
of 100** and see honest pricing for it (they get the per-unit price of the
price break they've earned). Design how quantity entry should look and feel;
the pricing math already exists.

## 3. Metalwork cutting selector (#9)
**The need:** MRP's customers choose how their masters are cut — DMM, lacquers
cut by MRP, or lacquers the customer supplies. The pricing machinery exists;
what's missing is the customer-facing choice. Design the three-way selection
(one is the press's default) and how the estimate should visibly reprice when
the choice changes.

## 4. Next-price-break callout (#27)
**The need:** when a customer is at, say, 700 copies at $4.12 each, MRP wants
them nudged: at 1,000 copies this drops to $3.61 each. Design where and how
that nudge lives relative to the running total — informative, not pushy.
Pairs naturally with the free quantity entry above.

## 5. Components → Pricing page rethink (Bill, Aug 22)
**The need:** MRP prices by *style* (Black, Opaque, Smoke Blends…), never by
individual color — each style's full price ladder is already loaded. The
current per-color upcharge grid therefore shows 370 blank cells and a
"0 of 370 priced" counter that reads like nothing loaded. Bill wants:
style-level upcharge blocks shown **only for styles the press actually prices
as a surcharge** (for MRP: Splatter — already stored, +$0.75@300/+$0.55@500+ —
and likely EcoMix); per-color rows demoted or hidden unless a press opts into
per-color pricing; and the empty state to say "you price by style — no
per-color upcharges (that's normal)" instead of an ominous zero.

## 6. "My price list" page for the press (Bill, Aug 22 — NEW)
**The need:** a press must be able to *see their own actual pricing* — the
loaded price list ("MRP Tier 3 — 09.01.2025"): record + jacket ladders per
style/format across their quantity breaks, setup & service lines, component
prices, and which rungs came from their sheet vs. hand edits (sync-lock).
Today those prices only surface inside the quote builder; there's no
read-it-like-a-price-sheet view. Design that page — think "the Tier 3
spreadsheet, but ours": scannable, printable, with an effective date. Otis
wires it; all data exists.

## Already with you
Client estimate **download page** (#30–31): `docs/handoff-briefs/estimate-download-spec.md`
(MRP's example sheet to beat is `docs/handoff-briefs/mrp-example-estimate.pdf`).
