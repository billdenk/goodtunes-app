// Task #1889 — regression guard for the iPhone "preview goes silent" bug.
//
// On iOS WebKit (iPhone Safari AND Chrome — both WebKit), the persistent
// <audio> element earns a gesture "bless" from ensureAudioUnlocked()'s
// silent-clip play(). That bless is what lets the LATER, deferred play() —
// the one that fires from the async signed-Mux-URL attach, OUTSIDE the
// original tap — actually produce sound. Calling `HTMLMediaElement.load()`
// when swapping in the real source DROPS that bless on iOS WebKit, so the
// deferred play() is autoplay-blocked: the dock flips to "playing" but the
// fan hears nothing. PlayerContext therefore SKIPS the explicit `a.load()`
// on `isWebIOS` in the native-HLS/direct-src branch of `attachSrc`
// (assigning `a.src` already invokes the media-element load algorithm, so
// load() is redundant there).
//
// This invariant is subtle and only reproduces on a real iPhone (Chrome and
// high-engagement desktop devices are masked by the Media Engagement Index),
// so a refactor that re-adds `load()` would slip through manual testing.
// jsdom can't reproduce real WebKit autoplay, but it CAN observe the exact
// call shape: drive a fan-playback source resolution with a Mux-ready song
// and assert that, with `isWebIOS` true, the source swap sets `audio.src` to
// the signed URL and attempts `play()` but does NOT call `audio.load()`; with
// `isWebIOS` false, `load()` IS called (no behaviour change off iOS).
//
// Runs under Node's built-in runner via tsx, same as the rest of the suite:
//   TSX_TSCONFIG_PATH=tsconfig.test.json npx tsx --test \
//     client/src/pages/playerAttachSrcLoad.test.ts

import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { installTestDom } from "./jsdomHarness";

// Stub static asset imports + import.meta.env AND redirect @/lib/platform to
// the live-binding isIOS/isWebIOS stub (exposes __setTestIsIOS). Must run
// before any React/PlayerContext import. Same loader the scrubber test uses.
register("./mobilePlayerLoader.mjs", import.meta.url);

const { window, g } = installTestDom();

// The signed Mux URL the (mocked) /playback-url fetch resolves to. It's an
// HLS manifest, so attachSrc takes the native-HLS branch once we make
// canPlayType() report HLS support (below) — exactly the iOS Safari path.
const SIGNED_URL = "https://stream.mux.test/guard-1889.m3u8";

// Instrument the single persistent <audio> element via its prototype: record
// every load()/play() call and every `src` assignment IN ORDER, so we can
// assert precisely what happened during the source swap. We don't have a
// direct handle on PlayerContext's `new Audio()`, and there's only one media
// element in play, so the prototype is the clean observation point.
const proto: any = window.HTMLMediaElement.prototype;
const origDesc = {
  src: Object.getOwnPropertyDescriptor(proto, "src"),
  load: proto.load,
  play: proto.play,
  pause: proto.pause,
  canPlayType: proto.canPlayType,
};

let events: string[] = [];
proto.canPlayType = function () {
  // Report native HLS support so attachSrc takes the direct-src / native-HLS
  // branch (the one carrying the `if (!isWebIOS) a.load()` line we guard),
  // matching iOS Safari rather than the hls.js/MSE branch.
  return "maybe";
};
proto.load = function () {
  events.push("load");
};
proto.pause = function () {
  events.push("pause");
};
proto.play = function () {
  events.push("play");
  // A resolved promise mirrors a permitted play() and lets
  // ensureAudioUnlocked finalize its silent-clip bless cleanly.
  return Promise.resolve();
};
Object.defineProperty(proto, "src", {
  configurable: true,
  get() {
    return this.__src ?? "";
  },
  set(v: string) {
    this.__src = String(v);
    events.push("src:" + v);
  },
});

// Network: only the signed-URL fetch matters; everything else (/api/me,
// /api/songs, /api/me/recents, analytics) gets a benign empty response so the
// provider's incidental queries/POSTs don't error. `/api/me` returns null so
// the fan is anonymous (keeps favorites on the localStorage path).
g.fetch = async (input: any) => {
  const url = typeof input === "string" ? input : input?.url ?? "";
  const body =
    url.includes("/playback-url")
      ? JSON.stringify({ url: SIGNED_URL })
      : url.includes("/api/me") && !url.includes("/recents")
        ? "null"
        : url.includes("/songs") || url.includes("/favorites")
          ? "[]"
          : "{}";
  return new Response(body, {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};

// Import React + the real PlayerProvider AFTER the DOM globals + stubs exist.
const ReactNs: any = await import("react");
const React =
  ReactNs.default && ReactNs.default.createElement ? ReactNs.default : ReactNs;
const act = React.act ?? ReactNs.act;
const RDC: any = await import("react-dom/client");
const createRoot = RDC.createRoot ?? RDC.default.createRoot;
const RQ: any = await import("@tanstack/react-query");

const { PlayerProvider, usePlayer } = await import("@/context/PlayerContext");
// Comes from the redirected stub (mobilePlayerLoader.mjs).
const platform: any = await import("@/lib/platform");

const h = React.createElement;

const MUX_SONG = {
  id: "song-1889",
  title: "Guard Song",
  duration: 180,
  audioUrl: undefined,
  muxPlaybackId: "mux-playback-1889",
  muxStatus: "ready",
  album: { id: "album-1889", title: "Guard Album", artist: "Tester", artwork: "" },
};

// Grab the live player API so the test can call playSong() (the gesture entry
// point that blesses the element then triggers the async source resolution).
let playerApi: any = null;
function Capture() {
  playerApi = usePlayer();
  return null;
}

function makeClient() {
  return new RQ.QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: Infinity },
    },
  });
}

async function flush(times = 8) {
  // The signed-URL resolution is async (fetch → res.json() → attachSrc), so
  // pump both microtasks and macrotasks a few times to let it land.
  for (let i = 0; i < times; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }
}

async function drivePlayback() {
  events = [];
  const container = window.document.createElement("div");
  window.document.body.appendChild(container);
  const client = makeClient();
  let root: any;
  await act(async () => {
    root = createRoot(container);
    root.render(
      h(RQ.QueryClientProvider, { client }, h(PlayerProvider, null, h(Capture))),
    );
  });
  assert.ok(playerApi, "PlayerProvider mounts and exposes the player API");
  await act(async () => {
    playerApi.playSong(MUX_SONG);
  });
  await flush();
  const teardown = async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    client.clear();
  };
  return { teardown };
}

// Slice the event log AFTER the moment the signed URL was attached — i.e. the
// load()/play() calls that belong to the source swap, not the earlier
// silent-clip bless.
function afterSignedSrc() {
  const i = events.indexOf("src:" + SIGNED_URL);
  return { idx: i, after: i >= 0 ? events.slice(i + 1) : [] };
}

test("iOS web: the source swap sets src + plays but never calls load() (preserves the WebKit bless)", async () => {
  platform.__setTestIsIOS(true);
  const { teardown } = await drivePlayback();

  const { idx, after } = afterSignedSrc();
  assert.ok(idx >= 0, "the signed Mux URL is assigned to audio.src");
  assert.ok(
    after.includes("play"),
    "play() is attempted on the swapped-in source (deferred play)",
  );
  assert.ok(
    !after.includes("load"),
    "audio.load() must NOT be called on iOS during the swap — load() re-locks " +
      "the WebKit gesture bless and silences the deferred play()",
  );

  await teardown();
  platform.__setTestIsIOS(false);
});

test("non-iOS: the source swap DOES call load() (no behaviour change off iOS)", async () => {
  platform.__setTestIsIOS(false);
  const { teardown } = await drivePlayback();

  const { idx, after } = afterSignedSrc();
  assert.ok(idx >= 0, "the signed Mux URL is assigned to audio.src");
  assert.ok(
    after.includes("load"),
    "audio.load() IS called off iOS (WebKit re-lock quirk doesn't apply)",
  );
  assert.ok(after.includes("play"), "play() is still attempted on the source");
  assert.ok(
    after.indexOf("load") < after.indexOf("play"),
    "load() runs before the deferred play(), matching attachSrc's order",
  );

  await teardown();
});

test("restore the patched media-element prototype", () => {
  // Keep the process clean for any sibling test sharing it (the runner spawns
  // a process per file today, but the harness pattern is to restore globals).
  if (origDesc.src) Object.defineProperty(proto, "src", origDesc.src);
  proto.load = origDesc.load;
  proto.play = origDesc.play;
  proto.pause = origDesc.pause;
  proto.canPlayType = origDesc.canPlayType;
});
