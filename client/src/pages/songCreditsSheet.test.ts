// Task #1556 — regression guard for the mobile per-song "Song Credits" sheet.
//
// SongCreditsSheet (client/src/components/ui/AlbumCreditsSheet.tsx) shares the
// CreditsSheetHost + CreditsSlider with the album-credits sheet, but it is
// scoped to a single track and feeds a one-song `bySongId` payload. Four
// behaviors have no other coverage and would regress invisibly:
//   • The trailing chevron is the ONLY affordance that a row leads somewhere.
//     It appears on rich-profile (tappable) rows and is omitted entirely on
//     unlinked / dead rows (a name with no real personId/profile).
//   • Tapping a rich row swaps the list for the person view in place (no nested
//     sheet) and the back caret returns to the list.
//   • The mobile sheet keeps the credits list's single close affordance (the
//     list shows the X; the person view hides it, back caret only).
//   • The per-track context is preserved: opening a person runs
//     resolvePersonContext(personId, role), and the song it returns leads the
//     profile (the "On <song>" context line), so the profile opens on the track
//     the person actually played on.
//
// A row's tappability hinges on the lightweight profile query
// ["/api/people", id, "profile"] feeding personProfileIsRich(): a bio, gear, or
// a track on another album makes it rich. We seed that query directly so
// nothing hits the network, then drive real clicks through jsdom.
//
// Runs under Node's built-in runner via tsx, same as the rest of the suite:
//   TSX_TSCONFIG_PATH=tsconfig.test.json npx tsx --test client/src/pages/songCreditsSheet.test.ts

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
// framer-motion useReducedMotion → force reduced so the slide animations
// resolve to a short fade instead of a 420-stiffness spring that never settles.
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

const { SongCreditsSheet } = await import("@/components/ui/AlbumCreditsSheet");

const h = React.createElement;

// ── fixtures ─────────────────────────────────────────────────────────
const ALBUM_ID = "a1";
const SONG_ID = "s1";
const SONG_TITLE = "Song One";
const RICH_ID = "p-rich";
const RICH_NAME = "Rich Player";
const UNLINKED_NAME = "Session Hand";

// One song's performers: a person with a real (rich) profile carrying a
// personId, and an unlinked row (personId null — a name only). The rich row
// goes through the rich-profile gate and becomes tappable; the unlinked row
// renders as a plain, non-tappable row with no chevron.
const credits = {
  bySongId: {
    [SONG_ID]: {
      performers: [
        {
          id: "c-rich",
          personId: RICH_ID,
          name: RICH_NAME,
          role: "Drums",
          person: { id: RICH_ID, name: RICH_NAME, photoUrl: null },
        },
        {
          id: "c-unlinked",
          personId: null,
          name: UNLINKED_NAME,
          role: "Tambourine",
          person: null,
        },
      ],
      writers: [],
    },
  },
} as any;

const SONG = {
  id: SONG_ID,
  title: SONG_TITLE,
  albumId: ALBUM_ID,
  trackNumber: 1,
  duration: 180,
} as any;

const album = {
  id: ALBUM_ID,
  title: "Test Album",
  artist: "Tester",
  artwork: "",
  year: 2026,
  type: "LP",
  songs: [SONG],
} as any;

// Seed a QueryClient so the rich-profile gate resolves without the network.
// Only the rich person gets a seeded profile (a bio makes it rich); every
// other profile query returns null via the default queryFn → not rich.
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
    person: { id: RICH_ID, name: RICH_NAME, photoUrl: null, bio: "Veteran session drummer." },
    tracks: [],
  });
  return qc;
}

// The per-song view renders "On this track" gear doors (not the flat credits
// list): a rich-profile performer with no rig becomes a tappable <button> door
// (door-performer-<personId>) with a trailing person chevron; an unlinked name
// with no rig renders as a plain, non-tappable <div> row keyed by its credit id
// (row-performer-<creditId>).
const RICH_DOOR = `door-performer-${RICH_ID}`;
const UNLINKED_ROW = `row-performer-c-unlinked`;

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
  // need real elapsed time, so each poll advances ~25ms of real timers.
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

test("song credits: chevron only on the linked row; tap slides to the person (with track context) and back returns to the list", async () => {
  // Capture every resolvePersonContext call and feed back a view whose `song`
  // is the current track, mirroring AlbumDetail's call site. Returning the song
  // is what makes the profile open on the track the person played on.
  const calls: Array<{ personId: string; role: string }> = [];
  const resolvePersonContext = (personId: string, role: string) => {
    calls.push({ personId, role });
    if (personId !== RICH_ID) return null;
    return {
      person: { id: RICH_ID, name: RICH_NAME, photoUrl: undefined },
      role,
      song: SONG,
      selectedCreditId: undefined,
      currentSongCredits: undefined,
      otherTracks: [],
    } as any;
  };

  const { q, click, settle, waitFor, teardown } = await mount(
    h(SongCreditsSheet, {
      songId: SONG_ID,
      songTitle: SONG_TITLE,
      albumId: ALBUM_ID,
      albumTitle: album.title,
      artist: album.artist,
      credits,
      album,
      resolveInstrument: () => undefined,
      // Provide a rig resolver so the host flips the list pane into the per-song
      // "On this track" gear doors (it only does so when BOTH the raw performer
      // rows and a rig resolver are present). No rig is exercised in this
      // fixture, so the stub view is never actually opened.
      resolveRigView: () => ({}) as any,
      resolvePersonContext,
      onClose: () => {},
    }),
  );
  try {
    await settle();

    // The per-song sheet mounted (own testid, distinct from the album sheet).
    assert.ok(q("sheet-credits"), "the Song Credits sheet renders");

    // Linked rich person, no rig → tappable <button> door WITH a trailing
    // person chevron. Every door carries a leading gear glyph (svg), so the
    // chevron shows up as the door's SECOND svg; the dead row has only the glyph.
    const richBtn = q(RICH_DOOR);
    assert.ok(richBtn, "rich-profile performer renders as a tappable door");
    assert.equal(richBtn!.tagName, "BUTTON", "rich door is an interactive button");
    assert.ok(
      richBtn!.querySelectorAll("svg").length >= 2,
      "tappable door carries the trailing chevron (gear glyph + chevron)",
    );

    // Unlinked person, no rig → plain (non-tappable) row: a <div>, not a button,
    // and no trailing chevron (only the leading gear glyph).
    const unlinkedRow = q(UNLINKED_ROW);
    assert.ok(unlinkedRow, "unlinked performer still renders as a plain row");
    assert.notEqual(unlinkedRow!.tagName, "BUTTON", "unlinked row is not a button");
    assert.equal(
      unlinkedRow!.querySelectorAll("svg").length,
      1,
      "unlinked row has only the gear glyph, no trailing chevron",
    );

    // List view: the sheet's single close affordance (X) is present, no back.
    assert.ok(q("button-credits-close"), "list view shows the close X");
    assert.equal(q("button-credits-back"), null, "no back caret on the list");

    // Tap the linked row → person profile slides in over the list (no nested
    // sheet) and resolvePersonContext gets the current row's personId + role.
    await click(richBtn!);
    await waitFor(RICH_DOOR, false);
    assert.deepEqual(
      calls,
      [{ personId: RICH_ID, role: "Drums" }],
      "opening the person runs resolvePersonContext with the row's personId + role",
    );
    assert.equal(q(RICH_DOOR), null, "list is swapped out for the person view");
    assert.ok(q("button-credits-back"), "person view shows the back caret");
    assert.ok(
      q("text-performer-name")?.textContent?.includes(RICH_NAME),
      "person view renders the tapped person's profile",
    );

    // Per-track context preserved: the profile leads with the song the person
    // played on (the resolved view's `song`), not an album-wide About.
    assert.ok(
      q("text-performer-context")?.textContent?.includes(SONG_TITLE),
      "person view opens on the contextual track (On <song>)",
    );

    // Mobile sheet HIDES the X on the person view (back caret only) so the
    // credits list keeps the single close affordance.
    assert.equal(
      q("button-credits-close"),
      null,
      "mobile person view hides the close X (back caret only)",
    );

    // Back caret returns to the credits list and restores the close X.
    await click(q("button-credits-back")!);
    await waitFor(RICH_DOOR, true);
    assert.ok(q(RICH_DOOR), "back returns to the credits list");
    assert.equal(
      q("button-credits-back"),
      null,
      "back caret is gone once we're back on the list",
    );
    assert.ok(q("button-credits-close"), "list view restores the close X");
  } finally {
    await teardown();
  }
});

test("song credits: a placeholder role ('Other') never reaches the fan subtitle — gear-only when there's gear, nothing when there isn't", async () => {
  // The importer buckets unclassifiable performers into "Other". Fans must never
  // see that label on the "On this track" gear doors: with gear the subtitle is
  // gear-only, with no gear there's no subtitle at all. A real role passes
  // through as "Role · Gear". (Names deliberately avoid the substring "Other" so
  // the assertion only catches the *role* leaking in.)
  const localCredits = {
    bySongId: {
      [SONG_ID]: {
        performers: [
          { id: "c-real", personId: null, name: "Real Guy", role: "Lead Guitar", instrumentId: "i-guitar", person: null },
          { id: "c-other-gear", personId: null, name: "Gear Guy", role: "Other", instrumentId: "i-guitar", person: null },
          { id: "c-other-nogear", personId: null, name: "Mystery Hand", role: "Other", instrumentId: null, person: null },
        ],
        writers: [],
      },
    },
  } as any;

  const resolveInstrument = (id: string) =>
    id === "i-guitar"
      ? ({ id: "i-guitar", name: "Ibanez RG550", category: "Guitar" } as any)
      : undefined;

  const { q, settle, teardown } = await mount(
    h(SongCreditsSheet, {
      songId: SONG_ID,
      songTitle: SONG_TITLE,
      albumId: ALBUM_ID,
      albumTitle: album.title,
      artist: album.artist,
      credits: localCredits,
      album,
      resolveInstrument,
      resolveRigView: () => ({}) as any,
      resolvePersonContext: () => null,
      onClose: () => {},
    }),
  );
  try {
    await settle();

    const realRow = q("row-performer-c-real");
    assert.ok(realRow, "real-role performer row renders");
    assert.ok(
      realRow!.textContent?.includes("Lead Guitar · Ibanez RG550"),
      "a real role shows 'Role · Gear'",
    );

    const otherGear = q("row-performer-c-other-gear");
    assert.ok(otherGear, "placeholder-role + gear row renders");
    assert.ok(
      otherGear!.textContent?.includes("Ibanez RG550"),
      "placeholder role with gear still shows the gear name",
    );
    assert.ok(
      !/Other/.test(otherGear!.textContent ?? ""),
      "placeholder role 'Other' is never shown as a subtitle (gear-only)",
    );

    const otherNoGear = q("row-performer-c-other-nogear");
    assert.ok(otherNoGear, "placeholder-role + no-gear row renders");
    assert.ok(
      !/Other/.test(otherNoGear!.textContent ?? ""),
      "placeholder role with no gear shows no subtitle at all",
    );
  } finally {
    await teardown();
  }
});
