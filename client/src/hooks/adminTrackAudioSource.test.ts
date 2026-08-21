// Task #3229 — honest playback failure copy + stale-"encoding" self-heal.
//
// The admin Digital tab used to render THREE different failures with the
// same "still encoding" copy: genuine Mux `ingesting`/`preparing`, a raw
// master the browser can't decode (`unplayable`), and stream/signing
// failures. Operators with fully-`ready` tracks were told to wait on an
// encode that had already finished. This pins:
//   • each reason code carries DISTINCT copy — "still encoding" is
//     reserved for genuine encoding states;
//   • a `ready` track attaches the signed Mux URL and never produces an
//     encoding reason;
//   • when the CLIENT's song data says "preparing" but the server can
//     sign a playback URL (stale album payload), attach self-heals to the
//     Mux stream instead of showing the encoding banner;
//   • a server-confirmed `errored` asset renders mux-errored copy, not
//     encoding copy;
//   • the shared banner helper only swaps in the "preview-play will light
//     up…" phrasing for the `encoding` code.
//
// Runs under Node's built-in runner via tsx:
//   TSX_TSCONFIG_PATH=tsconfig.test.json npx tsx --test client/src/hooks/adminTrackAudioSource.test.ts

import test from "node:test";
import assert from "node:assert/strict";

// Minimal browser globals so @/lib/queryClient (authHeaders reads
// localStorage) and the attach path import cleanly under plain Node.
const g = globalThis as any;
g.localStorage = g.localStorage ?? {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};
g.window = g.window ?? { location: { hostname: "localhost" } };

const {
  attachAdminAudio,
  adminAudioBannerText,
  ADMIN_AUDIO_COPY,
} = await import("./useAdminTrackAudioSource");

// ── fetch stub ───────────────────────────────────────────────────────
type StubResponse = { ok: boolean; status: number; body: any };
let nextResponses: StubResponse[] = [];
const fetchCalls: string[] = [];
g.fetch = async (input: any) => {
  fetchCalls.push(String(input));
  const r = nextResponses.shift() ?? {
    ok: true,
    status: 200,
    body: { url: "https://stream.mux.com/pb.m3u8?token=t" },
  };
  return {
    ok: r.ok,
    status: r.status,
    statusText: r.ok ? "OK" : "Conflict",
    text: async () => JSON.stringify(r.body),
    json: async () => r.body,
  };
};

// Fake <audio> element — enough surface for attachUrl/detach.
function fakeAudio() {
  const calls: string[] = [];
  return {
    calls,
    src: "",
    error: null,
    canPlayType: () => "", // no native HLS; Hls.isSupported() false in Node → plain src attach
    load() {
      calls.push("load");
    },
    pause() {
      calls.push("pause");
    },
    removeAttribute(name: string) {
      calls.push(`removeAttribute:${name}`);
      this.src = "";
    },
  } as unknown as HTMLAudioElement & { calls: string[] };
}

const hlsRef = { current: null as any };

function resetStub(...responses: StubResponse[]) {
  nextResponses = responses;
  fetchCalls.length = 0;
}

// ── distinct copy per failure mode ───────────────────────────────────
test("each failure mode carries distinct copy; only encoding says 'still encoding'", () => {
  const values = Object.values(ADMIN_AUDIO_COPY);
  assert.equal(new Set(values).size, values.length, "copy strings must be distinct");
  assert.match(ADMIN_AUDIO_COPY.encoding, /still encoding/i);
  for (const [key, text] of Object.entries(ADMIN_AUDIO_COPY)) {
    if (key === "encoding") continue;
    assert.doesNotMatch(
      text,
      /still encoding/i,
      `${key} copy must not claim the master is still encoding`,
    );
  }
  // stream/signing failures explicitly disclaim the encoding excuse
  assert.match(ADMIN_AUDIO_COPY.streamFailed, /isn't an encoding delay/i);
});

test("banner helper: encoding gets the override text, others render their own message", () => {
  const override = "This master is still encoding — preview-play will light up once Mux finishes.";
  assert.equal(
    adminAudioBannerText(
      { code: "encoding", message: ADMIN_AUDIO_COPY.encoding },
      { encodingText: override },
    ),
    override,
  );
  for (const code of ["unplayable", "stream-failed", "mux-errored", "mux-sign-failed"] as const) {
    const message = `distinct ${code} message`;
    assert.equal(
      adminAudioBannerText({ code, message } as any, { encodingText: override }),
      message,
      `${code} must never render the encoding banner text`,
    );
  }
});

// ── ready track attaches, never "encoding" ───────────────────────────
test("ready track attaches the signed Mux URL — no encoding reason", async () => {
  resetStub({ ok: true, status: 200, body: { url: "https://stream.mux.com/pb.m3u8?token=t" } });
  const audio = fakeAudio();
  const res = await attachAdminAudio(
    audio,
    { id: "s1", audioUrl: "/objects/uploads/x.flac", muxPlaybackId: "pb", muxStatus: "ready" },
    { hlsRef },
  );
  assert.ok("url" in res, "expected an attach, got a reason");
  assert.equal((res as any).source, "mux");
  assert.equal(audio.src, "https://stream.mux.com/pb.m3u8?token=t");
});

// ── stale "preparing" self-heals when the server can sign ────────────
test("client says preparing but server signs a URL → self-heals to Mux stream", async () => {
  resetStub({ ok: true, status: 200, body: { url: "https://stream.mux.com/pb2.m3u8?token=t2" } });
  const audio = fakeAudio();
  const res = await attachAdminAudio(
    audio,
    { id: "s2", audioUrl: "/objects/uploads/y.flac", muxPlaybackId: "pb2", muxStatus: "preparing" },
    { hlsRef },
  );
  assert.ok("url" in res, "stale-encoding track should have attached via the server probe");
  assert.equal((res as any).source, "mux");
  assert.equal(fetchCalls.length, 1);
  assert.match(fetchCalls[0], /\/api\/songs\/s2\/playback-url$/);
});

// ── genuinely encoding: server 409 preparing → encoding reason ───────
test("server-confirmed preparing renders the encoding reason", async () => {
  resetStub({
    ok: false,
    status: 409,
    body: { message: "Mux asset not ready", status: "preparing" },
  });
  const audio = fakeAudio();
  const res = await attachAdminAudio(
    audio,
    { id: "s3", audioUrl: "/objects/uploads/z.flac", muxPlaybackId: null, muxStatus: "preparing" },
    { hlsRef },
  );
  assert.ok("reason" in res);
  assert.equal((res as any).reason.code, "encoding");
  assert.equal((res as any).reason.message, ADMIN_AUDIO_COPY.encoding);
});

// ── server says errored → mux-errored copy, NOT encoding ─────────────
test("server-confirmed errored asset renders mux-errored copy, not encoding", async () => {
  resetStub({
    ok: false,
    status: 409,
    body: { message: "Mux asset not ready", status: "errored", lastError: "download failed" },
  });
  const audio = fakeAudio();
  const res = await attachAdminAudio(
    audio,
    { id: "s4", audioUrl: "/objects/uploads/w.flac", muxPlaybackId: null, muxStatus: "ingesting" },
    { hlsRef },
  );
  assert.ok("reason" in res);
  assert.equal((res as any).reason.code, "mux-errored");
  assert.doesNotMatch((res as any).reason.message, /still encoding/i);
});

// ── probe failures that are NOT encoding must not claim encoding ─────
test("stale-encoding probe hits a 500 → non-encoding failure reason", async () => {
  resetStub({ ok: false, status: 500, body: { message: "Failed to sign playback URL" } });
  const audio = fakeAudio();
  const res = await attachAdminAudio(
    audio,
    { id: "s7", audioUrl: "/objects/uploads/u.flac", muxPlaybackId: null, muxStatus: "preparing" },
    { hlsRef },
  );
  assert.ok("reason" in res);
  assert.equal((res as any).reason.code, "mux-sign-failed");
  assert.doesNotMatch((res as any).reason.message, /still encoding/i);
});

test("stale-encoding probe 409 not_ingested → non-encoding failure reason", async () => {
  resetStub({
    ok: false,
    status: 409,
    body: { message: "Song has no Mux asset", status: "not_ingested" },
  });
  const audio = fakeAudio();
  const res = await attachAdminAudio(
    audio,
    { id: "s8", audioUrl: "/objects/uploads/t.flac", muxPlaybackId: null, muxStatus: "ingesting" },
    { hlsRef },
  );
  assert.ok("reason" in res);
  assert.notEqual((res as any).reason.code, "encoding");
  assert.doesNotMatch((res as any).reason.message, /still encoding/i);
});

test("stale-encoding probe network failure → non-encoding failure reason", async () => {
  const realFetch = g.fetch;
  g.fetch = async () => {
    throw new TypeError("Failed to fetch");
  };
  try {
    const audio = fakeAudio();
    const res = await attachAdminAudio(
      audio,
      { id: "s9", audioUrl: "/objects/uploads/r.flac", muxPlaybackId: null, muxStatus: "preparing" },
      { hlsRef },
    );
    assert.ok("reason" in res);
    assert.equal((res as any).reason.code, "mux-sign-failed");
    assert.doesNotMatch((res as any).reason.message, /still encoding/i);
  } finally {
    g.fetch = realFetch;
  }
});

// ── signing failure keeps its own reason after retry ─────────────────
test("ready track whose signing fails twice → mux-sign-failed, not encoding", async () => {
  resetStub(
    { ok: false, status: 500, body: { message: "Failed to sign playback URL" } },
    { ok: false, status: 500, body: { message: "Failed to sign playback URL" } },
  );
  const audio = fakeAudio();
  const res = await attachAdminAudio(
    audio,
    { id: "s5", audioUrl: "/objects/uploads/v.flac", muxPlaybackId: "pb5", muxStatus: "ready" },
    { hlsRef },
  );
  assert.ok("reason" in res);
  assert.equal((res as any).reason.code, "mux-sign-failed");
  assert.equal((res as any).reason.message, ADMIN_AUDIO_COPY.signFailed);
});

// ── raw fallback (no Mux state at all) attaches the master directly ──
test("un-ingested track falls back to the raw master with source=raw", async () => {
  resetStub();
  const audio = fakeAudio();
  const res = await attachAdminAudio(
    audio,
    {
      id: "s6",
      audioUrl: "https://dl.dropboxusercontent.com/x/master.wav",
      muxPlaybackId: null,
      muxStatus: null,
    },
    { hlsRef },
  );
  assert.ok("url" in res);
  assert.equal((res as any).source, "raw");
  assert.equal(fetchCalls.length, 0, "no playback-url probe for a never-ingested track");
});
