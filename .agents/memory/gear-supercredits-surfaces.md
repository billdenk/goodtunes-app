---
name: Gear / SuperCredits fan surfaces
description: Where the fan-facing gear page + vendor profile actually live, and the link semantics (vendor vs gear vs brand-domain).
---

# Gear / SuperCredits fan surfaces

The gear page and vendor profile a fan sees from a song's SuperCredits are **sheets inside `client/src/pages/AlbumDetail.tsx`** — `InstrumentSheet` (gear) and `VendorSheet` (vendor profile) — NOT the standalone `/instrument/:id` route (`InstrumentDetail.tsx`). When a request shows screenshots of "the gear page" reached from playing an album, edit the sheets, not the route.

## Link semantics (the two-link model)
- **Vendor link** — InstrumentSheet "Where to buy" row: logo button *and* name button both call `onOpenVendor(v)` → opens `VendorSheet` in-app.
- **Direct-to-gear link** — trailing `IconButton` → `onOpenInAppBrowser({ url: v.affiliateUrl })`. `instrument_vendors.affiliate_url` is the instrument's own product page (e.g. `prsguitars.com/electrics/model/silver_sky_rosewood_2024`), never the brand homepage.
- **Brand domain** — VendorSheet globe / "Web" link uses `vendor.homeUrl ?? aboutUrl ?? affiliateUrl` and `vendor.domain` first. Globe = brand (prsguitars.com); anything featuring a specific instrument deep-links to that gear's URL instead.

**Why:** the distinction (vendor profile vs gear product vs brand domain) is the whole point of SuperCredits gear; mixing them (e.g. globe pointing at a gear page, or the right link pointing at the homepage) is the recurring bug.

## Chat is hidden on these surfaces
The vendor chat-bubbles were the only entry points to start a chat (Chat tab already off the bottom nav). They've been removed from InstrumentSheet rows + VendorSheet (top bar + instruments tab). The chat store/route still exist; restore the bubbles to bring chat back. See `docs/credits-and-chat.md`.

## Chrome
Both sheets use the 44px `IconButton` primitive (glass variant, circular bg) for back/share/bookmark/globe/direct-gear — no ad-hoc sub-44px buttons (design-lint flags `rounded-full` < `w-11` on fan surfaces).

## Gear photo gallery (`instruments.photo_urls`, extra shots beyond the hero)
The hero stays on `photoUrl`; extra listing photos live in `photo_urls text[]`. The gallery STRIP renders in **three parallel surfaces** — mirror any display change across all: the `InstrumentSheet` in `AlbumDetail.tsx`, the standalone `InstrumentDetail.tsx` route, and admin `AdminInstrument.tsx` PhotoPanel (where operators can "Make hero" / remove). The Add-gear scraper (`AdminInstruments.tsx`) returns `sourceImages: string[]` (primary first) from all 3 scrape handlers; the picker defaults every extra ON; create rehosts each picked `galleryImageUrls` to Object Storage (drops any === primary), PUT stores `photoUrls` verbatim (no rehost). `getInstrumentById`/credits return the full row so `photoUrls` flows automatically.
**Why:** the same "parallel fan surfaces drift" trap as AlbumCard/SyncedLyrics — a gallery added to one surface but not the others silently regresses the others.
