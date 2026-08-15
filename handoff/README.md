# Handoff notes

## Templates rework — Aug 15, 2026 (gogoods-approved)

Handoff law applies (see README-template.md): delete-first, verbatim replacement, states checklist below is the acceptance bar, questions beat inventions.

Files in this round (replace whole-file, character-for-character; wire data only):
- `handoff/PressTemplatesIndex.tsx`
- `handoff/PressTemplateLiveTest.tsx`
- `handoff/assets/label-template-r091125.pdf` (the index imports it via `?url` — demo asset for the certified tile; in production the tile opens the slot's live revision PDF)

### What changed (both files)
1. **No template detail popup.** Clicking any template tile opens the live template view directly — the same screen as before it was saved. Replace, re-test, and history all live there. The old Replace/Open-live/Close dialog is deleted.
2. **Per-tile ••• overflow** (hover, top-right): holds "Archive template…" with an are-you-sure confirm (X close, top-right, per canon). Archived tiles get "Restore template" instead. The ••• holds only shelf-level actions; everything with a view lives on the next screen.
3. **All / Current / Archived pills** beside the size pills (hairline divider between groups). Current is default. Archive is history, never deletion. Dashed "needed" slots hide in the Archived view.
4. **Standard slots can be archived too** ("Archived — not offered") — same per-press dismissal used for GoodTunes standards elsewhere. Restorable the same way.
5. **"Create New"** — quiet ghost pill at the far right of the size pills (escape hatch for unlisted templates). The old bright header "Upload a template" button is deleted. The "Vinyl · Templates" caption is deleted; the Vinyl/CD/Cassette/Stickers segmented control sits in its place.
6. **Hover language:** any tile that opens gets a solid blue (#319ED8) border on hover — filled templates and dashed slots alike. The dashed slots' "Click to add" overlay button is deleted; clicking just opens.
7. **Live test arrival state:** arriving from a tile or upload sheet shows only the thin sweep bar with "Opening template" — never an upload card (nothing is being uploaded). The upload step renders only when the page is reached truly empty-handed.
8. **Header actions are now Cancel / Test / Save in source** (Cancel = quiet text, leaves without saving; Test = pill; Save = the only filled blue, the only action that persists). This blesses the change you already made — the labels are no longer "Accept & …" anywhere.

### Save model (rule, per gogoods Aug 15)
Nothing saves automatically — Save is the one deliberate act that creates a revision, because a template is the ruler client files are measured against. Crash-safety comes from drafts, not auto-save: keep an automatic browser-local draft of any in-progress upload/test session and offer "Resume where you left off" on return after a crash or closed tab. A draft never becomes a revision by itself.

### Verdict rule (blessing your Aug 15 fix)
A test verdict belongs to the file it actually tested. A tile shows "Failed" only if the failing check ran against the currently-live revision; replacing the template clears the chip and the old result stays in revision history.

### States checklist (screenshot each, both themes, 1440px)
PressTemplatesIndex: Current (default) · All · Archived-empty · Archived with an archived template · Archived with an archived slot ("Archived — not offered") · filled-tile hover (blue ring) · dashed-slot hover (solid blue ring, no button) · ••• menu open (Archive / Restore variants) · archive confirm dialog · upload sheet from a slot (For: <slot>) · upload sheet from Create New (name + component fields) · fresh-save hairline pulse.
PressTemplateLiveTest: "Opening template" arrival sweep · empty-handed redirect to Templates · template view header (Cancel text / Test pill / Save filled blue) · test underway ("Save result & test another") · save-confirm sheet · read-failure fallback to upload step.

### Addendum — Aug 15 (hover-reveal fine print)
Template tiles now rest with just the preview, title, and status chip. The fine print — component · variant, code · rev, the superseded/history line, and the saved-tile mm/layers line — carries class `gt-detail` and rests at opacity 0, revealed on tile hover (and :focus-visible). Space stays reserved so the grid never jumps. Same file, replace verbatim: `handoff/PressTemplatesIndex.tsx`.
State added to the checklist: filled tile at rest (fine print hidden) vs hover (fine print + blue ring).

### Addendum 2 — Aug 15 (dialog canon: action order, X close, one-line subtext)
Two rules ratified by gogoods, now in `handoff/style-guide/apple-canon.md` (updated this commit):
1. **Dialog action order:** in any horizontal dialog/popover/footer action row, the confirming action is ALWAYS rightmost; Cancel sits immediately to its left as a quiet borderless text button (subink, hover wash) — never a bordered pill, never right of the primary. Sheets also carry an X close in the top-right gray circle. Vertically stacked alerts keep the primary on top — that stays correct.
2. **Dialog subtext is one short line;** longer explanation lives behind a small quiet ⓘ (faint, cursor-help, tooltip) — never a paragraph in the sheet.

`handoff/PressTemplatesIndex.tsx` updated in this commit (replace verbatim as before): upload sheet gained the X close, its subtext is now one line + ⓘ, and both its footer and the archive-confirm footer are reordered to Cancel-text-left / primary-right. Sweep your side for any dialog that violates rule 1 — our other mocks were audited and already comply.
