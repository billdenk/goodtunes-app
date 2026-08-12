# Press Components — handoff (2026-08-12)

Six screens for the components port: the press-side component setup pages and
the artist-side choosers that consume them. Verbatim-replacement mocks — copy
each `.tsx` as-is, then wire data. The rendering is the spec.

## Screens

**Press side**
- `PressVinylColorSetup.tsx` — the Vinyl component: live disc preview, type and
  color cards, edit dialogs (with preview-image upload), the splatter composer.
- `PressCatalogVinylLabels.tsx` — center labels.
- `PressCatalogStickers.tsx` — stickers.
- `PressGoodDeedPricing.tsx` — GoodDeed Certificates: the press-facing
  editable batch ladder (25–49 → 300+, empty $ cells, 25-cert minimum). This
  REPLACES the internal admin pricing matrix currently leaking into the press
  catalog view — presses must never see GoodTunes margins or artist wholesale.
  The wholesale ladder stays admin-only on Platform pricing.

**Artist side**
- `ArtistChooseJacket.tsx` — choose your jacket.
- `ArtistChooseInnerSleeve.tsx` — choose inner sleeve.
- `ArtistChooseInserts.tsx` — packages / inserts.

## Bill's porting rules (binding)

1. **GoodTunes Packages are untouchable.** The components port must never
   alter, hide, or restructure a press's GoodTunes Packages. They stay exactly
   where and as they are.
2. **Seed the Vinyl component from GoodTunes Packages.** Every vinyl type and
   color a press already defined through their packages work is pulled into
   their Vinyl component automatically — nobody re-enters anything. Example:
   Hellbender's packages show Black (1), Color (33), Splatter (31), House Mix,
   Translucent, Clear, Metallic, Opaque (+2 archived) — all of that arrives in
   their Vinyl component on day one. The Black-only default state applies only
   to a brand-new press with nothing to import.
3. **Press identity is data.** Memphis Record Pressing is the sample press in
   these mocks; every string and logo referencing it is hoisted into a
   `MOCK_PRESS` const. In the app, each press sees their own name and logo
   everywhere — header, intro copy, and the center label on every rendered
   disc (Hellbender sees the rune mark, never Memphis's skyline).

## Build order

Press side + super admin ship first. The artist choosers in this folder are
future-state reference — do not wire them up yet. Sequence: components live →
presses fill in content → component pricing scaffolding → (quote builder and
artist flow come later, separately briefed).

## Pricing (part of this build)

Pricing is by **component**, and it ships with the components:

- Each component gets its own pricing surface: per type / color / size /
  category, with quantity-break columns (the structure in the Catalog Pricing
  mocks).
- **Seed the rows, leave the cells empty.** The types, colors, and categories
  a press already has (imported from their GoodTunes Packages per rule 2)
  auto-populate the pricing rows — but component pricing is a different model
  from package pricing, so no numbers are copied over. Presses fill in their
  own component prices.
- **Package pricing is never touched** (rule 1 applies here too). A press's
  GoodTunes Package prices stay exactly as they are; component pricing lives
  alongside, not instead.

## Templates follow-through

Previously uploaded template PDFs should be auto-imported onto the Templates
page (see `handoff/press-templates/`) and associated with their components —
ingestion already reads type/size/check numbers from each PDF, so association
is determinable; queue anything ambiguous for a quick press review. Manual
download/re-upload is the fallback, not the plan.

## Rules that ship with these files

- **Both themes, always.** Every screen carries a `THEMES` map (light + dark).
  Light is the default here; the floating "View dark / View light" pill is
  MOCK-ONLY chrome — replace with the app's real theme source.
- Dark is the charcoal admin canon — never navy. Vinyl discs, album art, and
  splatter masks are not themed; white circle logo carriers stay white in both.
- All dummy data in top-level `MOCK_` consts; every state reachable.
- Statuses are word + shape, never color alone.
- Disc rendering uses the layered PNG kit in `./assets/vinyl-layers/` (body,
  splatter masks, highlights, inner circle) — imported as modules, travels
  with the screens.

## Acceptance

Both themes at 1440 / 1024 / 768, pixel-faithful to the mocks.
