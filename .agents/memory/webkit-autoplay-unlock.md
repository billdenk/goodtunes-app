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
- **Non-destructive borrow.** Only pause/remove-src during restore while
  `a.src.startsWith("data:audio/wav")`; never touch a real src. The silent clip
  resolves in a microtask, long before the network fetch for the signed URL
  completes, so the restore always runs before the real src is attached.
- **Real-src branch must still attempt an in-gesture play.** Because the real
  play normally fires from an effect (out of gesture), if the silent bless ever
  got blocked the element stays locked forever. So when a real src is already
  attached, still call `play()` in-gesture and finalize unlock on resolve, but
  do NOT borrow/restore (leave the stream alone).
- Call `ensureAudioUnlocked()` synchronously at the TOP of both `playSong` and
  `togglePlay` (the gesture entry points), not just from the global listeners.

**Why:** masters never leave as a file (Mux signing is mandatory), so the
async-signed-URL → deferred-play shape is structural and can't be made
synchronous; the unlock is the only lever. Do not "fix" this by pre-fetching to
make play synchronous or by muting.
