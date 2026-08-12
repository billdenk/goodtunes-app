# Press Templates flow — handoff (2026-08-12)

Four screens, one flow: a press manages its **certified template canon** and
tests it with a real file. These are verbatim-replacement mocks — copy each
`.tsx` as-is, then wire data. Do not restyle; the rendering is the spec.

## Flow

1. **PressTemplatesIndex.tsx** — Templates. Card grid per format (Vinyl / CD /
   Cassette / Stickers) and size (7"/10"/12"). One certified revision live per
   component; superseded revisions stay in history. Empty slots are dashed
   invitations.
2. **PressTemplatesUpload.tsx** — Upload/replace a template PDF. Modal shows
   CURRENT FILE (with ••• Replace / Archive — files are archived, never
   deleted) beside the NEW FILE drop zone (Upload file / Paste a URL).
3. **PressTemplateIngestion.tsx** — What we read from the PDF: embedded
   printed-areas study (Bleed / Cut / Safe / Hole overlays), Identity /
   Geometry / Rules cards, "Used by" packages. "Test" ghost pill opens the
   test-upload modal.
4. **PressTemplateCertification.tsx** — Test. Template spec and the press's own
   test file side by side (each with a pop-out), then control values vs. the
   8/8 pass verdict. Certification pins to the revision; a superseding revision
   re-runs the test file.

## Rules that ship with these files

- **Both themes, always.** Every screen carries a `THEMES` map (light + dark).
  The floating "View light / View dark" pill is MOCK-ONLY chrome — replace it
  with the app's real theme source when wiring.
- All dummy data lives in top-level `MOCK_` consts. Every state in the mock is
  reachable in the browser.
- The printed-areas study device is inlined (identically) in Ingestion and
  Certification. In the app it should become one shared component — inlined
  here only to keep each file self-contained.
- Statuses are word + shape (icon/ring), never color alone.
- Breadcrumbs follow the canon (muted crumbs, ChevronRight, current page in
  ink) with the ratified **crumb → H1 `mt-3` spacing** — see
  `handoff/style-guide/apple-canon.md`.
- Estimates language, placeholder-art rules, and press-vs-GoodTunes branding
  follow the existing style guide; copy in these mocks is final.

## Assets

`./assets/` holds everything the four screens import (press logo, GoodTunes
wordmark, avatar, template preview circle, Niina center-label test art).
Import paths are relative (`./assets/<name>`), so the folder travels with the
screens.

## Acceptance

Both themes at 1440 / 1024 / 768, pixel-faithful to the mocks. Dark is the
default in the files; light is one toggle away.
