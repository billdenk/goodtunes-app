---
name: WebKit autoplay unlock for deferred Mux playback
description: Why fan playback needs a gesture-bound silent-clip "bless" on the persistent Audio element, and the rules that keep it from clobbering the real stream.
---

Fan playback resolves a SIGNED Mux stream URL with an async network fetch AFTER
the play tap, then attaches it (`attachSrc` / hls.js `MANIFEST_PARSED`) and the
real `a.play()` fires from an effect (the `isPlaying` effect / attachSrc) — i.e.
OUTSIDE the original user-gesture stack. WebKit (iPhone/desktop Safari + the
standalone home-screen install) blocks *unmuted* media playback that isn't
gesture-bound, and the `.catch()` on play() swallows it: the dock flips to
"playing" (pause icon) with NO sound. This hits 100% of fresh fans on every
WebKit surface; Chrome and high-engagement operator devices are masked by the
Media Engagement Index, so operators never reproduce it.

**Fix (in PlayerContext):** `ensureAudioUnlocked()` blesses the single
persistent `new Audio()` by playing a zero-length silent WAV data URI from
inside a real gesture, so WebKit then permits the later source-swapped play().

**Rules that make it safe (learned via review — get these wrong and you either
trap the fan or clobber the stream):**
- **Success-driven + retryable.** Only mark `audioUnlockedRef` true AFTER
  `play()` *resolves*; on reject do nothing destructive. The capture-phase
  click/touchend/keydown listeners are NEVER removed on failure — a
  non-qualifying gesture (scroll, rejected play) must not permanently burn the
  one-shot. The old "set done=true before confirming success" design trapped
  users in the silent state.
- **Non-destructive borrow.** Only act during restore while
  `a.src.startsWith("data:audio/wav")`; never touch a real src. The silent clip
  resolves in a microtask, long before the network fetch for the signed URL
  completes, so the restore always runs before the real src is attached.
- **Restore must ONLY pause — never `removeAttribute("src") + load()`.** The
  WebKit gesture bless is per-element and is DROPPED the instant the element is
  reset to a no-source state via removeAttribute+load(). Since the restore
  microtask runs BEFORE the deferred attachSrc play(), de-blessing here re-blocks
  that play → dock loads the track but sits PAUSED, and a SECOND tap is needed
  (the symptom was desktop-Safari "two taps to play"). Just `a.pause()` the
  silent clip and leave the (zero-length, paused) data: src attached;
  resolveStream overwrites `a.src` wholesale, so the lingering URL is harmless,
  and pausing also kills a spurious zero-length `ended` that would advance the
  queue. A plain `a.src = realUrl` swap preserves the bless; a no-source reset
  does not.
- **Real-src branch must still attempt an in-gesture play.** Because the real
  play normally fires from an effect (out of gesture), if the silent bless ever
  got blocked the element stays locked forever. So when a real src is already
  attached, still call `play()` in-gesture and finalize unlock on resolve, but
  do NOT borrow/restore (leave the stream alone).
- Call `ensureAudioUnlocked()` synchronously at the TOP of both `playSong` and
  `togglePlay` (the gesture entry points), not just from the global listeners.

- **`a.load()` RE-LOCKS the element on iOS WebKit — the missing half.** The
  restore() avoiding removeAttribute+load() is not enough: `attachSrc` swaps in
  the real source via `a.src = url; a.load()`, and that explicit `load()` ALSO
  drops the gesture bless on iOS WebKit (iPhone Safari AND Chrome — both
  WebKit). The deferred play() then fails and the fan hears nothing even though
  the silent bless succeeded. Desktop Safari tolerates load() (stays blessed),
  which is why desktop worked but iPhone didn't. Fix: skip the explicit
  `a.load()` on `isWebIOS` in the native-HLS/direct-src branch — assigning
  `a.src` already invokes the media-element load algorithm, so load() is
  redundant; skipping it preserves the bless so play() lands on the FIRST tap.
  Same quirk howler.js works around (never call load() after the unlock).
  **Android is NOT affected:** it uses the hls.js/MSE branch (play() from
  MANIFEST_PARSED) and shares Chromium's session-activation autoplay policy with
  desktop Chrome (confirmed working) — Chromium has no load() re-lock quirk.

**Why:** masters never leave as a file (Mux signing is mandatory), so the
async-signed-URL → deferred-play shape is structural and can't be made
synchronous; the unlock is the only lever. Do not "fix" this by pre-fetching to
make play synchronous or by muting.
