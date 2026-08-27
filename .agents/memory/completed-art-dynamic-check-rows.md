---
name: Completed-art dynamic check rows
description: Warnings about state that changed AFTER upload are injected at payload time, never persisted; acks are change-timestamp-keyed.
---

The completed-template check rows come in two layers, and the split is the
durable rule:

- **Persisted rows** describe THE FILE as measured at check time; they only
  change on a re-check.
- **Warnings about state that changed AFTER upload** (e.g. the vinyl track
  order was edited after artwork went up) must be computed dynamically on
  every payload read and NEVER written into the stored checks.

**Why:** a snapshot taken at upload time cannot know about later changes;
recomputing at read time makes the warning self-clearing (re-upload or
reverting the change removes it with no extra bookkeeping) and immune to
stale persisted state.

**How to apply:**
- New "environment changed since upload" warnings follow the same pattern:
  compare a change timestamp against the component's latest upload event
  from the append-only file-events trail, inject the row at payload time,
  re-roll the component + verdict statuses after injecting.
- Acks for such warnings must store WHICH change timestamp they covered —
  a newer change re-flags despite the ack; a fresh check resets the ack.
- The change timestamp is stamped ONLY when a persisted value actually
  differs — no-op saves must never move it, or never-changed albums start
  warning.
- OCR-derived findings stay warn-only, and OCR silence (no confident
  words / failure) emits NO rows — never a false "verified" claim. OCR
  tracklist matching must bind titles to their label FACE (side markers or
  page↔side position), not just search the whole file.
