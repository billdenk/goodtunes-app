# Handoff: Press Estimates & Packages (Create group)

**Replace presentational code verbatim; wire data only.** Standing law in `handoff/README-template.md` applies (delete-first, states checklist, ledger, pane-of-glass, questions-beat-inventions).

**Demo context:** Bill demos press-side to Hellbender Aug 17. Dead-ends listed below are DELIBERATE — ship as quiet no-ops, do not invent endings.

## What this is
Four screens forming the press "Create" flow, plus a rail change:
- **PressEstimatesIndex.tsx** — NEW. Estimates home: grid/table views, All · Vinyl · CD · Cassette + 7″/10″/12″ segments, status filter popover, canon blue "Build estimate" → the estimate builder. 8 seeded rows + empty states.
- **PressQuoteBuilder.tsx** — CORRECTION to the previously shipped estimate builder: Add-a-person modal restyle; live "Estimates" breadcrumb → EstimatesIndex; per-press gold accent (PRESS_ACCENT #D6A63F, theme-aware `--q-accent-ink`) on spec-strip total pill + strip hairline; rail "Create" group. This accent is per-press white-label theming — each press gets its own accent value.
- **PressPackageBuilder.tsx** — NEW. Package-flavored variant of the estimate builder (same machinery, package semantics).
- **PressPackagesIndex.tsx** — CORRECTION: CTA is now a quiet hairline "Create package" pill → PackageBuilder; rail "Create" group.

**Rail change (all press screens):** a "Create" nav group with Estimates and Packages entries. Corrected copies of the 8 previously-shipped screens carrying this rail delta are pushed alongside this handoff to their existing handoff folders — the ONLY change in those files is the rail; do a rail-region diff, not a full re-wire. Rails stay Otis's — map the Create group into the real press rail.

## MOCK_ consts (swap these, nothing else)
- EstimatesIndex: `MOCK_ESTIMATES`.
- PackagesIndex: `MOCK_PACKAGES`, `MOCK_UNIT_PRICES`.
- QuoteBuilder + PackageBuilder (identical set): `MOCK_CLIENTS`, `MOCK_WEIGHT_UP`, `MOCK_LABEL_PRICE`, `MOCK_JACKET_PRICE`, `MOCK_SLEEVE_PRICE`, `MOCK_INSERT_PRICE`, `MOCK_KIND_MIN_QTY`, `MOCK_ASSEMBLY_PRICE`, `MOCK_SHRINK_PRICE`, `MOCK_STICKER_PRICE`.
- Option/structure catalogs (VINYL_SIZES, SLEEVE_OPTIONS, LABEL_STYLES, JACKET_CATALOG, STICKER_SHAPES, STATUS_META, PRESS_NAV, shell identity) are presentation/structure — keep, wire per-press where applicable.

## Wired vs decorative
Wired: format/size segments, status filter popover (live multi-select), grid/table toggle, every estimate card/row → builder, breadcrumbs (Estimates/Packages → their index), full progressive builder incl. in-mock save/send flows, quiet "Create package" CTA → builder, appearance control (mock chrome — Otis theming applies).
Decorative dead-ends: search icon + rail ⌘K, Feedback, Bell, user-menu items, rail leaves without routes, Packages card "Edit" links.

## Assets
`assets/` in this folder carries every import: goodtunes-logo.png, mrp-logo.png, mrp-logo.svg, brandon-seavers.png, californialand-cover.jpg, californialand-inner-sleeve.png, mrp-ruby-translucent.png, niina-label-1.png, niina-jacket.png, niina-soleil.webp, jeanne-rebillard.jpg, arian-kennedy.jpg.
**Plus `assets/vinyl-layers/`** (referenced by PUBLIC PATH in the builders, not imports): opaque-vinyl.png, translucent-vinyl.png, splatter-one.png, splatter-two.png, splatter-three.png, vinyl-highlights.png, inner-circle.png. The mock references them at `/__mockup/vinyl-layers/…` — repath to wherever Otis serves static assets; keep filenames.

## States to enumerate (acceptance bar)
EstimatesIndex: grid + table, each format segment, filtered, empty state. Builders: fresh, mid-build, complete/send. PackagesIndex: default. All in BOTH themes (light default + charcoal dark) at 1440 / 1024 / 768. Screenshot diff vs these files' render; any difference other than data values is a failure.

## Canon
Word + icon statuses. Real ® ("GoodTunes®"). "Estimate", never "quote" — in ALL user-facing copy (file names keep QuoteBuilder for history). One filled blue max per screen. Commas in dollar amounts.
