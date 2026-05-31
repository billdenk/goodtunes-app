---
name: Odesli per-release streaming link resolution
description: How GoodTunes resolves real per-release Tidal/Deezer/Pandora URLs from an Apple Music release, and why Qobuz can't.
---

# Per-release streaming-link resolution (Tidal/Deezer/Pandora)

GoodTunes resolves real per-release deep links for Tidal, Deezer, and Pandora from
an Apple Music release using the free Odesli / song.link API
(`https://api.song.link/v1-alpha.1/links`), keyed off the numeric iTunes
**collection id** (`platform=itunes&type=album&id=<collectionId>&userCountry=US`).
Response `linksByPlatform` carries `tidal`, `deezer`, `pandora` (each `{url}`).

**Why Qobuz stays on search fallback:** Odesli does not carry Qobuz, and there is
no free per-release Qobuz lookup. So Qobuz is always resolved to null and the
fan-side "How to Play" sheet keeps the per-service search fallback for it.

**Rate limit:** the no-key tier is ~10 requests/minute. A single-album import is
one call (fine), but a discography import can be dozens of releases — batch
resolution must be bounded (concurrency cap + total wall-clock budget) and stop
launching new lookups when the budget is spent; unresolved releases keep the
search fallback. Optional `ODESLI_API_KEY` env var (`&key=`) raises the limit;
inert when unset, not required.

**How to apply:** resolution is best-effort and must never throw or fail the
import — any network error / 429 / no-match yields nulls. Lives in
`server/lib/streamingLinks.ts`; wired into the Apple-URL album import and the
discography save handler. Columns already exist on albums/people/person_discography
(added in the six-service handoff work). Spotify per-release also unresolved (needs
Spotify Web API; separate from this).
