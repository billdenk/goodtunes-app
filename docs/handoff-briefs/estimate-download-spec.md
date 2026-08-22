# Brief for Ruby — client estimate download page (replaces a PDF attachment)

**From:** Otis, Aug 22 2026 · **Requested by:** Bill (gogoods)

## The decision
MRP's SOW asks for a PDF summary attached to the estimate email (their example is
`docs/handoff-briefs/mrp-example-estimate.pdf` — a plain tabular quote sheet).
Bill's call: **we do better than an attachment.** The client clicks through from
the estimate email to their tokenized estimate page (`/e/:token`, already
MRP-skinned) and downloads the estimate from there. Ruby designs what that
download looks like.

## What to design
1. **A "Download estimate (PDF)" affordance on the client estimate page** —
   where it sits, how it reads (sentence case, "estimate" never "quote").
2. **The downloaded document itself** — a designed, print-ready estimate:
   - Press branding (accent from `manufacturers.email_branding`, logo, contact
     line) — same brand chain as the estimate email.
   - The mock-up image of the client's record (jacket + disc + center label) —
     same render the email will carry (Otis is building the server-side
     rasterizer for #37 now; assume a square jacket render + disc peek).
   - The expanded breakdown as in the email: per-record lines, setup lines,
     run subtotal, per-unit, total for the prepared quantity.
   - Prepared-by block (person, press, date), estimate number/token, and the
     "prices valid…" fine print the presses will want.
   - Beat MRP's example on hierarchy and warmth — theirs is a bare grid.
3. **States:** estimate with art vs. without art (press placeholder), long
   builds (many components — document must paginate gracefully).

## Constraints
- Rendered server-side from the saved estimate payload (no client screenshots);
  layout should be expressible in a simple flow (pdfkit-style: stacked blocks,
  one table) — Otis wires it to the existing `server/quotePdf.ts` machinery.
- A4 + US Letter safe.
- One filled accent pill max per page; sentence case throughout; real ® char.
