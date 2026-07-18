# GoodTunes® — Investor Overview

*Updated July 2026. All capabilities below are live in the platform today.*

GoodTunes is a fan-first music platform that treats every song as a structured object — audio, synced lyrics, per-track credits, and the gear behind it. Fans buy albums directly from artists (no streaming-service middleman), listen in an Apple-Music-quality player, and discover the musicians, instruments, and brands behind every take. Artists get a richer relationship with their fans, a real revenue stream from gear they already use, and tools that make releasing vinyl as easy as uploading a Dropbox folder.

---

## For Fans

- **Apple-Music-grade player** — animated equalizer, GoodSync™ scrolling lyrics, tap-any-line seek, full-screen lyric overlay
- **Background audio + lock-screen controls** — music keeps playing when the phone locks; artwork, song, and artist all appear on the lock screen (native-grade, no app required)
- **Buy direct** — in-player Stripe checkout for digital + vinyl + merch bundles; album unlocks the instant payment clears
- **GoodDeed certificates** — every purchase mints a numbered, signed, QR-verified certificate; fans share it, gift it, or print it
- **Orders page with live tracking** — fulfillment pill from "Awaiting" to "Delivered," carrier + tap-to-track link, colored vinyl disc matching what ships
- **Personalized library** — Favorites playlist auto-built from hearted songs and starred artists, playlists, gear bookmarks, Play Next / Play Last

## For Artists & Labels

- **Stripe-grade dashboards** — KPI strips, revenue + plays charts, country heat maps, top-track tables, CSV export; label view covers the full roster
- **SuperCredits™** — per-track credits down to "1973 Martin D-28" with tappable affiliate links; artists earn a share of every gear sale their credits drive
- **GoodSync™ synced lyrics** — ElevenLabs transcribes and aligns word-by-word; a chorus finder snaps previews to the hook automatically
- **Dropbox ingestion** — paste one folder link, pull masters + lyrics + bonus media in one pass
- **Profit-aware pricing** — live "you earn $X.XX per unit" readout; fixed-run caps hold at checkout so artists are never on the hook for more prints than they committed to
- **Break-even calculator** — artists and operators see exactly how many units to sell to cover manufacturing + platform costs before committing to a run
- **Per-album NPO donation split** — artists can route up to $1/unit across up to 4 non-profits on any release, wired into payout accounting

## For Partners (Presses, Non-Profits, Publishers)

- **Press portal** — presses configure their own vinyl color catalogs, format tiers, and per-quantity price ladders; GoodTunes computes live quotes against the real ladder
- **NPO referral program** — non-profits earn $1/unit (or $1.50 in charity-bonus mode) on every paid order from artists they brought in; monthly Stripe Connect payouts with dry-run preview and one-click batch run
- **Multi-level invite trees** — artists, NPOs, and presses each have a referral subtree with a super-admin visualiser showing per-node paid units and pending payouts
- **Publisher portal** — publishers log in to see their own royalty statements and connect their Stripe payout account directly, without involving GoodTunes ops
- **Nightbirde launch storefront** — `store.goodtunes.music` is live as GoodTunes' first branded artist storefront, proving the white-label path for partners

## The Infrastructure

- **12 production integrations:** Mux (encrypted streaming), Stripe + Connect (checkout + payouts), Shopify (bundle redemption), OrderDesk (fulfillment), OpenAI (catalog AI — GPT-5 mini), ElevenLabs (lyric sync), Spotify (metadata enrichment), Google Sign-In, Apple Sign-In, Resend (transactional email), Replit Object Storage, GitHub (CI + source control)
- **Deep links wired** — Universal Links (iOS) and App Links (Android) verified; native app links resolve correctly when the Capacitor shell ships
- **Encrypted adaptive streaming** — every master delivered through Mux with per-session signed tokens; same model used by HBO Max and Robinhood

## By the Numbers

| | |
|---|---|
| **Automated tests** | 613 across 72 test files — re-run on every change so nothing that works can silently break |
| **Quality gates** | 6 run on every change: test suite, design linter, schema-drift check, DB-query smoke, and two app-build guards — all green |
| **Production integrations** | 12 |
| **Shipped improvements** | 1,200+ discrete, reviewed, tested changes merged into the platform |

*The automated tests are not manual QA — they are code checks that run automatically on every single change. The strength is that a thousand-plus improvements have each been validated against the same 600+ critical-path checks, for free, every time.*

## What's Next

- **LCID dashboards** — listener insights (completion rates, top fans, geo heat maps) for artists and labels
- **Shopify App Store listing** — GoodTunes listed as an installable app for any label already on Shopify
- **Streaming-service handoff** — fan discovery flows that hand off to Apple Music / Spotify for listeners who don't buy
- **Capacitor native app** — the web shell is native-ready; lock-screen controls and deep links are already wired

---

*GoodTunes is live, actively selling, and being pitched to pressing plants, labels, and non-profits now. Every number above is from the working platform, not a prototype.*

---

*How to keep this current: when a project task ships a customer-visible capability, update the matching section here in the same change-set. Refresh the "By the Numbers" counts whenever the test count or integration count meaningfully changes. Roadmap items belong in `docs/roadmap.md`, not here.*
