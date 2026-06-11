# GoodGear — feasibility & strategy brief

*Audience: Bill (and anyone he wants to share this with — an investor, a Deezer
contact, a future engineer). Plain language, honest about what's real today vs.
what would need building. This is a decision document, not a build plan — nothing
here is being built yet.*

---

## The short answer

**GoodGear is feasible, and the strategy is sound — but the thing that makes it
defensible is not the streaming data and not the app itself.** Both of those can
be copied in a weekend. The defensible asset is the **gear-per-track dataset**:
which guitar, amp, pedal, strings, mic, and console were used on a specific
recording. No streaming service sells that data, and GoodTunes is already building
it through SuperCredits™.

**Recommendation:** build GoodGear as a **second front-end on the same shared
gear/credit data layer** that already powers GoodTunes — not as a separate app
with its own copy of the data. Use streaming APIs (Deezer first, given Bill's
relationship) only for the music catalog, a popularity signal, and the
tap-to-listen handoff. Cap results with a popularity threshold so the experience
feels full from day one.

The rest of this doc backs up each of those points and answers Bill's specific
questions.

---

## 1. Where does the track data come from? Does Spotify's API allow it?

There are **two completely different kinds of "track data,"** and it's the
distinction that the whole strategy hinges on:

1. **Catalog / metadata** — title, artist, album, artwork, duration, a popularity
   score, a short preview (Deezer still offers one; Spotify deprecated its 30-second
   preview for new apps — see below), and a deep-link to open the track. Spotify and
   Deezer both provide catalog data through their APIs. ✅ This part is allowed and
   available.
2. **Gear-per-track** — which specific instruments and gear were used on *this
   recording*. ❌ **No streaming API carries this.** Not Spotify, not Deezer, not
   Apple. It simply isn't in their data model — it's not a field they have.

So you *can* pull "every song" from a streaming API, but **every one of those
songs arrives with zero gear information.** The gear has to be attached by
someone. That "someone" is the whole business.

### Where the gear annotation actually comes from (honest options)

| Source | What it gives | Caveats |
| --- | --- | --- |
| **GoodTunes SuperCredits™ (own data)** | Artists/labels fill in gear per track, with notes, tuning, and affiliate links. Highest quality, proprietary, *and* it pays the artist. | Grows one artist at a time. It's a flywheel, not a firehose. |
| **Manual curation** | A researcher fills in famous records by hand. | Accurate but slow and expensive; doesn't scale. |
| **muso.ai** (credits API) | Real credits including performers/instruments/sessions; already powers credits on some streaming services. `MUSO_API_KEY` is already reserved in our env vars for evaluation. | Credits-level, not gear-level — it won't have the exact make/model, the tuning, the personal note, or the affiliate link. Good for a *baseline* to seed from, not the finished product. Check pricing before committing. |
| **Equipboard** (community gear database) | Community-sourced "what gear does this artist use." | More artist-level than per-track, licensing/terms-of-use for reuse are unclear, and there's no clean official API. Treat as reference, not a feed. |

### The key finding, stated plainly

> **The streaming services give you the music. They cannot give you the gear.**
> The gear graph is the one thing that doesn't exist anywhere else — which is
> exactly why it's the moat.

### A note on Spotify specifically

Leaning on **Spotify as the backbone is fragile**, for two reasons:

- **They've been tightening access.** In late 2024 Spotify deprecated a batch of
  Web API endpoints for new apps — including the 30-second `preview_url` and the
  audio-features data. Building on top of endpoints they're actively pulling back
  is risky.
- **Their developer terms are restrictive** about reusing their catalog data
  inside another product. (We should confirm the current terms with Spotify
  before any launch — this brief is GoodTunes' read, not legal advice.)

**Deezer is the better primary partner.** Its API also provides catalog plus a
popularity/`rank` signal, it's friendlier for partner deep-linking, and — most
importantly — **Bill already has a relationship there.** Spotify can still be a
"open in Spotify" handoff target for fans who use it; it just shouldn't be the
data backbone.

---

## 2. Is the tap-to-listen handoff to Deezer / Spotify allowed?

**Yes — and it's the standard, legitimate pattern.** GoodGear would never stream
their audio itself. It **deep-links out**: the fan taps a track, it opens in
Deezer or Spotify, and *they* play it and pay the royalties. That's exactly how
Shazam, song.link, and every "smart link" service works. You're sending them a
listener, not copying their catalog.

**This is already partly built in GoodTunes today.** `server/lib/streamingLinks.ts`
uses the free Odesli / song.link API to take one known release and resolve its
equivalents on Deezer, Tidal, and Pandora, and we store those per-service URLs on
the release. The plumbing for "tap → open in the right service" exists.

Two honest caveats:

- **It's currently album-level.** We resolve a *release* to its streaming links,
  not each individual track. Track-level handoff is a natural extension of the
  same approach — an addition, not a rebuild.
- **Coverage gaps are real.** Odesli doesn't map Qobuz (no free source), so Qobuz
  falls back to a search link. And because Spotify deprecated inline previews,
  don't count on a 30-second clip from Spotify — the reliable path is the
  "open in app" deep-link.

**The Deezer advantage:** because Bill has a relationship there, we can likely get
a cleaner arrangement than the generic free tier — official deep-links, and
possibly attribution or affiliate terms — which is both more reliable and a
potential second revenue line.

---

## 3. Should we cap results with a listen / popularity threshold?

**Yes.** Two reasons:

- **Keep results meaningful.** Nobody searching "Les Paul" wants 400 obscure
  tracks. A threshold keeps the list to records people actually care about.
- **It makes the catalog feel curated** rather than dumped.

What to threshold *on*:

| Signal | Strength | Weakness |
| --- | --- | --- |
| **GoodTunes' own play analytics** (`play_complete`, `play_30s`) | Real, first-party, and ours. | In year one the volume is small — GoodTunes is a tethered-download model with a modest customer base. Not enough on its own to rank a global gear catalog. |
| **Streaming popularity score** (Spotify `popularity` 0–100, Deezer `rank`) | Global signal across the entire catalog, available on day one. | It's *their* number, so don't make it load-bearing (see §4). |

**Recommendation:** use the **streaming popularity score as the primary "is this
worth showing" filter** ("X listens or more"), and **layer GoodTunes' own play
data on top as it grows** — both to refine ranking and to surface
GoodTunes-exclusive records that the streaming services under-rank. Global reach
now, proprietary signal later.

---

## 4. Architecture + defensibility recommendation

**The question:** one shared gear/credit data layer feeding *both* GoodTunes and a
GoodGear front-end — or a fully separate GoodGear app with its own data?

**Recommendation: a shared data layer with two front-ends.**

**Why:**

- **The moat is the dataset, not the app.** The idea ("browse music by the gear
  used on it") and the screens can be cloned quickly. The gear-per-track graph
  cannot. Splitting the data into two copies *halves the moat and doubles the
  maintenance.*
- **Every SuperCredit compounds across both products.** A gear annotation an
  artist adds inside GoodTunes should instantly enrich GoodGear, and anything
  surfaced by GoodGear feeds right back. One source of truth makes that automatic.
- **GoodTunes already has the whole gear graph** — instruments, vendors (makers
  and resellers), per-track performer credits, and named rigs with their signal
  chains. GoodGear is a *different lens on the same tables*, not a different
  database.

**Defensibility, stated plainly for an investor:**

> A competitor can copy the idea and the screens. They **cannot** copy
> (a) the proprietary gear-per-track dataset, (b) the artist and label
> relationships that produce it, or (c) the affiliate / SuperCredits revenue loop
> that *pays artists to keep filling it in.* The more artists annotate, the wider
> the moat gets — it compounds over time. That asset lives in the data layer, so
> the data layer should stay unified.

**One caution:** don't let streaming data become load-bearing. If Spotify (or even
Deezer) revoked API access tomorrow, GoodGear should degrade to "still works,
fewer outbound links" — never to "dead." Because the core asset (the gear graph)
is ours, that's achievable: streaming is an **enrichment layer** (catalog,
popularity, deep-links), never the source of the gear truth.

---

## 5. The three discovery shapes — one dataset, queried three ways

Bill asked how the same data serves "by instrument," "by song," and "by gear."
The important point: **these aren't three datasets. They're one graph read from
three directions** — and all three already have working queries in GoodTunes
today, which is the proof that GoodGear is a re-presentation of existing data, not
a build from scratch.

**The graph in plain language:** People perform on Songs. Each performance can name
an Instrument. Instruments are made and sold by Vendors. A Song can also carry one
or more Rigs (an instrument plus its signal chain of accessories — pedals, amps,
strings). That's the whole thing.

### (a) By instrument → the songs played on it
*"Show me every song recorded on a 1973 Martin D-28."*
Walk from the instrument, through the per-track performer credits, to the songs and
their albums.
*Under the hood: `instruments → track_performers → songs → albums`; storage
methods `getInstrumentTracks`, `getInstrumentSuperCreditArtists` already exist.*

### (b) By song → the instruments / rig → the artist
*"What gear is on this track, and who played it?"*
From the song, read both its performer credits (each with an instrument) and its
rigs (each instrument plus its accessories).
*Under the hood: `songs → track_performers → people + instruments`, and
`songs → track_rigs → rigs → instruments + rig_accessories`; storage methods
`getSongRigs`, `getPersonTracks` already exist.*

### (c) By gear / brand → the artists who used it → their rig
*"Which artists play Fender, and what's each one's setup?"*
From the vendor, find their instruments, then everyone credited with those
instruments, then each artist's rig on the relevant song.
*Under the hood: `vendors → instrument_vendors → instruments → track_performers →
people`, then `people + songs → track_rigs → rigs`; storage methods
`getVendorSuperCreditArtists`, `getMakerInstruments` already exist.*

> **Takeaway for Bill:** all three "search modes" are the same gear graph entered
> from a different door. GoodGear doesn't need a new database — it needs a new
> front door onto the one GoodTunes is already filling.

---

## What happens next (no commitments here)

Nothing gets built from this brief — it's the decision input. *If* Bill greenlights
the direction, the path is:

1. **Firm up the Deezer relationship** for catalog, deep-links, and the popularity
   signal (and explore attribution/affiliate terms).
2. **Confirm GoodGear is a front-end on the shared data layer** (and, when needed,
   a thin read-only API over the same tables) — not a separate database.
3. **Keep pouring SuperCredits™ into the gear graph.** That's the moat-builder, and
   it's already in motion.
4. **Evaluate muso.ai** (`MUSO_API_KEY` already reserved) as a credits baseline to
   seed gear annotation faster, with artists enriching it from there.

**Explicitly *not* decided here:** the actual partner deals, API keys, and the
GoodGear UI itself (mockups are a separate task). Streaming-partner terms should be
confirmed directly with each service before any launch.
