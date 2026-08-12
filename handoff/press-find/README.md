# Find a press — handoff (2026-08-12)

One change, two parts, super admin only:

1. **Remove "Find a press" from the left rail.** It is not a destination.
   The rail's Partners group ends at its current children with no
   "Find a press" item.
2. **It becomes an advanced-search modal on the Presses page.** A quiet
   "Advanced" outline button sits next to the quick "Search presses…" box.
   Clicking it opens the spec-first modal over a dimmed page: Format,
   Quantity, Color (optional), Preferred location (optional), Max
   turnaround (optional) → "Find presses" (the ONE filled blue pill on
   screen) → ranked results with fit notes, turnaround, price, and
   "Invite to bid".

The Presses page itself is otherwise **unchanged** — cards grid,
All / Vinyl / GoodDeeds filters, quiet outline "Add Press". Do not
redesign it.

## File

- `SuperAdminPressesFind.tsx` — self-contained, copy verbatim and wire
  data. Shown with the modal open (`findOpen` starts true for the mock;
  real app starts closed).

## Rules that ship with this file

- **Both themes.** `FIND_DARK` (super-admin charcoal canon, default) and
  `FIND_LIGHT` ship in the file. The floating "View light / View dark"
  pill is MOCK-ONLY chrome — replace with the app's real theme source.
- Ranking is by fit (price, color, turnaround, location); "Best match"
  is dot + label, never color alone.
- All dummy data in top-level `MOCK_` consts.
- Logo asset in `./assets/` (dark logo; white via CSS invert in dark theme).

## Acceptance

Rail has no "Find a press" anywhere; modal opens from Advanced on
Presses; both themes at 1440 / 1024 / 768.
