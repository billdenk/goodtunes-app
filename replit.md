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

### Chat / vendor messaging (demo)

A **Chat** tab lives in the bottom nav. It currently powers a single demo flow:
**fan ↔ vendor about an instrument**.

- Each vendor row inside an instrument sheet has a chat-bubble button. Tapping it opens (or creates) a thread with that vendor and seeds it with an Open-Graph-style preview card containing the instrument photo, category, name, and vendor link. The fan can then ask a question (e.g. "Is this still in stock?") without leaving GoodTunes.
- Threads + messages are client-only via `localStorage` (`gt:chats`, `gt:chats-changed` event). One thread per vendor; additional instrument links append more cards into the same thread.
- The composer is real (Apple Messages-style bubbles, blue for the fan, grey for the vendor). For the demo we trigger a single canned vendor reply ~1.5s after the fan sends a text, so the thread feels alive without a backend.
- Bottom-nav Chat icon shows an unread badge in `#FF5470` driven by `totalUnread()`.
- **Why this matters**: pitch-deck-grade proof that fans can reach a brand directly inside the player, instead of hunting down a contact email on the vendor's site. Pairs naturally with the SuperCredits™ Micro-Sponsorship link.

Out of scope for the demo (planned for the real build):
- Vendor accounts (separate role from listener), real inbox + thread storage, push notifications.
- Anti-spam, rate limiting, attachments (artists will want gear photos / audio clips).
- Vendor profile pages (logo, bio, hours, response-time SLA, instruments they specialize in). Today the row simply links into the in-app browser for the vendor's own about/buy pages.

#### In-app browser (web vs. native)
On the web, vendor sites (Reverb, Sweetwater, Shar, etc.) all send `X-Frame-Options: deny` / restrictive CSP `frame-ancestors`, so we **cannot** render them inside an iframe. The current "preview card → Open in browser" sheet (`InAppBrowserSheet` in `AlbumDetail.tsx`) is the honest web-platform answer: show vendor logo + name + domain, then punt to system Safari/Chrome via `window.open`.

When this ports to the native iOS/Android apps, swap `window.open(url)` for **`SFSafariViewController`** (iOS) / **Chrome Custom Tabs** (Android) — both are real in-app browsers that bypass X-Frame-Options because they're full browser instances, not iframes. The fan stays "inside GoodTunes" visually (with the native bottom Safari/share/done chrome) but gets a fully functional vendor site with their own cookies, autofill, Reader mode, etc. In React Native this is one line via `expo-web-browser` (`WebBrowser.openBrowserAsync`) or `react-native-inappbrowser-reborn`. The preview-card UX stays unchanged; only the handoff target changes.
- **Verified-artist outreach** — gating a "Reach out about a gig" button on artist/management contact rows. Originally scoped here; explicitly **deferred** until we have a real identity-verification path (Spotify-for-Artists / distributor / label cross-check) and the moderation tooling to keep working musicians safe from spam.

#### Data shape implications (when we build it)
- `track.credits.writers: { name, role }[]`
- `track.credits.performers: { personId, role, instrumentId, tuningNotes? }[]`
- `people: { id, name, photoUrl?, bio? }`
- `instruments: { id, name (e.g. "1967 Gretsch 6071 'Monkees' Bass Walnut"), photoUrl, artistNote?, vendor: { name, logoUrl, affiliateUrl } }`
- Performer ↔ track is many-to-many (same person plays multiple tracks, often on different instruments).

## Backend integration plan (GoodTunes AWS)

GoodTunes already runs its own AWS-backed sales + delivery pipeline for the vinyl + digital bundles sold on goodtunes.fm (no App Store cut). Audio + artwork live in S3 / CloudFront, and the team's coders already issue per-purchase entitled URLs tied to a logged-in user. This player should plug into that, **not** ship its own audio storage.

### What the player needs from the existing backend
1. **`GET /me/library`** — for the logged-in user, return the albums + tracks they're entitled to: ids, titles, artwork URLs, durations, credits payload (SuperCredits™-shaped).
2. **`GET /stream/{trackId}`** — return a short-lived signed URL (~30s) bound to the user + track. The `<audio>` element fetches it on play; reusing it later 403s. Same pattern the GT coders already use.
3. **Auth handoff** — SSO from goodtunes.fm (cookie / JWT / OAuth — match whatever the main site does) so the player inherits the session instead of doing its own login.

Once those exist, `client/src/data/musicData.ts` becomes a fetch-from-API layer; the rest of the player (SuperCredits™, playlists, favorites, chat, mini-player, lyrics) is unchanged.

### Pre-call agenda for the GT coders
- Does the entitlements API already expose `/me/library` and `/stream/{id}`-shaped endpoints? If yes, share the JSON shapes.
- Auth mechanism on goodtunes.fm (session cookie, JWT, OAuth)?
- Where does this Replit player live in URL space? Subdomain (`player.goodtunes.fm`) vs path (`goodtunes.fm/play`) — affects cookie sharing + CORS.

### DRM / anti-rip ladder (decision pending)
Browsers can never be fully unrippable (analog hole), but the realistic goal is "as locked-down as Spotify Web."
- **Tier 1 (cheap, ~weekend):** Stop serving raw Dropbox/S3 URLs. Proxy through GT backend with short-lived signed URLs, chunked range streaming, disabled right-click/drag, **per-user inaudible audio watermark** so leaks are traceable. GT is mostly here already.
- **Tier 2 (real DRM, weeks + $):** Encrypted HLS/DASH (Shaka Packager / Bento4), license server, integrate Widevine + FairPlay + PlayReady. Self-host or use **EZDRM / BuyDRM / Axinom / Mux / Bitmovin** (~$300–$2k/mo + per-stream). Player swaps `<audio>` for **Shaka Player** or **hls.js + EME**.
- **Tier 3:** Native iOS/Android wrapper for cert pinning, encrypted local cache, jailbreak detection. Defer until paying users + native app on roadmap.

### Artist upload / review portal (Phase 2)
Today files are manually uploaded by the GT team. Planned flow:
- Artist-facing portal (separate surface, not inside the fan player). Uploads: masters (WAV/FLAC) → staging bucket; artwork; SuperCredits™ metadata (writers, performers, instruments + tunings + vendor links).
- Internal review queue: GT team listens, eyeballs art, sanity-checks credits + vendor links, approves → files move staging → production, album becomes visible to entitled users.
- Reject-with-notes path for fixes.
- Bolt the lyrics-sync editor (see "Synced lyrics" below) onto this same upload step — auto-align runs on submit, artist nudges any drifted words before approval.

## Synced lyrics (Apple-style "Sync Lyrics")

Apple's karaoke-style lyrics highlighting comes in two tiers:
- **Line-level** — each line has a start timestamp (old LRC format), current line gets larger/brighter, past lines fade. Easy.
- **Word-level** — per-word/per-syllable timing, words light up as sung (TTML extension under the hood). Apple licenses this from **Musixmatch** (dominant) or **LyricFind** — produced by forced alignment + human QA.

GoodTunes can't license Musixmatch for **pre-release indie** material (not in their catalog yet). Recommended path:

### Data plan
1. **Artist-supplied timing** — best quality, free. Upload portal accepts a CSV / DAW export of word or line timestamps if the artist already has them.
2. **Auto-align in our backend** — open-source forced aligners (**Whisper-timestamped**, **Montreal Forced Aligner**, **aeneas**) take audio + plain lyrics text → per-word timestamps. ~80–90% accurate on clear lead vocals, gets shaky on harmonies/runs/mumbled delivery. Run at upload, store JSON next to track.
3. **Editor in the upload portal** — lyrics on the left, waveform on the right, drag any word/line to nudge timestamp. 60-second touch-up per song. This is the long-term recommended flow.
4. **License Musixmatch / LyricFind** — only useful post-Spotify/Apple launch when tracks are in their catalog. Skip pre-launch.

### Player-side (line-level shipped today)
The Lyrics overlay in `client/src/pages/Player.tsx` derives **round-second timestamps** from each song's `lyrics` string by evenly distributing non-header lines across `duration`, with a small lead-in (~6%) and outro (~4%). Section headers (`[Verse 1]`, `[Chorus]`, etc.) render dimmed and uppercase, are skipped during distribution, and aren't seek targets. Active line is white + bold + 1.05× scale, past lines fade to 35%, future lines sit at 55%. Auto-scrolls active line to vertical center via `scrollIntoView({ block: "center" })`. Tap any non-header line to seek to its timestamp. This is a placeholder until real per-song timing arrives via the upload portal — at that point swap the auto-distribution for the stored `syncedLyrics: { time, text }[]` array; rendering stays the same.

Word-level karaoke (per-word fill animation in `#319ED8` → `#4AFFCA`) is a follow-up driven off `requestAnimationFrame(audio.currentTime)` once per-word data exists — render code is small (~1 day).

## Mobile / native strategy (handing this off to existing iOS + Android apps)

GoodTunes already ships native apps in the App Store + Play Store. **Sales happen on goodtunes.fm, not in-app**, so the App Store 30% cut is a non-issue — this player is purely a **playback surface for already-purchased content**, which Apple's rules explicitly allow without their cut.

Four realistic paths to get this codebase onto mobile, in order of effort:

1. **WebView wrap** (fastest stop-gap). Embed the existing web player inside the current native shells (`WKWebView` on iOS, `WebView` on Android). Zero re-work, instant updates without app-store review. **Trade-offs**: background audio is finicky, no native lock-screen / CarPlay / Android Auto without a small native bridge, slightly less snappy on old devices. **Use as a bridge while Path 2 is being built.**
2. **React Native port** ⭐ (recommended end-state). Same React + TypeScript model — components, hooks, state, data flow port nearly 1:1. Web-specific glue (~5% of the code) gets swapped:
   - `<audio>` → `react-native-track-player` (true native audio + lock screen + CarPlay + Android Auto)
   - `localStorage` → `AsyncStorage` (one-line swap)
   - `wouter` → `react-navigation`
   - `<div>`/`<img>` + Tailwind → `<View>`/`<Image>` + NativeWind
   - Lyrics scroll → `FlatList.scrollToIndex`
   - Sheets/popovers → RN `Modal` / bottom-sheet libs

   Realistic budget: **2–4 weeks** for a competent RN dev to port everything we've built, +2 weeks for CarPlay/Auto/lock-screen polish. One codebase ships to both stores. Same stack as Spotify, Discord, Coinbase, Shopify, Teams.
3. **Capacitor / Ionic**. Web app inside a native shell with proper plugins. Less work than RN, more native-feeling than plain WebView. Fine, but RN's audio story is meaningfully better for a music app.
4. **Full native rewrite (Swift + Kotlin)**. Two codebases, double the maintenance forever. Skip unless at Apple-Music scale.

### What ports vs. what gets rebuilt (Path 2)
- **Ports unchanged**: SuperCredits™ surface, vendor chat, lyrics overlay (synced renderer included), favorites, playlists, mini-player + queue, brand styling, all interaction patterns.
- **Adapter layer**: `PlayerContext` already isolates audio + persistence behind a stable API — the RN swap happens behind that interface, the rest of the app doesn't notice.
- **Genuinely new work**: store accounts/certs/signing, push notifications (artist-drop alerts), CarPlay / Android Auto integration.

### Handoff value to the GT coders
This codebase is a **working reference implementation**, not throwaway prototype. Even if they choose Path 4, what they receive is:
- Every screen, every interaction, every transition — already designed and validated.
- Clean separation between UI / playback / persistence / data — the seam where native pieces plug in.
- Data shape docs in this file (SuperCredits™, chat, playlists, favorites, lyrics, analytics).
- Product decisions already locked (Apple-trimmed action menu, playlist cover mosaic logic, mini-player layout, heart-vs-star icon convention) — no re-litigation needed.

**Recommended sequence**: keep iterating the web player here as the canonical reference → wrap it in the existing apps as a stop-gap (Path 1) → budget 6–10 weeks for the RN port (Path 2) → RN becomes the real mobile experience, web stays alive for desktop and platforms without an app.

## Play analytics (artist + label insights)

GoodTunes is a **tethered download** model, not streaming — but per-track listening data is just as valuable to artists, and the player already has hooks for every event we'd need. Capture this from day one; **every play that happens before instrumentation is a play we can never recover.**

### Event taxonomy (industry-standard for music apps)
| Event | Fires when | Why |
|---|---|---|
| `play_start` | Audio actually begins (not on tap — on the `playing` event) | Counts attempts; lets us measure intro drop-off |
| `play_progress` | Every 30s of continuous playback | Confirms it's a real listen, not autoplay-then-walk-away |
| `play_complete` | Reached ≥ 90% of song length | The "real listen" — primary number for artist reports |
| `play_30s` | Reached 30s | Spotify/Apple-equivalent "stream" metric, for comparability |
| `play_skip` | Next/prev tapped before 30s in | Bail-rate per track |
| `seek` | User scrubs the timeline | Optional — spots replayed sections (chorus, solo) |
| `favorite` / `unfavorite` | Heart toggle | Top-fan signal |
| `add_to_playlist` | Song added to a custom list | Strong intent |
| `lyrics_open` | Lyrics overlay opened | Engagement depth |
| `credits_open` / `instrument_view` / `vendor_link_click` | SuperCredits™ surfaces | Proves the micro-sponsorship channel works; required for affiliate attribution |

**For "plays count" in artist-facing reports, use `play_complete`.** Show `play_30s` alongside it so artists can compare apples-to-apples with their Spotify/Apple numbers.

### Player-side wiring (~½ day)
- One module: `client/src/lib/analytics.ts` exposing `track(name, payload)`.
- Hook into `PlayerContext` events that already fire: audio element `playing` / `ended` / `timeupdate` / `seeking`, plus the existing `next` / `prev` / `toggleFavorite` / playlist mutations.
- Buffer events in memory + `localStorage` (key `gt:analytics-queue`), flush in batches every ~15s and on `pagehide` / `visibilitychange=hidden` via **`navigator.sendBeacon`** so the last batch never gets dropped on tab-close.
- Resilient to backend downtime — events queue in `localStorage` until next successful flush.

### Backend (GT coders, small)
- One endpoint: **`POST /api/events`** accepting a JSON batch tied to the logged-in user (server already knows who that is via the existing session).
- Storage: either a `play_events` table (Postgres / DynamoDB) or — better at scale — append to S3 in hourly partitions and query via Athena / Snowflake / BigQuery. The latter is cheap, schema-flexible, and the standard pattern for event streams.
- Nightly rollup job → artist-facing aggregates table (much smaller, indexed for fast dashboard queries).

### Artist / label dashboard (Phase 3, separate surface from the fan player)
The pitch — and a real GoodTunes differentiator vs. Apple/Spotify, where indie artists get crumbs of analytics:
- **"Which track should be your first single to streaming?"** — `play_complete` count + completion rate per track on the album.
- **"Who are your top 50 fans?"** — rank entitled users by completed plays + favorites + playlist adds. Use for vinyl gifts, livestream invites, meet-and-greets.
- **"Where do people drop off?"** — average % of song listened before skip, per track.
- **"Did SuperCredits™ vendor links convert?"** — `vendor_link_click` → affiliate-attributed purchase. Closes the loop on the micro-sponsorship promise.
- **"Geographic heat map"** — country/region only, no precise location. Tour-planning gold (Bandcamp does this well).

### Fan-facing application (year-end)
GoodTunes Wrapped equivalent — "Your top 10 songs of 2026" — but for music **bought**, not streamed. Warmer story than Spotify Wrapped because the user paid for everything in it.

### Privacy (must build alongside, not after)
Every event is per-identified-user (paid product, can't be anonymous). Required:
- Privacy policy line: "we record what you listen to so artists can see which songs resonate."
- Account-settings button: **"Delete my listening history"** → backend `DELETE /me/events`. GDPR + CCPA both require this; cheap to build, expensive to retrofit if regulators ask.
- Artist-facing reports show **aggregates only** — top-fan list shows display name + city, never raw event log.

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
