---
name: iOS WKWebView wins now-playing arbitration
description: On native iOS the WebView's playing <audio> element owns the lock-screen now-playing slot; the native plugin's MPNowPlayingInfoCenter writes lose — must set web navigator.mediaSession on native iOS too.
---

# iOS WKWebView wins the lock-screen now-playing arbitration

**Rule:** On iOS 15+, when audio plays through the WKWebView's hidden HTML `<audio>`
element (the whole GoodTunes native app is a thin Capacitor wrap of the remote
web player), **WebKit itself publishes that element's now-playing info to the
shared system slot and WINS arbitration over the app's own
`MPNowPlayingInfoCenter` writes** for the phone lock screen / Control Center.
iOS picks the media session that OWNS the actually-playing audio, which is
WebKit's — not the native plugin's manual writes.

So the native `NowPlaying` plugin can report metadata `delivered: true` (real
title/artist/art) and the lock screen STILL shows the app name ("GoodTunes")
with WebKit's default skip-10 transport, because WebKit re-writes the slot on
every timeupdate with generic info (falls back to the app/document name when
`navigator.mediaSession.metadata` is unset).

**Fix (what actually surfaces the real title/art on iOS):** set the WEB
`navigator.mediaSession` on native iOS too — metadata, `playbackState` /
`setPositionState`, and the transport action handlers. In PlayerContext.tsx this
meant removing three `isNativeIOS` gates that had deliberately disabled the web
MediaSession on iOS. This surfaced the real artwork/title/artist on the lock
screen — **verified on-device** in TestFlight.

**Transport buttons (skip-10 vs next/prev) are a SEPARATE iOS quirk:** merely
registering `nexttrack`/`previoustrack` is NOT enough. iOS/WebKit exposes a FIXED
number of lock-screen transport slots and, when BOTH the seek-offset
(`seekbackward`/`seekforward`) AND track (`previoustrack`/`nexttrack`) handlers
are set, it shows the ±10s SKIP buttons and DROPS next/prev. On-device proof:
metadata rendered correctly yet the transport was still ±10s skip. Fix = on iOS
do NOT register `seekbackward`/`seekforward` at all (keep `seekto` so the
lock-screen scrubber still works); the system then surfaces real previous/next
track buttons. Android/other webviews keep the seek handlers (room for both).

**Why the old design was wrong:** the prior rationale was "stay silent on iOS so
the native plugin is the sole owner of the WKWebView lock screen — the web
MediaSession would otherwise fight MPNowPlayingInfoCenter." That premise is
invalid: WebKit publishes regardless, so silence just means WebKit publishes the
generic fallback. You cannot suppress WebKit's publish; you can only make it
carry the correct metadata by setting mediaSession.

**How to apply / keep intact:**
- Keep the native `NowPlaying` plugin doing everything else: AVAudioSession
  `.playback` (background audio while locked), and mirroring metadata / queue /
  catalog / recents / favorite into `NowPlayingStore` for **CarPlay browse** and
  the **cold-connect snapshot**. CarPlay browse reads the store directly, never
  the arbitrated slot, so it's unaffected.
- The plugin's `MPRemoteCommandCenter` targets stay wired (CarPlay needs them)
  but are **inert for the phone lock screen** — iOS routes those taps to
  WebKit's session. The diagnostic overlay's `REMOTE COMMANDS (0)` staying 0
  after the fix is EXPECTED, not a failure.
- CarPlay-only publish effects (setCatalog/setRecents/setFavorite and the
  nativeCatalog/nativeRecents data sources) stay `isNativeIOS`-gated. Do NOT
  remove those gates — only the three lock-screen mediaSession gates.

**Verification:** JS-only change, ships to the installed binary via a normal web
publish (native loads the remote origin) — no Codemagic rebuild needed. Must be
confirmed on a real device: lock screen should show the real title/art + real
next/prev buttons. Diagnosed from on-device screenshots (delivered:true yet
"GoodTunes" on screen), confirmed by architect debug consult.
