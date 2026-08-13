---
name: Template/test preview render convention
description: null vs [] semantics and stale-write guard for lazily backfilled PDF page previews on press template specs and test runs
---

Press template-spec and test-run preview images are rendered lazily at view time.

**The rule:** `NULL` = never attempted → the next view renders; `[]` (or null slots for runs) after an attempt = genuine rasterize failure → honest "no preview" panel, never re-hammered. Clearing measurements (template replace/archive) must reset previews to NULL so the new file re-renders.

**Why:** without the tri-state, a permanently broken file gets re-fetched on every page view, or a replaced template keeps serving the old file's renders.

**Stale-write guard:** a render in flight when the template is replaced/archived must NOT persist — the persist is conditional on the file URL the render was made from (guarded UPDATE), and a rejected persist re-renders the current file (bounded retry). Never persist preview URLs keyed only on the spec id.

**How to apply:** any new preview-bearing column follows the same NULL/[]/populated convention plus the guarded persist; the Test page must never collapse to one column — a missing proof preview renders a dedicated honest panel beside the template study.
