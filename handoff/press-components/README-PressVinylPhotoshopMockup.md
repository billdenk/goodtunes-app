# Handoff — PressVinylPhotoshopMockup (Press Vinyl Component: Photoshop Vinyl Mockup)

Per the handoff law in `handoff/README-template.md`: **delete-first, replace presentational code verbatim; wire data only.** This file is the source, not a reference. Acceptance = full-page screenshot diff at 1440px (also 1024/768), both themes, per enumerated state.

## What this screen is
The press-side vinyl component page rebuilt as a live "Photoshop-style" vinyl mockup builder. The press manages its generator styles (Standard, Black, Splatter, Split Splatter, Marble, Blended, Metallic Blend), each rendered as a layered SVG disc preview, and edits them in the rebuild/creator sheet.

## File & assets
- `PressVinylPhotoshopMockup.tsx` — one self-contained screen. Only `react`, `lucide-react`, `@radix-ui/react-popover`, and `./assets/*` imports. The inline `Button`/`PopoverContent` primitives at the top are stand-ins: swap them for the shared design-system components — props and classes match.
- Assets: `mrp-logo.png`, `mrp-logo.svg`, `goodtunes-logo.png`, `brandon-seavers.png`, `gt-preview-artwork-circle.png`, and the three real MRP disc photos (`mrp-disc-hb01-metallic-gold.png`, `mrp-disc-md25-america.png`, `mrp-disc-mb16-sangria.png`) used as mock uploads.
- All dummy data lives in `MOCK_`-prefixed consts at the top. Press identity is data — every press sees its own name/logo, never Memphis's hardcoded.

## States checklist (screenshot each, both themes, 1440px)
1. Gallery default — all style tiles rendered.
2. Rebuild sheet open on an existing style (colors populated).
3. Rebuild sheet fresh/untouched (no valid hex yet).
4. Photo uploaded → suggestion applied (caption "Suggested from their photo — a first guess. Change anything." visible while the suggested style is still selected).
5. Suggestion overridden (caption gone after style change).
6. Splatter style with 3 passes; Split Splatter with 2; Metallic Blend gradient.
7. Edit/Archive popover open on a style tile.
8. Color picker open, including the eyedropper button.
9. Hidden/archived style state (word + icon, never color alone).

## Must work (everything else is decorative chrome)
- **Style tiles** — select a style and open/update the disc preview.
- **Rebuild sheet photo upload** — runs the client-side palette extraction (`extractDiscPalette`, 96px canvas sample of the vinyl ring only) and applies `suggestDiscStyle` ONCE into an untouched sheet only, never over a locked/edited one; sets style, colors, splatter count, gradient stops, and closes the gallery.
- **Suggestion caption** — shows only while the suggested style remains selected.
- **Color picker** — full picker, valid-hex gating, and the **eyedropper button** (EyeDropper API). The eyedropper is a TEMPORARY drawer control (Andrew) — keep it functional but expect a future removal.
- **Splatter pass add/remove** (up to 3) and **gradient stops** (up to 5).
- **Per-style ••• popover** — Edit opens the creator on the default color; Archive hides the style. Two rows only.
- **Edit sheet Save/Cancel** — Save gated on valid input; outside clicks must NOT dismiss the sheet (it is a form, not a menu); Esc/Cancel/Save close it.
- **Light/dark toggle** — full THEMES map, both themes ship (ALWAYS dark and light).

## Notes
- Statuses/labels are word + icon, never color alone (accessibility rule, binding).
- "Estimate", never the q-word, anywhere copy is touched.
- Questions beat inventions: any conflict with live data models gets flagged to Bill, not silently adapted.
