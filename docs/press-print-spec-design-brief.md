# Design Brief — Press Print-Spec Entry & Artwork Check Dialog

**For:** Ruby (design studio)
**Publish location:** `docs/press-print-spec-design-brief.md` (committed by Task #3012, step 0)
**Related build tasks:** #3012 (fields + checks), #3011 (template measurement)

## Design-system mandate (read first)

Design **within the existing GoodTunes admin design system — do not invent a new visual language**. Specifically:

- Follow `docs/design-system.md` and `docs/apple-canon.md` plus the design-reference images in the repo; the operator/admin surfaces use the **light admin slate theme** and Apple-canon styling (thin rules, restrained color, at most one blue primary pill per screen).
- **Reuse existing components and patterns**: these surfaces extend the existing press catalog editor (`PressCatalogPanel` → `CatalogEditor` → `PressTemplateSpecsCard`) and the existing artwork check dialog (`CompletedTemplatePanel`). Keep their card structures, typography scale, spacing, form controls, pill/badge styles, and pass/warn/fail iconography (green check / amber triangle / red x) exactly as they exist today.
- Partner-portal surfaces reuse super-admin components verbatim (standing rule) — voice/copy and permission-trimmed affordances are the only allowed differences between the operator view and the press portal view.
- New elements (e.g. a measured-vs-expected comparison row, a template-scan summary strip) should look like siblings of existing elements, not a new family.

## Context

Each vinyl manufacturer (Memphis Record Pressing, Precision, Viryl, Hellbender, …) publishes its own art-file standards and templates. The platform stores per-press specs and automatically checks every uploaded print file (from the artist, an admin, or the press) against them before files go to the plant. Two surfaces need design:

## Surface 1 — Press spec entry (press catalog, per vinyl format)

Where a press (or operator on their behalf) records their standards. Today it's a card per component (jacket / center labels / inner sleeve / booklet; cassette: shell, J-card, O-card, sticker) with artboard W×H, expected pages, color rule, fonts rule, min PPI, and a template file upload. New fields to accommodate:

- **Geometry:** bleed minimum + recommended bleed (inches); safety margin from cut line (inches)
- **Resolution:** two PPI floors — standard images and bitmap/line-art images
- **Color rules:** CMYK/PMS, 4-color-process-only, grayscale-required (B/W pieces), "official Pantone spot colors only" toggle
- **Placed-image format rule** (e.g. disallow GIF/PNG-sourced images)
- **Component advisories:** free-text press-worded rules (e.g. labels: "solid image, no center-hole knockout")
- **Accepted submission formats note** ("PDF preferred…") shown to uploaders
- **Reference artifacts:** beyond the template PDF, slots for the press's PDF output preset (.joboptions) and preflight profile, each downloadable
- **Template-scan summary (from #3011):** when a template is uploaded the system measures it (artboard, pages, color spaces, dieline layer, live text). Design a compact read-only summary of what was measured, with clear affordance for which values are *measured from the template* vs *manually overridden* — a manual edit wins and should be visibly distinct, with a way to revert to the measured value.
- States to cover: no template on file; template measured OK; template couldn't be measured (non-fatal note + re-scan action); field-level mismatch flag when a configured rule disagrees with what the template itself contains.

## Surface 2 — Artwork check dialog

Today: a modal per component (see the existing "Cover: 12"" dialog) with a preview area, a pass/warn/fail line-item list, Download, and "Override with justification". Keep that skeleton. Upgrades:

- Line items now cite **the press's own spec** and show measured-vs-expected values (e.g. `30.31" × 19.95" vs MRP template 27.25" × 27.0"`), replacing generic "computed / verify with the plant" wording when a template or press spec is on file.
- New line items: bleed (pass / below-recommended warn / fail), edge-band bleed-content advisory ("outer bleed band appears empty…" — warning tone, never fail), dual PPI (standard + bitmap), grayscale verdict, Pantone spot-name verdict, placed-image format, plus advisory rows for human-judgment rules (safety area, label knockout) visually distinct from machine-verified rows.
- A subtle provenance cue per line item: is the expectation from the press's template, their entered spec, or a computed fallback.
- Keep three verdict tiers visually as today (green/amber/red); advisories should read softer than warnings.

## Deliverable

Mockups (desktop-width admin) of: Surface 1 component card in edit mode with the new fields + template-scan summary states; Surface 2 dialog with the expanded line-item list showing all three verdict tiers + advisory rows. For review before build.
