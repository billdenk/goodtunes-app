---
name: Fan album PlayerSong must carry Mux fields (mobile AND desktop)
description: Why fan track taps go silent — both album pages re-map songs into PlayerSong/Song literals and must copy the Mux master fields through, or playback bails before fetching.
---

The desktop album page (`AlbumDetailDesktop.tsx`) does NOT pass the raw album-by-slug song rows to the player. It builds its own `playableSongs` array by mapping each row into a `PlayerSong` (so it can attach the per-song `album` object). Any field not explicitly copied in that map is silently dropped.

`PlayerContext.resolveStream()` gates on `song.muxPlaybackId && song.muxStatus === "ready"`; if either is missing it pauses/clears and never POSTs `/api/songs/:id/playback-url`. So a desktop map that omits the Mux fields yields a phantom "playing" state with NO sound and NO playback-url request in the server logs — even though the data, Mux signing, and ownership are all healthy.

**Why:** the local `ApiSong`/`ApiAlbum.songs` types are hand-written subsets, so they can omit Mux fields and still type-check; the map then can't copy what the type doesn't declare. Both fan surfaces hit this — MOBILE (`AlbumDetail.tsx`) does NOT forward the raw song; its `songs` useMemo re-shapes `apiAlbum.songs` into a typed `Song[]` literal and had to be fixed the same way desktop was (declare + copy `muxPlaybackId`/`muxStatus`). For an anon non-owner the symptom is sharpest: `audioUrl`/`muxAssetId`/`muxStatus` are all absent server-side, so `hasMasterButNotReady` is false and `isPlaying` stays true → phantom equalizer, no sound, repeated taps no-op (effect deps are `[id, muxPlaybackId, muxStatus]`). `hydrate()` only papers over it when the song is already in the `/api/songs` cache (first-tap race), so anon previewers get silence. This is also why an iOS autoplay-bless fix alone can't help — nothing is being fetched to play.

**How to apply:** when any surface constructs/casts `PlayerSong[]` (rather than forwarding the raw API song), it MUST carry `muxPlaybackId` + `muxStatus` (and `muxAssetId`). Diagnostic tell: "UI plays but silent" + zero `playback-url` requests in logs = a stripped Mux field on the queued song, not a Mux/signing/data fault. Consider a single shared song→PlayerSong helper to stop this drifting back.
