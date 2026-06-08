---
name: Nightbirde "Hope" canonical album + storefront-constant trap
description: Which prod "Hope" row is the real go-live release, and the empty-duplicate trap that bit STOREFRONT_LAUNCH_ALBUM_ID.
---

# Canonical Nightbirde "Hope" release (prod-only)

Prod has MORE THAN ONE Nightbirde "Hope" row. Only one is the real, purchasable
go-live release:

- **Canonical:** 7" "Hope", id `b250a5a5-98cc-4673-9903-ab39e5278d8c`,
  `share_slug = hope`, `physical_format = seven_inch`, 12 songs, the 7" SKU,
  signed-cert + Gift of Hope add-ons, and the Nightbirde Foundation donation split.
  Sunrise = `good_tunes_release_date` (was 2026-06-08). This is also what the server
  `CAMPAIGN_PREVIEWS` mapping for `nightbirde/hope` resolves to.
- **Empty decoy:** `single_lp` "Hope", id `54d46505-2d23-4066-88f3-0337bb2e8b79`,
  0 songs / no SKU / no add-ons / no slug. Never go live on it, never configure it.

**Why this matters:** `STOREFRONT_LAUNCH_ALBUM_ID` (shared/schema.ts) — the album the
store.goodtunes.music launch storefront drops fans into — was set to the EMPTY decoy
`54d46505`, so the storefront would have rendered a blank, unpurchasable page at
launch. Fixed to point at the canonical `b250a5a5`.

**How to apply:** any launch/storefront/share wiring that hardcodes a "Hope" album id
must use `b250a5a5` and match the slug `hope`. When picking a Nightbirde row in prod,
verify it has songs + a SKU before trusting it — title alone is ambiguous across the
duplicates ("Hope", "Love", "Brave", "Test" prepping rows all exist). Prod is
read-only from the agent; the duplicate cleanup itself is an operator action.
