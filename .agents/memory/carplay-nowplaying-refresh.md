---
name: CarPlay Now Playing re-render keys
description: What actually makes CPNowPlayingTemplate refresh on a track change — nil-wipe must be observable (next runloop hop) and artwork must be a NEW object instance.
---

# CarPlay Now Playing panel refresh on track change

**Rule 1 — the nil-wipe must be observable.** Writing
`MPNowPlayingInfoCenter.nowPlayingInfo = nil` and the new dict in the SAME
main-thread runloop tick gets coalesced by iOS: CarPlay never sees the wipe, so
when nothing else in the dict reads as "changed" the panel stays frozen on the
old track. Wipe, then apply the new dict on the NEXT hop
(`DispatchQueue.main.async`). The one-tick blank is invisible-to-subtle and is
the intended "refresh".

**Rule 2 — artwork identity is the re-render key.** CPNowPlayingTemplate keys
its full re-render on the `MPMediaItemArtwork` OBJECT identity. Songs on one
album share the cover URL, so re-injecting the cached artwork instance reads as
"no change" and text/scrubber freeze even though title/artist differ. Mint a
FRESH `MPMediaItemArtwork` per track from a cached `UIImage` (no refetch)
whenever the URL is unchanged.

**Rule 3 — native `lastDuration` only updates via setMetadata.** The plugin's
duration-mismatch guard clamps the CarPlay scrubber to the duration last sent
by `setMetadata`; playback-state pushes carry the real duration but do NOT
update it. If JS sends metadata before `loadedmetadata` resolves the real
length, the scrubber stays clamped to the stale value all track. Fix lives in
PlayerContext: a `[duration]`-keyed corrective effect re-publishes metadata
(same title → in-place dict update, no wipe/flicker) once the real duration
lands.

**Diag channel:** native AVAudioSession interruption began/ended + route-change
reasons ride the existing `remoteCommand` bridge as `action:"diag"` and land in
the JS playback ring buffer (`native-…` kinds) — older JS bundles ignore the
unknown action, older binaries just don't emit it. Use it to correlate
mid-drive audio dropouts with OS session arbitration.

**Deploy split:** Swift changes need a Codemagic rebuild (ios-testflight is
MANUAL, and the GitHub mirror must be caught up first or the build is stale);
PlayerContext/JS ships to installed binaries via a normal web publish.

**Cold-start limit (unchanged):** with the phone app never launched, only the
CarPlay scene exists — no web player, so nothing can play until the app is
opened once. Fixing that needs off-screen web-player bring-up = scene-manifest
work, which is FORBIDDEN (black-screen history).
