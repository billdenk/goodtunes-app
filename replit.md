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
- **Player dock primitive** lives at `client/src/components/ui/PlayerDock.tsx` — Apple-Music-style floating pill (transport · cover/title · lyrics/volume) graduated from the admin Tracks-tab Seamless mockup. The mockup sandbox keeps a parallel inline `BottomDock` copy (the sandbox alias can't reach `client/src`); mirror polish into both files until the sandbox gains a real alias.
  - **Reuse for the consumer player**: this same primitive should drive the fan-facing player surface (Now Playing / mini-player) once we wire lyrics, queue, and shuffle/repeat state for fans. Plan to extend rather than fork: keep the dock as-is for admin (lyrics-disabled placeholder), and pass `onLyrics`, real shuffle/repeat handlers, and a queue when consumer mounts it. Any polish landing here should automatically benefit the consumer dock.
- Replit Object Storage for image uploads (album art, person photos, vendor logos/covers, scraped instrument images). Files live in `${PRIVATE_OBJECT_DIR}/uploads/<uuid>.<ext>` and are served via `GET /objects/uploads/<id>` (public ACL). Survives redeploys — the old local `uploads/` disk was ephemeral on Autoscale and wiped on each republish.

## Brand
- Colors: `#00062B` (bg), `#319ED8` (blue), `#7F10A7` (purple), `#4AFFCA` (mint), `#FF5470` (heart pink)
- Mobile-first single column, max width ~440px
- Apple-Music-style large headers, 44×44 minimum touch targets
- Songs use **heart** icon (`#FF5470`); artists use **star** icon

## User preferences

### Design system (app-wide — admin + player)
**One design system covers the entire product** — the mobile player, the admin/CMS, and every mockup. Identical concepts must look identical everywhere. No one-off colors, button sizes, hover treatments, or icon sizes outside the primitives.

**Two surfaces, shared vocabulary, distinct chrome.** Mobile player and desktop admin share **icon glyphs** (Lucide for UI chrome, `react-icons/si` for company logos), **brand colors**, and **product concepts** (favorite = heart, lyrics = `Mic2`, etc.) — but they use different button treatments because they live on different backgrounds and serve different users.
- **Mobile player (fan-facing, dark `#00062B` bg)**: follow **Apple Music**. Circular `IconButton` chips (44/48px) with the `glass` variant (white/14 scrim) for search/filter/share/back/photo-nav. Apple-Music-style segmented tabs (Albums / Songs / Artists). Rounded, generous, photo-forward.
- **Admin desktop (operator-facing, white/slate bg)**: square h-9 buttons, slate-100 segmented controls (`ViewModeToggle`, tab underlines), tighter density. Lives on white cards over a slate page background. Apple-Mac-app-style rather than Apple-Music-style.
When in doubt on the mobile player: Apple Music, Apple Music, Apple Music. Don't borrow admin chrome (h-9 squares, slate borders) into the player.

- **Primitives home**: `client/src/components/ui/` is the canonical home. Mockups in `artifacts/mockup-sandbox/` prove a pattern first in a local `_shared.tsx`, then the primitive graduates into `client/src/components/ui/` when the pattern ships to real code.
- **Default to Apple HIG** whenever a size/weight/spacing/radius/font isn't explicitly specified for a surface:
  - Type: SF / system font stack. Body 17pt, secondary 15pt, footnote 13pt, caption 11pt. Headings use Apple's title scale (Title 1 / 2 / 3).
  - Touch targets: **44×44pt minimum** on mobile surfaces (already enforced in this README).
  - Corner radii, padding rhythm, hover/pressed states: match Apple Music / Apple-iOS conventions over inventing our own.
- **Icons**: a single icon set per family (Lucide for UI chrome; `react-icons/si` for company logos). One play triangle, one trash can, one chevron, one pencil — used in every surface that needs that concept.
- **Circular icon buttons** (search, filter, share, close, photo-viewer nav, send, etc.) **must use the `IconButton` primitive** at `client/src/components/ui/IconButton.tsx`. The Collection page's search + sort buttons are the canonical reference.
  - Sizes: `md` (44×44, default — HIG floor) and `lg` (48×48, player primary controls only). No 40px buttons — bump to 44.
  - Variants: `glass` (default — white/10 scrim on dark bgs), `dimmed` (black/45 + blur, for use over bright photos/album art), `solid` (brand blue fill, primary actions), `ghost` (no bg).
  - Icon size auto-applied via child-SVG selector — consumers pass `<svg>` or a Lucide icon as a child without sizing it. 19px on `md`, 22px on `lg`.
  - Press feedback is `active:scale-[0.94]` everywhere. No more mixing scale/opacity. Always.
  - Surfaces still to migrate off ad-hoc inline circular buttons: `AlbumDetail.tsx` (back, more, photo-viewer nav, lyrics close), `Player.tsx`, `Playlists.tsx`, `ArtistDetail.tsx`, `Chat.tsx` composer send, `GoodDeedCertificate.tsx`. Migrate each time you touch the file — don't sweep all at once.
  - **Lyrics glyph**: Lucide `Mic2` (singer's mic) — same icon Spotify uses for the same concept. Wrapped at `client/src/components/ui/LyricsIcon.tsx` so any future swap happens in one place. Used on the mobile player's Now Playing controls **and** the admin Tracks-tab BottomDock. Sandbox surfaces import `Mic2` directly from `lucide-react` since they can't reach `@/components` — both surfaces stay on `Mic2`. We tried Apple's `quote.bubble` SF Symbol; inline-SVG approximations didn't read well at 16px so we kept the mic.
- **Color**: only the five brand colors listed above + Tailwind slate for neutrals. New colors require a discussion, not a one-off.
- **Destructive actions always confirm.** Any trash / delete / "remove forever" button must pop a confirmation sheet naming the thing being destroyed (e.g. "Delete *Storms*? This removes the master, snippet, lyrics, and credits.") with a rose-tinted primary action. Hide / Park / Archive are reversible and do **not** need a confirm — they just toast "Hidden — undo." Destructive buttons must also keep visual breathing room (gap + hairline divider) from any adjacent non-destructive control so a thumb can't slide between them.

### Spelling
- Use **US English** for all user-facing strings (e.g. "color", not "colour"; "favorite", not "favourite"). Code identifiers can stay as they are; only the visible UI copy needs to read American.

### Admin index pages — grid / list toggle
The five admin index pages (Albums, People, Gear, Vendors, Labels) all carry the same Apple-Music-style **Grid / List** segmented control in the header. The primitive lives at `client/src/components/admin/ViewModeToggle.tsx` and exports both the toggle and the `useViewMode(entity)` hook. Preference is persisted **per entity** (`gt:admin:view:<entity>`) so list-mode on Vendors sticks to Vendors while Gear can stay on grid.

**Canonical entity tokens** — used identically for the `useViewMode(…)` key, the `testIdPrefix`, the `row-<entity>-<id>` / `list-<entity>` / `grid-<entity>` testids, and any future per-entity storage namespace: `albums`, `people`, `instruments`, `vendors`, `labels`. Note "Gear" is only the user-facing label — the data entity (and therefore the token everywhere in code) is **`instruments`**. Don't introduce a parallel `gear` token; it splits selectors and storage keys.

- **Grid view**: the entity's tile/card layout (square album/instrument art, circular avatars, etc.). Density-optimized for browsing visual catalogs.
- **List view**: a single-column compact table — `rounded-lg border bg-white divide-y divide-slate-100`, with row testids `row-<entity>-<id>`. Thumbnail 40–48px, name + secondary line on the left, meta (label / domain / type+year / vendor count) right-aligned. Density-optimized for scanning a long list.

When adding a new admin index page, follow the same pattern: `useViewMode("<entity>")`, place the `<ViewModeToggle>` in the right-side header cluster, and render a per-entity `<EntityRow>` for the list branch.

### Person sheet — content guardrails
The public, fan-facing Person sheet (and any artist bio surface we ingest) must **not** include legal-issue, criminal-allegation, lawsuit, or controversy content, even when the source (Wikipedia, Roon, MusicBrainz, etc.) has those sections. When ingesting biographies, filter out sections titled along the lines of "Legal issues", "Allegations", "Controversy", "Lawsuits", or any incident/court coverage — keep early life, career, discography, charity work, family, and music-related content only. This is a product rule, not a one-off Nick decision.

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

### Synced lyrics — GoodSync™ (line-level shipped today)
The Lyrics overlay in `client/src/pages/Player.tsx` derives **round-second timestamps** from each song's `lyrics` string by evenly distributing non-header lines across `duration`, with a small lead-in (~6%) and outro (~4%). Section headers (`[Verse 1]`, `[Chorus]`, etc.) render dimmed + uppercase, are skipped during distribution, and aren't seek targets. Auto-scrolls active line to vertical center via `scrollIntoView({ block: "center" })`. Tap any non-header line to seek to its timestamp.

**Type model (matches Apple Music):** every line is the **same large size** — 28px, weight 700 (active gets weight 800). There is **no font-size bump and no scale transform** on the active line; that would make the column "jump" as the song progresses. Differentiation is **blur + opacity only**:

- Active line — 0 blur, opacity 1, weight 800, subtle text shadow.
- Neighbors (±1) — 1.2px blur, opacity ~0.50–0.72.
- Distance 2 — 2.8px blur.
- Distance 3 — 4.5px blur.
- Distance 4+ — 6px blur (still just legible).
- Past lines fade faster than upcoming ones so the eye naturally tracks down the page.

When changing the lyrics styling, keep the size uniform and adjust the blur/opacity ramps — never reintroduce size or scale variation between lines.

Placeholder until real per-song timing arrives via the upload portal — at that point swap the auto-distribution for the stored `syncedLyrics: { time, text }[]` array; rendering stays the same. Word-level karaoke is a follow-up. Full lyrics data plan in roadmap.

---

For everything below this line — auth plan, backend AWS integration, DRM ladder, mobile RN port, play analytics, artist upload portal, Micro-Sponsorships economics, streaming-service handoff, muso.ai evaluation, verified-artist outreach, lyrics data plan — see **[docs/roadmap.md](./docs/roadmap.md)**.
