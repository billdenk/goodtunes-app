---
name: Object-storage range serving + faststart
description: Why /objects/uploads/:id must implement HTTP ranges itself (esp. suffix bytes=-N) and why mp4 imports need faststart
---

# Object range serving + mp4 faststart

The `/objects/uploads/:id` route must implement HTTP range handling **in
the app**, not lean on Replit's edge proxy (`server: Google Frontend`) to
slice a full 200 response.

**Why:** the edge proxy slices forward ranges fine but **500s on suffix
ranges (`Range: bytes=-N`) and large streams**. A browser `<video>`
playing a non-faststart MP4 (moov index atom at the *end* of the file)
issues exactly a suffix tail-seek to read the index before playback — so
that 500 manifested as "Couldn't play this video" for bonus videos and
as stalled large-WAV audio. (The Mux path already bypasses the edge for
the same reason.)

**How to apply:** parse all three forms — `bytes=START-END`,
`bytes=START-`, and the suffix `bytes=-N` — resolve to an absolute
`[start,end]` window, answer `206` with `Content-Range`/`Accept-Ranges`
and a sliced `createReadStream({start,end})`. Clamp `end` past EOF;
`416` only when truly unsatisfiable (start past EOF, or zero-length
suffix). The earlier regex `^bytes=(\d+)-(\d*)$` silently dropped the
suffix form (no leading digits) → fell through to a full 200 → edge 500.

**Companion fix — faststart on import:** `.mp4` files that took the
*passthrough* branch of `transcodeVideoToWebFriendlyMp4` shipped
non-faststart, so they depended on the tail-seek. The passthrough branch
now `-c copy -movflags +faststart` remuxes `.mp4` (relocates moov to the
front, no re-encode) and **falls back to passthrough on ffmpeg failure**
(range support still plays it). `.webm` stays true passthrough — Matroska
has no moov atom. The bulk-import "transcoded" report excludes faststart
(it's mp4-in/mp4-out, not a format conversion).
