# Handoff: Artist Portal Restructure (full walk)

**Replace presentational code verbatim; wire data only.** `ArtistPortalRestructureFlow.tsx` is the source, not a reference — copy character-for-character, swap only the `MOCK_` consts. Standing law in `handoff/README-template.md` applies (delete-first, states checklist, ledger, pane-of-glass, questions-beat-inventions).

**Demo context:** Bill demos this to Hellbender Aug 17. Known dead-ends are DELIBERATE — the remaining flows get designed this week. Do not invent endings for them; ship them as quiet no-ops exactly as mocked.

## What this is
The full restructured artist portal, delivered as one walk file with a scene stepper. **The stepper and the exploration banner are mock-only chrome** — in Otis, the scenes are real destinations:

1. **Releases wall** — rail destination "Releases". 6-card grid: cover, derived per-format status line, year, channel glyph, balance-due overlay chip. Only CALIFORNIALAND opens (mock).
2–3. **Release view: Assets + inheritance** — the release shell: breadcrumb, then plain-TEXT tabs Dashboard · Details · Assets · Store · Payments (this five-tab bar is real product surface and replaces the old Dashboard/Overview/Package/Digital/Physical/Shopify/Payments tabs). Assets = Art/Audio lanes × Master / GoodTunes® Player / Vinyl format chips; vinyl art blocks link to the already-handed-off Artist Template Test page (`handoff/artist-template-test/`).
4. **Store** — channel picker, share link / Shopify connect, fulfillment toggle, email appearance, Publish + readiness checklist.
5. **Payments** — project rows + 50% hybrid milestone schedule; artists only ever pay GoodTunes®.
6. **Reports** — tab set with the two money ledgers (owed / earned), never netted.
7. **Settings** — Team + Connections (Shopify Connected · Manage; Payout account dimmed "Not set up"). Shopify rail item is EARNED — appears only once connected; inline connect stays on the Store tab.

## Files
- `ArtistPortalRestructureFlow.tsx` — self-contained (react + lucide + DS Button/Popover + 6 assets). THEMES light + dark, dark charcoal default.
- `assets/`: goodtunes-logo.png, shopify-logo.png, mrp-logo.svg, hellbender-icon.svg, niina-soleil.webp, californialand-cover.jpg (MOCK data/art only).

## MOCK_ consts (swap these, nothing else)
MOCK_USER, MOCK_RELEASE, MOCK_WALL_CARDS, MOCK_LP_BLOCKS, MOCK_MASTER_TRACKS, MOCK_DASH_FORMATS, MOCK_DASH_NEXT, MOCK_DASH_STATS, MOCK_DASH_ACTIVITY, MOCK_STORE, MOCK_PAYMENT_PROJECTS, MOCK_LEDGERS, MOCK_TEAM.
Note: the rhetorical "$2,135" inside the Reports "never netted" sentence is canon copy, not a dummy record — it stays; the two real totals beside it read from MOCK_LEDGERS.

## Wired vs decorative
Wired (state/nav): stepper (mock chrome); release five-tab bar; Art/Audio lane chips; Master/Player/Vinyl format chips; fulfillment toggle; channel radios; milestone expand/collapse; Reports tab switch; appearance toggle (mock chrome — Otis theming applies); CALIFORNIALAND card → release; breadcrumb Releases → wall; vinyl art block → Artist Template Test.

Decorative / DELIBERATE dead-ends (ship as no-ops):
- CanonPill CTAs: Pay balance, Pay GoodTunes®, Connect Shopify, Publish to fans.
- Rail nav links (stepper does the scene switching in the mock; in Otis the rail is real — rails stay Otis's).
- Search / ⌘K / Feedback / Notifications / UserMenu items.
- Reports Audience/Acquisition/Buyers tabs → empty-state with "Show the two ledgers" bounce-back.
- Off-scene release tabs show "The X tab lives here" placeholders — WALK ARTIFACT ONLY; in Otis every tab renders its real content (Dashboard/Details/Assets content is all in this file).
- Settings Invite / Manage / Set up; Add format; Add bonus content; Master with Wave; Templates; per-track Download.

## States to enumerate (acceptance bar)
Each scene above, both themes (dark default + light), at 1440 / 1024 / 768. Full-page screenshot diff vs this file's render; any difference other than data values is a failure.

## Canon
Word + icon statuses, never color alone. Real ® characters. "Estimate", never "quote". ONE filled blue max per screen (the release Dashboard's "Pay balance" is that screen's one). Thin sweep progress bars. Commas in dollar amounts.
