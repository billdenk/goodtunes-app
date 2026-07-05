import { test } from "node:test";
import assert from "node:assert/strict";
import {
  signPreviewPass,
  verifyPreviewPass,
  readPreviewPass,
} from "./previewPass";

// Task #1766 — the preview pass is the staged-launch "review mode" credential:
// it must round-trip for the album it was minted for, reject tampering/expiry,
// and (via readPreviewPass) only ever surface a pass that actually verifies.
// The leak-safe re-resolve in routes.ts depends on `albumId` being trustworthy,
// and the no-charge guarantee depends on a forged/expired pass being unusable.

test("a freshly minted pass round-trips with its albumId and review mode", () => {
  const token = signPreviewPass("album-123");
  const pass = verifyPreviewPass(token);
  assert.ok(pass, "valid token should verify");
  assert.equal(pass!.albumId, "album-123");
  assert.equal(pass!.mode, "review");
  assert.ok(pass!.exp > Math.floor(Date.now() / 1000));
});

test("a tampered payload (swapped albumId) fails verification", () => {
  const token = signPreviewPass("album-A");
  const [, sig] = token.split(".");
  // Re-encode a different albumId but keep the original signature.
  const forgedPayload = Buffer.from(
    JSON.stringify({
      albumId: "album-B",
      mode: "review",
      exp: Math.floor(Date.now() / 1000) + 1000,
    }),
  )
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  assert.equal(verifyPreviewPass(`${forgedPayload}.${sig}`), null);
});

test("a tampered signature fails verification", () => {
  const token = signPreviewPass("album-123");
  const [payload] = token.split(".");
  assert.equal(verifyPreviewPass(`${payload}.deadbeef`), null);
});

test("an expired pass does not verify", () => {
  // signPreviewPass takes an options object; ttlSeconds:-1 mints an
  // already-expired pass (exp = now - 1s) so verify must reject it.
  const token = signPreviewPass("album-123", { ttlSeconds: -1 });
  assert.equal(verifyPreviewPass(token), null);
});

test("malformed / empty tokens verify as null (no throw)", () => {
  assert.equal(verifyPreviewPass(null), null);
  assert.equal(verifyPreviewPass(undefined), null);
  assert.equal(verifyPreviewPass(""), null);
  assert.equal(verifyPreviewPass("not-a-token"), null);
  assert.equal(verifyPreviewPass("a.b.c"), null);
});

test("readPreviewPass pulls the pass from the X-Preview-Pass header", () => {
  const token = signPreviewPass("album-xyz");
  assert.equal(
    readPreviewPass({ headers: { "x-preview-pass": token } })!.albumId,
    "album-xyz",
  );
  // Array-valued header (proxy duplication) takes the first entry.
  assert.equal(
    readPreviewPass({ headers: { "x-preview-pass": [token, "junk"] } })!.albumId,
    "album-xyz",
  );
  // No header → no pass.
  assert.equal(readPreviewPass({ headers: {} }), null);
  // A garbage header never yields a usable pass.
  assert.equal(readPreviewPass({ headers: { "x-preview-pass": "forged" } }), null);
});
