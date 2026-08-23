# Brief — Otis #3145: the artist art-upload flow (art blocks)

**Status:** the flow is fully designed across four mocks. This brief stitches
them into one implementation story: which mock owns which step, what is wired
vs. decorative, and the check thresholds. Nothing here needs new design.

## The story in one paragraph
An artist never touches a dieline. On their release's Vinyl → Art tab they see
one block per piece of their package (Front, Back, Spine, Center labels, Inner
sleeve — driven by what the press's certified template contains). They drag,
drop, link, or upload plain art into each block. The system checks each file
instantly (CMYK, 300 ppi, bleed, format), shows what survives the cut with
trim/bleed/text-safe overlays, and on approval places everything into the
press's certified PDF template itself. Downloading the raw template stays as
the quiet secondary path for artists who have designers.

## The four surfaces (mock = source of truth, copied verbatim in this push)

1. **`ArtistReleaseArtTab.tsx` — the entry point.** Release detail, Vinyl tab,
   ART sub-chip. One drop zone per component block; blocks come from the
   press's certified template, never hardcoded. Per-block states: empty,
   uploading, checks running, passed, needs attention. "Download template
   (PDF)" is the quiet secondary.
2. **`ArtistArtworkStudio.tsx` — the placement view.** Each piece shown with
   TRIM / BLEED / TEXT-SAFE overlays. Overlays differ by LINE STYLE, never
   color alone (Bill is colorblind). On approval the system maps art into the
   press template — artist never edits the template.
3. **`ArtworkCheckUpgraded.tsx` — the prepress review dialog.** Shown to
   artist and GoodTunes team. TL;DR verdict card on top, then sections in
   urgency order: Needs attention → Check by eye → Passed (collapsed). All
   file actions live in the single ··· overflow chip over the preview.
4. **`ArtistTemplateTest.tsx` — the seated-art test view.** Already pushed at
   `handoff/artist-template-test/` (Aug 16) with its README and asset. Tap any
   art block to open it. Artist-safe copy of the live Template. Test. Certify.
   page — press-only pieces stripped.

## Checks (the gate, not decoration)
- Color: CMYK required; RGB flagged "Needs attention" with a one-tap convert
  offer, never a silent conversion.
- Resolution: 300 ppi minimum at print size; borderline (250–299) lands in
  "Check by eye" with a zoomed preview.
- Bleed: template-defined per piece; missing bleed = needs attention.
- Format: PDF, TIFF, PNG, PSD, AI accepted; fonts must be outlined in vector
  files.
- Every status is word + icon — never color alone.

## Must work
- [ ] Blocks derive from the press's CERTIFIED template for the chosen build —
      change the package, blocks change with it.
- [ ] Per-file checks run on drop and re-run on replace; results persist on
      the block chip.
- [ ] Placement into the press PDF template is system-side; the artist can
      preview the seated result (template test view) but never edit it.
- [ ] Prepress review dialog is shared: same data for artist and team.
- [ ] Quiet path: template PDF download remains available per block group.
- [ ] Light + dark themes on all artist surfaces.
- [ ] "Estimate" never "quote"; real ®; statuses word + icon.

## Acceptance bar
An artist with three PNGs and no design software gets from empty blocks to
"all pieces passed, art seated in the template" without ever seeing a dieline,
and a colorblind user can read every state with the color stripped.
