# Handoff — Help & feedback dialog (apple-canon redesign)

Replaces the current Help & feedback modal (Bug/Feature tabs, "My requests" link, hidden auto-screenshot). Per the handoff law (`handoff/README-template.md`): **delete-first** — the existing dialog UI comes out, this goes in character-for-character; wire data only.

## Files
- `HelpFeedbackDialog.tsx` — one self-contained screen. All dummy data in `MOCK_REQUESTS`. The page shell (`GhostCanvas`, scrim wrapper, floating "View light/dark" pill) is MOCK-ONLY chrome for preview — the shipped unit is the `Dialog` component (plus its preview sheet) rendered over the live app.

## What changed vs. the live dialog
1. Apple-canon dress: two-tone heading, rounded-full segmented pills (never squared tabs), gray-circle X, quiet-text Cancel, confirm that EARNS its blue (outline until title is non-empty).
2. "My requests" moved out of the header corner into a segmented control (New report / My requests) on its own row — nothing crowds the X.
3. The auto-screenshot is SHOWN: a visible attachment card with a thumbnail, "Attached automatically when you send", quiet Remove / Include toggle.
4. Click the card → preview sheet: the full screenshot with drag-to-highlight markup (numbered blue pins, % coords), click-to-remove, Clear all.

## Real-data swaps (the ONLY changes allowed)
- `PageThumb` and `BigPage` are drawn stand-ins for the captured screenshot. In the app, replace their interiors 1:1 with the real capture (`<img>` of the screenshot). Geometry, borders, radii, and the %-based highlight overlay stay exactly as written.
- `MOCK_REQUESTS` → the user's real submitted reports.
- Send posts `{ kind, title, details, screenshot?, highlights: [{x,y,w,h} as % of the screenshot] }`.

## States checklist (acceptance bar — screenshot diff each, BOTH themes, 1440/1024/768)
1. New report, Bug kind, empty form — Send is a quiet outline pill.
2. Title typed — Send fills blue.
3. Feature request kind — placeholders swap.
4. Screenshot attached (default) — thumbnail card + Remove.
5. Screenshot removed — dashed card, "Include screenshot" in blue.
6. Preview sheet, no highlights — Done outline, helper line "No highlights yet…".
7. Preview sheet, dragging — live draft rectangle.
8. Preview sheet, ≥1 highlight — numbered pins, "Clear all", Done blue.
9. Back on form — "✓ N highlights" chip on the card.
10. My requests — rows with word+icon statuses (✓ Received green, clock In review). Empty state: keep the card grammar, quiet "You haven't sent anything yet." line (enumerated here; not in mock — flag if you want it drawn).

## Must work (everything else is decorative chrome)
- New report / My requests segmented control switches panels.
- Bug / Feature request segmented control swaps placeholder copy.
- Title input gates the Send button (blue only when non-empty).
- Details textarea captures text.
- Clicking the screenshot card opens the preview sheet.
- Remove / Include screenshot toggles the attachment; Remove also clears highlights.
- Preview sheet: drag draws a highlight; clicking an existing highlight removes it; Clear all wipes them; Done and X close the sheet, keeping highlights.
- Highlight % coords travel with the report payload.
- "Send to GoodTunes®" submits report + screenshot + highlights, then closes.
- My requests rows render the user's real reports with live statuses.
- Both X buttons close their sheets.

Decorative only: GhostCanvas backdrop, outer scrim wrapper, floating View light/dark pill (never ships), MOCK_REQUESTS values.
