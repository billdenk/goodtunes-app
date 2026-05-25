---
name: Mux-only fan playback
description: The fan player must never attach a raw master file as audio src — Mux signed HLS only, refuse otherwise.
---

# Mux-only fan playback (no raw-file fallback)

The fan player's audio element may only ever attach a Mux signed HLS URL. Every other branch — signing failure, preparing, errored, never-ingested, legacy "audioUrl present but no Mux state" — must refuse to play and flip the play state off so the UI does not sit in a phantom "playing" state.

**Why:** The investor-facing capabilities doc promises "masters never leave our infrastructure as a downloadable file" (HBO Max / Robinhood model). A silent fallback to the raw object-storage MP3 makes that promise a lie *and* hides Mux pipeline breakage — audio still plays so nobody notices. Failing loud is the whole point of the admin Mux banner and per-track state pill: the fan player must be the loudest failure in the system, not the quietest.

**How to apply:**
- Fan source-resolution effect: gate every code path on `muxPlaybackId && muxStatus === "ready"`. No `else if (audioUrl)` branch. No `offlineSrcFor(audioUrl)` fallback. If signing 4xx's, `setIsPlaying(false)` and surface — do not retry against the raw URL.
- "Has real audio" / duration / scrub / auto-advance logic must derive from Mux readiness, not from `audioUrl` presence — otherwise the simulated-timer path disagrees with playback state.
- Admin previews are the only legitimate consumer of raw `audioUrl`; keep that behind admin-only routes/components so it can never leak into the fan shell.
- The signed-URL endpoint returns 409 (not 404) with `{status, lastError}` when the master isn't Mux-ready, so the client can show *why* it refused. Preserve that contract.
