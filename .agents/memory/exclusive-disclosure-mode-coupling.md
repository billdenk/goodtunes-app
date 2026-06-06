---
name: Exclusive-disclosure row + local sub-editor coupling
description: Why an accordion row's expansion must derive solely from the disclosure controller, not OR'd with local editor state.
---

When an accordion row (one-open-at-a-time via `useExclusiveDisclosure`) also has
a local sub-editor state (e.g. `mode !== "view"`), DO NOT compute
`expanded = controllerOpen || mode !== "view"`.

**Why:** opening a sibling row only flips THIS row's controller flag to false;
the local `mode` is untouched, so the OR keeps the row expanded and "only one
open at a time" silently breaks (caught in code review on the admin tracklist).

**How to apply:** derive `expanded` SOLELY from the controller flag, and add a
`useEffect` that resets the local sub-editor (`setMode("view")`) whenever the
controller collapses the row. Entering a sub-editor must also call the
controller's open (so the controller flag is the single source of truth).
