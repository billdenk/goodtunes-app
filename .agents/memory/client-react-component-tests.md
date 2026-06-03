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

**Testing a context-driven page (e.g. mobile `Player.tsx`):** it reads
everything from `usePlayer()`, not props. Render it inside a
`PlayerContext.Provider` (now exported from `PlayerContext.tsx`) with a
stateful host that supplies a full controlled value — mirrors the desktop
harness's "one showLyrics flag both surfaces read" approach. Stub all the
fns; only the toggled flag (`setShowLyrics`) and `currentSong` (with
`lyrics`) need to be real.

**Two gotchas unique to importing `Player.tsx`:**
- It transitively imports `client/src/data/musicData.ts`, which `import`s
  binary `@assets/...jpg|png` files. tsx has no Vite asset pipeline and
  errors `Cannot find package '@assets/...'`. Fix in `tsconfig.test.json`:
  add `"@assets/*": ["./client/src/__stubs__/asset"]` (a one-line
  `export default ""`). `paths` REPLACES the base paths on extend, so
  re-list `@/*` and `@shared/*` too.
- On mount it fires `analytics.track()`, which lazily arms a 15s
  `setInterval` flush loop — an open handle that hangs the WHOLE
  `tsx --test` run (no output, never exits). In test setup wrap
  `globalThis.setInterval` to `.unref()` the returned timer. Also set
  `globalThis.localStorage = window.localStorage` (track writes there).

**Lingering-handle hangs (CRITICAL — the whole suite shares ONE process via the
find-glob, and there's no `--test-force-exit`):** if your test leaves ANY live
timer, the process never exits and the buffered TAP output never flushes — it
looks like an infinite hang even though the tests passed. Two sources when you
render the real page / providers:
- `@/lib/analytics` lazily starts a module-level `setInterval` flush loop the
  first time `track()`/`identifyAnalyticsUser` fires (it does once you mount a
  page that plays a song or mounts `useAuth`); never cleared. Capture intervals
  by wrapping `globalThis.setInterval` (push ids to a Set) and `clearInterval`
  them in a `node:test` `after()` hook.
- TanStack Query schedules a 5-minute gc `setTimeout` PER cached query when it
  goes inactive on unmount (~11 timers for a seeded page). Set `gcTime: Infinity`
  on the test QueryClient (Infinity ⇒ no timer scheduled) in addition to
  `staleTime: Infinity`.
  Diagnose lingering timers with `process.getActiveResourcesInfo()` (lists
  `"Timeout"` entries); `process._getActiveHandles()` does NOT show timers on
  Node 20.

**import.meta.env (Vite-only) under tsx:** the page reads `import.meta.env.DEV`
etc.; tsx doesn't provide it. Use a `node:module` ESM loader to (a) stub static
asset imports (`.svg/.png/...`) and (b) rewrite `import.meta.env` →
`globalThis.__VITE_ENV__`, then set
`globalThis.__VITE_ENV__ = {DEV,PROD,MODE,SSR}` before importing the page. See
`client/src/pages/assetStubLoader.mjs`.

**Whole-page render vs PlayerDock note:** when you render `AlbumDetailDesktop`
inside a real `PlayerProvider`, the dock auto-expands once the track key changes
(after Play), so `button-lyrics` appears after clicking `button-play-album`
without first clicking `button-show-player`.

**Baseline:** `server/auth/identityLink.db.test.ts` ("same-email fan IS
linked…") fails with 500 in throwaway task DBs — pre-existing, DB-state
dependent, not caused by client test work.

Reference implementations: `client/src/components/ui/desktopLyricsPanel.test.ts`
(prop-driven components), `client/src/pages/playerLyricsPanel.test.ts`
(context-driven page), and `client/src/pages/albumDetailLyricsBreakpoints.test.ts`
(full-page, md vs lg lyrics surfaces).
