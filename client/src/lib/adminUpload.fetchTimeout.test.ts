// Task #3200 — the progress uploader's sign + finalize legs are bounded by
// `fetchWithTimeout`: a finalize request that hangs forever used to leave the
// template live-test Save frozen on "Saving…" with no feedback. This pins the
// helper's two behaviors: a stalled request rejects with the actionable
// timeout message, and a request that answers in time passes through.
//
//   GT_TEST=1 TSX_TSCONFIG_PATH=tsconfig.test.json npx tsx --test client/src/lib/adminUpload.fetchTimeout.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { fetchWithTimeout } from "./adminUpload";

const realFetch = globalThis.fetch;

test("a stalled request rejects with the actionable timeout message", async (t) => {
  t.after(() => {
    globalThis.fetch = realFetch;
  });
  // Never settles on its own; only the abort signal can end it.
  globalThis.fetch = ((_input: any, init?: any) =>
    new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () =>
        reject(new DOMException("The operation was aborted.", "AbortError")),
      );
    })) as typeof fetch;

  await assert.rejects(
    fetchWithTimeout("/api/admin/upload-doc/finalize", { method: "POST" }, 50, "finishing the upload"),
    /Timed out finishing the upload/,
  );
});

test("a request that answers in time passes through untouched", async (t) => {
  t.after(() => {
    globalThis.fetch = realFetch;
  });
  globalThis.fetch = (async () => new Response("ok", { status: 200 })) as typeof fetch;
  const res = await fetchWithTimeout("/x", { method: "GET" }, 1000, "testing");
  assert.equal(res.status, 200);
});

test("a non-timeout network failure keeps its own error", async (t) => {
  t.after(() => {
    globalThis.fetch = realFetch;
  });
  globalThis.fetch = (async () => {
    throw new TypeError("Failed to fetch");
  }) as typeof fetch;
  await assert.rejects(fetchWithTimeout("/x", { method: "GET" }, 1000, "testing"), /Failed to fetch/);
});
