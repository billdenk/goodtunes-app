// Task #3359 — estimate email mockup renderer: SSRF posture + render
// fallbacks. The renderer is reachable through a PUBLIC token route
// (GET /api/estimate-link/:token/mockup.png) and its source URLs are
// press-editor-influenced, so the source reader must be fail-closed:
// object-storage paths only, NEVER an outbound HTTP request.
import test from "node:test";
import assert from "node:assert/strict";

import { fetchImageBytes, renderEstimateMockupImage } from "./estimateMockup";

// ── Fail-closed source reads: no network, object storage only ────────────
test("fetchImageBytes rejects every non-object-storage source without fetching", async (t) => {
  const realFetch = globalThis.fetch;
  let fetchCalls = 0;
  (globalThis as any).fetch = async () => { fetchCalls += 1; throw new Error("network fetch must never happen"); };
  t.after(() => { (globalThis as any).fetch = realFetch; });

  const rejected = [
    "https://evil.example/art.png", // external host
    "http://127.0.0.1:5000/objects/uploads/x.png", // loopback absolute
    "http://localhost:5000/internal", // loopback by name
    "http://[::1]/art.png", // IPv6 loopback
    "http://169.254.169.254/latest/meta-data", // cloud metadata
    "http://10.0.0.5/img.png", // RFC1918
    "http://[::ffff:127.0.0.1]/x.png", // IPv4-mapped IPv6
    "//evil.example/x.png", // protocol-relative
    "data:image/png;base64,AAAA", // data URI
    "file:///etc/passwd",
    "/objects/uploads/../../secrets", // traversal inside the allowed prefix
    "/album-placeholder.svg", // non-objects relative path
    "objects/uploads/x.png", // missing leading slash
  ];
  for (const src of rejected) {
    assert.equal(await fetchImageBytes(src), null, `must reject: ${src}`);
  }
  assert.equal(fetchCalls, 0, "no outbound HTTP request may ever be made");
});

test("fetchImageBytes returns null (not throw) for a missing object", async () => {
  // Allowed prefix, nonexistent object → storage lookup fails → null, so the
  // renderer draws its fallback instead of 500ing the public route.
  const out = await fetchImageBytes("/objects/uploads/00000000-0000-0000-0000-000000000000.png");
  assert.equal(out, null);
});

// ── Render fallbacks: a valid estimate always yields a PNG ────────────────
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

test("house jacket + neutral disc renders a PNG with zero loadable sources", async () => {
  const buf = await renderEstimateMockupImage({
    artUrl: null,
    pressName: "Memphis Record Pressing",
    pressLogoUrl: null,
    colorName: "Some Unknown Color",
  });
  assert.ok(buf.length > 1000, "non-trivial image bytes");
  assert.ok(buf.subarray(0, 4).equals(PNG_MAGIC), "PNG magic header");
});

test("hostile art/logo URLs degrade to the house jacket, never break the render", async () => {
  const buf = await renderEstimateMockupImage({
    artUrl: "http://169.254.169.254/latest/meta-data",
    pressName: "X Press",
    pressLogoUrl: "https://evil.example/logo.png",
    colorName: null,
  });
  assert.ok(buf.subarray(0, 4).equals(PNG_MAGIC), "still a valid PNG");
});
