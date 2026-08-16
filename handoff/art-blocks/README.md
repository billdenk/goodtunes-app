# Art Blocks builder — design brief for Ruby

**Brief status:** Awaiting Ruby's design pass. Build task follows once mocks land.
**Brief date:** 2026-08-16 (amended same day per Bill's corrections memo — IA rename, format picker removed, Draft/Converted states, press-assignment precedence, thresholds-vs-geometry spec model, dual-theme ruling)
**Point of contact:** Bill / gogoods

---

## Context

Artists who press vinyl, CD, or cassette through GoodTunes must supply print-ready artwork for every physical component of the release — jacket front, back, spine, center labels A+B, inner sleeve, CD booklet, etc. Today that means navigating PDFs of dieline templates, reading press spec sheets, and exporting files to exact artboard dimensions. Most artists don't know what a bleed is.

The Art Blocks builder hides all of that. The artist sees a map of named blocks ("Cover front", "Cover back", "Center label — Side A", …), drops an image on each one, and gets instant pass/warn/fail feedback. When all blocks pass, the system stitches the accepted art into the press's real template downstream — the artist never sees the dieline.

This brief covers the **interface the artist interacts with**. It does NOT cover the stitching pipeline, the operator prepress review flow, or the existing Completed Art confirmation surface (those are unchanged).

---

## Concept and flow

```
Release → format tab (Vinyl, CD, …) → Art section (artist portal, embedded AdminAlbum)
        ↓
  [1] Block map — one tile per required component
        • Format is already known: it was chosen once at draft creation
          ("Name your release": name + format), and the artist is standing
          inside that format's tab. There is NO format picker here — ever.
        • The map derives from the draft's format and its spec source
          (see "Draft vs Converted" and "Spec model" below)
        • Tiles are named, shaped, and sized for the format
        • Each tile starts in "Empty" state with an outlined drop zone
        ↓
  [2] Drop / pick image on each block
        • Accepts JPEG or PNG (primary path — compositor stitches these directly)
        • PDF, TIFF, PSD accepted with an advisory note (see Check semantics)
        ↓
  [3] Per-block check panel opens inline
        • Pass / warn / fail rows per check (format, dimensions, resolution, color)
        • Rollup badge on the tile: ✓ Pass / ⚠ Warning / ✗ Fail / … Checking
        ↓
  [4] Bleed toggle (per-block, in the check panel)
        • Switches the block's preview between trimmed view and full-bleed view
        • Guide overlays: cut line, bleed boundary, safety zone
        ↓
  [5] All-blocks-complete summary
        • Rollup across all blocks for the format
        • Draft: "Save artwork" confirm CTA when all blocks pass/warn
        • Converted (press assigned): "Looks good — send to press" CTA
        • Blocked by any failing block
        ↓
  [6] System stitches art into press template (not visible to artist;
      Converted state only)
```

---

## Draft vs Converted — the surface is state-aware

Art upload works in **both** release states. Ruby must mock both; the transition between them is quiet — most art that passed in Draft passes again at conversion with no artist action.

**Draft state (no press assigned):**
- **No press name appears anywhere on the surface.** This is the standing visibility rule.
- Blocks check against the **generic baseline geometry** and the **strictest thresholds across the press pool** (see "Spec model" below).
- Copy uses the generic form: **"Presses require CMYK"** — never "your press requires CMYK."
- The confirm CTA is **"Save artwork"** (or similar). There is no send-to-press verb in Draft.
- The **Unverified** status and the "guide geometry estimated — not from a certified press template" note are exactly the Draft-state behavior; Draft is the state that machinery serves.

**Converted (press assigned):**
- Everything **re-verifies** against the assigned press's certified template specs. Nothing is re-done, everything is re-verified.
- The press name appears, copy switches to **"your press,"** and the CTA becomes **"Looks good — send to press."**

---

## Press assignment — the precedence chain

The block map's spec source is unambiguous because assignment follows this order:

1. **Referral origin locks the press.** An artist who arrived through a press's referral link or white-label funnel is assigned that press automatically. No chooser shown.
2. **Otherwise MRP is the default** (per standing agreement).
3. **Super admin can assign or reassign at any time**, before or after the artist is in the system.
4. **Blind comparison is a future layer** on top of this chain, not a change to it (artists/labels compare anonymized press options against surfaced criteria). Do not build or design it now; do not structure anything that prevents it.

Standing rule unchanged: **no press ever sees another press's terms, pricing, or deal shape** anywhere in this flow.

---

## Spec model — thresholds vs geometry

Press specs split into two kinds, and the portability promise works differently for each:

- **Thresholds** (PPI floor, color-mode requirements, bleed depth): every upload is checked against the **strictest value across the press pool**, not the assigned press's value. Art that clears the highest bar clears every press — threshold checks are done **once** and the asset is portable forever. A press switch or a future repress never re-checks thresholds.
- **Geometry** (artboard dimensions, label diameters, fold positions): not stricter or looser between presses — just **different** (e.g. Viryl's 12″ label artboard is 4.25″ vs MRP's 4.125″). Geometry **re-verifies automatically** at press assignment and at any press switch. Most switches pass silently; a genuine mismatch surfaces as a specific ask naming only the affected blocks: *"Viryl's center labels are slightly larger. Re-export just the labels."*

The artist-facing promise: **verify once at the highest bar, switch presses freely, and only re-touch a file when the physical dimensions actually differ.**

Empty-state ruling: the cover-art placeholder is a **neutral icon on the quiet surface**, matching the template pattern — **never a blurred version of the artist's image**. Empty must look unmistakably empty.

---

## Block map by format

### What the block map contains

The block map is **derived from the draft's format and its spec source** — the generic baseline + strictest pool thresholds in Draft, the assigned press's certified specs once Converted. A 12″ single-LP needs different blocks than a gatefold 2×LP. There is no format question on this surface: format was set at draft creation, and the artist reaches the Art section standing inside a format tab (a release with vinyl and CD shows one set of blocks per tab, never two maps at once). Blocks are grouped visually by the physical component they represent.

### Required blocks per format

| Format | Block | Shape | Finished size (in) | Artboard (fin + bleed) | Bleed |
|---|---|---|---|---|---|
| **12″ single jacket** | Cover front | Rect | 12 × 12 | 12.25 × 12.25 | 0.125 / side |
| | Cover back | Rect | 12 × 12 | 12.25 × 12.25 | 0.125 / side |
| | Spine | Rect | *varies by disc count* | spine-w + 0.25 × 12.25 | 0.125 / side |
| | Center label — Side A | Circle w/ hole | 3.875 × 3.875 | 4.125 × 4.125 | 0.125 / side |
| | Center label — Side B | Circle w/ hole | 3.875 × 3.875 | 4.125 × 4.125 | 0.125 / side |
| **12″ gatefold** | Cover (full gatefold spread) | Rect | 24 × 12 | 24.25 × 12.25 | 0.125 / side |
| | Center label — Side A | Circle w/ hole | 3.875 × 3.875 | 4.125 × 4.125 | 0.125 / side |
| | Center label — Side B | Circle w/ hole | 3.875 × 3.875 | 4.125 × 4.125 | 0.125 / side |
| **12″ widespine (2×LP)** | Cover (with widened spine) | Rect | 12 × 12 outer | 12.25 × 12.25 | 0.125 / side |
| | Center labels (×4) | Circle w/ hole | 3.875 × 3.875 | 4.125 × 4.125 | 0.125 / side |
| **12″ inner sleeve** | Sleeve (per disc) | Rect | 19.09 × 30.97 | measured from press template | 0.125 / side |
| **7″ single jacket** | Cover front | Rect | 7.0625 × 7.0625 | 7.3125 × 7.3125 | 0.125 / side |
| | Cover back | Rect | 7.0625 × 7.0625 | 7.3125 × 7.3125 | 0.125 / side |
| | Center label — Side A | Circle w/ hole | 3.5 × 3.5 | 3.75 × 3.75 | 0.125 / side |
| | Center label — Side B | Circle w/ hole | 3.5 × 3.5 | 3.75 × 3.75 | 0.125 / side |
| **10″ single jacket** | Cover front | Rect | 10 × 10 | 10.25 × 10.25 | 0.125 / side |
| | Cover back | Rect | 10 × 10 | 10.25 × 10.25 | 0.125 / side |
| | Center label — Side A | Circle w/ hole | 3.5 × 3.5 | 3.75 × 3.75 | 0.125 / side |
| | Center label — Side B | Circle w/ hole | 3.5 × 3.5 | 3.75 × 3.75 | 0.125 / side |
| **CD (j-card)** | Front panel | Rect | 4.724 × 4.724 | press-specific | per press |
| | Back panel / spine | Rect | press-specific | press-specific | per press |
| **CD (booklet)** | Booklet pages | Rect | press-specific | press-specific | per press |

> **Spine-width caveat.** For single-jacket formats the spine is part of the jacket artboard. Its width depends on the disc count and paper stock — it is calculated at order time and is NOT a fixed number. For the art-blocks builder, the spine is shown as a block with a placeholder width and a note: "Spine width is confirmed by your press once the order is placed — your art should extend across the full gatefold spread."

> **Center labels are circles, not squares.** The finished area is a disc (circle) with a center spindle hole. Art must fill the circular bleed boundary; the center hole area (approximately 1½″ diameter on 12″ labels; larger on 7″ 45 RPM) is a no-content zone. Ruby should represent labels as circles with a hole indicator, not as squares.

> **Viryl Technologies labels are slightly wider.** Viryl's 12″ center label is 4.0″ finished / 4.25″ artboard (vs the 3.875″ / 4.125″ used by MRP, Hellbender, and the generic baseline). This is a **geometry** difference, not a threshold (see "Spec model"): in Draft the block uses the generic baseline; at press assignment or a press switch the geometry re-verifies automatically, and a genuine mismatch surfaces as a specific per-block ask ("Re-export just the labels"). Design the label block as a generic circle and note that the artboard dimensions come from the spec source.

> **CD specs are press-specific.** There is no generic-baseline artboard for CD components analogous to the vinyl specs above — each press issues its own CD template. The block map for CD formats will show "Artboard dimensions confirmed by your press" and display the press's template dimensions once the release is Converted with a press that has CD specs on file. Design the CD blocks so they gracefully handle this "pending spec" state (which is also the Draft state for CD).

---

## Check semantics — what Ruby must design states for

Each block runs these checks when an image is dropped. Results appear as a row list inside the block's check panel. Every check has a status and a one-line message.

### Check statuses (four, always word + icon — Bill is colorblind)

| Status | Meaning | Rollup effect |
|---|---|---|
| **Pass** (green check) | Check ran and met the standard | Clean |
| **Warn** (amber triangle) | Non-blocking — artist should note it | Degrades rollup to Warn |
| **Fail** (red ×) | Standard not met — blocks "looks good" confirm | Degrades rollup to Fail |
| **Unverified** (amber ? ) | Check ran but against a weaker reference (no certified press template on file); operator attention needed | Degrades rollup to Unverified, outranks Warn |

Rollup precedence: **Fail > Unverified > Warn > Pass**.

Advisory rows have status Pass but render with an info glyph (ⓘ) instead of a green check. They represent press-worded guidance that can't be machine-verified (e.g. "Keep important elements inside the safety zone"). Advisory rows never flip a clean rollup.

### Checks per uploaded file

**1. File format**

The compositor (the engine that stitches art into the press template) accepts **JPEG and PNG only**. The checks reflect this:

| Format uploaded | Result |
|---|---|
| JPEG or PNG | Pass — "Accepted for print. Ready to stitch." |
| PDF | Advisory warn — "PDF accepted, but the system will rasterize it for the press template. Export as JPEG or PNG at 300+ PPI for best results." |
| PSD, TIFF, EPS/AI | Advisory warn — "Accepted, but automated dimension and color checks are limited for this format. Verify specs manually." |
| Anything else | Fail — "Format not supported. Upload a JPEG or PNG." |

**2. Dimensions**

Art must match the block's artboard size (finished + bleed on all sides) within ±0.05″ (≈ 1/20 of an inch).

| Outcome | Result |
|---|---|
| Within tolerance | Pass — "12.25″ × 12.25″ — matches 12″ jacket finished+bleed." |
| Outside tolerance | Fail — actual vs expected sizes shown |
| Cannot determine (non-PDF raster with no embedded metadata) | Warn — "Couldn't read dimensions. Verify the artboard is WW″ × HH″ (finished FF″ × FF″ + 0.125″ bleed all sides)." |

**3. Resolution / PPI**

Default floor is **300 PPI** at the block's finished+bleed size. PPI is a **threshold** (see "Spec model"): uploads check against the **strictest floor across the press pool** (per-press values sourced from `press_template_specs.min_ppi`, null = 300), so a pass is portable across any press switch and never re-checks.

| Outcome | Result |
|---|---|
| ≥ 300 PPI (or per-press floor) | Pass — "Estimated 350 PPI at print size — meets the 300 PPI minimum." |
| < 300 PPI | Fail — "Estimated 180 PPI — below the 300 PPI minimum. Re-export at a higher resolution." |
| Cannot determine | Warn — "Couldn't verify resolution. Ensure the file is at least 300 PPI at WW″ × HH″ (the artboard size)." |

Vector art in a PDF passes automatically with a note: "Vector PDF — scales cleanly to print size. Embedded rasters not deeply inspected."

**4. Color mode**

All press plants require **CMYK, PMS (spot), or Grayscale**. RGB is auto-flagged — GoodTunes never silently converts color.

| Color mode | Result |
|---|---|
| CMYK | Pass |
| PMS / spot | Pass |
| Grayscale | Pass |
| RGB | **Fail** — "RGB detected. Presses require CMYK. Re-export from your design app as CMYK — do not convert in GoodTunes." *(Converted: "Your press requires CMYK…")* |
| Unknown (non-PDF, or PDF without readable color tokens) | Warn — "Couldn't verify color mode. Presses require CMYK. Check in your design app before submitting." *(Converted: "Your press requires CMYK…")* |

**State to note:** RGB uploads do **not** get silently converted. The design should make this unmissable — the artist needs to go back to their design app. This is the most common blocker in real prepress.

**5. Dieline / template layer (PDF only)**

A PDF that contains a layer named like a dieline or template (common if an artist laid out on the press's blank template and forgot to hide the guide layer) gets a warn:

| Outcome | Result |
|---|---|
| No dieline tokens found | Pass (silent — no row shown) |
| Dieline token found | Warn — "Found a layer that looks like a template guide. Hide or delete it before the final export." |

### Advisory rows (always shown, never block)

These appear beneath the check rows regardless of outcome. They echo the press's guidance that can't be machine-verified:

- "Keep important elements (text, faces, logos) inside the safety zone — content near the cut line may be trimmed."
- "The center-hole area is not printed. Keep it clear."  *(labels only)*
- "The spine is printed — text should be legible at the finished spine width."  *(jacket formats)*

---

## Bleed toggle

Each block's check panel has a toggle: **Trimmed view** (default) / **Full bleed view**.

- **Trimmed view:** shows the art cropped to the finished size (the cut line). What the physical product looks like.
- **Full bleed view:** shows the full artboard with guide overlays: cut/die line (outer boundary of the finished piece), bleed boundary (art must reach here), safety zone (important content should stay inside here). These three rings come from the press's certified template guides (`MeasuredTemplateGuides` — bleed, cut, safety per-side insets, plus fold lines for gatefolds and spines).

When no certified template guides are on file for a block, the toggle still works but the guide geometry is computed from the finished + bleed baseline numbers (with a subtle note: "Guide geometry estimated — not from a certified press template.").

**What to design for the bleed toggle:**
- Idle state (trimmed) — shows just the finished-size art, no overlay rings
- Full-bleed state — shows the wider artboard + three colored rings (bleed boundary, cut line, safety zone), each labeled
- Fold lines (gatefold / spine blocks) — vertical rules on the artboard showing where the fold falls
- Center hole (label blocks) — a circle at the center showing the spindle hole no-content zone
- Guide geometry absent — a quiet note that guides are estimated; no visual difference in the ring display

---

## States to design (per block)

For each block tile, Ruby must design:

1. **Empty** — outlined drop zone, block name, size note, a quiet "Drop image here or click to browse" affordance
2. **Uploading / checking** — progress indicator; "Checking your art…" message; block name and size info still visible
3. **Pass** — green rollup badge on tile; collapsed check rows (expandable); thumbnail of the art
4. **Warn** — amber rollup badge; at least one warn row visible (others collapsed); thumbnail; "Review and continue" CTA on the block
5. **Fail** — red rollup badge; failing rows foregrounded; thumbnail; specific failure message; "Replace image" CTA
6. **Unverified** — amber ? badge; unverified rows shown with the "weaker reference" explanation; operator note visible
7. **Replace / remove** — hover or expand action on a filled block; "Replace image" swaps the file without losing the block's position; "Remove" resets to Empty
8. **Bleed toggle — trimmed** (default preview mode, see above)
9. **Bleed toggle — full bleed** (guide rings visible, see above)

### All-blocks-complete summary state

Once all blocks for the chosen format have been attempted, a summary banner or row appears at the bottom of the block map:

- **All pass** — "Your artwork is ready. Confirm to send to press." → filled "Looks good" CTA
- **Warnings present, no failures** — "N warning(s) noted — you can still continue." → "Continue anyway" secondary CTA + "Review warnings" link
- **One or more failures** — "Fix N issue(s) before continuing." → CTA is locked; failing blocks are highlighted

### Reassurance framing

Artists aren't print professionals. The surface needs a reassurance line, visible before any uploads, that removes anxiety about getting it wrong:

> "Drop your artwork on each block. We'll check the specs — if something needs fixing, we'll tell you exactly what to change. You never have to touch the dieline."

This framing lives as a quiet subheading or intro line above the block map, not a modal.

---

## Where it lives

- **Surface:** Artist portal → Release → format tab (Vinyl, CD, …) → Art section. The locked structure inside a Release is: Dashboard, Overview, Music, one tab per physical format (Vinyl, CD), Sales — Package, Art, Prep, and Payments nest inside each format tab. Ruby's CALIFORNIALAND mock (Vinyl tab, Art segment) already has this right; this brief matches her mock. Artist-facing strings say **"Release"** (never "Album") and **"Variants"** (never "SKUs").
- **Embedded mode:** `AdminAlbum` in `embedded` mode (no /admin chrome) inside `OperatorShell`
- **Theme:** **Theme-aware, both modes — dark default in mocks.** All operator and partner surfaces are theme-aware with light and dark modes (dark = the charcoal admin dark, never navy); both token sets ship with every handoff per the theming rules. See `handoff/style-guide/apple-canon.md` "Theming & breakpoints."
- **Reuse rule:** partner portals reuse super-admin components with permission-removed affordances only. The block check panel is a lighter version of the existing prepress review dialog (`handoff/press-specs/ArtworkCheckUpgraded.tsx`) — same check-row layout, same verdict banner structure, same status vocabulary — just artist-facing copy and no override affordance.
- **Colorblind rule (founder, applies everywhere):** every status = icon + word, never color alone. Never use color as the only indicator of pass/fail/warn.

---

## Spec-table companion — per-block geometry at a glance

Quick reference for Ruby to size the block tiles and the artboard previews inside them.

```
Block                    Finished (in)      Artboard (in)       Shape
─────────────────────────────────────────────────────────────────────────────
12″ Jacket (sq panel)    12 × 12            12.25 × 12.25       Rect
12″ Gatefold (spread)    24 × 12            24.25 × 12.25       Rect
12″ Widespine outer      12 × 12            12.25 × 12.25       Rect
12″ Center label (MRP)   3.875 × 3.875      4.125 × 4.125       Circle + hole
12″ Center label (Viryl) 4.0 × 4.0          4.25 × 4.25         Circle + hole
12″ Inner sleeve         19.09 × 30.97      measured from press  Rect
10″ Jacket               10 × 10            10.25 × 10.25       Rect
10″ Center label         3.5 × 3.5          3.75 × 3.75         Circle + hole
7″ Jacket                7.0625 × 7.0625    7.3125 × 7.3125     Rect
7″ Center label          3.5 × 3.5          3.75 × 3.75         Circle + hole
CD (press-specific)      per press          per press           Rect
```

All bleed values: **0.125″ per side** (standard for all plants on file — MRP, PMP, Hellbender, Viryl, Generic). Safety margin: **0.125″ inside the cut line** (same as bleed depth — standard industry value; per-press certified value wins if set).

---

## Non-goals for Ruby (do not design these)

- **No dieline editing.** The artist never draws or moves guide lines. The block map displays guides read-only as overlays.
- **No Canva integration.** A future escape hatch (separate task) may add "Open in Canva" as a block action. Do not design it for this round — mention it at most as a greyed-out future tile.
- **No operator preflight redesign.** The existing prepress review dialog (`ArtworkCheckUpgraded.tsx`) used by operators and team members is unchanged. This is an additive artist-facing surface only.
- **No stitching UI.** The compositor runs server-side after the artist confirms. The artist sees "Sent to press" — no progress bar, no compositor controls.
- **No format picker, no multi-format upload.** Format is chosen once, at draft creation; the format tabs enforce one-format-at-a-time for free. A release with both vinyl and CD shows one set of blocks per format tab — never two simultaneous block maps, and never a second format question.

---

## Implementation notes (for the follow-on build task — not for Ruby)

These are for the engineer who builds from Ruby's mocks. Included here so context is not lost.

- The compositor (`server/printPdfs/compositor.ts`) accepts JPEG/PNG only — other formats must be converted or the route hard-blocks.
- Dimension check tolerance: ±0.05″ (from `validateArt` — `const tol = 0.05`).
- Guide geometry lives in `press_template_specs.measured_guides` (shape: `shared/templateGuides.ts MeasuredTemplateGuides`) and in the operator-entered `fold_x_inches` / `fold_y_inches` / `safety_inset_inches` columns; operator values win.
- Rollup logic is in `shared/uploadValidation.ts rollupStatus()`.
- Per-press PPI override is in `press_template_specs.min_ppi` (null = 300 PPI default).
- The block map is derived from the draft's format + spec source using `shared/vendorSpecs.ts` templates and the operator-entered `press_template_specs` catalog rows. In Draft: generic baseline geometry + strictest thresholds across the press pool. Converted: the assigned press's certified specs; geometry re-verifies at assignment/switch, thresholds never re-check.
- Press assignment precedence: referral origin locks the press → otherwise MRP default → super admin can (re)assign any time. Blind comparison is a future layer on top; structure nothing that prevents it. No press ever sees another press's terms, pricing, or deal shape.
