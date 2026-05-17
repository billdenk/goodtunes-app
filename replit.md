# GoodTunes® Player

Mobile-first, Apple-Music-inspired web player.

> Long-form roadmap, integration plans, and future-phase deep-dives live in **[docs/roadmap.md](./docs/roadmap.md)** — read that file when working on anything labelled "planned" or "deferred" below.

## Stack
- React + TypeScript + Vite (frontend)
- Express + tsx (backend)
- Drizzle ORM + Postgres (`DATABASE_URL`)
- TanStack Query v5 (`staleTime: Infinity`)
- Wouter (routing)
- Tailwind + shadcn/ui
- Bearer-token admin auth (temporary; SSO plan in roadmap)
- Replit Object Storage for image uploads (album art, person photos, vendor logos/covers, scraped instrument images). Files live in `${PRIVATE_OBJECT_DIR}/uploads/<uuid>.<ext>` and are served via `GET /objects/uploads/<id>` (public ACL). Survives redeploys — the old local `uploads/` disk was ephemeral on Autoscale and wiped on each republish.

## Brand
- Colors: `#00062B` (bg), `#319ED8` (blue), `#7F10A7` (purple), `#4AFFCA` (mint), `#FF5470` (heart pink)
- Mobile-first single column, max width ~440px
- Apple-Music-style large headers, 44×44 minimum touch targets
- Songs use **heart** icon (`#FF5470`); artists use **star** icon

## User preferences

### Design system (app-wide — admin + player)
**One design system covers the entire product** — the mobile player, the admin/CMS, and every mockup. Identical concepts must look identical everywhere. No one-off colors, button sizes, hover treatments, or icon sizes outside the primitives.

- **Primitives home**: `client/src/components/ui/` is the canonical home. Mockups in `artifacts/mockup-sandbox/` prove a pattern first in a local `_shared.tsx`, then the primitive graduates into `client/src/components/ui/` when the pattern ships to real code.
- **Default to Apple HIG** whenever a size/weight/spacing/radius/font isn't explicitly specified for a surface:
  - Type: SF / system font stack. Body 17pt, secondary 15pt, footnote 13pt, caption 11pt. Headings use Apple's title scale (Title 1 / 2 / 3).
  - Touch targets: **44×44pt minimum** on mobile surfaces (already enforced in this README).
  - Corner radii, padding rhythm, hover/pressed states: match Apple Music / Apple-iOS conventions over inventing our own.
- **Icons**: a single icon set per family (Lucide for UI chrome; `react-icons/si` for company logos). One play triangle, one trash can, one chevron, one pencil — used in every surface that needs that concept.
  - **Lyrics glyph**: GoodTunes-canonical SVG (speech bubble + two filled quote marks) lives at `client/src/components/ui/LyricsIcon.tsx`. Used on the mobile player's Now Playing controls **and** the admin Tracks-tab BottomDock. Sandbox mockups inline the same path data since they can't reach `@/components` — keep both in sync if it ever changes. No `Mic2`, no third-party speech-bubble for this concept.
- **Color**: only the five brand colors listed above + Tailwind slate for neutrals. New colors require a discussion, not a one-off.
- **Destructive actions always confirm.** Any trash / delete / "remove forever" button must pop a confirmation sheet naming the thing being destroyed (e.g. "Delete *Storms*? This removes the master, snippet, lyrics, and credits.") with a rose-tinted primary action. Hide / Park / Archive are reversible and do **not** need a confirm — they just toast "Hidden — undo." Destructive buttons must also keep visual breathing room (gap + hairline divider) from any adjacent non-destructive control so a thumb can't slide between them.

### Spelling
- Use **US English** for all user-facing strings (e.g. "color", not "colour"; "favorite", not "favourite"). Code identifiers can stay as they are; only the visible UI copy needs to read American.

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
- The "download to your device" choice (which would burn Transfer Rights) is deferred to the desktop version. Album-level "Download Music Files" + Transfer Rights warning sheet have been removed for now.
- Song row layout: track # · title · **download cloud-arrow** · ⋯ menu. Heart moved into the ⋯ sheet.
- Song ⋯ sheet (Apple-trimmed): Favorite + Share (top two-up), then Add to Playlist · Play Next · Play Last · View Credits. Intentionally omitted: Pin Song, Create Station, Suggest Less, Rate Song.

### SuperCredits™ (active build)
Richer per-track credits than Apple's writer-only list. Three layers:

1. **Writers** (composer / lyricist / producer) — always present.
2. **Performers**, one per row, each with photo (or initial in a colored circle), name + role on this track, and the specific **instrument used on this track** (e.g. "1973 Martin D-28").
3. Tapping a performer opens a song-focused sheet:
   - **Played on this song** — the instrument(s) used on THIS track, each tappable.
   - **Also on {album}** — other tracks on this album where they played (light-grey track numbers, album track-list style).
   - **View artist profile** — placeholder toast today; see "Artist profile + streaming-service handoff" in roadmap.
4. Tapping an instrument opens an InstrumentSheet with photo, artist note, tuning/setup notes, and a **"Discover more / Buy"** vendor link (affiliate — see Micro-Sponsorships in roadmap).

#### Data shape (currently being built out by the admin CMS)
- `people: { id, name, photoUrl?, bio?, accent? }`
- `instruments: { id, name, category, photoUrl?, about?, artistNote? }`
  - `instrument_vendors: { id, instrumentId, name, affiliateUrl, aboutUrl?, logoUrl?, tagline?, bio?, location?, coverUrl?, position }`
- `trackWriters: { id, songId, personId?, name (snapshot), role, position }`
- `trackPerformers: { id, songId, personId?, instrumentId?, name (snapshot), role, tuningNotes?, position }`
- Person + instrument FKs are `SET NULL` on delete; the `name` snapshot keeps a credit renderable after a Person row is removed.
- Public read: `GET /api/songs/:id/credits` returns writers + performers already enriched with their joined `person` and `instrument: {..., vendors: []}` so the credits sheet renders from a single fetch.

#### SuperCredits™ badge (discovery)
Apple surfaces small chips on albums/tracks for **Dolby Atmos**, **Lossless**, **Spatial Audio** — fans actively hunt for them. A `SuperCredits™` chip serves the same job: "this album took the trouble to credit every musician + show you their gear."

Surfaces:
- Small chip on album cover in library / search results.
- Inline on the track row in the album view (not every track will always have credits, especially early on).
- A library filter: "Albums with SuperCredits™".

Same slot can later host partner-brand lockups ("Gear by Gretsch", "Strings by D'Addario") on sponsored albums. One slot, two kinds of signal — design the slot now.

### Chat / vendor messaging (demo)

A **Chat** tab in the bottom nav. Currently powers a single demo flow: **fan ↔ vendor about an instrument**.

- Each vendor row inside an instrument sheet has a chat-bubble button. Tapping it opens (or creates) a thread with that vendor and seeds it with an Open-Graph-style preview card (instrument photo, category, name, vendor link). Fan can then ask a question without leaving GoodTunes.
- Threads + messages are client-only via `localStorage` (`gt:chats`, `gt:chats-changed` event). One thread per vendor; additional instrument links append more cards into the same thread.
- Composer is real (Apple Messages-style bubbles, blue for the fan, grey for the vendor). For the demo we fire a single canned vendor reply ~1.5s after the fan sends a text.
- Bottom-nav Chat icon shows an unread badge in `#FF5470` driven by `totalUnread()`.

**Why this matters**: pitch-deck-grade proof that fans can reach a brand directly inside the player. Pairs naturally with SuperCredits™ Micro-Sponsorship links.

#### In-app browser (web vs. native)
On the web, vendor sites (Reverb, Sweetwater, Shar) all send `X-Frame-Options: deny` / restrictive `frame-ancestors`, so we **cannot** iframe them. The current "preview card → Open in browser" sheet (`InAppBrowserSheet` in `AlbumDetail.tsx`) shows vendor logo + name + domain, then punts to system Safari/Chrome via `window.open`.

When this ports to native: swap `window.open(url)` for **`SFSafariViewController`** (iOS) / **Chrome Custom Tabs** (Android). Both are real in-app browsers that bypass `X-Frame-Options`. Preview-card UX stays unchanged; only the handoff target changes.

### Synced lyrics (line-level shipped today)
The Lyrics overlay in `client/src/pages/Player.tsx` derives **round-second timestamps** from each song's `lyrics` string by evenly distributing non-header lines across `duration`, with a small lead-in (~6%) and outro (~4%). Section headers (`[Verse 1]`, `[Chorus]`, etc.) render dimmed + uppercase, are skipped during distribution, and aren't seek targets. Active line is white + bold + 1.05× scale, past lines fade to 35%, future lines sit at 55%. Auto-scrolls active line to vertical center via `scrollIntoView({ block: "center" })`. Tap any non-header line to seek to its timestamp.

Placeholder until real per-song timing arrives via the upload portal — at that point swap the auto-distribution for the stored `syncedLyrics: { time, text }[]` array; rendering stays the same. Word-level karaoke is a follow-up. Full lyrics data plan in roadmap.

---

For everything below this line — auth plan, backend AWS integration, DRM ladder, mobile RN port, play analytics, artist upload portal, Micro-Sponsorships economics, streaming-service handoff, muso.ai evaluation, verified-artist outreach, lyrics data plan — see **[docs/roadmap.md](./docs/roadmap.md)**.
