# Update — Aug 22, 2026: Estimate PDF locked (run options, presale CTA, link line)

Replace `handoff/press-estimates-packages/PressEstimateDownloadMRP.tsx` with the copy in this push — verbatim, MOCK_ consts and all. This is the blessed design, not a reference to approximate.

## What changed (all Bill-approved Aug 22)
- **Page 1**: record mock enlarged (150px) so the prepared-for block earns its white space.
- **Run options (multi-quantity)**: the estimate's story stays with the prepared run; other sizes get ONE compact final "Run options" comparison sheet (500 / 1,000 / 2,000 rows: per unit, run subtotal, setup, total). The prepared run is marked "✓ This estimate" — word + icon, never color alone. Never re-quote page-per-option (Hellbender's 6-page trap) and never cram quantity columns into the main table (MRP's Excel sheet). Page counts stay honest ("Page 3 of 3").
- **Presale callout** — directly under the gold Estimate-total band, quiet gold-ruled box, printed line not a button: "Want this run with $0 out of pocket — and no financing? Fans preorder first; the presale covers the press bill before anything ships." CTA locked: **"Ask {rep first name} how →"** — the rep name is a variable per press ("Brandon" for MRP), never hardcoded.
- **Link line** — every sheet's footer carries "View this estimate online: memphisvinyl.com/estimate/{token}". The token IS the key: viewing requires no sign-in; acting (accept, start, upload art) confirms email at that moment.

## Must work
- [ ] PDF renders 1–3 sheets: build sheets per line-count spill, plus the Run options sheet only when the estimate has alternate quantities.
- [ ] Run-option math is real: per-unit × qty + one-time setup; setup identical on every row.
- [ ] Prepared-run row marked with word + check icon (colorblind-safe).
- [ ] Presale CTA uses the estimate's actual prepared-by contact first name per press.
- [ ] Footer link uses the estimate's real tokenized URL; token grants read-only view without sign-in.
- [ ] No-art state = press logo on press hex on jacket AND center label.
- [ ] "Estimate" everywhere — never "quote". Dollar amounts carry commas.

## Acceptance bar
Print the 3-sheet PDF. If a client can find the price for 2,000 units in under five seconds, and tell which run the estimate was prepared for without reading color, it passes.
