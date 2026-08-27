# Brief for Ruby — "artwork lists an outdated track order" warnings (Bill, Aug 26 2026 — built, live behind the completed-art check)

**Needs, not solutions** — the design is yours. Everything below is wired and
working today with plain components (functional buttons, default row styling),
so your look & feel can land whenever ready. House rules apply: sentence case,
statuses word + icon never color alone, one filled accent pill per screen,
warn tone never alarm tone (nothing here ever blocks anything).

## The story (one paragraph)
Artists sometimes reorder tracks (or move songs between sides) **after** the
finished art — center labels, jackets, inner sleeves — was already uploaded.
The printed tracklist then lists the old order; in one real case a track was
missing from the label entirely. The system now notices two ways: (1) a cheap
timestamp check — "the track order changed after this file was uploaded" —
and (2) an OCR read of the label text that matches the printed titles against
the album's current per-side running order. Both are **honest nudges, never
gates**: the operator can acknowledge after eyeballing the art, re-uploading
the file clears the warning, and a further reorder re-flags it.

## Hard rules (these bound the design)
- **Warn-only, forever.** These rows must never read as blockers. The send
  gate is untouched — a warned component is still sendable. Advisory ≠ error.
- **OCR is a heuristic.** Copy always hedges ("may list", "verify stylized
  type visually"). Stylized/hand-lettered type can defeat OCR; a "missing"
  title might just be unreadable. Never present an OCR miss as fact.
- **Acknowledge is operator-only** (press/artist accounts see the row but not
  the button — permission-reduced, not hidden weirdness).
- **Self-healing lifecycle.** Re-upload clears; acknowledge converts the warn
  into a quiet "acknowledged" advisory (with who + when); ANOTHER reorder
  re-warns even after an acknowledge. The design should make that lifecycle
  legible.
- **Albums that never reorder see nothing.** No new chrome on the happy path.

## Where it lives
The per-component **completed-art check panel** (admin album → Physical → art
check; the press portal renders the same grid). Component:
`client/src/components/admin/CompletedTemplatePanel.tsx`. Rows are computed at
view time — nothing here is persisted except the acknowledgment.

## States & exact current copy (the acceptance list)

### 1. Never reordered (or file re-uploaded after the reorder)
No row at all. Nothing new anywhere.

### 2. Stale-order WARN (order changed after this file's upload)
Row label: **Track order since upload** — status warn.
> The album's vinyl track order changed after this file was uploaded — the
> printed tracklist may list the old order. Re-check the artwork against the
> current side order (re-uploading clears this).

Legacy variant (file predates upload tracking, so the upload time is
unknown — honesty wins):
> The album's vinyl track order changed, and this file's upload predates
> order tracking — the printed tracklist may list the old order. Re-check the
> artwork against the current side order (re-uploading clears this).

Below the row, operators get an amber action (today: filled amber pill,
HelpCircle icon):
> Acknowledge — artwork checked against current track order

### 3. Acknowledged (pass + advisory tier)
Same row key flips to a quiet advisory:
> The album's track order changed after this file was uploaded — acknowledged
> as still correct by {name} on {Mmm D, YYYY}. A further reorder re-flags
> this.

### 4. OCR all-clear (pass + advisory, center labels only)
Row label: **Tracklist (OCR)**.
> All {N} track titles were found in the label text on the expected side in
> the expected running order (OCR read — verify stylized type visually).

### 5. OCR — missing title(s) (warn)
Row label: **Tracklist titles (OCR)**.
> Couldn't find "{Title}", "{Title}" in the label text — a track may be
> missing from the printed tracklist, or the type wasn't OCR-readable. Verify
> against the current side order.

### 6. OCR — title on the wrong side (warn)
Row label: **Tracklist sides (OCR)**.
> "{Title}" (expected on Side A) appears on a different label side than the
> album's current side assignments — the artwork may list an outdated track
> order.

### 7. OCR — titles out of order (warn)
Row label: **Tracklist order (OCR)**.
> "{Title}" (Side B) appears in a different order than the album's current
> running order — the artwork may list an outdated track order.

### 8. OCR unreadable / no sides assigned
Silent — no row. We never scold about what we can't read.

## What's yours to shape
- The warn vs. acknowledged vs. advisory row presentation (today they reuse
  the panel's stock warn/pass rows — the lifecycle deserves better
  storytelling than a status swap).
- The acknowledge affordance (today an amber pill among the panel's other
  buttons — the sky-blue "unverified result" ack and the violet override
  live in the same stack; the three shouldn't melt together).
- Whether the OCR advisory rows group under one "Printed tracklist" heading
  instead of three sibling rows.
- Copy polish welcome — the strings above are canon until you improve them;
  keep the hedged, non-blaming tone.

## Pointers (for reference, not homework)
- Row logic: `shared/staleArtOrder.ts` (timestamp check + ack lifecycle),
  `server/validators/trackOrderOcr.ts` (per-side OCR matching).
- Check keys: `art.stale_track_order`, `art.tracklist_missing`,
  `art.tracklist_side`, `art.tracklist_order`, `art.tracklist_ocr`.
- Hand back the usual way: a `handoff/<feature>/` folder per
  `handoff/README-template.md` — delete-first rule applies to this panel's
  rows/buttons, the row *logic* and endpoints stay.
