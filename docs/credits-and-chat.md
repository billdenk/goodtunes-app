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
4. Tapping an instrument opens an InstrumentSheet with photo, artist note, tuning/setup notes, and a **"Where to buy"** list. Each vendor row exposes **two distinct links**:
   - **The Vendor** — tap the logo *or* the name → that vendor's profile sheet inside GoodTunes (VendorSheet).
   - **The gear** — the trailing circular `IconButton` opens THIS instrument's own product page (`instrument_vendors.affiliate_url`), e.g. `https://prsguitars.com/electrics/model/silver_sky_rosewood_2024` — never the vendor's brand homepage.
   On the VendorSheet, the **globe** (and the "Web" link) always points at the vendor's **brand domain** (`vendors.home_url` / `vendors.domain`, e.g. `prsguitars.com`), so "anything featuring a specific instrument deep-links to that gear's URL; the globe is the brand."

   Both the InstrumentSheet and VendorSheet chrome (back / share / bookmark / globe / direct-gear) use the 44px `IconButton` primitive with circular glass backgrounds — no ad-hoc sub-44px buttons.

### Data shape (currently being built out by the admin CMS)

- `people: { id, name, photoUrl?, bio?, accent? }`
- `instruments: { id, name, category, photoUrl?, about?, artistNote? }`
  - `instrument_vendors: { id, instrumentId, name, affiliateUrl, aboutUrl?, logoUrl?, tagline?, bio?, location?, coverUrl?, position }`
- `trackWriters: { id, songId, personId?, name (snapshot), role, position }`
- `trackPerformers: { id, songId, personId?, instrumentId?, name (snapshot), role, tuningNotes?, position }`
- Person + instrument FKs are `SET NULL` on delete; the `name` snapshot keeps a credit renderable after a Person row is removed.
- Public read: `GET /api/songs/:id/credits` returns writers + performers already enriched with their joined `person` and `instrument: {..., vendors: []}` so the credits sheet renders from a single fetch.

### Rigs (named gear bundles, active build)

A **Rig** is a reusable, named gear bundle — a base instrument plus the accessories that complete it — that attaches to a track with a per-track tweak note. It answers "what exactly was this sound made with?" beyond the single instrument on a performer row.

- **Data shape.** `rigs: { id, name, instrumentId?, notes? }` (the base instrument FK is `SET NULL` on delete); `rig_accessories: { id, rigId, type, value, position }` (e.g. `type: "Strings"`, `value: "D'Addario EJ16 (.012–.053)"`); `track_rigs: { id, songId, rigId?, rigName (snapshot), tweakNote?, position }`. All three carry the soft-delete columns. The `rigName` snapshot keeps the attachment renderable if the underlying rig is deleted.
- **Accessory types** are free text, but the admin builder offers a category-aware suggestion list (`accessoryTypesFor()` in `shared/categories.ts`, keyed off the base instrument's short-category — Guitar → Strings/Pick/Capo/Strap/Slide/Tuning, etc., with a generic fallback). The chosen type is stored verbatim so the data survives any edit to that list.
- **Admin.** Build + attach lives on the per-track Credits panel (`TrackCreditsPanel`): create a rig (name, base instrument, accessory rows, notes) and it attaches to the current track in one step, or attach an existing rig with a tweak note. Routes: `POST/PUT/DELETE /api/admin/rigs`, `POST /api/admin/songs/:songId/rigs` (attach), `DELETE /api/admin/track-rigs/:id` (detach), `GET /api/rigs` (admin list), `GET /api/rigs/:id` + `GET /api/songs/:songId/rigs` (public).
- **Fan read.** A track's rigs ride in the album credits payload (`bySongId[songId].rigs`) and render under the performers in the credits sheet: rig name, the base instrument as a tappable gear link, accessories as labeled chips, and the tweak note in quotes.
- **Demo.** Fernando Perdomo's "Folk-Pop Rig" is seeded (prod-only, marker-guarded in `post-merge.sh`) on *Waves* / "Beautiful Soul".

### SuperCredits™ badge (discovery)

Apple surfaces small chips on albums/tracks for **Dolby Atmos**, **Lossless**, **Spatial Audio** — fans actively hunt for them. A `SuperCredits™` chip serves the same job: "this album took the trouble to credit every musician + show you their gear."

Surfaces:

- Small chip on album cover in library / search results.
- Inline on the track row in the album view (not every track will always have credits, especially early on).
- A library filter: "Albums with SuperCredits™".

Same slot can later host partner-brand lockups ("Gear by Gretsch", "Strings by D'Addario") on sponsored albums. One slot, two kinds of signal — design the slot now.

## Stream-elsewhere tracks (credits without the master)

A third track type sits alongside owned masters and previews: **stream-only** tracks. GoodTunes carries the full SuperCredits™ for these but does **not** host the audio — the operator adds the track to a GoodTunes album and pastes a Spotify link (Apple Music optional), and the fan is handed off to their own streaming service to actually listen. Masters never leave our infrastructure, and a track we never hosted never tries to.

**Operator (admin):** the Add Track form has a stream-only toggle. With it on, the audio-upload requirement drops (no Mux ingest, no probe) and a Spotify / Apple Music URL pair appears. A **Look up** button resolves a pasted Spotify URL to title/artist/artwork so the operator can confirm the right track before saving. The track stays fully creditable — writers, performers, instruments, gear links all work exactly as on a hosted track.

**Fan-facing gating** (this is the important part):

- **Album WITH SuperCredits** (any production credit, or any writer/performer on any track) → per-track handoff: tapping a stream-only row sends the fan to their service for *that track*, and the `SuperCredits™` badge shows over the album art. The big primary control reads **"Stream this."** Shuffle and download are hidden when every track is stream-only (nothing to shuffle locally, nothing to download).
- **Album WITHOUT SuperCredits** → a single album-level **"open whole album on Spotify"** handoff and **no badge**. There's no per-track handoff and no credit theater on an album that hasn't earned the badge.

The three-dots → **View Credits** entry is unchanged on every track type.

**Streaming-service preference (handoff target):** the first time a fan taps a stream handoff, a picker sheet asks which service to use (only services with a link for that release are tappable). The pick is saved and reused so every later tap opens that service directly — no picker. It persists in `localStorage` (`gt:fav-streaming-service`) for guest fans and mirrors to the customer profile (`PUT /api/me` → `favoriteStreamingService`) for signed-in fans so it follows them across devices. Fans change or clear it from **Account → Settings → Streaming Service**, an Apple-Settings-style sub-screen (tap the active service again to clear it back to first-tap-picker behavior).

**Data shape:** `songs.streamOnly` (bool), `songs.spotifyTrackUrl`, `songs.appleMusicTrackUrl`; album-level `spotifyUrl` / `appleMusicUrl` for the no-credit album handoff; `customerUsers.favoriteStreamingService`. The fan player (`PlayerContext`) hard-guards stream-only songs — they can never reach Mux or a raw audio URL.

## Chat / vendor messaging (demo)

> **Hidden on the gear surfaces (current state).** The Chat tab is off the bottom nav, and the vendor chat-bubbles have been removed from the InstrumentSheet "Where to buy" rows and the VendorSheet (top bar + instruments tab). Those were the only entry points to start a thread, so the chat demo below is effectively dark for fans. The chat store + route still exist (existing threads/unread count survive); restore the bubbles to bring it back. The notes below describe the design if/when it returns.

A **Chat** tab in the bottom nav. Powers a single demo flow: **fan ↔ vendor about an instrument**.

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

## Sell panel — physical good picker

The "+ Add physical good" menu on an album's Sell panel is **catalog-driven** when the album's artist or label was onboarded by a press. Only the formats that press's catalog covers show in the menu; non-invited / free albums see the full `ALBUM_FORMATS` list. On a vinyl row, the color picker is a progressive **tier → color → quantity** picker reading the press's catalog (color tiers + each tier's quantity price ladder). The typed quantity snaps up to the next ladder rung, the row shows that rung in a caveat ("Priced at the next rung up: 300 units."), and the per-unit Cost is recomputed live from the picked tier's ladder. Picks are snapshotted to the SKU on Save (tier name + color display name + snapped qty + `costSource: "catalog"`), preserving the cost-locked-at-save semantics fans depend on at checkout.

See `docs/admin-conventions.md` → **Press Catalog** for the editor + cost-split between per-press manufacturing and platform-wide publishing / processing / margin.

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

- "Favorites" is a virtual playlist combining favorited songs + songs by favorited artists (deduped). It is built (count, artwork mosaic, and detail list) by resolving favorited song ids against the **live DB catalog** (`/api/songs` + `/api/albums`), not the hardcoded `SONGS`/`ALBUMS` demo data — matching against the demo data left it permanently empty. It pins to the top of the Playlists tab whenever there's at least one favorite and disappears when the last one is removed.
- Order: most-recently favorited first.
- Persistence: server-backed for signed-in fans; anonymous/admin sessions fall back to localStorage (`gt:fav:songs`, `gt:fav:artists`) with the `gt:favorites-changed` event (see `useFavorites`).
- The leading favorite marker on a desktop track row is a quiet neutral-white heart (~70% opacity), not brand rose, and stays visible while the track plays (it sits in its own cell, left of the equalizer). The explicit favorite/unfavorite action buttons (⋯ sheet, Favorites detail) stay rose.

## Downloads & song row

- Per-song download is **in-app only** (Apple/Spotify model) — no Transfer Rights warning, no popups. Tap the cloud-arrow icon → silent toggle, persisted in localStorage (`gt:downloaded-songs:<albumId>`).
- **Web = no-op; native = protected.** On the web app the toggle only flips the localStorage flag — no audio bytes are ever fetched or stored. On the native apps (Android today; iOS gated off via `nativeDownloadsEnabled`) the audio is encrypted at rest with a per-device key, written to private, backup-excluded storage, and revoked automatically when the fan no longer owns the album. The full rationale lives in `client/src/lib/nativeDownloads.ts`; the DRM ladder it sits on is in [`roadmap.md`](./roadmap.md).
- The "download to your device" choice (which would burn Transfer Rights) is deferred to the desktop version. Album-level "Download Music Files" + Transfer Rights warning sheet have been removed for now.
- Song row layout: track # · title · **download cloud-arrow** · ⋯ menu. Heart moved into the ⋯ sheet.
- Song ⋯ sheet (Apple-trimmed): Favorite + Share (top two-up), then Add to Playlist · Play Next · Play Last · View Credits. Intentionally omitted: Pin Song, Create Station, Suggest Less, Rate Song.

## GoodDeed cost stack & ladder

What the artist actually owes us per signed copy, and how the Design tab reads it. Source of truth for the rung values: [`docs/shopify-pricing-strategy.md`](./shopify-pricing-strategy.md) § "Signed-cert wholesale ladder".

### One line, not five

Per signed copy the artist sees two cost lines on the Design tab — that's it:

1. **Quickprinter (rung)** — the tiered wholesale rung that matches the resolved signed-copy count for the current vinyl run.
2. **CC fee** — Stripe's 2.9% + $0.30 on the cert retail price.

The Quickprinter rung covers all six operational legs on a signed copy: **print + hologram + shrinkwrap + insertion into the jacket + all three shipping legs** (Hoover → artist for signing → Spinney for insertion → fulfillment). There is no separate "shipping" or "Sticker Mule" line on the artist's view — it's already inside the rung.

### Wholesale ladder & artist net at $20 retail

`shared/signedCertLadder.ts` is the canonical rung set; the table below is what the artist nets per cert at the recommended $20 retail. CC fee on $20 = $0.88.

| Signed copies | Quickprinter / cert | CC fee | **Artist net / cert** |
|---|---|---|---|
| 25–49 | $13.00 | $0.88 | **$6.12** |
| 50–99 | $12.00 | $0.88 | **$7.12** |
| 100–199 | $9.00 | $0.88 | **$10.12** |
| 200–299 | $7.00 | $0.88 | **$12.12** |
| 300+ | $6.00 | $0.88 | **$13.12** |

A 1,000-unit pressing at the 20% default attach rate → 200 signed copies → $7 rung → ~$12.12 net per cert × 200 = ~$2,424 cert uplift on top of the vinyl net. A 500-unit run at the same attach → 100 signed copies → $9 rung → ~$10.12 net per cert. **The ladder rung must be keyed off the resolved signed-copy count, not the vinyl run size.**

### Don't use the flat default

`payout_settings.cert_cost_cents` is the historical flat platform default ($12). It is only the fallback shown when the per-cert preview hasn't loaded yet or the platform-default Printing/Hologram/Insertion vendors aren't configured. Any Sell-panel / Design-tab readout of cert cost must read the rung from `/api/admin/albums/:id/gooddeed-pricing-preview?runQty=<certCount>` — not the flat default. See `.agents/memory/gooddeed-cost-stack.md`.
