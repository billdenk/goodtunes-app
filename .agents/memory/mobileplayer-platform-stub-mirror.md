---
name: mobile-player test platform stub must mirror @/lib/platform exports
description: The mobilePlayer scrubber test stubs @/lib/platform; new exports Player.tsx imports must be added to the stub or the test fails to link.
---

# mobile-player test platform stub must mirror @/lib/platform exports

`client/src/pages/mobilePlayerScrubber.test.ts` loads Player.tsx through a
custom ESM loader (`client/src/pages/mobilePlayerLoader.mjs`) that REPLACES
`@/lib/platform` with a synthetic in-source stub (`PLATFORM_STUB_SOURCE`).

**Rule:** any NEW named export of `@/lib/platform` that Player.tsx (or its
import graph) starts importing MUST also be added to the stub, or the test
dies at link time with `does not provide an export named 'X'` (static ESM
named-export check) — even though the real module exports it.

**Why:** the stub is a hand-maintained parallel copy, not a re-export. It
intentionally hard-codes web/jsdom defaults and exposes `isIOS` as a live
`let` flipped by `__setTestIsIOS`. When the volume gate moved from `!isIOS`
to `!isWebIOS`, the stub still only exported `isIOS`, so the import broke.

**How to apply:** in the stub, gates the test toggles via `__setTestIsIOS`
must flip every binding that tracks iOS together. In this web stub
`isNative` is always false, so `isWebIOS === isIOS` — set both in the setter.
Bindings the test doesn't toggle can be hard-coded constants.
