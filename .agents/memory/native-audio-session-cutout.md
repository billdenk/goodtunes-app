---
name: Native iOS audio-cutout from AVAudioSession churn
description: Why native-iOS <audio> playback can cut out ~2s in, and the JS-first diagnose-without-rebuild pattern used to prove it.
---

# Native iOS audio cuts out ~2s after play (WKWebView <audio> vs a native AVAudioSession)

**Symptom:** On the native shell (TestFlight, iPhone + CarPlay), a song plays for
~1-2 seconds then the audio goes silent while the UI still looks like it's
playing. Web playback in a browser is completely fine. Isolated to native.

**Root cause (CONFIRMED on-device via the kill-switch A/B below):** the in-tree
native `NowPlayingPlugin.swift` calls `configureAudioSession()` — which does
`AVAudioSession.setCategory(.playback)` + `setActive(true)` — from the *recurring*
bridge pushes (`setMetadata` and `setPlaybackState` on the isPlaying tick), not
just once. The web player lives in WKWebView, which owns its OWN media-process
`AVAudioSession`. Re-activating a second app-process session ~1×/sec races/
interrupts the WebView's session and silences the `<audio>` element shortly after
playback starts. A separate change had enabled web `navigator.mediaSession` on
native iOS, so an OS interruption pause flips `isPlaying` invisibly (no error
surfaced).

**On-device proof:** kill-switch OFF → every cycle `playing → pause@t≈2.0` with
`readyState=4` (full buffer, no MediaError) = external interruption, not a data/
decode stall. Kill-switch ON (pushes suppressed) → audio plays through (~9s+).
A one-time `MEDIA_ERR_DECODE` fires at the very start and recovers — it is NOT the
recurring villain.

**Why:** iOS treats `setActive(true)` as a session-activation request; doing it
repeatedly from the app process while WKWebView is playing media is not a no-op —
it can deactivate/interrupt the other session. Session config must happen ONCE
(on load + on the transition to playing), never on a per-tick metadata/state push.

**How to apply / the reusable pattern:**
- Native-shell bugs where the JS is fine but the native binary misbehaves can
  often be *diagnosed* (and sometimes A/B-fixed) from the web bundle alone, which
  ships via a normal web publish — NO Codemagic rebuild. Build:
  1. a small in-memory **event ring buffer** logging the HTMLAudioElement
     lifecycle (pause/waiting/stalled/suspend/emptied/ended/playing/error with
     MediaError name+code) plus web mediaSession actions and play()-reject
     reasons, surfaced in the operator debug overlay;
  2. a **kill-switch** (localStorage-persisted) that stops the native bridge
     pushes suspected of causing the issue, so an operator can A/B on-device.
- The two-run operator protocol that makes it conclusive: run 1 switch OFF,
  reproduce, open overlay + Copy the JSON; run 2 switch ON, confirm audio plays
  through. Bare `pause` at t≈2s with no `error`/`ms-pause` = consistent with an OS
  interruption; the kill-switch play-through is the proof.
- Keep the scaffolding INERT by default — logging only, no per-tick diag events,
  native pushes unchanged unless the operator flips the switch.

**The native fix (IMPLEMENTED):** `setActive(true)` now happens ONCE on `load()`
and again only when a genuine `AVAudioSession` interruption ends. The `~1Hz`
`setPlaybackState` re-activation was deleted outright; `setMetadata` + a
routeChange observer now call `ensurePlaybackCategory()` (setCategory only-if-
drifted, NEVER setActive) as a safety net for a WKWebView category reset. An
interruption observer re-activates on `.ended` and emits `play` if iOS sets
`.shouldResume`.

**SECOND CONFIRMED BUG: `.newDeviceAvailable` route change also calls
`setActive(true)` and causes MEDIA_ERR_DECODE at t=0.0 on CarPlay connect.**
On-device (build 93, kill switch OFF): MEDIA_ERR_DECODE at exactly t=0.0, rs=1,
ns=1 fires when CarPlay head unit first connects — the same `setActive(true)` race,
but this time at the very first track load rather than mid-track. After the decode
error, the 300ms `emit("play")` fires and playback recovers fine. Fix: replace
`configureAudioSession(activate: true)` with `ensurePlaybackCategory()` in the
`.newDeviceAvailable` branch. Session is already active from `load()` — a route
change means the audio output changed, NOT that the session needs deactivating/
reactivating. Keep the 300ms `emit("play")` delay for route-settle before resuming.

**RULE: NEVER call `setActive(true)` in `handleRouteChange`.** The two and ONLY
two legitimate `setActive(true)` call sites are:
1. `load()` — initial session setup.
2. `handleInterruption(.ended)` — after a genuine OS interruption (phone call, Siri).
All other sites use `ensurePlaybackCategory()` (category repair, no activation).

**Kill-switch ON is NOT a safe permanent setting — it desyncs CarPlay + lock
screen (expected, not a new bug).** Suppressing the metadata + playback-state
pushes ALSO starves `MPNowPlayingInfoCenter`, which feeds BOTH the lock-screen
scrubber AND the CarPlay Now Playing template + its transport buttons. Kill-switch
ON = audio plays but CarPlay/lock go stale. OFF = CarPlay syncs and (after the
route-change fix) audio plays without stalling. Check `BUILD.commit` in the overlay
before interpreting — if it isn't the fix commit, the binary predates the fix.
