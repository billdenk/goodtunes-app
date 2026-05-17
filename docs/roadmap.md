# GoodTunes® Player — Roadmap & Deep-Dives

Long-form design notes and future-phase plans. Operational rules + active user preferences live in [`../replit.md`](../replit.md); this file is the "phase 2 and beyond" thinking.

---

## Track publish requirements (locked)

A track is "ready to publish" when **both** of the below are set. Lyrics + Credits remain optional (a track can ship without them and still play in the demo).

1. **Master** — full-length audio file uploaded to object storage (existing flow).
2. **30-second snippet** — start/end timestamps on the master defining a ≤30s preview clip. Used anywhere we currently auto-truncate audio (search results, library tiles, share-to-X previews) and for the future free-tier listening experience. Implementation plan:
   - Add `snippetStartSec NUMERIC` + `snippetEndSec NUMERIC` to `tracks`. Validation: `0 ≤ start < end ≤ duration` and `end - start ≤ 30`.
   - Admin UI: when a master is loaded, render a [`wavesurfer.js`](https://wavesurfer.xyz) waveform with two draggable handles. Right handle is clamped to ≤30s from the left. Play button auditions only the windowed slice. Save sets the two timestamps; no re-encoding of the master.
   - Player: a `snippetUrl()` helper returns the master URL plus a `?range=` hint so the `<audio>` element seeks to `snippetStartSec` and stops at `snippetEndSec`. No new endpoint needed for v1; can move to backend-sliced delivery later if leak-prevention demands it.
   - Tracks-tab dot meter ("N/2") is driven off these two flags.

The Admin Tracks tab uses a dot meter on each row (●●  2/2) for the two required pieces; lyrics + credits live under an "Optional" divider in the expanded inline editor.

### Master replacement vs. removal

The Master detail panel offers **Replace** only — there is no "Remove master." Replacing swaps the audio while preserving the lyrics + credits work attached to the track. If a track should be gone entirely, the row-level trash deletes the row (and all its metadata together).

### Track publish state (`draft` / `hidden` / `live`)

Each track row carries a publish state — `draft` by default, `hidden` for soft-deleted/parked rows, `live` once the album ships. Hide is the recoverable parking spot ("not on the public album, but lyrics + credits + master stay intact"); Trash is the unrecoverable nuke. The admin row's danger strip surfaces both: `EyeOff` icon → toggle hidden, `Trash2` icon → confirm + delete. Same muted-slate-at-rest hover-tint treatment (slate for Hide, rose for Delete) so neither pulls the eye at rest.

---

## SuperCredits™ — Micro-Sponsorships (monetization layer)

Outbound instrument links are affiliate links. Revenue split: **artist gets the lion's share, GoodTunes takes a small cut for the connection.** This makes credits a revenue stream for the musician, not just metadata — a real differentiator vs. Apple/Spotify.

Treat affiliate URL + revenue share as part of the instrument record, not a per-link afterthought.

### Pitch timing — don't sell SuperCredits™ to an empty card
The first Credits-empty state intentionally does **not** mention SuperCredits™. Once the artist has added a writer + a performer, *then* surface the upsell: "Add the gear you used and turn your credits into SuperCredits™ — fans can tap your guitar, your strings, your producer's console, and buy them. You get the lion's share." The pitch lands harder when there's already a credit on screen to point at.

### Higher affiliate share for richer notes
Personal notes (tuning, why you picked this guitar for this take, mod history) are what fans actually want and what gear brands love to be associated with. Consider a tiered revenue split: **flat instrument credit → base share. Instrument + artist note → bumped share.** Pays the artist for the storytelling work and makes every credit row genuinely worth filling in.

### Sub-gear (working name)
A performer's instrument is often a *system*, not a single product. Example: "1973 Martin D-28" is the headline instrument, but the strings, capo, pickup, case, and signal-chain pieces are all separately purchasable and individually meaningful to fans. Data shape (tentative):
- `instruments` stays the primary record (the guitar).
- A new `instrument_components` (or `gear_pieces`) table links to a parent instrument with its own name, category (strings / capo / pickup / case / pedal / cable / strap), vendor + affiliate URL, position, optional photo.
- The instrument sheet renders the headline instrument at top, then a compact "Setup" list of components — each tappable, each an affiliate link.
- Sub-gear inherits the same affiliate-share rules as the parent instrument. Notes ("D'Addario EJ16 — light bronze, restrung the morning of the take") trigger the same bumped share.
Naming: "Sub-gear" is fine internally but probably needs a friendlier user-facing term — *Setup*, *Rig*, *Loadout*, or *Kit* are candidates. Punt until we mock the instrument sheet redesign.

## SuperCredits™ — Artist profile + streaming-service handoff

The "View artist profile" link on a performer sheet is the seed of a much bigger flow. It belongs to GoodTunes' core sales pitch (see "Sell first. Then stream." strategy deck): **fans buy on GoodTunes pre-launch and listen here; once the album reaches Spotify / Apple Music / Pandora / Deezer / etc., we hand them off**.

Planned UX:
- **One-time service picker** — first time after we've launched to streaming, the player surfaces a pop-up: *"This album is now on streaming. Pick the service you'd like us to send you to from now on."* The user taps a service icon. We store this as their preferred streaming service.
- **From then on**, when they tap "View artist profile" (or any cross-album link from a performer sheet), we deep-link straight into their preferred service. They can change the preference any time in user settings.
- **Notifications** — once a fan has chosen a service, we can notify them when an artist they care about drops something new on that service. The performer sheet is the natural place to subscribe, because they're already showing intent to follow this person.
- **Data value** — preferred-service selections are first-party data we can report back to artists (who's listening where).

This is post-launch work. For now the link is a toast placeholder, but the row is intentionally there in the design so demos can point at it.

## SuperCredits™ — Potential data source: muso.ai

[muso.ai](https://developer.muso.ai/) has a developer API for music credits — writers, performers, instruments, sessions. They already power credits surfaces for some major streaming services. Worth evaluating when we move beyond hand-curated seed data: pull a baseline of credits from muso.ai, then let the artist override/enrich (especially the per-instrument note + tuning + vendor link, which muso.ai won't have). Auth is API-key based; check pricing tiers before committing.

(MUSO_API_KEY is already listed in expected env vars.)

## Chat — out of scope for the demo

Planned for the real build:
- Vendor accounts (separate role from listener), real inbox + thread storage, push notifications.
- Anti-spam, rate limiting, attachments (artists will want gear photos / audio clips).
- Vendor profile pages (logo, bio, hours, response-time SLA, instruments they specialize in). Today the row simply links into the in-app browser for the vendor's own about/buy pages.
- **Verified-artist outreach** — gating a "Reach out about a gig" button on artist/management contact rows. Originally scoped for the demo; explicitly **deferred** until we have a real identity-verification path (Spotify-for-Artists / distributor / label cross-check) and the moderation tooling to keep working musicians safe from spam.

---

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

## DRM / anti-rip ladder (decision pending)

Browsers can never be fully unrippable (analog hole), but the realistic goal is "as locked-down as Spotify Web."
- **Tier 1 (cheap, ~weekend):** Stop serving raw Dropbox/S3 URLs. Proxy through GT backend with short-lived signed URLs, chunked range streaming, disabled right-click/drag, **per-user inaudible audio watermark** so leaks are traceable. GT is mostly here already.
- **Tier 2 (real DRM, weeks + $):** Encrypted HLS/DASH (Shaka Packager / Bento4), license server, integrate Widevine + FairPlay + PlayReady. Self-host or use **EZDRM / BuyDRM / Axinom / Mux / Bitmovin** (~$300–$2k/mo + per-stream). Player swaps `<audio>` for **Shaka Player** or **hls.js + EME**.
- **Tier 3:** Native iOS/Android wrapper for cert pinning, encrypted local cache, jailbreak detection. Defer until paying users + native app on roadmap.

## Artist upload / review portal (Phase 2)

Today files are manually uploaded by the GT team. Planned flow:
- Artist-facing portal (separate surface, not inside the fan player). Uploads: masters (WAV/FLAC) → staging bucket; artwork; SuperCredits™ metadata (writers, performers, instruments + tunings + vendor links).
- Internal review queue: GT team listens, eyeballs art, sanity-checks credits + vendor links, approves → files move staging → production, album becomes visible to entitled users.
- Reject-with-notes path for fixes.
- Bolt the lyrics-sync editor (see "Synced lyrics" below) onto this same upload step — auto-align runs on submit, artist nudges any drifted words before approval.

---

## Synced lyrics — data plan (post line-level)

Apple's karaoke-style lyrics highlighting comes in two tiers:
- **Line-level** — each line has a start timestamp (old LRC format), current line gets larger/brighter, past lines fade. **Shipped today** (see replit.md).
- **Word-level** — per-word/per-syllable timing, words light up as sung (TTML extension under the hood). Apple licenses this from **Musixmatch** (dominant) or **LyricFind** — produced by forced alignment + human QA.

GoodTunes can't license Musixmatch for **pre-release indie** material (not in their catalog yet). Recommended path:

1. **Artist-supplied timing** — best quality, free. Upload portal accepts a CSV / DAW export of word or line timestamps if the artist already has them.
2. **Auto-align in our backend** — open-source forced aligners (**Whisper-timestamped**, **Montreal Forced Aligner**, **aeneas**) take audio + plain lyrics text → per-word timestamps. ~80–90% accurate on clear lead vocals, gets shaky on harmonies/runs/mumbled delivery. Run at upload, store JSON next to track.
3. **Editor in the upload portal** — lyrics on the left, waveform on the right, drag any word/line to nudge timestamp. 60-second touch-up per song. Long-term recommended flow.
4. **License Musixmatch / LyricFind** — only useful post-Spotify/Apple launch when tracks are in their catalog. Skip pre-launch.

Word-level karaoke (per-word fill animation in `#319ED8` → `#4AFFCA`) is a follow-up driven off `requestAnimationFrame(audio.currentTime)` once per-word data exists — render code is small (~1 day).

---

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
- Data shape docs in this file + replit.md (SuperCredits™, chat, playlists, favorites, lyrics, analytics).
- Product decisions already locked (Apple-trimmed action menu, playlist cover mosaic logic, mini-player layout, heart-vs-star icon convention) — no re-litigation needed.

**Recommended sequence**: keep iterating the web player here as the canonical reference → wrap it in the existing apps as a stop-gap (Path 1) → budget 6–10 weeks for the RN port (Path 2) → RN becomes the real mobile experience, web stays alive for desktop and platforms without an app.

---

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

---

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

---

## Admin restructure — May 16, 2026 decision log

Bill's pass over the storyboard mockups. Locking these in so future sessions have a single source of truth before code moves.

### Tab layout (album level)
**Overview · Tracks · Artwork · Masters · Bonus**

- "Files" renamed to **Masters** (matches the deliverable language engineers actually use; "Files" sounds clerical).
- **Bonus** is a new album-level tab sitting after Masters. Houses the existing Videos + Photos blocks plus future buckets (liner notes, lyric sheets, commentary, press kit). Videos/photos are deliberately NOT moved to per-track scope — they're album-wide and Bill is happy with the album-level UX today.

### Track-level tabs
**Details · Credits · Lyrics** (no Files tab at track level — masters live at album level).

### Decisions by topic

1. **Gear-to-credits pipeline (point 2).** SuperCredits storytelling requires performers to be grouped by instrument category (Guitars / Bass / Synth / Drum programming / Piano / Mastered by). Data model already supports it via `trackPerformers.instrumentId → instruments.category`; what's missing is the visual grouping in the Credits row UI. Build category-bucket layout when Credits tab is implemented.

2. **Writers & Publishing stays first-class (point 3).** Platoon's May 7 reply confirms vendors require: (a) vendor secures mechanical licensing, (b) vendor handles royalty accounting and pays artists + Platoon directly, (c) vendor assumes legal title of inventory. So our W&P fields aren't admin paperwork — they're the on-ramp for every distribution partner.

3. **Label + payment routing (point 4).** Need to add per album:
   - `label` (record label name + contact)
   - `payeeMap` (% split: artist / label / writers / publishers — must reconcile to 100%)
   - `mechLicenseRoute` per track: `self` | `harry-fox` | `mlc` | `rumblefish`
   - Sales-unit reporting hooks (vendors need unit counts per period).

4. **Ownership documentation (point 5).** Per-track `ownership` field: `label-owned` | `artist-100` | `split`, plus the ability to attach a signed ownership PDF to the track record. Protects against cover-song liability if the artist didn't actually clear it.

5. **Lyrics services pinned (point 6).** Musixmatch ($200/mo) and LyricFind (no public pricing, no email reply) are both deferred. We do **plain lyrics + synced .vtt** in-house only. The "Request from artist" + "Look up" buttons are removed from the Lyrics tab. Synced-lyrics-as-a-service is a future monetization play.

6. **Masters tab — pared down (point 7):**
   - Streaming master ✓
   - Hi-res downloadable ✓
   - Stems ✗ (deferred)
   - Per-track cover override ✗ (deferred — albums already have artwork)

7. **Apple-style lyrics player preview (point 8).** Section headers (`[Verse 1]`) hidden in render, large bold active line, neighbors blur and fade, left-aligned, blurred album-art backdrop, no progress bar inside the lyric pane. Matches the IMG_3607 reference (Apple Music "Superman" view). Editor still uses section headers — they just don't render to fans.

8. **Studios as an entity (point 9).** Convert "Recorded at" from free text to a **dropdown + create-new**. Globally-shared studio table:
   - Default option `"Home studio"` (generic — used when an artist records at home; no contact info required).
   - Real studios get full records (name, city, contact, phone, email) so we can reach them later if needed.
   - Studios are global across the app — every artist sees the same dropdown and can pick from existing rows or create new ones. (Bill's confirmed answer: one generic "Home studio" entry; real named studios are first-class records.)
   - Schema: `studios { id, name, city?, contactName?, email?, phone?, isGeneric }`. Track's `recordedAtStudioId` FK.

9. **Single Link button per instrument category (point 10).** Collapse "Link instrument" + "Link a guitar..." duplicate UI to one button with category-aware label: "Link a guitar", "Link a bass", "Link a synth", etc. Link / Edit / 🗑 affordances render **hover-only** to keep the resting state clean.

10. **Track ribbon — elegant + minimum-complete (point 11).** Thinner row, smaller numerals, dots (not icons) for status: `·` incomplete · green dot complete · amber dot warning. Tooltip on hover for missing-field detail.

    **Minimum-complete threshold (Bill's confirmed answer B):**
    - Title ✓ (required)
    - Audio master ✓ (required)
    - Writers — best effort, not required
    - Performers — best effort, not required
    - Splits — optional (no enforced 100% gate)

    A track turns "green" once title + audio are present. Writers/performers/splits surface as soft warnings, not blockers.

11. **Relationships block pinned (point 12).** "Alternate version of / sample / cover / remix" UI hidden for now. Schema can stay (cheap) but no UI consumer until we have a clear use case (CD Baby ingest, etc.).

12. **Lock-by-default + hover-edit pattern (point 13).** Standard interaction for every field on the new admin: at rest, fields render as locked read-only text; hover reveals Edit + 🗑. **First-entry exception:** brand-new empty fields render as live inputs so the user knows to type; once filled + saved, they switch to locked read-only. (Matches the Notion / Linear pattern + Bill's existing videos/photos UX he already likes.)

13. **Section-level permission locks deferred (point 14).** Password-to-edit per section is a later add — wait until multi-user/roles exist. Not building this in the current pass.

### Mockups updated / added in this pass
- `admin-track-edit/TrackLyrics.tsx` — removed "Request from artist" + "Look up" buttons, removed Musixmatch/LyricFind fallback block, rebuilt the Player Preview pane in Apple Music style (blurred backdrop, left-aligned, no section headers visible, no progress bar in pane).
- `admin-album-bonus/BonusTab.tsx` — NEW. Album-level Bonus tab demonstrating the lock-by-default + hover-reveal pattern on videos + photos, plus dashed scaffolding for future bonus buckets (liner notes, lyric sheets, commentary, press kit).

### Build phasing (recap from prior turn)
Phase 1 — Albums list + Album page route split (1 session) · **next up**
Phase 2 — Per-track edit page with Details + Credits tabs (2 sessions)
Phase 3 — Lyrics tab w/ Apple-style player preview (1 session)
Phase 4 — Masters tab w/ pared-down pipeline (1 session)
Phase 5 — Bonus tab (album-level move; 1 session)
Phase 6 — ASCAP pull + Person-record memory + co-writer suggestions (1 session)


---

## Storefront — sunrise/sunset album sales (designed, not built)

Captured while planning admin redesign, May 16 2026. Not in the current build pass — locking the design intent so the schema we ship in Phase 1–6 doesn't paint us into a corner.

### Release lifecycle (canonical, 4 states)

Every album moves through these states in order. The new admin's Albums page (`/admin/albums`) already shows them as the four underline tabs:

1. **Prepping** — we're working on it. Cover art, metadata, credits, lyrics, masters are still being assembled. Not visible to fans. Today this maps to `isGoodTunesRelease=false` (imported albums that haven't been promoted yet); will gain a proper `lifecycle='prepping'` enum / draft flag with the schema work below.
2. **Staged** — ready to release. All prep work done, just waiting for sunrise. Not visible to fans yet. **No schema field today** — count shows 0 in the admin until `saleStartsAt` (sunrise) is wired and the admin can flip an album into staged-and-scheduled.
3. **Live** — fans can see and purchase. Today: `isGoodTunesRelease && !isHidden`. After sunrise/sunset land: between `saleStartsAt` and `saleEndsAt`, and `unitsAvailable` not yet hit.
4. **Sunset** — pulled from sale. Either the admin manually hid it (`isHidden=true` today) or `saleEndsAt` passed or `unitsAvailable` was reached. **Existing owners keep their entitlement forever** — Collection is per-user and entirely orthogonal to storefront visibility. Sunset only ends *new* sales.

### Core sale model
Albums on GoodTunes are **time-windowed, supply-limited drops** — not "buy anytime forever." Each album has:
- **`saleStartsAt`** (sunrise) — drop goes live; album becomes purchasable. Before this: card visible with countdown, no buy button.
- **`saleEndsAt`** (sunset) — automatic end. Album becomes unpurchasable. Existing owners keep their entitlement forever (Apple/Spotify rules don't apply — they bought it). Today's `albums.isHidden` is the primitive, manual version of this — the admin's **Sunset** tab in `/admin/albums` already lists those, and the semantics (pulled from sale, owners keep access) are identical.
- **`unitsAvailable`** (optional cap) — sells out when reached, even if before sunset. "First-N gets it" mechanic.
- **`unitsSold`** — running count. Public-facing "X of Y remaining" badge if `unitsAvailable` is set.

Either gate ends the sale: time **or** units, whichever first. UI shows whichever's closer. Admin can also **manually end early** with one click.

### Add-ons / bundle SKUs (per album)
A drop isn't just digital audio. The cart can include physical/extra SKUs:
- **GoodDeed™ Certificate** — printed and signed certificate of ownership for the buyer. Limited-edition feel. Numbered, e.g. "#37 of 250." Drives scarcity.
- **Vinyl** — 7" single, 10", 12" LP, double LP, picture disc, color variant. Signed or unsigned.
- **CD** — standard, digipak, deluxe with booklet. Signed or unsigned.
- **Cassette** (niche but real demand in indie circles).
- **Behind-the-scenes / extended liner notes PDF** (digital add-on).
- **Personal video message from the artist** for the first N buyers.
- **Demo / unreleased session takes** for the first N buyers.
- **Bundle SKUs** — one cart line that contains multiple physical items (e.g. "LP + signed cert + tote"). Internally a parent SKU with child references.

Add-ons are SKU-shaped: each has its own price, units available, fulfillment type, and can sell out independently of the main album. Each physical SKU also captures:

- **Package contents** — free-text plus structured tags ("12-inch LP, 180g black vinyl, gatefold sleeve, digital download code") so we can render a clean cart line + a fulfillment pick-list.
- **Format** enum: `vinyl_7 | vinyl_10 | vinyl_12 | vinyl_2lp | cd | cd_deluxe | cassette | cert | bundle | digital_extra`.
- **Manufacturer / fulfillment vendor** — for our records: which plant pressed the vinyl, who printed the certs, who handles drop-ship. Not customer-facing. Useful for: chasing a late shipment, tracking defect rates, accounting, and re-ordering when an SKU restocks.
  - Fields: `manufacturerName`, `manufacturerContact`, `manufacturerOrderRef`, `unitCostCents`, `leadTimeDays`.
- **Weight + dimensions** (for shipping calc later).
- **Inventory status** — `pre_order` (manufactured after sunset based on units sold) vs `in_stock` (we already have them on a shelf). Pre-order is the default — it's how indie drops avoid sitting on unsold inventory.

### Manufacturers (new global entity)
Like Studios, Manufacturers becomes a tiny global table so admins pick from a dropdown instead of retyping the vendor every time. One row per real plant / printer / fulfillment partner.

```
manufacturers {
  id, name, kind (vinyl_plant|cd_duplicator|print_shop|fulfillment|merch),
  contactName, contactEmail, contactPhone, website, notes
}
```

Album SKUs reference a manufacturer FK, `SET NULL` on delete so a removed vendor leaves the SKU's history intact.

### Pre-sale + post-sale states
- **Pre-sunrise**: album visible, **30-second previews only** per track, countdown to sunrise, "Notify me" capture (email/push).
- **Live window**: previews + full streaming for logged-in owners; non-owners can buy.
- **Post-sunset / sold out**: previews stay (~30s clips), full streaming for owners only. Public page reads "Sold out · [N] copies pressed."
- **Owner-forever**: a buyer's entitlement never expires, regardless of sunset. Sunset only ends *new* sales.

### Private artist promo link
- Each album gets a **private link** the artist can share before sunrise (`/album/:slug?promo=<token>`).
- Pre-sunrise: token grants preview-page access + email capture flow + maybe a sneak-peek track.
- Optional: token-gated early access (first 24h reserved for the artist's list, then public).
- Per-token analytics: clicks, signups, conversions — so the artist can see which channel (Insta DM, mailing list, friend) drove sales.

### Schema implications (touch shared/schema.ts later)
```
albums + {
  saleStartsAt: timestamp (nullable — null = "no sale window, always for sale" legacy mode)
  saleEndsAt:   timestamp (nullable)
  unitsAvailable: integer (nullable — null = unlimited)
  unitsSold:    integer (default 0)
  saleStatus:   enum('draft','scheduled','live','sold_out','ended','manually_closed')
  promoToken:   text (random, regenerable)
  previewSeconds: integer (default 30) — per-track preview length pre-purchase
}

album_skus (new table) {
  id, albumId,
  format (vinyl_7|vinyl_10|vinyl_12|vinyl_2lp|cd|cd_deluxe|cassette|cert|bundle|digital_extra|...),
  title, description, packageContents,           -- "12in LP, 180g black, gatefold sleeve, DL code"
  priceCents,
  unitsAvailable?, unitsSold,
  fulfillmentType (digital|physical),
  manufacturerId? -> manufacturers.id,            -- our records, not customer-facing
  manufacturerOrderRef?,                          -- their PO number
  unitCostCents?,                                 -- what we pay per unit (margin math)
  leadTimeDays?,                                  -- expected wait from order to ship
  inventoryStatus (pre_order|in_stock),
  weightGrams?, dimensionsCm?,                    -- for shipping calc later
  assetUrl?                                       -- for digital extras only
}
```

### Why this matters
The storefront IS the product on day one. Streaming-without-purchase comes later via the handoff flow. Sunrise/sunset + scarcity is what makes a GT drop feel like a Kickstarter / Bandcamp drop rather than a Spotify catalog entry — and is the reason artists make more per fan here than via streaming.

### Out of scope for now
Cart UX, Stripe checkout, fulfillment dashboard, post-purchase delivery email, refund flow, sales reporting per artist/label, public sold-out leaderboards. All of that is post-admin-restructure work.


## Masters tab — consolidate into Tracks (proposed May 16, 2026)

Bill's call: a "master" is just the audio file attached to a track, not a separate entity. Today we render the same per-track info on both the Tracks tab (rich row with chips for Master / Lyrics / Sync / Credits) **and** a dedicated Masters tab (bulk listening + upload). The Masters tab is redundant.

Plan:
- Drop the dedicated Masters tab from `AdminAlbum.tsx`.
- Add a **View toggle** at the top of the Tracks tab: `Edit · Listen`.
  - **Edit** (default) = today's rich rows with chips + rename/delete.
  - **Listen** = compact row per track: track # · title · MASTER LOADED chip · transport (▶ / ⏸ / scrubber) · duration. No edit affordances. Optional "play all" header button. Purpose: bulk-QA the audio before a release.
- Drag-and-drop / paste-URL / remove-master move into the per-track AudioEditor (already there on the Master chip) — Listen mode is read-only.
- Keep the explanatory banner ("a master is the streaming audio file for a track") but on the Tracks tab in Listen mode.

Risk: a couple weeks ago Bill liked the standalone Masters tab. If consolidation lands and he misses it, we can bring it back as a per-album route (`/admin/albums/:id/masters`) without restoring the tab in the entity tabbar.

## Preview clips — 30-second trim + multiple named takes (deferred)

Goal: every track gets a 30-second preview clip that plays for non-purchasers / Apple-Music-style sample players. Bill's mental model: Apple's QuickTime trim tool — yellow timeline strip with a fixed-width 30s window the admin slides across the song, then taps **Create preview**.

Phase 1 — single preview per track:
- Schema: `songs.previewUrl: text | null`, `songs.previewStartSec: integer | null` (where the 30s starts in the master).
- Admin UI: Tracks-tab row → Master chip sheet adds a "Preview" sub-panel. Shows the song waveform (peaks JSON pre-computed server-side from the master), a draggable 30s window overlay, ▶ on the windowed section, **Create preview** button.
- Backend: small ffmpeg job — input master + startSec, output `previewUrl` (encoded MP3 ~128 kbps so it's tiny). Stored in object storage alongside masters.
- Player: when a non-purchaser hits play on a sample-only track, source from `previewUrl` instead of `audioUrl`, hard-stop at 30s.

Phase 2 — multiple named takes:
- Like Vimeo thumbnails: admin can create *several* named 30s previews ("Chorus drop", "Intro hook", "Outro"), then radio-select which one is active. Schema becomes `song_previews: { id, songId, name, startSec, previewUrl, isActive }` — `audioUrl` stays on the song.
- Why: A&R folks tend to A/B which 30s lands best on socials / shop. Keeping the takes lets us change the public sample without re-rendering.

Phase 3 — open questions:
- Word-stamped previews? Not now — keep the trim time-based.
- Auto-suggest the loudest 30s (RMS analysis) as a starting position. Nice-to-have.

## Quality ladder — low-bandwidth fallback for masters (deferred)

When a fan is on weak signal, drop to a smaller file. Industry-standard ladder:

- **Hi**: original master (FLAC / WAV / 320 kbps MP3) — current `audioUrl`.
- **Mid**: 192 kbps AAC — default playback on good Wi-Fi / LTE.
- **Lo**: 64 kbps HE-AAC — emergency fallback on weak/expensive connections.

Plan:
- On master upload, server kicks off two background ffmpeg encodes (mid + lo) into the same storage bucket, paths `…/mid.m4a` and `…/lo.m4a`.
- Schema: `songs.audioUrlMid: text | null`, `songs.audioUrlLo: text | null`. Or a structured `songs.audioVariants: jsonb` if we expect more rungs.
- Player: pick rung based on `navigator.connection.effectiveType` + a manual quality picker in Settings ("Auto · High · Standard · Data Saver"). Apple Music has the same toggle.
- Pre-cache the mid rung in IndexedDB for downloaded / favorited tracks (covers the offline-on-flight case).

Open: do this **after** preview clips ship — same ffmpeg pipeline, so we want to design the encoding worker once.

## Desktop / iPad consumer player — anatomy lives in the admin Tracks-tab dock

The mobile fan player is shipped. The **desktop + iPad consumer player** is still ahead of us. Decision: don't redraw player vocabulary for that surface — **lift it from the admin Tracks-tab bottom dock** (`artifacts/mockup-sandbox/.../admin-tracks-mode/Seamless.tsx → BottomDock`). That dock is being designed with full Apple-Music parity (transport left, thumb + title + inline scrubber center, volume + lyrics on the right, fully-rounded pill, no white circle on Play) even though admin doesn't strictly need every piece. The extra anatomy isn't waste — it's the consumer player learning to walk inside an admin tool first.

When the desktop/iPad player ships, graduate the dock as a primitive into `client/src/components/ui/PlayerDock.tsx`, fan-side features (queue, AirPlay, true volume binding, full-screen lyrics overlay) layer on top of the same skeleton. Anything we get wrong here is wrong twice — get it right once.

## DDEX alignment — Layers 1 & 2 (pinned, deferred)

Two low-cost, no-disruption steps to execute when the moment is naturally right. **Not refactors** — these slot in when the relevant code is *first* being written. After both, we can truthfully say "MEAD and PIE compliant" in any label meeting. Everything else (ERN export, schema rebuilds, DSR/RDR/MWN) is deferred until a specific distributor/label deal demands it (that's a DDEX Implementation Licence + 1–2 weeks of real engineering).

### Layer 1 — MEAD `ContributorRole` codes as backing values for the role catalog

UI labels stay whatever they are; **the string constants stored in the data layer should be DDEX MEAD `ContributorRole` codes**. Map into our three existing buckets:

**SONG (compositional)** — `Composer`, `ComposerLyricist`, `Lyricist`, `Author`, `MusicArrangeur`, `LyricAdapteur`, `Translator`

**PERFORMANCE (artist/recorded performance)** — `MainArtist`, `FeaturedArtist`, `Conductor`, `Soloist`, `Orchestra`, `Choir`, `Actor`, `Dancer`, `DJ`, `Narrator`, `AssociatedPerformer`

**PRODUCTION (studio/technical)** — `Producer`, `Executive Producer`, `AssociatedEngineer` (Engineer), `MixingEngineer`, `MasteringEngineer`, `RecordingEngineer`, `SoundEngineer`, `StudioPersonnel`, `Programmer`, `Editor`. `AssociatedPerformer` can dual-map here for session musicians.

No UI changes. No schema migration. Just swap the string constants in the role catalog/enum when the opportunity naturally arises.

### Layer 2 — ISNI + IPI columns on `people` (PIE compliance)

When the `people` table gets built (it's already in the data shape above), add two nullable text columns from day one — zero UI cost, no validation required at that stage:

```ts
isni: text("isni"),   // International Standard Name Identifier — 16-digit (performers)
ipi:  text("ipi"),    // Interested Parties Information — 9 or 11-digit CAE/IPI (songwriters/publishers)
```

Lets us answer "are your artist records ISNI-linked?" with yes, and future-proofs payout de-duplication (two "James Walsh" entries resolve cleanly).

### What we are NOT doing yet

- **No ERN export** — deferred until a specific distributor or label deal requires it.
- **No rebuilding the Drizzle schema around DDEX vocabulary natively** — internal types stay clean, DDEX translates at the boundary on import/export.
- **No other DDEX standards** (DSR, RDR, MWN).
