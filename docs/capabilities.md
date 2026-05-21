# GoodTunes® — Capabilities

A living, investor-facing catalog of what GoodTunes has actually shipped. Read this when you need to speak to investors, partners, or labels about the product as it exists today — not what's on the roadmap. For future-phase plans and deep-dives, see [`roadmap.md`](./roadmap.md).

## What GoodTunes is

GoodTunes® is a fan-first music player built around the idea that a song is a **structured object** — audio, lyrics, credits, and the gear behind it — not just an MP3. Fans buy albums directly from the artist (no streaming-service middleman), listen in an Apple-Music-quality player on web and (soon) native, and discover the musicians, instruments, and brands behind every track. Artists get richer credits, a real listening relationship with their fans, and a new affiliate revenue stream through the gear they actually use.

---

## Platform capabilities

The things that make GoodTunes more than another player.

- **Dynamic cross-linking across the catalog.** Every Vendor, Artist, Gear item, and Label is a first-class entity that links to every other. Tap a guitar inside a song's credits and you land on its vendor's page; tap the vendor and you see every artist on GoodTunes who plays their gear. The catalog acts like a graph, not a list of files.
- **Dropbox album ingestion.** An operator pastes a single Dropbox folder link and GoodTunes pulls in the full album — audio masters, lyric files, and bonus images and videos — in one ingest pass. What used to be a multi-hour manual upload becomes a few minutes.
- **Preview slider.** Every track carries a precision-trimmed 30-second preview window the artist sets visually against the waveform. Fans hear the artist's chosen hook anywhere a preview plays — search, share cards, free-tier teasers — instead of a hard-cut first 30 seconds.
- **GoodSync™ synced lyrics.** Lyrics scroll in time with the music in the Apple-Music-style overlay, with the active line in focus and surrounding lines softly blurred. Tapping any line seeks the song to that lyric — fans navigate the song by what's being sung, not by a timecode.
- **Chorus finder.** GoodTunes can identify a song's chorus from its lyric structure and audio, so previews and share cards default to the part of the song that hooks people fastest.
- **SuperCredits™.** Per-track credits that go far beyond Apple's writer-only list — every performer, the specific instrument they played on that take (down to "1973 Martin D-28"), tuning notes, and tappable affiliate links to buy the gear. Artists keep the lion's share of any sale. Credits turn into a real revenue stream, and a fan-discovery surface no other player offers.
- **Artist-profile creation from Search.** When an operator searches for an artist who isn't in the catalog yet, GoodTunes can create their profile in place — pulling biography, photo, and metadata from trusted music sources — and the new profile is immediately wired into albums, credits, and search.

## Player features

What fans actually see and do.

- **View Songs / View Artists.** Browse the library as albums, as songs, or as artists — three lenses on the same catalog.
- **Search.** Fast search across albums, songs, and artists, with album art and artist photos inline.
- **Filter across every category.** Filter albums, songs, artists, gear, vendors, and labels by the attributes that matter for each — surface "albums I've favorited," "artists from this label," "gear from this vendor," all from the same control.
- **Shuffle.** One-tap shuffle on any album, playlist, or auto-collection.
- **Favorite.** Heart a song or star an artist. Favorited artists' songs roll into the auto-built Favorites playlist (see below).
- **Playlists, including an auto-playlist from favorites.** Fans build their own playlists, and a virtual "Favorites" playlist is maintained automatically — favorited songs plus every song by a favorited artist, deduped, freshest first.
- **Play Next / Play Last.** Queue any song to play immediately after the current track, or drop it at the end of the queue.
- **GoodDeed sharing.** Fans can share a song by name and username over social and email with a branded GoodDeed card — every share carries the fan's identity so artists see who's spreading the word.
- **Usernames.** Every fan has a public username that travels with their shares, playlists, and (soon) listening insights.
- **Encrypted adaptive streaming with per-session tokens.** Masters never leave our infrastructure as a downloadable file. Each play request mints a short-lived, user-bound token, and audio is delivered as encrypted adaptive-bitrate segments — Spotify-Web-grade leak resistance, while letting fans listen instantly on any connection.

## Admin / CMS

The operator surface that powers the catalog.

- **Artists.** Full CRUD for artist profiles — photo, biography (filtered for legal-issue and controversy content), and the credits and albums they appear on.
- **Vendors.** Manufacturers, retailers, and luthiers who sell the gear featured in SuperCredits™. Each vendor carries a logo, cover image, location, tagline, and affiliate URL.
- **Gear.** The instruments themselves — guitars, basses, drums, mics, pedals — with photos, artist notes, and the vendors that sell them.
- **Manufacturers / Labels.** Record labels and instrument manufacturers, with their own catalog of associated albums and gear.
- **Cross-section deep-link UX.** When an operator pivots from one entity to a related one — Gear to its Vendor, Person to their Gear — the destination remembers where they came from and offers a one-tap return crumb. Browsing the catalog feels like reading a wiki, not navigating a folder tree.
- **Paste-a-URL entity creation.** To add a new vendor or label, an operator pastes the company's website. GoodTunes scrapes the name, domain, and logo automatically and warns if the entity is already in the catalog — onboarding a new brand takes seconds, and duplicates are caught at creation.
- **Grid / list toggle.** Every admin index page (Albums, People, Gear, Vendors, Labels) carries an Apple-Music-style segmented control to switch between a visual grid and a scannable list. Preference persists per section.

## Integrations

The third-party services GoodTunes already runs against in production.

- **OpenAI.** Powers operator-facing AI tools across the admin — biography drafting, content suggestion, structured metadata extraction — so the catalog can be built quickly with the artist's voice intact.
- **ElevenLabs.** Voice-AI engine behind GoodTunes' lyric workflows — transcribes vocals from a master and aligns artist-supplied lyrics word-by-word, so synced lyrics ship without weeks of manual timing.
- **Mux.** Encrypted, adaptive-bitrate streaming with per-session signed tokens — masters never leave our infrastructure as a downloadable file. Same delivery model used by HBO Max and Robinhood.
- **Spotify.** Used at the catalog level to enrich albums, artists, and tracks with the canonical metadata fans recognize — release dates, artwork, identifiers — without depending on Spotify for playback.
- **GitHub.** Source of truth for every line of GoodTunes code, with automated checks on every change — engineering velocity stays high while production stays safe.
- **Apple Sign-In.** Apple ID is wired as a first-class login option for fans on iOS-heavy devices (final activation is gated on a production signing key).
- **OrderDesk.** Order routing and fulfillment for the physical side of GoodTunes — vinyl, merchandise, and bundle deliveries flow through OrderDesk to the right warehouse automatically.
- **Google Sign-In.** Fans and admins can sign in with their Google account — one tap, no password.
- **Shopify Bundle.** Labels and artists who already sell physical product on Shopify can bundle GoodTunes digital access into the same checkout. After the buyer pays on the label's store, our app unlocks the album for the email on the order, mints a one-time redemption code, and adds a "Get your music now" button to both the order-status page and the confirmation email. The fan lands on a branded redeem page that already knows their name, sets a password (or signs in if they already have GoodTunes), and drops straight into the player with their GoodDeed number assigned. Refunds reverse the unlock automatically. Operators connect a label's store from our admin in two clicks — no plugin to download — and each album's admin Shopify tab maps the physical product (or specific variant) to the digital release.

---

## Coming next

Wired in design and on the near-term roadmap, but not yet shipped to fans:

- **Stripe.** Direct in-player checkout for albums, merchandise, and tipping.
- **LCID (Listener Counts Insights Dashboard).** Artist- and label-facing listening analytics — top fans, completion rates, geographic heat maps, and SuperCredits™ vendor-link conversion.

---

## How to keep this current

When a project task that ships a customer-visible capability merges, add or update its line here. This doc is the deck-grade reference Nick reads from when pitching, so it has to stay honest about what fans can actually do today. Anything still in design or behind a feature flag belongs in [`roadmap.md`](./roadmap.md), not here.
