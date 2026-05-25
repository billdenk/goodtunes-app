# GoodTunes® — Investor One-Pager

*Updated May 22, 2026.*

**GoodTunes is a fan-first music player that treats every song as a structured object — audio, synced lyrics, per-track credits, and the gear behind it — so fans buy direct from artists, listen in an Apple-Music-quality experience, and discover the people, instruments, and brands behind every take.**

---

## Integrations live in production

The third-party services GoodTunes already runs against, and what each one unlocks.

- **Mux** — Encrypted adaptive-bitrate streaming with per-session signed tokens; masters never leave our infrastructure as a downloadable file. Same delivery model used by HBO Max and Robinhood.
- **Stripe + Stripe Connect** — In-player album-bundle checkout (digital + vinyl + merch + signed copies) that unlocks the album the instant payment clears, plus automated artist and label payouts.
- **Shopify Bundle** — Labels already selling physical product on Shopify bundle GoodTunes digital access into the same checkout, with no plugin and no developer — the fan lands on a label-branded redeem page that already knows their name.
- **OrderDesk** — Every paid physical order (vinyl, cassette, CD, signed certificate, bundled merch) hands off to OrderDesk on payment, with signed status webhooks driving the fan's order-tracking pill from submitted through delivered.
- **OpenAI** — Powers the operator-facing AI tools: biography drafting, content suggestion, structured metadata extraction, and SuperCredits™ enrichment, so the catalog gets built fast in the artist's voice.
- **ElevenLabs** — Transcribes vocals from a master and aligns artist-supplied lyrics word-by-word, so GoodSync™ synced lyrics ship without weeks of manual timing work.
- **Spotify** — Catalog-level metadata enrichment for albums, artists, and tracks — release dates, artwork, identifiers — without depending on Spotify for playback.
- **Google Sign-In** — One-tap sign-in for fans and admins, no password to remember.
- **Apple Sign-In** — Apple ID wired as a first-class fan login on iOS-heavy devices, with deliverable-email capture when Apple returns a private-relay address (final activation pending a real PKCS#8 signing key).
- **Replit Object Storage** — Durable cloud storage for every operator-uploaded asset — album art, person photos, vendor logos and covers, scraped instrument images — on stable URLs that survive redeploys.
- **GitHub** — Source of truth for every line of GoodTunes code, with automated checks on every change so engineering velocity stays high while production stays safe.
- **PostHog** — Server-side event forwarding from our own typed event registry, giving us product analytics, funnels, and cohorts on top of the same data that powers the artist and label dashboards.

---

## Features at a glance

### Platform capabilities
- **Catalog as a graph** — Vendors, Artists, Gear, Makers, and Labels are first-class entities that link to every other, so a guitar in a credit row leads to the maker, then to every artist on GoodTunes who plays it.
- **Dropbox album ingestion** — One pasted folder link pulls masters, lyric files, and bonus images and videos in a single pass; hours of manual upload become minutes.
- **GoodSync™ synced lyrics** — Lyrics scroll in time with the song, tap any line to seek there, and a chorus finder can snap the 30-second preview window to the hook automatically.
- **SuperCredits™** — Per-track credits down to "1973 Martin D-28," with tappable affiliate links to buy the gear and the artist keeping the lion's share of any sale.
- **Encrypted adaptive streaming** — Per-play, user-bound tokens deliver encrypted segments, giving Spotify-Web-grade leak resistance with instant playback on any connection.
- **Dual sign-in shells, one product** — Fans and operators sign in through separate accounts on `my.goodtunes.music` and `admin.goodtunes.music`; admin always requires a second factor. Both shells offer a self-serve **Forgot password?** recovery (single-use, 30-minute, non-enumerating) so locked-out fans and admins reset themselves without operator help.
- **Typed product-analytics pipeline** — Every meaningful fan interaction flows through a typed event registry, enriched with device/session/user/platform/geo, and forwarded to PostHog as the foundation for every artist and label dashboard.

### Player — what fans do
- **Three lenses on one library** — Albums, Songs, Artists, with fast search, sort, and one-tap shuffle.
- **Apple-Music-density desktop album page** — 280-pixel hero, hover-to-play rose triangle, an animated equalizer on the playing row, and a slide-in lyrics panel from the bottom dock.
- **Preview slider** — Every track plays a precision-trimmed 30-second window the artist places visually against the waveform.
- **Favorites & auto-built Favorites playlist** — Heart a song or star an artist; everything by a starred artist rolls into a single auto-playlist, deduped, freshest first.
- **Play Next / Play Last & playlists** — Queue any song instantly or at the end, build personal playlists, and revisit them across sessions.
- **Gear bookmarks** — Bookmark any piece of gear spotted in SuperCredits™ for a one-tap return later.
- **GoodDeed certificates, shares, and gifts** — Every purchase mints a numbered digital certificate; fans share it with their username on social, or convert any order into a gift with a shareable claim link.
- **Real link previews** — Every shareable GoodTunes URL — albums, artists, gear, the app root — unfurls in iMessage, Slack, Twitter, and email with a proper preview card (real artwork, real title, real description). Admin URLs render a neutral `noindex` card so a mis-pasted admin link never leaks a record.
- **Printable signed GoodDeed certificates** — Optional print-and-sign add-on at checkout produces a real, artist-signed certificate with a QR-verified provenance page and live status on the Orders page.
- **Orders page with live fulfillment** — Every album the fan owns, the GoodDeed serial, and the fulfillment pill (Awaiting → Shipped → Delivered) with carrier and tap-to-track.
- **One-app shell across every fan surface** — Apple-HIG-grade 44-pixel touch targets, shared bottom-nav clearance, and a steady mini-player — ready for the upcoming Capacitor App Store wrap.

### Admin / CMS — what operators and partners do
- **Paste-a-URL entity creation** — Drop in a vendor or label website and GoodTunes scrapes name, domain, logo, cover, bio, and location, with duplicate detection at creation.
- **Makers + Resellers (split brands)** — Every vendor carries Maker and Reseller role flags; gear pages read "By Gibson" first and "Available at" second.
- **Per-track credits import from Dropbox** — Paste a link on a song's credits panel; GoodTunes reads PDFs, Word docs, or text and proposes writers, performers, and production rows pre-matched to existing People.
- **Album bundle catalog with profit-aware pricing** — Operators map physical SKUs to the digital release; artists see a live "You earn $X.XX per unit" readout on the signed-certificate add-on, with planned-quantity caps that hold at checkout.
- **2FA-protected admin sign-in & scoped invitations** — Super-admins invite teammates pre-bound to a specific artist, label, manufacturer, or fulfillment partner; the invitee lands in the right scope on first login.
- **Stripe-grade artist & label dashboards** — KPI strips, revenue charts, top-tracks tables, country panels, audience cohorts, and CSV exports — scope-enforced so a label only sees its own roster.
- **Super-admin god-view reporting** — Platform-wide GMV, conversion, refund rate, payout reconciliation, embedded PostHog funnels, and a raw event explorer on a single `/admin/reports` page.
- **Customer directory** — Read-only directory of every fan with order count, lifetime spend, addresses, owned albums, playlists, and a deep-link into the live Stripe customer.
- **Cross-section deep-link UX & grid/list toggle** — Pivot between related entities with a one-tap "back to where you came from" crumb, and view any index as a visual grid or a scannable list.
- **Light admin theme** — A clean white-and-slate Mac-app skin, distinct from the dark fan player but on the same brand vocabulary.

---

## What's next

The bets queued behind the current sprint:

- **LCID (Listener Counts & Insights Dashboard)** — Artist- and label-facing listening analytics: top fans, completion rates, geographic heat maps, and SuperCredits™ vendor-link conversion.
- **Apple Sign-In activation** — Swap the placeholder PKCS#8 key for a real one so the live button stops being inert.
- **Customer Orders + Library cards on the Account profile** — At-a-glance summary cards that put purchases and library size on the fan's profile home.
- **Upload progress for large audio masters** — A visible progress bar for multi-hundred-megabyte uploads.
- **Micro-Sponsorships economics on SuperCredits™** — Turn the affiliate gear layer into a revenue stream, with richer credit notes earning a bumped share.

---

*How to keep this current: when a project task ships a customer-visible capability, refresh the matching bullet here in the same change-set — same rule that governs [`../capabilities.md`](../capabilities.md). This is the deck-grade page Nick sends to investors, so it has to stay honest about what fans can do today. Anything still in design or behind a flag belongs in [`../roadmap.md`](../roadmap.md).*
