# Artwork placement into press templates — decision spike

**Status:** Recommendation ready for Bill's review. Follow-up build task already queued (see bottom) so it can be unblocked the moment Bill signs off; if Bill picks a different path, retitle/reframe that task instead of opening a new one.
**Date:** May 27, 2026.

## The question

GoodDeed's print template took weeks to get pixel-correct. Before we commit to building artwork placement for every press we work with — MRP, PMP, Hellbender, and whoever comes next — we need to pick one of three paths and write the build task against it:

- **(a) We own placement** — for every vendor template (jacket, center label, inner, insert, obi…), our code merges the customer's art onto the vendor's PDF/InDesign template and ships a print-ready PDF.
- **(b) We generate press-ready PDFs to spec** — we render to each vendor's bleed/safe-zone/color-profile spec; the vendor's pre-press does final placement onto their own template.
- **(c) Hand-off file + spec sheet only** — we collect strict-spec source art + a populated spec sheet (PQ, filename, color profile, dimensions), and the vendor's pre-press team does all placement.

## What each vendor actually accepts

Pulled from `docs/vendors/{mrp,pmp,hellbender}.md`. Re-verify before any build.

| Vendor         | Public template library?                                  | Outside files accepted?                                                            | Submission channel                          | Programmatic API? |
| -------------- | --------------------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------- | ----------------- |
| **MRP**        | Yes — full gallery + InDesign Preflight + Adobe PDF Profile | High-res PDF preferred; PSD/EPS/TIFF/packaged InDesign also fine                  | Dropbox / WeTransfer / Hightail / FTP       | No                |
| **PMP**        | **No** — CSR sends the correct template per project       | **No — "only PMP-provided templates"** explicitly forbids outside templates       | PMP file-drop tool (artwork + audio)        | No                |
| **Hellbender** | Yes — but **"do not resize or modify."** Dielines never embedded or flattened, request from PM | Only files laid out on Hellbender's own templates                | Shareable link (Dropbox/Drive) to assigned PM | No                |

**API check:** none of the three exposes a programmatic submission API. All three are CSR/PM-mediated drops with a human-staffed pre-press team on the other side. That is not going to change in the demo timeframe.

## Path (a): we own placement

**What it costs.** GoodDeed was a single template and took weeks. The MRP catalog alone is roughly 30+ templates across 7"/10"/11"/12" (center label, single jacket, widespine, gatefold, tri-fold, tip-on single/gatefold, paper inner, board inner, 2-page insert, 4-page gatefold insert, 8pp booklet, three poster sizes, obi in three spine widths, picture-disc label, etching, plus sticker shapes and UPC). Hellbender adds a second set with different dielines. PMP can't be done at all — they don't publish templates; CSR assigns one per project, so there's nothing to pre-build placement against.

**Tooling check.** `pdf-lib` can reliably overlay a customer image onto a vendor PDF page with bleed/safe-zone math — that's how GoodDeed works. Puppeteer is the wrong tool here (HTML/CSS color is RGB-only; vendors require CMYK/PMS). A real headless layout engine (e.g. Scribus CLI) exists but is a big new dep with its own ramp time.

**Verdict.** Months of work just to reach demo coverage of MRP + Hellbender, with PMP structurally excluded. We carry the full misprint liability. Hellbender explicitly forbids modifying their templates, so any drift in our placement code becomes a printed mistake on a customer's record.

## Path (b): we generate press-ready PDFs to spec

**What it costs.** We define one generator per (size × packaging) — e.g. 12" single jacket at 12.25×12.25 with 1/8" bleed, CMYK, fonts outlined — and the vendor's pre-press snaps it onto their own template.

**Compatibility.** Only MRP plausibly accepts this. MRP's spec is publicly documented (300 PPI, CMYK/PMS, 1/8" bleed, fonts outlined, dielines hidden) and they state PDF is preferred. **PMP and Hellbender both explicitly refuse outside templates** — Hellbender's rule is "files must match the specific Hellbender template they were laid out on," and PMP's rule is "only PMP-provided templates." Generating to a generic spec doesn't satisfy either.

**Verdict.** Partial-vendor only. Useful as a future optimisation for MRP, not a strategy.

## Path (c): hand-off file + spec sheet only

**What it costs.** We're already building the upload validator (300 PPI / CMYK / 24-bit WAV / per-side time limits / filename convention — see `docs/vendors/README.md`). On submission we package:

1. The customer's source art (PDF/PSD/EPS/TIFF) per Hellbender's accepted-formats list.
2. A populated PQ sheet (PMP's rule — side breaks, catalog/matrix, engineer contact, file count, file types).
3. The mandatory filename `Catalog#_ArtistName_TemplateType_yyyymmdd` (PMP-strict, safe everywhere).
4. The chosen template name (so the vendor's pre-press knows which dieline to drop onto).
5. A delivery link (Dropbox/Drive/WeTransfer) to the vendor's CSR/PM.

**Compatibility.** Works on all three vendors today. It is *literally* what each vendor's published workflow expects.

**Verdict.** Lowest time-to-first-vinyl, lowest ongoing per-album effort (the upload validator is the only code we write), lowest misprint liability (the vendor's pre-press team is on the hook for placement). Trade-off: no in-app "see your final jacket mockup" preview, and we can't auto-generate a comparison PDF across vendors.

## Comparison

| Axis                          | (a) We own placement                                | (b) Press-ready PDFs                               | (c) File + spec hand-off                             |
| ----------------------------- | --------------------------------------------------- | -------------------------------------------------- | ---------------------------------------------------- |
| Time to first vinyl           | Months (per-template build)                         | Weeks (MRP only)                                   | **Days** — just the upload validator                 |
| Ongoing per-album effort      | Low *after* every template is built                 | Low for MRP, N/A for others                        | **Zero** beyond validation                           |
| Error rate (misprint risk)    | High — bug = printed mistake                        | Medium — vendor pre-press catches our drift        | **Low — vendor pre-press owns final layout**         |
| Vendor compatibility          | MRP + Hellbender; **PMP impossible** (no templates) | **MRP only**                                       | **All three, today**                                 |
| Our liability for misprint    | Ours                                                | Shared                                             | **Vendor's**                                         |
| Demo readiness                | Not by demo                                         | MRP-only by demo                                   | **Ready for demo**                                   |
| In-app jacket preview         | Yes                                                 | Partial (MRP)                                      | No — vendor proof only                               |

## Recommendation

**Adopt path (c) — file + spec hand-off — for the demo and beyond.**

Reasons:

1. It is the only path that works for all three vendors we already track. PMP structurally rules out (a) and (b) by refusing outside templates.
2. The upload validator is work we're doing anyway. Path (c) reuses it and adds only the spec-sheet/PQ generator and the delivery hand-off.
3. The misprint liability sits with the vendor's pre-press team, not us. That's the right shape for a small team and matches how every other indie label submits today.
4. GoodDeed is already built and is the exception that proves the rule — we *can* own a template when the volume justifies the weeks of work. We should keep that exception for cases where we press at GoodDeed-scale volume on our own product, not extend it to every vendor.

In-app preview is the one thing we give up. Mitigate by showing the customer their source art on the chosen template *dieline* (vendor-published visual reference) as an approximation, with a clear "vendor pre-press will finalise placement; you will approve a proof before pressing" disclaimer.

## Follow-up build task

Already queued as **"Vendor submission packet: validate upload, generate spec sheet, hand off to press."** It is parked behind Bill's sign-off on path (c) — if Bill picks a different path, reframe that same task instead of opening a new one. Scope:

- Upload validator enforcing `docs/vendors/README.md` strict spec (300 PPI, CMYK/PMS, bleed, outlined fonts, 24-bit WAV, per-side time table, accepted formats blocklist).
- Per-vendor submission packet builder: source art + PQ sheet + filename convention + chosen template name + delivery link.
- Delivery hand-off UI: copies the packet link, surfaces the vendor's CSR/PM contact, marks the album as "submitted, awaiting vendor proof."
- Out of scope: any pixel-level placement against a vendor template (explicitly deferred).
