---
name: Preflight side-break tracklist source
description: Where the masters-preflight Tracklist / Side-length checks get their side-break data from — and why there is no separate editor for it.
---

The masters-preflight checks `audio.tracklist` ("Tracklist") and `audio.side_length`
("Side length") in `server/validators/preflight.ts` need a per-side tracklist with
per-track run times (`SideBreakInput[] = { side, trackTimesSeconds[] }`).

**That data is NOT a separate field and has no separate editor.** It is derived from
the per-song vinyl assignments (`songs.vinylSide` + `songs.vinylOrder`) that the
operator sets in the **vinyl-order panel** (`VinylOrderPanel`, the Side A / Side B
drag list under the Physical tab). The preflight route assembles `sideBreaks` from
those columns (group by `vinylSide`, sort each side by `vinylOrder`, use
`song.duration` for times) and passes it into `validateAudioFromSpecs`.

**Why:** Bill flagged that preflight reported "no side-break tracklist supplied" /
"can't check the per-side limit" even though he had already laid out the sides in the
vinyl panel. The route was building per-track validations but never assembling/passing
`sideBreaks`, so Tracklist always failed and Side length always warned. Earlier in the
same session I almost built a brand-new "side-break editor" — that would have been a
redundant duplicate of the vinyl-order panel. Don't.

**How to apply:** If preflight Tracklist/Side-length regress to false-negatives, check
that the route still assembles `sideBreaks` from the vinyl assignments. Tracks an
operator deliberately leaves OFF the vinyl have null `vinylSide` and are correctly
excluded from `sideBreaks` (don't "require all songs assigned" — that false-fails
intentional exclusions). A track with no master already emits its own fail row, so a
null duration can't sneak a clean album rollup past the gate.
