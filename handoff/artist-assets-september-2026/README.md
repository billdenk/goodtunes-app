# Artist Assets + Apple Canon correction handoff

**UI + FUNCTIONALITY + DATA-CONTRACT CHANGES**

> **FUNCTIONALITY CHANGES INCLUDED. Replace presentational code verbatim and wire every listed interaction and persistence transition. Do not preserve conflicting legacy behavior.**

This correction lands on top of Otis `main` commit
`32805d8d726cc1e4de93531cfbea220355c27692`, “Restore artist assets exposure
and apply Apple admin skin.” Preserve that recovery, its tests, and all newer
production behavior.

Do not replace unrelated Otis infrastructure, routes, builders, estimates,
pricing, permissions, role behavior, white-label identity, or the production
GoodDeed renderer. The image-review and vinyl-representation interactions below
are explicitly authorized functionality and persistence changes.

## Why this is a correction, not a second rewrite

Otis has already restored the main Artist Assets entry points and routed
GoodDeed through the existing `GoodDeedCertificate`. The remaining work is to
reconcile the approved presentation and interaction details below without
removing that recovery.

The source files in this folder are the exact approved GoodStudio source for
the named presentation sections. Copy those named sections verbatim, then wire
them to Otis data and existing production actions. Do not copy the GoodStudio
shell, mock release data, mock artwork, or local GoodDeed reconstruction.

This is deliberately a surgical correction bundle, not a standalone full-page
replacement: the complete Playground files retain Playground-only shell and
mock imports so the named sections remain reviewable in their original
context. Those imports are not a license to transplant mock assets. Map the
named sections to Otis' existing production components and assets; if that
conflicts with Otis data or permissions, stop and ask Bill rather than
inventing a substitute.

## Role application matrix

### Artist

Apply the complete Assets hierarchy and interactions:

- Primary: **Art · Audio · Bonus**
- Art: **Vinyl · GoodTunes® Player · GoodDeed®**
- Audio: **Vinyl · GoodTunes® Player**
- Bonus: **Videos · Photos**

Keep the production Tracks panel mounted once. Individual Tracks owns
per-track masters, ordering, downloads, extraction, Lyrics/LyricFlow™,
credits, splits, and track actions. Side Masters owns Side A/B files,
replacement/download, and side generation.

### Super Admin

When viewing an artist, render the artist’s exact components as a pane of
glass, with only permission-appropriate operator chrome/actions layered around
them. Do not maintain a separate Super Admin reconstruction.

Shared operator controls, dialogs, importers, menus, and semantic dark tokens
must use Apple Canon.

### Press Admin

Reuse shared Canon components for press-owned templates, files, estimates, and
project assets. Do not expose artist-only controls or data merely because the
visual component is shared. Super Admin and Press Admin use the same press
Catalog component where Otis already does so; preserve role permissions and
read-only states.

## Named verbatim source sections

From `source/ArtistAssetsTaskFirstVariant.tsx`:

- `VinylAudioPanel`
- `PlayerArtPanel`
- `MediaImportDialog`
- `PlayerMediaTileCards`
- `PlayerBonusRow`
- `PlayerAudioPanel`
- `VinylArtPieceCard`
- `AssetsTaskFirst`

From `source/OtisTracksInteractive.tsx`:

- the complete `Interactive` track experience and its Lyrics, Credits, Splits,
  Edit, and Listen surfaces

From `source/ArtistTemplateTest.tsx`:

- the artist Test/Certify page body, file history, lock state, breadcrumb, and
  prominent **Back to Assets** return action

## Must work

- Existing images become legitimate center-stage vinyl representations.
- **Replace image** opens the nested uploader.
- **Build with colors** enters the image-to-generated conversion state.
- **Keep image** cancels conversion, restores the image, and marks it reviewed.
- Saving a generated design replaces the image-backed representation.
- Saving a replacement image resolves the corresponding legacy-image review
  item.
- Image-count chips count only unresolved legacy images and decrement or
  disappear as those items are resolved.
- Persist `imageReviewed`; existing records without the field remain unresolved
  by default.
- Accept PNG and WebP images. Render non-square images contained rather than
  cropped or stretched.
- Cancel and close paths never mutate saved state.
- Art, Audio, and Bonus switch the visible task family without losing release
  context.
- Product selectors expose only the valid product/task combinations above.
- Individual Tracks and Side Masters show their own assets and instructions;
  never duplicate the same asset set under both.
- Side Masters supports Side A/B files, replacement, download, generation, and
  sequence reconciliation.
- Physical Audio preserves cut settings, per-side capacity guidance,
  sequence/gap decisions, cross-asset preflight, and overflow actions.
- Before preflight, show only **Run preflight**. Afterward show the result and
  **Run again**.
- Undo, Redo, and Reset follow cursor state and visibly dim when unavailable.
- Edit / Listen is a quiet mode selector aligned with the GoodTunes® Player
  music heading row.
- Player artwork shows image, source, 1080×1080 target, status, and actions.
- Bonus Videos render 16:9; Photos render square; each collection has exactly
  one blank Add tile.
- Vinyl artwork empty tiles and all Add/Upload/Replace actions open the shared
  Canon importer. Drag/drop happens inside the importer, not on the tile.
- The importer offers **Upload file** and **Paste a URL**. Only **Choose file**
  inside Upload file may open the native file picker.
- Importer guidance and validation match the selected asset type. Closing
  returns focus to the visible launcher.
- Existing review, download, refresh, report, persistence, lock, and permission
  behavior remains wired.
- Template Test/Certify returns to the prior Assets state through **Back to
  Assets** and its breadcrumb.

## GoodDeed exclusion and production rules

Do not copy `GoodDeedArtistPreview`, any GoodStudio-generated social card, the
blue mock logo, rounded certificate corners, the local dashed safe-zone inset,
or historical CALIFORNIALAND art into production.

Keep Otis’ existing `GoodDeedCertificate` as the production source. Current
production evidence has:

- Square 1080×1080
- Portrait 1080×1350
- Story 1080×1920
- square outer corners
- orange frame
- centered owner avatar
- the production GoodTunes mark

The historical US Letter PDF supplied during review proves the approved orange
print perimeter only. Its older album cover, recipient, certificate number,
copy, and geometry are not replacement data.

The Story safe-zone overlay is reference-only and must never appear in an
export. Do not infer it from screenshots or use the GoodStudio dashed inset.
It remains unavailable until a target platform and verified pixel bounds on
the 1080×1920 Otis output are documented.

## States and acceptance

Check every applicable state in light and neutral-charcoal dark at 1440, 1024,
and 768:

- default / populated
- empty
- loading with the thin Canon sweep
- validation error
- read-only / permission-reduced
- importer file and URL sources
- invalid and confirm-disabled importer
- successful import
- Individual Tracks and Side Masters
- preflight before and after
- undo/redo/reset enabled and disabled
- Test/Certify unlocked and production-locked
- artist, Super Admin view-as, Press Owner/Admin, and Press Staff

No horizontal overflow, navy operator surfaces, direct native-file launchers,
or lost functionality is acceptable.

## Otis response required after application

Update `docs/STATUS.md` with this handoff commit and the production files that
match it. Then return the GoodDeed actuals described in `OTIS-RETURN.md`.
