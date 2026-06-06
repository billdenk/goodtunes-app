// Task #1554 — regression guard for the album-credits person slide-in.
//
// The credits surface (AlbumCreditsSheet on mobile, AlbumCreditsPage on
// iPad/desktop — both in client/src/components/ui/AlbumCreditsSheet.tsx)
// renders Apple-Music-style grouped credit "pills" and slides a person's
// profile in over the list when a tappable row is clicked. Three behaviors
// have no other coverage and would regress invisibly:
//   • The trailing chevron is the ONLY affordance that a row leads somewhere.
//     It appears on rich-profile (tappable) rows and is omitted entirely on
//     dead rows (a name + photo with no real profile) — no greyed caret.
//   • Tapping a rich row swaps the list for the person view (horizontal Apple
//     push) and the back caret returns to the list.
//   • The MOBILE sheet hides the close X on the person view (back caret only),
//     while the DESKTOP page keeps the X in the corner.
//
// A row's tappability hinges on the lightweight profile query
// ["/api/people", id, "profile"] feeding personProfileIsRich(): a bio, gear,
// or a track on another album makes it rich. We seed that query directly so
// nothing hits the network, then drive real clicks through jsdom.
//
// Runs under Node's built-in runner via tsx, same as the rest of the suite:
//   TSX_TSCONFIG_PATH=tsconfig.test.json npx tsx --test client/src/pages/albumCreditsPersonSlide.test.ts

import test, { after } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { JSDOM } from "jsdom";

// Stub static asset imports (.svg/.png/…) so the real modules import under tsx
// without Vite. Must run before any import that pulls them in.
register("./assetStubLoader.mjs", import.meta.url);

// `@/lib/analytics` starts a module-level setInterval flush loop the first time
// track() fires (openPerson calls it). It's never cleared, so it would keep the
// process alive and the buffered TAP output would never flush. Capture any
// interval created during the run and clear them in an `after` hook.
const realSetInterval = globalThis.setInterval;
const createdIntervals = new Set<ReturnType<typeof setInterval>>();
(globalThis as any).setInterval = (...args: any[]) => {
  const id = (realSetInterval as any)(...args);
  createdIntervals.add(id);
  return id;
};
after(() => {
  for (const id of createdIntervals) clearInterval(id);
  createdIntervals.clear();
  (globalThis as any).setInterval = realSetInterval;
});

// The loader rewrites `import.meta.env` (Vite-only) to this global.
(globalThis as any).__VITE_ENV__ = {
  DEV: false,
  PROD: true,
  MODE: "test",
  SSR: false,
};

// ── jsdom environment ────────────────────────────────────────────────
const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost/album/a1",
  pretendToBeVisual: true, // gives us requestAnimationFrame for framer-motion
});
const { window } = dom;
const g = globalThis as any;
g.window = window;
g.document = window.document;
g.navigator = window.navigator;
g.location = window.location;
g.history = window.history;
g.localStorage = window.localStorage;
g.addEventListener = window.addEventListener.bind(window);
g.removeEventListener = window.removeEventListener.bind(window);
g.dispatchEvent = window.dispatchEvent.bind(window);
g.HTMLElement = window.HTMLElement;
g.SVGElement = window.SVGElement;
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
// framer-motion useReducedMotion → force reduced so slide animations resolve
// to a short fade instead of a 420-stiffness spring that never settles.
window.matchMedia = ((query: string) => ({
  matches: /reduce/.test(query),
  media: query,
  onchange: null,
  addListener() {},
  removeListener() {},
  addEventListener() {},
  removeEventListener() {},
  dispatchEvent() {
    return false;
  },
})) as any;
g.matchMedia = window.matchMedia;
// Profile content may auto-scroll via element.scrollTo, which jsdom lacks.
(window.HTMLElement.prototype as any).scrollTo = () => {};
// Required for React 18's act().
g.IS_REACT_ACT_ENVIRONMENT = true;

// Import React + the real modules AFTER the DOM globals exist.
const ReactNs: any = await import("react");
const React =
  ReactNs.default && ReactNs.default.createElement ? ReactNs.default : ReactNs;
const act = React.act ?? ReactNs.act;
const RDC: any = await import("react-dom/client");
const createRoot = RDC.createRoot ?? RDC.default.createRoot;

const RQ: any = await import("@tanstack/react-query");
const { QueryClient, QueryClientProvider } = RQ;

const { AlbumCreditsPage, AlbumCreditsSheet } = await import(
  "@/components/ui/AlbumCreditsSheet"
);

const h = React.createElement;

// ── fixtures ─────────────────────────────────────────────────────────
const ALBUM_ID = "a1";
const RICH_ID = "p-rich";
const DEAD_ID = "p-dead";
const RICH_NAME = "Rich Player";
const DEAD_NAME = "Dead Player";

// Two album-level production credits: one person with a real (rich) profile
// and one who is only a name + photo (dead). Both carry a personId so both go
// through the rich-profile gate — only the rich one should become tappable.
const credits = {
  production: [
    {
      id: "c-rich",
      personId: RICH_ID,
      name: RICH_NAME,
      role: "Bass",
      person: { id: RICH_ID, name: RICH_NAME, photoUrl: null },
    },
    {
      id: "c-dead",
      personId: DEAD_ID,
      name: DEAD_NAME,
      role: "Assistant Engineer",
      person: { id: DEAD_ID, name: DEAD_NAME, photoUrl: null },
    },
  ],
} as any;

const album = {
  id: ALBUM_ID,
  title: "Test Album",
  artist: "Tester",
  artwork: "",
  year: 2026,
  type: "LP",
  songs: [],
} as any;

// Seed a QueryClient so the rich-profile gate resolves without the network.
// Only the rich person gets a seeded profile (a bio makes it rich); the dead
// person's profile query returns null via the default queryFn → not rich.
function makeClient() {
  const qc = new QueryClient({
    defaultOptions: {
      queries: {
        queryFn: async () => null,
        retry: false,
        staleTime: Infinity,
        gcTime: Infinity,
        refetchOnWindowFocus: false,
      },
    },
  });
  qc.setQueryData(["/api/people", RICH_ID, "profile"], {
    person: { id: RICH_ID, name: RICH_NAME, photoUrl: null, bio: "Veteran session bassist." },
    tracks: [],
  });
  return qc;
}

const RICH_BTN = `link-album-credit-person-${RICH_ID}`;
const DEAD_BTN = `link-album-credit-person-${DEAD_ID}`;
const DEAD_ROW = `text-album-credit-${DEAD_ID}`;

async function mount(element: any) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  let root: any;
  await act(async () => {
    root = createRoot(container);
    root.render(h(QueryClientProvider, { client: makeClient() }, element));
  });

  const q = (id: string) =>
    document.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
  const click = async (el: HTMLElement) => {
    await act(async () => {
      el.dispatchEvent(
        new window.MouseEvent("click", { bubbles: true, cancelable: true }),
      );
    });
  };
  const settle = async (frames = 6) => {
    for (let i = 0; i < frames; i++) {
      await act(async () => {
        await new Promise((r) => setTimeout(r, 0));
      });
    }
  };
  // Wait until `id` either appears (want=true) or disappears (want=false),
  // letting the framer exit/enter fade play out before asserting. Exit fades
  // need real elapsed time (unlike the immediate enter), so each poll advances
  // ~25ms of real timers rather than a bare setTimeout(0).
  const waitFor = async (id: string, want: boolean) => {
    for (let i = 0; i < 80; i++) {
      if (!!q(id) === want) return;
      await act(async () => {
        await new Promise((r) => setTimeout(r, 25));
      });
    }
  };
  const teardown = async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  };

  return { q, click, settle, waitFor, teardown };
}

test("desktop page: chevron only on tappable rows; tap slides to the person and back returns to the list", async () => {
  const { q, click, settle, waitFor, teardown } = await mount(
    h(AlbumCreditsPage, {
      album,
      albumTitle: album.title,
      artist: album.artist,
      credits,
      onClose: () => {},
    }),
  );
  try {
    await settle();

    // Rich person → tappable button WITH a trailing chevron.
    const richBtn = q(RICH_BTN);
    assert.ok(richBtn, "rich-profile credit renders as a tappable button");
    assert.ok(
      richBtn!.querySelector("svg"),
      "tappable row carries the trailing chevron affordance",
    );

    // Dead person → plain (non-tappable) row, NO button, NO chevron.
    assert.equal(q(DEAD_BTN), null, "dead row is not a tappable button");
    const deadRow = q(DEAD_ROW);
    assert.ok(deadRow, "dead person still renders as a plain credit row");
    assert.equal(
      deadRow!.querySelector("svg"),
      null,
      "dead row has no chevron (presence of the chevron is the whole signal)",
    );

    // List view shows the close X and no back caret yet.
    assert.ok(q("button-credits-close"), "list view shows the close X");
    assert.equal(q("button-credits-back"), null, "no back caret on the list");

    // Tap the rich row → person profile slides in over the list.
    await click(richBtn!);
    await waitFor(RICH_BTN, false);
    assert.equal(q(RICH_BTN), null, "list is swapped out for the person view");
    assert.ok(q("button-credits-back"), "person view shows the back caret");
    assert.ok(
      q("text-performer-name")?.textContent?.includes(RICH_NAME),
      "person view renders the tapped person's profile",
    );
    // Desktop keeps the close X in the corner on the person view.
    assert.ok(
      q("button-credits-close"),
      "desktop page keeps the close X on the person view",
    );

    // Back caret returns to the credits list.
    await click(q("button-credits-back")!);
    await waitFor(RICH_BTN, true);
    assert.ok(q(RICH_BTN), "back returns to the credits list");
    assert.equal(
      q("button-credits-back"),
      null,
      "back caret is gone once we're back on the list",
    );
  } finally {
    await teardown();
  }
});

test("mobile sheet: person view shows the back caret but hides the close X", async () => {
  const resolvePersonContext = (personId: string, role: string) => {
    if (personId !== RICH_ID) return null;
    return {
      person: { id: RICH_ID, name: RICH_NAME, photoUrl: undefined },
      role,
      song: undefined,
      selectedCreditId: undefined,
      currentSongCredits: undefined,
      otherTracks: [],
    } as any;
  };

  const { q, click, settle, waitFor, teardown } = await mount(
    h(AlbumCreditsSheet, {
      albumId: ALBUM_ID,
      albumTitle: album.title,
      artist: album.artist,
      credits,
      album,
      resolveInstrument: () => undefined,
      resolvePersonContext,
      onClose: () => {},
    }),
  );
  try {
    await settle();

    // List view: the sheet's single close affordance (X) is present.
    const richBtn = q(RICH_BTN);
    assert.ok(richBtn, "rich-profile credit is tappable in the mobile sheet");
    assert.ok(q("button-credits-close"), "list view shows the close X");
    assert.equal(q("button-credits-back"), null, "no back caret on the list");

    // Tap → person slides in. Mobile HIDES the X (back caret only) so the
    // credits list keeps the single close affordance.
    await click(richBtn!);
    await waitFor("button-credits-back", true);
    assert.ok(q("button-credits-back"), "person view shows the back caret");
    assert.equal(
      q("button-credits-close"),
      null,
      "mobile person view hides the close X (back caret only)",
    );

    // Back caret returns to the list and restores the close X.
    await click(q("button-credits-back")!);
    await waitFor(RICH_BTN, true);
    assert.ok(q(RICH_BTN), "back returns to the credits list");
    assert.ok(q("button-credits-close"), "list view restores the close X");
  } finally {
    await teardown();
  }
});
