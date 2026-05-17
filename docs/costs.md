# GoodTunes® cost ledger

Living, single-page tally of every cost lever in the product. Updated as
each lever is wired up. Two columns matter for every line: **unit cost**
(what does ONE happen-it cost) and **trigger** (when does it happen, so
we can ballpark annual spend).

Numbers marked **(est.)** are back-of-envelope until we have a real
receipt. Numbers marked **(confirmed)** have been verified against an
actual invoice or vendor pricing page.

Last touched: 2026-05-17 (admin album-5 waveform backfill)

---

## 1 · Storage

### 1a. Master audio files (Object Storage)
- **What**: 24-bit / 96 kHz WAV masters, ~50–200 MB each. Uploaded once
  per song to Replit Object Storage at `${PRIVATE_OBJECT_DIR}/uploads/`.
- **Unit cost**: **(est.)** $0.02 / GB / month for Replit Object Storage
  (parity with GCS Standard, which it sits on).
- **Per song**: ~100 MB avg → ~$0.002 / month / song.
- **Per album**: ~1.5 GB × $0.02 = **~$0.03 / month / album**.
- **Per 1,000 albums** (~15,000 songs): ~22.5 TB × $0.02 = **~$450 / month**.
- **Open question**: do we keep the raw 24-bit master forever, or
  transcode to AAC/Opus once it's encoded and only keep the lossy
  rendition? Probably keep both — the master is the source of truth and
  storage is cheap.

### 1b. Encoded delivery files (AAC + lossless FLAC)
- **What**: Apple-style ladder. Need to settle on encodings, but rough
  plan: AAC-LC 256 kbps (default playback), FLAC (lossless tier).
- **Unit cost**: same $0.02 / GB / month bucket.
- **Per song**: AAC ~8 MB + FLAC ~25 MB = 33 MB → **~$0.0007 / month / song**.
- **Status**: not built yet. Numbers placeholder.

### 1c. Album art, person photos, instrument photos, vendor logos
- **What**: JPEGs / PNGs, typically 100 KB – 2 MB each.
- **Unit cost**: same Object Storage rate.
- **Per album** (cover + 3 person photos + a few instrument shots): **<$0.0001 / month**. Negligible.

### 1d. Bonus videos
- **What**: MP4 uploads via `/api/admin/upload-video`. Sizes vary wildly
  (5 MB lyric video → 500 MB tour doc).
- **Unit cost**: same.
- **Status**: cap to consider once we see real usage patterns.

---

## 2 · Bandwidth (fan playback)

This is the big one — scales with **fan-listens**, not with the
catalog. The two real options below have very different cost curves.

### 2a. Progressive HTTPS streaming (today)
- **What**: fan hits play → browser fetches the file in chunks from
  Object Storage → audio plays as bytes arrive. Same model as
  SoundCloud / Bandcamp early.
- **Cost driver**: GB transferred OUT of Object Storage to the fan's
  device. Replit Object Storage egress is **(est.)** $0.10–$0.15 / GB
  (GCS-equivalent).
- **Per stream of one 4-min AAC-256 song** = ~8 MB ≈ **$0.001 per play**.
- **Per fan per month** (10 albums × 12 plays each ≈ 120 songs of
  listening) ≈ 1 GB / fan / month ≈ **~$0.10–$0.15 / fan / month**.
- **What inflates this**: lossless FLAC plays. ~25 MB per song instead
  of 8 MB. 3× the bandwidth cost.

### 2b. Download-to-device (deferred to desktop / native)
- **What**: fan downloads the file once. Future plays = local, zero
  bandwidth to us.
- **Per download**: same ~8 MB / song → ~$0.001 once.
- **Break-even vs. streaming**: pays for itself after **1 listen**. From
  play #2 onward, every play is free for us.
- **Caveat**: this is the "burns a Transfer Right" path. Not all
  songs/albums should be downloadable; that's a license decision.

### 2c. Progressive cached (the middle path)
- **What**: stream once, browser caches locally (`Cache-Control:
  immutable`), re-plays come from disk.
- **Cost**: same as 2a for the first stream, then free on repeats.
- **Verdict**: we already do this via the `cacheControl: "public,
  max-age=31536000, immutable"` flag on every uploaded object. So
  album re-plays are already free for the listener AND for us. Repeat
  fans cost very little.

**Big takeaway** for Bill: the streaming bill scales with **first
listens**, not total listens. Repeat plays are nearly free thanks to
the immutable cache header. This is the same trick Apple/Spotify use.

---

## 3 · Compute (the stuff we run on our own servers)

### 3a. Waveform generation (ffmpeg, this commit)
- **What**: pipe master → ffmpeg → 200 normalized peaks.
- **API cost**: **$0.00.**
- **Compute**: ~30–90 sec CPU + transient memory per song. Inside our
  existing Replit hosting bill — no metered overage at our scale.
- **Per song**: effectively **$0**.
- **Per 1,000 songs**: still effectively **$0** in API; ~$0.50–$1 in
  attributable compute.
- **When triggered**: once per master upload (auto, going forward) +
  admin "Regenerate" button.

### 3b. Lyrics sync via ElevenLabs Forced Alignment
- **What**: master audio + written lyrics → word-level timestamps.
  Powers GoodSync™ karaoke lyrics on the player.
- **Unit cost**: **(est.)** $0.05–$0.15 per 4-min song. Verify on first
  real invoice.
- **Per album** (17 tracks): **~$1–$2.50**.
- **When triggered**: admin clicks "Auto-sync lyrics" on a song.
  One-time per song unless lyrics or master change.
- **Cost guard already in code**: 150 MB master cap, 30k char lyric cap,
  120 s timeout per call.

### 3c. Lyrics transcription via ElevenLabs Scribe (deferred)
- **What**: audio-only → STT transcript. Use to **diff** against written
  lyrics so the artist can catch "I wrote demo lyrics but recorded
  final mix" mismatches.
- **Unit cost**: **(est.)** ~$0.10 per 4-min song. Same order of
  magnitude as forced alignment.
- **When triggered**: opt-in "Verify against recording" button in the
  Lyrics editor. Not the default path.

---

## 4 · Third-party API costs (per-call, not per-asset)

### 4a. Object Storage operations (PUT / GET requests)
- Negligible at our scale. ~$0.005 per 1,000 PUT, ~$0.0004 per 1,000
  GET. Even at 1M plays / month: <$1.

### 4b. ASCAP lookup (server/ascap.ts)
- **Status**: scraping pubic search results, not a paid API. $0.
- **Risk**: rate-limit / ToS pressure if usage grows. Plan: cache results.

### 4c. Muso.ai (deferred)
- See roadmap. Subscription, not per-call. Decide when we have a real
  use-case.

---

## 5 · Rules of thumb (for fast back-of-envelope)

- **Adding 1 album** = ~$0.03 / month storage + one-time ~$1.50 in
  lyric-sync (if we do all tracks).
- **Adding 1,000 fans** = ~$100–$150 / month in streaming bandwidth at
  AAC quality, before caching kicks in. Closer to ~$30–$50 / month with
  immutable cache after fans settle into their listening patterns.
- **Adding 1 stream** ≈ $0.001 (AAC) or $0.003 (lossless). Per play.

---

## 6 · Open questions to revisit

- **Audio ladder**: when do we transcode the 24-bit master to AAC / FLAC?
  Server-side at upload? On-demand at play? Different bills, different
  player UX.
- **CDN in front of Object Storage**: at ~10k fans/month, fronting GCS
  with Cloudflare or Fastly drops egress by 60–80%. Worth doing once
  monthly bandwidth crosses ~$200.
- **Lossless tier opt-in**: only fans who toggle "lossless" trigger the
  bigger files. Apple charges the same regardless; we could too, but
  it's worth tracking the actual cost delta per user.
- **DRM ladder cost** (Widevine / FairPlay): TBD when we wire it up.
  Material — see roadmap for plan.
