# Credits, Chat, Lyrics & Library

Player-side product rules: SuperCredits™, the in-app chat demo, GoodSync™ lyrics, playlist covers, favorites, and the song-row download model.

## SuperCredits™ (active build)

Richer per-track credits than Apple's writer-only list. Three layers:

1. **Writers** (composer / lyricist / producer) — always present.
2. **Performers**, one per row, each with photo (or initial in a colored circle), name + role on this track, and the specific **instrument used on this track** (e.g. "1973 Martin D-28").
3. Tapping a performer opens a song-focused sheet:
   - **Played on this song** — the instrument(s) used on THIS track, each tappable.
   - **Also on {album}** — other tracks on this album where they played (light-grey track numbers, album track-list style).
   - **View artist profile** — placeholder toast today; see "Artist profile + streaming-service handoff" in roadmap.
4. Tapping an instrument opens an InstrumentSheet with photo, artist note, tuning/setup notes, and a **"Discover more / Buy"** vendor link (affiliate — see Micro-Sponsorships in roadmap).

### Data shape (currently being built out by the admin CMS)

- `people: { id, name, photoUrl?, bio?, accent? }`
- `instruments: { id, name, category, photoUrl?, about?, artistNote? }`
  - `instrument_vendors: { id, instrumentId, name, affiliateUrl, aboutUrl?, logoUrl?, tagline?, bio?, location?, coverUrl?, position }`
- `trackWriters: { id, songId, personId?, name (snapshot), role, position }`
- `trackPerformers: { id, songId, personId?, instrumentId?, name (snapshot), role, tuningNotes?, position }`
- Person + instrument FKs are `SET NULL` on delete; the `name` snapshot keeps a credit renderable after a Person row is removed.
- Public read: `GET /api/songs/:id/credits` returns writers + performers already enriched with their joined `person` and `instrument: {..., vendors: []}` so the credits sheet renders from a single fetch.

### SuperCredits™ badge (discovery)

Apple surfaces small chips on albums/tracks for **Dolby Atmos**, **Lossless**, **Spatial Audio** — fans actively hunt for them. A `SuperCredits™` chip serves the same job: "this album took the trouble to credit every musician + show you their gear."

Surfaces:

- Small chip on album cover in library / search results.
- Inline on the track row in the album view (not every track will always have credits, especially early on).
- A library filter: "Albums with SuperCredits™".

Same slot can later host partner-brand lockups ("Gear by Gretsch", "Strings by D'Addario") on sponsored albums. One slot, two kinds of signal — design the slot now.

## Chat / vendor messaging (demo)

A **Chat** tab in the bottom nav. Currently powers a single demo flow: **fan ↔ vendor about an instrument**.

- Each vendor row inside an instrument sheet has a chat-bubble button. Tapping it opens (or creates) a thread with that vendor and seeds it with an Open-Graph-style preview card (instrument photo, category, name, vendor link). Fan can then ask a question without leaving GoodTunes.
- Threads + messages are client-only via `localStorage` (`gt:chats`, `gt:chats-changed` event). One thread per vendor; additional instrument links append more cards into the same thread.
- Composer is real (Apple Messages-style bubbles, blue for the fan, grey for the vendor). For the demo we fire a single canned vendor reply ~1.5s after the fan sends a text.
- Bottom-nav Chat icon shows an unread badge in `#FF5470` driven by `totalUnread()`.

**Why this matters**: pitch-deck-grade proof that fans can reach a brand directly inside the player. Pairs naturally with SuperCredits™ Micro-Sponsorship links.

### In-app browser (web vs. native)

On the web, vendor sites (Reverb, Sweetwater, Shar) all send `X-Frame-Options: deny` / restrictive `frame-ancestors`, so we **cannot** iframe them. The current "preview card → Open in browser" sheet (`InAppBrowserSheet` in `AlbumDetail.tsx`) shows vendor logo + name + domain, then punts to system Safari/Chrome via `window.open`.

When this ports to native: swap `window.open(url)` for **`SFSafariViewController`** (iOS) / **Chrome Custom Tabs** (Android). Both are real in-app browsers that bypass `X-Frame-Options`. Preview-card UX stays unchanged; only the handoff target changes.

## Synced lyrics — GoodSync™ (line-level shipped today)

The Lyrics overlay in `client/src/pages/Player.tsx` derives **float-second timestamps** from each song's `lyrics` string by weighted-distributing lines across `duration`. Weights: sung line = 1, blank line = 0.6 (so stanza breaks earn real time, instead of mashing the next verse up against the previous one), section header (`[Verse 1]`, `[Chorus]`, etc.) = 0 (rendered dimmed + uppercase, not timed, not seek-targets). Lead-in scales with duration (`max(1.5s, min(8s, duration × 4%))`) so longer songs allow for a longer instrumental intro; tail is `max(2s, duration × 2%)`. Auto-scrolls active line to ~28% from top of the viewport. Tap any non-header line to seek to its timestamp.

**Type model (matches Apple Music):** every line is the **same large size** — 28px, weight 700 (active gets weight 800). There is **no font-size bump and no scale transform** on the active line; that would make the column "jump" as the song progresses. Differentiation is **blur + opacity only**:

- Active line — 0 blur, opacity 1, weight 800, subtle text shadow.
- Neighbors (±1) — 1.2px blur, opacity ~0.50–0.72.
- Distance 2 — 2.8px blur.
- Distance 3 — 4.5px blur.
- Distance 4+ — 6px blur (still just legible).
- Past lines fade faster than upcoming ones so the eye naturally tracks down the page.

When changing the lyrics styling, keep the size uniform and adjust the blur/opacity ramps — never reintroduce size or scale variation between lines.

Placeholder until real per-song timing arrives via the upload portal — at that point swap the auto-distribution for the stored `syncedLyrics: { time, text }[]` array; rendering stays the same. Word-level karaoke is a follow-up. Full lyrics data plan in roadmap.

### Large-master alignment copy

ElevenLabs' forced-alignment / Scribe endpoint enforces its own 150 MB hard cap on whatever we POST it. Long 24-bit/96 kHz masters routinely exceed that even after Task #32's FLAC shrink. The auto-sync route handles this transparently: when the source bytes are over the cap, the server transcodes a throwaway *alignment-only* copy on the fly — mono, 16 kHz, MP3 64 kbps — via the `transcodeForAlignment` helper, and ships those bytes to ElevenLabs instead. The stored `audio_url` / `audio_source_url` / playback are unchanged; only the bytes sent to ElevenLabs change. The alignment copy preserves the original timeline (no `-ss` / `-t` / `atempo`), so word-level cues map 1:1 back to the real master and the existing refinement + hallucination filter runs exactly as before. If the alignment-copy transcode itself fails (ffmpeg error, corrupt source), the operator sees the actual ffmpeg stderr tail in the error — not the misleading "Try a FLAC" message it used to return.

## Playlist covers

- Always show the actual artwork mosaic (gradient fallback only when truly empty).
- Adapt the layout to the count of unique album artworks:
  - 1 → single full image
  - 2 → split in half, side-by-side
  - 3 → one large left, two stacked right (Spotify-style)
  - 4+ → 2×2 grid
- Never repeat the same album in the cover.
- Pick the **most-recent** unique artworks first so the cover shifts as new songs are added.
- Custom uploaded covers + lock-in: deferred until friends/public sharing exists (then add reporting/moderation).

## Favorites

- "Favorites" is a virtual playlist combining favorited songs + songs by favorited artists (deduped).
- Order: most-recently favorited first.
- Client-only via localStorage (`gt:fav:songs`, `gt:fav:artists`) with `gt:favorites-changed` event.

## Downloads & song row

- Per-song download is **in-app only** (Apple/Spotify model) — no Transfer Rights warning, no popups. Tap the cloud-arrow icon → silent toggle, persisted in localStorage (`gt:downloaded-songs:<albumId>`).
- The "download to your device" choice (which would burn Transfer Rights) is deferred to the desktop version. Album-level "Download Music Files" + Transfer Rights warning sheet have been removed for now.
- Song row layout: track # · title · **download cloud-arrow** · ⋯ menu. Heart moved into the ⋯ sheet.
- Song ⋯ sheet (Apple-trimmed): Favorite + Share (top two-up), then Add to Playlist · Play Next · Play Last · View Credits. Intentionally omitted: Pin Song, Create Station, Suggest Less, Rate Song.
