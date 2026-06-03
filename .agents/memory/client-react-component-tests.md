---
name: client React component tests
description: How to write client/ React component/integration tests under the node:test + tsx harness (no vitest/jsdom preinstalled).
---

# Client React component tests

The repo has NO vitest / testing-library. Tests run with Node's built-in
runner via `tsx --test`, and the `test` validation command globs
`find client shared server -name '*.test.ts'` with
`TSX_TSCONFIG_PATH=tsconfig.test.json` set.

**Why the test tsconfig:** the app's components use the automatic JSX
runtime (Vite-configured), but the base `tsconfig.json` has
`jsx: "preserve"`, so plain `tsx` falls back to the CLASSIC transform and
every component throws `React is not defined` (source files don't
`import React`). `tsconfig.test.json` extends the base and overrides
`jsx: "react-jsx"` so tsx emits automatic-runtime calls. Keep the
`TSX_TSCONFIG_PATH` env on the `test` validation command (set via
`setValidationCommand`, NOT by editing `.replit` — direct edits are
blocked).

**How to stand up a DOM:** import `jsdom` (installed dev dep), create a
JSDOM with `url` + `pretendToBeVisual: true` (gives requestAnimationFrame),
then assign globals BEFORE dynamically importing React/components:
`window, document, navigator, location, history, addEventListener,
HTMLElement, SVGElement, Element, Node, DocumentFragment, Event,
CustomEvent, MouseEvent, KeyboardEvent, getComputedStyle,
requestAnimationFrame`. Required quirks:
- **wouter** reads the GLOBAL `location`/`history` (not window.*) → set them or you get `location is not defined`.
- **framer-motion** needs `SVGElement` global (`SVGElement is not defined`) and reads `matchMedia`; stub `matchMedia` to return `matches: /reduce/.test(query)` so `useReducedMotion()` is true and AnimatePresence enter/exit width animations resolve at 0ms (otherwise close assertions race the spring).
- **SyncedLyrics** calls `element.scrollTo` (not in jsdom) → stub `HTMLElement.prototype.scrollTo`.
- Set `globalThis.IS_REACT_ACT_ENVIRONMENT = true`, render with `react-dom/client` `createRoot` inside React 18's `act` (available as `React.act`). Drive clicks via `el.dispatchEvent(new window.MouseEvent("click",{bubbles:true}))` wrapped in `act`; container must be appended to `document.body`.

**PlayerDock gotcha:** it boots COLLAPSED (`dockHidden=true`) to a corner
pill and only expands when the track key CHANGES. In a test, click
`button-show-player` first to reveal the full dock (and `button-lyrics`),
or the transport controls aren't mounted.

**Baseline:** `server/auth/identityLink.db.test.ts` ("same-email fan IS
linked…") fails with 500 in throwaway task DBs — pre-existing, DB-state
dependent, not caused by client test work.

Reference implementation: `client/src/components/ui/desktopLyricsPanel.test.ts`.
