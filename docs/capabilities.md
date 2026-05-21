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
- **Chorus finder.** GoodTunes can identify a song's chorus from its lyric structure and audio and offer to snap the 30-second preview window to it, so previews and share cards default to the part of the song that hooks people fastest.
- **SuperCredits™.** Per-track credits that go far beyond Apple's writer-only list — every performer, the specific instrument they played on that take (down to "1973 Martin D-28"), tuning notes, and tappable affiliate links to buy the gear. Artists keep the lion's share of any sale. Credits turn into a real revenue stream, and a fan-discovery surface no other player offers.
- **Artist-profile creation from Search.** When an operator searches for an artist who isn't in the catalog yet, GoodTunes can create their profile in place — pulling biography, photo, and metadata from trusted music sources — and the new profile is immediately wired into albums, credits, and search.
- **Dual sign-in shells, one product.** Fans and operators sign in through completely separate accounts on `my.goodtunes.music` and `admin.goodtunes.music` — the same human can hold both with the same email without the two ever colliding. Admin sign-in always requires a second factor (one-time code by email by default, with an option to switch to an authenticator app).

## Player features

What fans actually see and do.

- **View Albums / Songs / Artists.** Browse the library through three lenses on the same catalog, with album art and artist photos inline.
- **Search and sort.** Fast search across albums, songs, and artists from a single field at the top of the library, with sort by artist or title.
- **Shuffle.** One-tap shuffle on any album, playlist, or auto-collection.
- **Favorite.** Heart a song or star an artist. Favorited artists' songs roll into the auto-built Favorites playlist (see below).
- **Playlists, including an auto-playlist from favorites.** Fans build their own playlists, and a virtual "Favorites" playlist is maintained automatically — favorited songs plus every song by a favorited artist, deduped, freshest first.
- **Gear bookmarks.** Fans can bookmark any piece of gear they spot inside SuperCredits™ — the guitar they noticed on track 3 lives in a dedicated Bookmarks page in their account, one tap away later.
- **Play Next / Play Last.** Queue any song to play immediately after the current track, or drop it at the end of the queue.
- **GoodDeed sharing.** Fans can share a song by name and username over social and email with a branded GoodDeed certificate — every share carries the fan's identity, the unique GoodDeed serial number for that copy of the album, and a record of the purchase.
- **GoodDeed gifting.** Any paid order can be turned into a gift with a shareable claim link — the recipient opens the link, signs in or signs up, and the album drops into their library with their name on the GoodDeed certificate.
- **Usernames.** Every fan picks a public username at sign-up that travels with their shares, playlists, and (soon) listening insights.
- **Vendor chat (demo).** A Chat tab in the player lets a fan open a thread with the vendor behind any piece of gear directly from its credit row — the instrument is auto-attached as a preview card so the conversation starts in context. Today this is a working demo of the UX (threads live on-device, replies are canned); real vendor accounts and live routing are scoped for the next phase.
- **Orders page.** Fans see every album they've purchased, their GoodDeed numbers, and the status of any physical product (vinyl, merch) in one place.
- **Encrypted adaptive streaming with per-session tokens.** Masters never leave our infrastructure as a downloadable file. Each play request mints a short-lived, user-bound token, and audio is delivered as encrypted adaptive-bitrate segments — Spotify-Web-grade leak resistance, while letting fans listen instantly on any connection.

## Admin / CMS

The operator surface that powers the catalog.

- **Artists.** Full CRUD for artist profiles — photo, biography (filtered for legal-issue and controversy content), and the credits and albums they appear on.
- **Vendors.** Manufacturers, retailers, and luthiers who sell the gear featured in SuperCredits™. Each vendor carries a logo, cover image, location, tagline, and affiliate URL.
- **Gear.** The instruments themselves — guitars, basses, drums, mics, pedals — with photos, artist notes, and the vendors that sell them.
- **Manufacturers / Labels.** Record labels and instrument manufacturers, with their own catalog of associated albums and gear.
- **Pressing-plant & fulfillment partners.** Pressing plants and fulfillment warehouses are first-class entities in the admin — each with contact info, location, specialties (e.g. "180g black", "splatter"), standard turnaround time, and a default fulfillment partner per plant. Foundation for the in-app RFQ flow that lets GoodTunes invite multiple plants to bid on a print run.
- **Album bundle catalog.** Operators set per-album price, configure add-ons (vinyl variants, merch, signed copies), and map physical SKUs to the digital release — the same record powers both direct GoodTunes checkout and Shopify-bundle redemption.
- **Album engagement view.** Per-album orders, GoodDeed serials issued, and refund/void state, so operators can see at a glance how a release is performing.
- **Cross-section deep-link UX.** When an operator pivots from one entity to a related one — Gear to its Vendor, Person to their Gear — the destination remembers where they came from and offers a one-tap return crumb. Browsing the catalog feels like reading a wiki, not navigating a folder tree.
- **Paste-a-URL entity creation.** To add a new vendor or label, an operator pastes the company's website. GoodTunes scrapes the name, domain, and logo automatically and warns if the entity is already in the catalog — onboarding a new brand takes seconds, and duplicates are caught at creation.
- **Grid / list toggle.** Every admin index page (Albums, People, Gear, Vendors, Labels) carries an Apple-Music-style segmented control to switch between a visual grid and a scannable list. Preference persists per section.
- **Light admin theme.** The operator surface uses a clean white-and-slate Mac-app skin, distinct from the dark fan player — same brand vocabulary, denser layout for getting work done.
- **2FA-protected admin sign-in.** Every admin sign-in requires a second factor — by default a one-time code emailed to the admin, with an option to switch to an authenticator-app TOTP enrollment and scrypt-hashed recovery codes. Super-admin grant and revoke are gated to existing super-admins from inside the app.

## Integrations

The third-party services GoodTunes already runs against in production.

- **Replit Object Storage.** Durable cloud storage for every operator-uploaded asset — album art, person photos, vendor logos and covers, scraped instrument images — served through stable public URLs that survive redeploys.
- **OpenAI.** Powers operator-facing AI tools across the admin — biography drafting, content suggestion, structured metadata extraction, and SuperCredits™ enrichment — so the catalog can be built quickly with the artist's voice intact.
- **ElevenLabs.** Voice-AI engine behind GoodTunes' lyric workflows — transcribes vocals from a master and aligns artist-supplied lyrics word-by-word, then diffs the two so the artist can confirm or correct any mismatches before publishing. Synced lyrics ship without weeks of manual timing.
- **Mux.** Encrypted, adaptive-bitrate streaming with per-session signed tokens — masters never leave our infrastructure as a downloadable file. Same delivery model used by HBO Max and Robinhood. New uploads ingest into Mux automatically, and a startup sweep brings any pre-Mux masters into the pipeline.
- **Spotify.** Used at the catalog level to enrich albums, artists, and tracks with the canonical metadata fans recognize — release dates, artwork, identifiers — without depending on Spotify for playback.
- **GitHub.** Source of truth for every line of GoodTunes code, with automated checks on every change — engineering velocity stays high while production stays safe.
- **Google Sign-In.** Fans and admins can sign in with their Google account — one tap, no password.
- **Apple Sign-In.** Apple ID is wired as a first-class login option for fans on iOS-heavy devices, including capture of a real deliverable email when Apple returns a private-relay address. Final activation is gated on swapping in a real PKCS#8 signing key.
- **Stripe.** Direct in-player checkout for album bundles (digital + optional vinyl, merch, add-ons) runs on Stripe Embedded Checkout. Webhook-driven order fulfillment unlocks the album the instant payment clears, assigns the buyer's GoodDeed serial number, and reverses cleanly on refund. Stripe Connect powers artist and label payouts when an order is marked fulfilled.
- **Shopify Bundle.** Labels and artists who already sell physical product on Shopify can bundle GoodTunes digital access into the same checkout. After the buyer pays on the label's store, our app unlocks the album for the email on the order, mints a one-time redemption code, and adds a "Get your music now" button to both the order-status page and the confirmation email. The fan lands on a branded redeem page that already knows their name, sets a password (or signs in if they already have GoodTunes), and drops straight into the player with their GoodDeed number assigned. Refunds reverse the unlock automatically. Operators connect a label's store from our admin in two clicks — no plugin to download — and each album's admin Shopify tab maps the physical product (or specific variant) to the digital release.

---

## Coming next

Wired in design and on the near-term roadmap, but not yet shipped to fans:

- **Apple Sign-In activation.** The OAuth flow is live; the final piece is dropping a real PKCS#8 private key in place of the current placeholder so the button is no longer inert.
- **Admin filters for People, Gear, Vendors, and Labels.** Albums already filter by type, year, genre, and explicit flag — extending the same control to the other four index pages is in flight.
- **Customer Orders + Library cards on the Account profile.** A dedicated Orders page already exists; the Account page is gaining at-a-glance cards that summarize purchases and library size.
- **Upload progress for large audio masters.** Direct master upload is shipped; the visible progress bar for multi-hundred-MB uploads is next.
- **OrderDesk routing.** Order-routing rules and warehouse handoff for physical fulfillment are scoped against OrderDesk; today, fulfillment is driven by Stripe webhooks and the admin Orders surface.
- **LCID (Listener Counts Insights Dashboard).** Artist- and label-facing listening analytics — top fans, completion rates, geographic heat maps, and SuperCredits™ vendor-link conversion.

---

## How to keep this current

When a project task that ships a customer-visible capability merges, add or update its line here. This doc is the deck-grade reference Nick reads from when pitching, so it has to stay honest about what fans can actually do today. Anything still in design or behind a feature flag belongs in [`roadmap.md`](./roadmap.md), not here.
