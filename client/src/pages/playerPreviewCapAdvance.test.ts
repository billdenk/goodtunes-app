// Regression guard for the preview double-advance bug ("plays tracks
// 1, 3, 5 — skips the evens").
//
// In preview mode PlayerContext's cap effect auto-advances when currentTime
// reaches previewEndSec. The advance path calls `audio.pause()`, and per the
// HTML media spec's pause steps that queues one FINAL `timeupdate` task which
// is delivered AFTER handleNext has already moved the queue forward. Because
// the next song's signed Mux URL is fetched asynchronously, the element still
// holds the OLD song's media at that moment, so the handler reads ~the old
// cap time (≈30s) — and that stale value re-trips the cap against the NEXT
// song's window (which also ends at 30s when no window is placed), advancing
// a second time. Fans heard track 1, then 3, then 5.
//
// The fix zeroes the element clock right after pausing when advancing to
// another track: `timeupdate` handlers read `audio.currentTime` LIVE at
// delivery, so the queued stale tick now reads 0 (inside every window), plus
// a one-shot arm ref as a belt. This test drives the real PlayerProvider with
// an instrumented media prototype, simulates the cap crossing, then delivers
// the spec's stale post-pause `timeupdate` and asserts the queue advanced by
// exactly ONE track — and that the next cap crossing still advances normally.
//
// Runs under Node's built-in runner via tsx, same as the rest of the suite:
//   TSX_TSCONFIG_PATH=tsconfig.test.json npx tsx --test \
//     client/src/pages/playerPreviewCapAdvance.test.ts

import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { installTestDom } from "./jsdomHarness";

// Stub static asset imports + import.meta.env AND redirect @/lib/platform to
// the live-binding isIOS stub. Must run before any React/PlayerContext import.
register("./mobilePlayerLoader.mjs", import.meta.url);

const { window, g } = installTestDom();

const SIGNED_URL = "https://stream.mux.test/preview-cap.m3u8";

// Instrument the persistent <audio> element via its prototype (same pattern
// as playerAttachSrcLoad.test.ts): capture the element instance from the src
// setter, and give currentTime real read/write storage so the timeupdate
// handler's live read observes exactly what the fix wrote.
const proto: any = window.HTMLMediaElement.prototype;
const origDesc = {
  src: Object.getOwnPropertyDescriptor(proto, "src"),
  currentTime: Object.getOwnPropertyDescriptor(proto, "currentTime"),
  load: proto.load,
  play: proto.play,
  pause: proto.pause,
  canPlayType: proto.canPlayType,
};

let mediaEl: any = null;
proto.canPlayType = function () {
  // Native-HLS branch (direct src assignment), matching iOS Safari.
  return "maybe";
};
proto.load = function () {};
proto.pause = function () {
  // Do NOT auto-dispatch the spec's post-pause timeupdate here — the test
  // delivers it explicitly so the assertion points at the exact moment.
};
proto.play = function () {
  return Promise.resolve();
};
Object.defineProperty(proto, "src", {
  configurable: true,
  get() {
    return this.__src ?? "";
  },
  set(v: string) {
    this.__src = String(v);
    if (!String(v).startsWith("data:audio/wav")) mediaEl = this;
  },
});
Object.defineProperty(proto, "currentTime", {
  configurable: true,
  get() {
    return this.__ct ?? 0;
  },
  set(v: number) {
    this.__ct = Number(v);
  },
});

// Network: signed-URL fetch + benign empties for the provider's incidental
// queries (/api/me, /api/songs, /api/me/recents, analytics).
g.fetch = async (input: any) => {
  const url = typeof input === "string" ? input : input?.url ?? "";
  const body = url.includes("/playback-url")
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

const ReactNs: any = await import("react");
const React =
  ReactNs.default && ReactNs.default.createElement ? ReactNs.default : ReactNs;
const act = React.act ?? ReactNs.act;
const RDC: any = await import("react-dom/client");
const createRoot = RDC.createRoot ?? RDC.default.createRoot;
const RQ: any = await import("@tanstack/react-query");

const { PlayerProvider, usePlayer } = await import("@/context/PlayerContext");

const h = React.createElement;

const album = {
  id: "album-cap",
  title: "Cap Album",
  artist: "Tester",
  artwork: "",
};
// Three Mux-ready songs with NO placed preview window, so every track's
// window is the default 0–30s — the exact shape that double-advanced.
const SONGS = ["s1", "s2", "s3"].map((id, i) => ({
  id,
  title: `Song ${i + 1}`,
  trackNumber: i + 1,
  duration: 180,
  audioUrl: undefined,
  muxPlaybackId: `mux-${id}`,
  muxStatus: "ready",
  album,
}));

let playerApi: any = null;
function Capture() {
  playerApi = usePlayer();
  return null;
}

async function flush(times = 8) {
  for (let i = 0; i < times; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }
}

async function tick(time: number | null) {
  // Deliver a `timeupdate` to the live element. time===null models the
  // spec's queued post-pause tick: the handler reads whatever the element
  // clock holds AT DELIVERY (the heart of the bug).
  if (time != null) mediaEl.__ct = time;
  await act(async () => {
    mediaEl.dispatchEvent(new window.Event("timeupdate"));
  });
  await flush(2);
}

test("preview cap advances exactly one track despite the stale post-pause timeupdate", async () => {
  const container = window.document.createElement("div");
  window.document.body.appendChild(container);
  const client = new RQ.QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: Infinity } },
  });
  let root: any;
  await act(async () => {
    root = createRoot(container);
    root.render(
      h(RQ.QueryClientProvider, { client }, h(PlayerProvider, null, h(Capture))),
    );
  });
  assert.ok(playerApi, "PlayerProvider mounts and exposes the player API");

  await act(async () => {
    playerApi.setPreviewMode(true);
  });
  await act(async () => {
    playerApi.playSong(SONGS[0], SONGS);
  });
  await flush();
  assert.ok(mediaEl, "the persistent audio element received the signed source");
  assert.equal(playerApi.currentSong?.id, "s1");
  assert.equal(playerApi.previewMode, true);

  // Track 1 plays inside its window, then crosses the 30s cap.
  await tick(5);
  assert.equal(playerApi.currentSong?.id, "s1", "still on track 1 mid-window");
  await tick(30.2);
  assert.equal(
    playerApi.currentSong?.id,
    "s2",
    "crossing the cap advances to track 2",
  );

  // The spec's queued post-pause timeupdate now lands. The old media is
  // still attached (signed URL for track 2 resolves async), so WITHOUT the
  // element-clock zeroing the handler would read ~30.2s and advance AGAIN
  // (to track 3 — the reported skip). The fix makes this tick read 0.
  await tick(null);
  assert.equal(
    playerApi.currentSong?.id,
    "s2",
    "the stale post-pause tick must NOT double-advance to track 3",
  );

  // The guard must not swallow real caps: track 2's own cap still advances.
  await tick(1);
  await tick(30.4);
  assert.equal(
    playerApi.currentSong?.id,
    "s3",
    "track 2's genuine cap crossing still advances to track 3",
  );
  // …and its stale tick is inert too.
  await tick(null);
  assert.equal(playerApi.currentSong?.id, "s3", "no double-advance off track 2");

  await act(async () => {
    root.unmount();
  });
  container.remove();
  client.clear();
});

test("restore the patched media-element prototype", () => {
  if (origDesc.src) Object.defineProperty(proto, "src", origDesc.src);
  if (origDesc.currentTime)
    Object.defineProperty(proto, "currentTime", origDesc.currentTime);
  else delete proto.currentTime;
  proto.load = origDesc.load;
  proto.play = origDesc.play;
  proto.pause = origDesc.pause;
  proto.canPlayType = origDesc.canPlayType;
});
