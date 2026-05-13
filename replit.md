# GoodTunes® Player

Mobile-first, Apple-Music-inspired web player.

## Stack
- React + TypeScript + Vite (frontend)
- Express + tsx (backend)
- TanStack Query v5 (`staleTime: Infinity`)
- Wouter (routing)
- Tailwind + shadcn/ui
- In-memory `MemStore` (temporary; will move to a real DB)
- Bearer token auth (temporary)

## Brand
- Colors: `#00062B` (bg), `#319ED8` (blue), `#7F10A7` (purple), `#4AFFCA` (mint), `#FF5470` (heart pink)
- Mobile-first single column, max width ~440px
- Apple Music-style large headers, 44×44 minimum touch targets
- Songs use **heart** icon (`#FF5470`); artists use **star** icon

## User preferences

### Playlist covers
- Always show the actual artwork mosaic (gradient fallback only when truly empty).
- Adapt the layout to the count of unique album artworks:
  - 1 → single full image
  - 2 → split in half, side-by-side
  - 3 → one large left, two stacked right (Spotify-style)
  - 4+ → 2×2 grid
- Never repeat the same album in the cover.
- Pick the **most-recent** unique artworks first so the cover shifts as new songs are added.
- Custom uploaded covers + lock-in: deferred until friends/public sharing exists (then add reporting/moderation).

### Favorites
- "Favorites" is a virtual playlist combining favorited songs + songs by favorited artists (deduped).
- Order: most-recently favorited first.
- Client-only via localStorage (`gt:fav:songs`, `gt:fav:artists`) with `gt:favorites-changed` event.

### Downloads & song row
- Per-song download is **in-app only** (Apple/Spotify model) — no Transfer Rights warning, no popups. Tap the cloud-arrow icon → silent toggle, persisted in localStorage (`gt:downloaded-songs:<albumId>`).
- The "download to your device" choice (which would burn Transfer Rights) is deferred to the desktop version. Album-level "Download Music Files" + the Transfer Rights warning sheet have been removed for now.
- Song row layout: track # · title · **download cloud-arrow** · ⋯ menu. Heart moved into the ⋯ sheet.
- Song ⋯ sheet (Apple-trimmed): Favorite + Share (top two-up), then Add to Playlist · Play Next · Play Last · View Credits. Intentionally omitted: Pin Song, Create Station, Suggest Less, Rate Song.

### SuperCredits™ (planned — currently a placeholder toast)
"View Credits" is a placeholder for now. The real feature is **SuperCredits™** — a richer credits experience than Apple's writer-only list. Each track shows:

1. **Writers** (composer / lyricist / producer) — like Apple, but always present.
2. **Performers**, one per row, each with:
   - Photo (or initial in a colored circle if no photo).
   - Name + role on this track (e.g. "Joe Hall — Guitar").
   - The specific **instrument used on this track** (e.g. "1973 Martin D-28", "1967 Gretsch 6071 'Monkees' Bass").
3. Tapping a performer opens their detail sheet listing **every track on this album** they played on, with the instrument used per track and any tuning/setup notes (e.g. "DADGAD", "dropped D", capo 3).
4. Tapping an **instrument** opens an instrument sheet with:
   - A photo of that specific instrument.
   - Short note from the artist (why they chose it, how it was tuned/mic'd, etc.).
   - A **"Discover more / Buy"** link out to the maker or shop (Gibson, Martin, Fender, Gretsch, Norman's Rare Guitars, etc.).

#### Micro-Sponsorships (monetization layer for SuperCredits™)
Outbound instrument links are affiliate links. Revenue split: **artist gets the lion's share, GoodTunes takes a small cut for the connection.** This makes credits a revenue stream for the musician, not just metadata — a real differentiator vs. Apple/Spotify. Treat affiliate URL + revenue share as part of the instrument record, not a per-link afterthought.

#### Performer sheet (song-focused)
When you tap a performer (or a writer who's also in our roster) inside SuperCredits™, the sheet that opens is **focused on the current song**, not the whole album:
1. **Played on this song** — the instrument(s) that performer used on THIS track, each tappable into the InstrumentSheet.
2. **Also on {album}** — other tracks on this album where they played, with light-grey track numbers matching the album track-list style.
3. **View artist profile** — currently a placeholder toast. The full flow is described in "Artist profile + streaming-service handoff" below.

#### Artist profile + streaming-service handoff
The "View artist profile" link on a performer sheet is the seed of a much bigger flow. It belongs to GoodTunes' core sales pitch (see "Sell first. Then stream." strategy deck): **fans buy on GoodTunes pre-launch and listen here; once the album reaches Spotify / Apple Music / Pandora / Deezer / etc., we hand them off**.

Planned UX:
- **One-time service picker** — first time after we've launched to streaming, the player surfaces a pop-up: *"This album is now on streaming. Pick the service you'd like us to send you to from now on."* The user taps a service icon. We store this as their preferred streaming service.
- **From then on**, when they tap "View artist profile" (or any cross-album link from a performer sheet), we deep-link straight into their preferred service. They can change the preference any time in user settings.
- **Notifications** — once a fan has chosen a service, we can notify them when an artist they care about drops something new on that service. The performer sheet is the natural place to subscribe, because they're already showing intent to follow this person.
- **Data value** — preferred-service selections are first-party data we can report back to artists (who's listening where).

This is post-launch work. For now the link is a toast placeholder, but the row is intentionally there in the design so demos can point at it.

#### Potential data source: muso.ai
[muso.ai](https://developer.muso.ai/) has a developer API for music credits — writers, performers, instruments, sessions. They already power credits surfaces for some major streaming services. Worth evaluating when we move beyond hand-curated seed data: pull a baseline of credits from muso.ai, then let the artist override/enrich (especially the per-instrument note + tuning + vendor link, which muso.ai won't have). Auth is API-key based; check pricing tiers before committing.

#### Data shape implications (when we build it)
- `track.credits.writers: { name, role }[]`
- `track.credits.performers: { personId, role, instrumentId, tuningNotes? }[]`
- `people: { id, name, photoUrl?, bio? }`
- `instruments: { id, name (e.g. "1967 Gretsch 6071 'Monkees' Bass Walnut"), photoUrl, artistNote?, vendor: { name, logoUrl, affiliateUrl } }`
- Performer ↔ track is many-to-many (same person plays multiple tracks, often on different instruments).

## Auth plan (when moving off in-memory store)

Support email/password, **Sign in with Apple**, and **Sign in with Google**.

### What providers give us

| Field            | Apple                              | Google           |
|------------------|------------------------------------|------------------|
| Stable `sub` ID  | always                             | always           |
| Email            | real or `@privaterelay.appleid.com`| verified         |
| Full name        | **first auth only**, if shared     | usually          |
| Profile photo    | no                                 | usually          |
| Username/handle  | never                              | never            |

### First-login onboarding (must run immediately after first auth)

Pre-fill anything the provider gave us; ask for whatever's missing:

1. **Email** — ask only if Apple user declined to share. Mark relay addresses as private/forward-only.
2. **Full name** — required for billing/legal. Capture on Apple's first callback or it's gone forever.
3. **Username** — always ask. Public `@handle` for sharing. Lowercase, unique, validated.
4. **Display name** — pre-fill from full name; always editable. Shown on profile/playlists.

### Data model implications

- `users` table keys on internal id; store `authProvider` + `providerUserId` (the `sub`).
- `email`, `fullName`, `photoUrl` nullable.
- `username` unique, required.
- `displayName` required (defaults from fullName or username).
- Account linking later: match on verified email when both providers verified it; otherwise keep separate and let user merge manually.
- Never email a relay address expecting a reply — forward-only and revocable.
