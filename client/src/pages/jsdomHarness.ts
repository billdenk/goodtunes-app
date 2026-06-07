// Shared jsdom + globals harness for the client React component/integration
// tests that run under Node's built-in runner via tsx
// (`TSX_TSCONFIG_PATH=tsconfig.test.json npx tsx --test …`).
//
// WHY THIS EXISTS — test isolation:
// The `test` validation command globs EVERY `*.test.ts` under
// client/shared/server into one `tsx --test` invocation. Today Node's test
// runner spawns a separate child process per file, so a global one file
// leaves behind (a stubbed `fetch`, a reassigned `window`/`document`/
// `matchMedia`/`localStorage`, …) does not bleed into a LATER file. But that
// isolation is a property of the RUNNER, not of the tests — flip the runner
// to `--test-isolation=none` (or import several test modules into one
// process) and a leaked global would silently change a sibling's behaviour.
// That is exactly the "passes alone, fails in the suite" flake class this
// harness defends against: every global it touches is snapshotted on install
// and restored in a per-file `after()` hook, so each file hands the process
// back exactly as it found it. New tests get this isolation for free by
// calling `installTestDom()` instead of hand-rolling ~80 lines of global
// assignment.
//
// What it sets up: a JSDOM window + the globals React/wouter/framer-motion/
// SyncedLyrics read (window, document, navigator, location, history,
// localStorage, the event constructors, getComputedStyle, rAF, Audio), a
// reduced-motion + viewport-aware `matchMedia`, an `HTMLElement.scrollTo`
// stub, React 18's act() flag, and the Vite `import.meta.env` shim global.
// It also wraps `setInterval` so the analytics flush loop (and any other
// stray timer) is captured and cleared on teardown — a live timer would hang
// the shared, buffered `tsx --test` run forever.
//
// What it does NOT do: register the asset/`import.meta.env` ESM loader (call
// `register("./assetStubLoader.mjs", import.meta.url)` — or your module's own
// loader — yourself, BEFORE calling this, since it must run before the
// component graph is imported) and specialised prototype stubs
// (getBoundingClientRect, pointer capture, the Radix copy-all-window-props
// trick). Apply those after `installTestDom()` returns, against the returned
// `window`.

import { after } from "node:test";
import { JSDOM } from "jsdom";

export interface InstallTestDomOptions {
  /** Document URL wouter reads from the global location. */
  url?: string;
  /**
   * Initial viewport width the `matchMedia` stub answers
   * `(min-width: Npx)` / `(max-width: Npx)` against. Use the returned
   * `setViewport()` to change it between mounts.
   */
  viewportWidth?: number;
}

export interface TestDom {
  dom: JSDOM;
  window: Window & typeof globalThis;
  document: Document;
  /** `globalThis`, pre-cast to `any` for ad-hoc test-only assignments. */
  g: any;
  /** Repoint the `matchMedia` viewport width (also sets `window.innerWidth`). */
  setViewport: (px: number) => void;
}

// Every global key this harness assigns, PLUS a couple it deliberately does
// not set but still guards (`fetch`) so that a test which stubs them after
// install is automatically restored on teardown.
const MANAGED_KEYS = [
  "window",
  "document",
  "navigator",
  "location",
  "history",
  "localStorage",
  "addEventListener",
  "removeEventListener",
  "dispatchEvent",
  "HTMLElement",
  "SVGElement",
  "Element",
  "Node",
  "DocumentFragment",
  "Event",
  "CustomEvent",
  "MouseEvent",
  "KeyboardEvent",
  "getComputedStyle",
  "requestAnimationFrame",
  "cancelAnimationFrame",
  "Audio",
  "matchMedia",
  "fetch",
  "IS_REACT_ACT_ENVIRONMENT",
  "__VITE_ENV__",
  "setInterval",
] as const;

export function installTestDom(opts: InstallTestDomOptions = {}): TestDom {
  const { url = "http://localhost/", viewportWidth = 1280 } = opts;
  const g = globalThis as any;

  // Snapshot the pre-test value (and existence) of every managed global so
  // the after() hook can restore the process to exactly this state.
  const snapshot = new Map<string, { had: boolean; value: any }>();
  for (const k of MANAGED_KEYS) {
    snapshot.set(k, { had: k in g, value: g[k] });
  }

  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url,
    pretendToBeVisual: true, // gives us requestAnimationFrame for framer-motion
  });
  const { window } = dom;

  g.window = window;
  g.document = window.document;
  g.navigator = window.navigator;
  g.location = window.location; // wouter reads the GLOBAL location/history
  g.history = window.history;
  g.localStorage = window.localStorage; // analytics.track() writes here on mount
  g.addEventListener = window.addEventListener.bind(window);
  g.removeEventListener = window.removeEventListener.bind(window);
  // wouter v3 patches history.pushState/replaceState to emit a navigation
  // event via the GLOBAL dispatchEvent; jsdom only exposes it on window.
  g.dispatchEvent = window.dispatchEvent.bind(window);
  g.HTMLElement = window.HTMLElement;
  g.SVGElement = window.SVGElement; // framer-motion: "SVGElement is not defined"
  g.Element = window.Element;
  g.Node = window.Node;
  g.DocumentFragment = window.DocumentFragment;
  g.Event = window.Event;
  g.CustomEvent = window.CustomEvent;
  g.MouseEvent = window.MouseEvent;
  g.KeyboardEvent = window.KeyboardEvent;
  g.getComputedStyle = window.getComputedStyle.bind(window);
  g.requestAnimationFrame = window.requestAnimationFrame.bind(window);
  g.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
  g.Audio = window.Audio; // PlayerContext news up a hidden <audio> element
  g.IS_REACT_ACT_ENVIRONMENT = true; // required for React 18's act()
  // The asset/import.meta.env ESM loader rewrites `import.meta.env` to this.
  g.__VITE_ENV__ = { DEV: false, PROD: true, MODE: "test", SSR: false };

  // `@/lib/analytics` lazily arms a 15s setInterval flush loop the first time
  // track()/identify fires (which happens once we render a real page). It's
  // never cleared, so the open handle would keep this process alive and the
  // buffered TAP output would never flush — looking like an infinite hang
  // even though the tests passed. Capture every interval and clear them in
  // the after() hook.
  const realSetInterval = snapshot.get("setInterval")!.value;
  const createdIntervals = new Set<any>();
  g.setInterval = (...args: any[]) => {
    const id = realSetInterval(...args);
    createdIntervals.add(id);
    return id;
  };

  // framer-motion's useReducedMotion reads matchMedia; force "reduce" so
  // enter/exit (width/opacity) animations resolve at 0ms and close
  // assertions don't race a spring. Also answer min/max-width so
  // breakpoint-driven surfaces can be exercised via setViewport().
  let width = viewportWidth;
  const setViewport = (px: number) => {
    width = px;
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: px,
    });
  };
  setViewport(viewportWidth);
  window.matchMedia = ((query: string) => {
    let matches = false;
    if (/reduce/.test(query)) {
      matches = true;
    } else {
      const mn = /min-width:\s*(\d+)px/.exec(query);
      if (mn) matches = width >= Number(mn[1]);
      const mx = /max-width:\s*(\d+)px/.exec(query);
      if (mx) matches = width <= Number(mx[1]);
    }
    return {
      matches,
      media: query,
      onchange: null,
      addListener() {},
      removeListener() {},
      addEventListener() {},
      removeEventListener() {},
      dispatchEvent() {
        return false;
      },
    };
  }) as any;
  g.matchMedia = window.matchMedia;

  // SyncedLyrics auto-scrolls via element.scrollTo, which jsdom doesn't ship.
  (window.HTMLElement.prototype as any).scrollTo = () => {};

  after(() => {
    // Drain captured timers first (uses the native clearInterval, which we
    // never replaced), THEN restore every managed global to its pre-test
    // value so the next file in a shared process starts clean.
    for (const id of createdIntervals) clearInterval(id);
    createdIntervals.clear();
    for (const k of MANAGED_KEYS) {
      const snap = snapshot.get(k)!;
      if (snap.had) g[k] = snap.value;
      else delete g[k];
    }
    try {
      window.close();
    } catch {
      // jsdom window already torn down — nothing to do.
    }
  });

  return {
    dom,
    window: window as unknown as Window & typeof globalThis,
    document: window.document,
    g,
    setViewport,
  };
}
