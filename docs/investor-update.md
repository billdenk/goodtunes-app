# GoodTunes® — Investor Update

*Updated May 21, 2026.*

> **See also:** [`sales/investor-one-pager.md`](./sales/investor-one-pager.md) — the shorter, scannable one-pager Nick sends to investors, organized around integrations + features and the benefit each one unlocks. This update letter is the longer narrative; the one-pager is the at-a-glance version.

GoodTunes is a fan-first music player built around the idea that a song is a **structured object** — audio, lyrics, credits, and the gear behind it — not just an MP3. Fans buy albums directly from the artist, listen in an Apple-Music-quality player on web (and soon native), and discover the musicians, instruments, and brands behind every track. Artists get richer credits, a real listening relationship with their fans, and a new affiliate revenue stream through the gear they actually use.

This page is the one-pager: what's live, what's landing in the next sprint or two, and where we're headed.

---

## Shipped today

What fans and operators can actually do right now.

### Player
- **Apple-Music-quality fan player on the web.** Browse the library through three lenses — Albums, Songs, Artists — with fast search, sort, shuffle, queue (Play Next / Play Last), favorites (heart songs, star artists), and an auto-built Favorites playlist that mixes hearted songs with everything by starred artists.
- **GoodSync™ synced lyrics.** Lyrics scroll in time with the song in an Apple-Music-style overlay, with the active line in focus and surrounding lines softly blurred; tapping any line seeks the song to that lyric. The chorus finder can snap the 30-second preview window to the song's hook automatically.
- **Artist-set 30-second previews.** Every track carries a precision-trimmed preview window the artist places visually against the waveform, so any teaser — search result, share card, free-tier sample — leads with the artist's chosen moment.
- **SuperCredits™.** Per-track credits that go far beyond a writer list — every performer, the specific instrument on that take (down to "1973 Martin D-28"), tuning notes, and tappable affiliate links to buy the gear. Artists keep the lion's share of any sale.
- **GoodDeed certificates, shares, and gifts.** Every purchase mints a numbered digital certificate the fan can share on social, gift to a friend with a one-tap claim link, or carry alongside a physical vinyl. Shares carry the buyer's username and serial number.
- **Encrypted adaptive streaming.** Masters never leave our infrastructure as a downloadable file — each play mints a short-lived, user-bound token and audio is delivered as encrypted adaptive-bitrate segments. Same delivery model used by HBO Max and Robinhood.

### Catalog & SuperCredits™
- **Catalog as a graph.** Vendors, Artists, Gear, Manufacturers, and Labels are all first-class entities that link to every other. Tap a guitar inside a song's credits and you land on its vendor's page; tap the vendor and you see every artist on GoodTunes who plays their gear.
- **Dropbox album ingestion.** Operators paste a single Dropbox folder link and GoodTunes pulls in the full album in one pass — audio masters, lyric files, bonus images and videos. What used to be hours of manual upload becomes minutes.
- **Paste-a-URL entity creation.** To add a new vendor or label, operators paste the company's website and GoodTunes scrapes name, domain, and logo automatically, warning if a duplicate is already in the catalog.
- **Artist-profile creation from Search.** When an operator searches for an artist who isn't in the catalog yet, GoodTunes can build the profile in place — biography, photo, and metadata pulled from trusted music sources — and immediately wire it into albums, credits, and search.

### Commerce & Partners
- **Direct in-player checkout.** Stripe Embedded Checkout sells album bundles (digital + optional vinyl, merch, signed copies) right inside the player. The album unlocks the instant payment clears, the buyer's GoodDeed serial is assigned, and refunds reverse cleanly. Stripe Connect powers artist and label payouts.
- **Shopify Bundle integration.** Labels and artists already selling physical product on Shopify can bundle GoodTunes digital access into the same checkout — no plugin to install. After the buyer pays on the label's store, GoodTunes unlocks the album for the email on the order, mints a one-time redemption code, and drops the fan into a branded redeem page that already knows their name.
- **Pressing-plant & fulfillment partners as first-class entities.** Plants and fulfillment warehouses live in the admin alongside artists and labels, with contact info, specialties, and turnaround times — the foundation for the in-app RFQ flow that lets GoodTunes invite multiple plants to bid on a print run.

### Platform & Integrations
- **Dual sign-in shells, one product.** Fans sign in on `my.goodtunes.music`; operators sign in on `admin.goodtunes.music`. The same human can hold both with the same email without the two ever colliding. Admin sign-in always requires a second factor (one-time email code by default, with an option to switch to an authenticator app).
- **Operator surface built like a Mac app.** A clean white-and-slate admin distinct from the dark fan player, with grid/list toggles on every index page (Albums, People, Gear, Vendors, Labels) and one-tap "back to where you came from" crumbs as operators pivot between related entities.
- **Integrations live in production.** Replit Object Storage for every operator-uploaded asset, OpenAI across the operator-facing AI tools, ElevenLabs powering the lyric workflows (transcription + word-level alignment + diff), Mux for encrypted adaptive streaming, Spotify for canonical metadata enrichment, Stripe + Stripe Connect for checkout and payouts, Shopify for the bundle flow, and Google + Apple Sign-In wired up on the auth surface.

---

## In flight (next sprint or two)

Work currently in the queue, grouped by theme. Each line describes what fans or operators will be able to do once it lands.

**Auth & accounts.** Apple Sign-In moves from "button is live" to "button actually works" — we're swapping in a real PKCS#8 signing key, capturing a deliverable email when Apple returns a private-relay address, and hardening the admin sign-in flow with real email delivery for one-time codes, cross-site request protection on security settings, and an end-to-end test pass before we hand admin access to label partners. The fan-account tables get applied to production on the next publish so customer sign-up can ship.

**Admin & CMS polish.** The filter strip that already makes Albums fast to triage extends to People, Gear, Vendors, and Labels, so operators can slice the whole catalog the same way everywhere. Cross-entity navigation gets a smarter back button — if you arrived at a piece of gear from a vendor's page, "back" returns you there instead of to a generic index. Admin preview surfaces stay in lock-step with the real fan app so what an operator sees is what fans will see. And every album gains an at-a-glance view of its Shopify and GoodTunes distribution status, so operators can answer "where is this record actually available?" without opening three tabs.

**Ingestion & catalog quality.** Large audio masters get a visible progress bar during upload so operators aren't guessing whether a multi-hundred-megabyte master is stalled. Per-song credits can be imported directly from a Dropbox link alongside audio and art. Bonus videos brought in by previous imports get their source URLs backfilled so we can re-fetch or re-link them cleanly. Direct file uploads (not just URL imports) auto-extract a still frame for thumbnails, and oversized masters auto-shrink to the working size GoodSync needs for lyric alignment. PDF imports of liner notes stop accidentally getting parsed as lyrics, and online-lookup failures explain themselves instead of erroring silently.

**Commerce & partners.** GoodDeed serial numbering gains a real uniqueness guarantee plus a retry loop, so two simultaneous purchases can never collide on the same number even under heavy launch-day traffic.

**Customer experience.** The fan profile picks up Orders and Library summary cards so a returning fan sees their purchases and library size at a glance. New fans land in a streaming-mentality onboarding experience — an "empty shelf" welcome that explains how a GoodTunes library is built one album at a time, rather than dumping them onto an empty grid.

---

## Near-term roadmap

The bigger bets queued behind the in-flight sprint.

- **LCID (Listener Counts & Insights Dashboard).** Artist- and label-facing analytics — top fans, completion rates, geographic heat maps, and SuperCredits™ vendor-link conversion — turning the play stream into a real story we can hand to artists.
- **Native mobile app (React Native).** A ~6–10 week port of the existing player to one shared React Native codebase across iOS and Android, with true lock-screen, CarPlay, and Android Auto support. Same product fans use on the web, in their pocket.
- **DRM ladder.** Step up from today's signed adaptive streaming to full Widevine + FairPlay + PlayReady encrypted HLS via a license server — the Spotify-Web-grade baseline that lets us sign bigger catalogs.
- **Micro-Sponsorships economics.** Turn SuperCredits™ from a feature into a revenue stream — affiliate-link revenue split where artists keep the lion's share and richer credit notes (tuning, why this guitar for this take) earn a bumped share. Pays artists for the storytelling work fans actually want.
- **Artist upload portal.** A self-serve surface where artists deliver masters, artwork, and SuperCredits™ metadata into a review queue, with the dual-pass lyric auto-sync editor (ElevenLabs Scribe + Forced Alignment, diffed for review) bolted onto the same step.
- **Streaming-service handoff.** Fans pick their preferred streaming service once at onboarding. When an album they bought on GoodTunes lands on Spotify / Apple Music / Qobuz / Tidal / Deezer, we surface a one-tap deep-link to their chosen service — sell first, then stream.
- **In-app pressing-plant RFQ.** Use the pressing-plant entities already in the admin to invite multiple plants to bid on a print run, with the manufacturing package (cut masters, label art, sleeves, inserts, hype sticker, GoodDeed print spec) generated and zipped on demand.
- **Multi-tenant orgs.** One auth system, five principals — fans, internal staff, artists, labels, manufacturers — with scoped visibility into the same admin shell. Labels see their roster, artists see their albums, manufacturers see only the runs assigned to them.
- **muso.ai evaluation.** Pull a baseline of credits from muso.ai's developer API at ingest time, then let artists override and enrich (especially the per-instrument note + vendor link, which muso.ai won't have).

---

## What we'd love feedback on

- Where would investor and label conversations most want to see us push next — the artist analytics dashboard (LCID), the native mobile app, or the Micro-Sponsorships revenue layer on top of SuperCredits™?
- How important is a verified-artist identity layer to the partners you talk to — is "this is really the artist" worth gating outreach features behind, or is fan-side experience the higher-leverage place to spend the next quarter?
- Is the Shopify Bundle path (we ride alongside an existing label store) or the direct in-player checkout (fans buy on GoodTunes itself) the more compelling on-ramp for the labels and artists in your network?
- Anything in the "shipped today" list that surprises you — capabilities you didn't realize were already live, or that you'd want to see demoed in more depth before the next conversation?
