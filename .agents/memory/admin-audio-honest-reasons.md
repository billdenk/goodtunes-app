---
name: Admin track audio honest failure reasons
description: Playback failure copy contract for admin preview audio + why Mux ingest must accept external-URL masters.
---

Rule: "still encoding" copy may only render when the SERVER confirms an in-progress Mux state (`ingesting`/`preparing`). Every other playback failure — undecodable raw master, stream rejection, signing/probe failure (incl. 500s, auth errors, network failures, not-ingested), Mux asset errored — must carry its own distinct, accurate copy. Consumers render the reason's message; never re-add a blanket encoding fallback.

**Why:** A prod album whose tracks were all `ready` showed a permanent "still encoding" banner. The real cause was one track with a raw external master URL that the object-storage-only ingest gates skipped, so the browser fell back to a file it couldn't decode, and that decode failure was mislabeled as encoding — operators were told to wait on an encode that never existed.

**How to apply:**
- Any Mux ingest entry point (auto-hook, boot backfill, manual retry) must accept BOTH object-storage paths and absolute http(s) master URLs; Mux fetches either server-side. A gate that only accepts one shape strands the other permanently un-ingested.
- When client data claims a track is encoding, don't trust it: probe the playback-url route; a success attaches immediately (self-heal), and only a server-confirmed in-progress status may render encoding copy.
- The playback hook must know which leg attached (Mux stream vs raw master) so a media error maps to accurate stream-rejection vs undecodable-master copy.
- Related standing rule: external file links should be mirrored into object storage at save (external-file-links-mirror-rule.md); un-mirrored rows are the trigger for this failure class.
