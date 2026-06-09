---
name: Desktop album PlayerSong must carry Mux fields
description: Why desktop fan track taps can go silent — the desktop album page rebuilds PlayerSong objects and must copy the Mux master fields through.
---

The desktop album page (`AlbumDetailDesktop.tsx`) does NOT pass the raw album-by-slug song rows to the player. It builds its own `playableSongs` array by mapping each row into a `PlayerSong` (so it can attach the per-song `album` object). Any field not explicitly copied in that map is silently dropped.

`PlayerContext.resolveStream()` gates on `song.muxPlaybackId && song.muxStatus === "ready"`; if either is missing it pauses/clears and never POSTs `/api/songs/:id/playback-url`. So a desktop map that omits the Mux fields yields a phantom "playing" state with NO sound and NO playback-url request in the server logs — even though the data, Mux signing, and ownership are all healthy.

**Why:** the local `ApiSong` type in `AlbumDetailDesktop.tsx` is a hand-written subset, so it can omit Mux fields and still type-check; the map then can't copy what the type doesn't declare. Mobile (`AlbumDetail.tsx`) passes the raw song object straight to `playSong`, so it never hit this.

**How to apply:** when any surface constructs/casts `PlayerSong[]` (rather than forwarding the raw API song), it MUST carry `muxPlaybackId` + `muxStatus` (and `muxAssetId`). Diagnostic tell: "UI plays but silent" + zero `playback-url` requests in logs = a stripped Mux field on the queued song, not a Mux/signing/data fault. Consider a single shared song→PlayerSong helper to stop this drifting back.
