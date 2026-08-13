---
name: Template/test preview render convention
description: null vs [] semantics for lazily backfilled PDF page previews on press template specs and test runs
---

Press template-spec `preview_urls` (jsonb string[]) and test-run preview columns are rendered lazily at view time (GET press templates payload) through the shared pdftoppm→sharp→object-storage core in `server/templateSpecs.ts`.

**The rule:** `NULL` = never attempted → the next view renders; `[]` = attempted and rasterize genuinely failed → honest "no preview" panel, never re-hammered. Clearing measurements (template replace/archive) must reset previews to NULL so the new file re-renders.

**Why:** without the tri-state, a permanently broken file gets re-downloaded (up to 300MB external fetch) on every page view, or a replaced template keeps serving the old file's renders.

**How to apply:** any new preview-bearing column on these tables follows the same NULL/[]/populated convention; run-preview backfill failures are only remembered in-process (re-tried once per instance restart — acceptable). The Test page must never collapse to one column: a missing proof preview renders a dedicated honest panel beside the template study.
