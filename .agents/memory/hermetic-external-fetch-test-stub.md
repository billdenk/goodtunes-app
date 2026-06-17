---
name: Hermetic external-fetch stubbing in route tests
description: How to drive a route that streams an external URL + calls a third-party API through the real handler with zero network, DNS, ffmpeg, or AI.
---

When a real route test must drive a handler that (a) streams an operator-supplied
external URL through the SSRF guard and (b) calls a third-party API (ElevenLabs,
OpenAI, Mux), make it hermetic WITHOUT touching `server/routes.ts`:

- **Stub `globalThis.fetch` in `before`, restore in `after`.** The route resolves
  `fetch` at call time, so a swap is seen by the handler. Match the third-party
  host (return canned JSON) and the audio/asset host (return a few bytes with
  `content-type` + `content-length`); fall through to a captured `realFetch` for
  everything else. **The test's own loopback POST must use `realFetch`**, not the
  stub, or the request to your own server gets intercepted.
- **Defeat the SSRF/private-IP guard with an IP-LITERAL host**, e.g.
  `https://203.0.113.10/x.wav` (TEST-NET-3 — public, never matches the
  private-IP check). `dns.lookup` short-circuits IP literals (returns them with
  NO network query), so `assertPublic` passes offline. Don't use a real domain
  (real DNS = flaky/networked).
- **Dodge ffmpeg**: give the URL a passthrough extension (`.wav`) and keep the
  stubbed body under the direct-send cap so `needsTranscode` stays false.
- **Dodge the AI fallback**: craft the canned transcription so the deterministic
  path resolves (for auto-GoodSync, embed a `[Chorus]` marker line so the chorus
  finder never calls OpenAI).

**Why:** these are the seams that are NOT exported from `registerRoutes`
(transcription/Mux closures), so global `fetch` + the dns IP-literal trick are the
only no-network handles. **How to apply:** any new route test that pulls an
external file or calls a vendor API.

Note: such db tests exit 124 under `tsx --test` (boot schedulers never unref) —
that's a PASS; read the streamed `--test-reporter=spec` ✔/✖ lines, never the exit
code. See odoo-printer-integration.md.
