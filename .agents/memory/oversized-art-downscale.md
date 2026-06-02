---
name: Oversized album art downscale (sharp shrink-on-load)
description: How GoodTunes keeps huge raster uploads from OOM-crashing viewers/server, and the invariant the upload + backfill paths must hold.
---

## The invariant
A processable raster (png/jpeg/webp) that is OVER the display size is **never** stored or served raw. It is either downscaled to a ~1500px display derivative (original preserved at a `.orig` sibling) or the operation hard-fails. Storing the raw huge original at its canonical `/objects/uploads` URL is exactly what OOM-crashed mobile WebKit (and the server's full-canvas decode).

**Why:** a ~178MP cover served raw crashes the viewer; a full RGBA canvas decode of it (~700MB) OOMs the worker. There is no safe "fall back to raw" — silent-raw IS the bug.

## How to apply
- The display-derivative helper returns one of `derivative` / `passthrough` (small or non-derivable, store as-is) / `reject` (oversized but un-shrinkable). Callers MUST treat `reject` as a hard stop: the upload path throws (request fails, nothing persisted); the backfill counts it a blocking error.
- Memory safety comes from libvips/sharp **shrink-on-load** (no full canvas materialized): ~178MP downscales at ~135–155MB peak RSS vs ~700MB for a canvas decode. Use it for art above the cheap-canvas pixel ceiling, with sharp `cache(false)` + `concurrency(1)`.
- There is a hard pixel ceiling above which even shrink-on-load is refused (a pixel-bomb guard). Anything above it is `reject`, not silent-raw — so a real >ceiling image rejects on upload and **blocks** the backfill marker (it can't quietly leave a dangerous original).
- sharp's native binary ships as platform sibling pkgs — it must be externalized in the esbuild build (see napi-canvas-build-externals.md) or `npm run build` fails on `.node`.

## Backfill marker discipline
- The marker is per-DB and is stamped ONLY when zero targets errored. A run that couldn't convert a target must not stamp "done" (the original failure: it skipped the one over-ceiling image it existed to fix, yet marked done). Bump the marker NAME to force a corrected re-run on already-stamped DBs.
- A full pass must settle small images from the ranged header sniff alone (return without a full download); only genuinely oversized images get fully downloaded, or the pass blows the post-merge wall-clock budget.
- Object Storage is shared dev↔prod, so converting either DB's URLs fixes the bytes globally; only the marker row is per-DB. Prod-only art (e.g. the original crash case) must be reprocessed by pointing the script at the prod DB directly.
