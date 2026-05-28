---
name: napi-rs native binary packages and esbuild externals
description: Why @napi-rs/* (and other napi-rs packages) break the production esbuild bundle even when the parent dep is in package.json, and how to fix it.
---

## Rule
When adding any `@napi-rs/*` package (or any other npm package whose native binary ships as platform-specific *sibling* packages — e.g. `pkg-linux-x64-gnu`, `pkg-darwin-arm64`, …), add a glob entry for the sibling packages to the esbuild `external` list in `script/build.ts`.

## Why
`script/build.ts` builds the externals list by taking `Object.keys(pkg.dependencies)` ∪ `devDependencies` and removing the bundling allowlist. napi-rs publishes the actual native binary inside a separate per-platform package and lists it as an *optional* dep on the parent — those optional siblings are NEVER in our `dependencies`/`devDependencies`, so the filter doesn't see them. esbuild then follows the `require("@napi-rs/<pkg>-linux-x64-gnu")` inside the parent's `js-binding.js`, tries to bundle `skia.linux-x64-gnu.node`, and fails with `No loader is configured for ".node" files`. Dev mode works because tsx never bundles.

## How to apply
- Add `"@napi-rs/<pkg>-*"` (e.g. `"@napi-rs/canvas-*"`) to the externals array in `script/build.ts` alongside the existing `allDeps.filter(...)` spread.
- Same pattern applies to other libraries that distribute platform binaries this way: sharp (`@img/sharp-*`), lightningcss, swc, esbuild itself, etc. Any time `npm i <thing>` adds sibling `*-linux-*`/`*-darwin-*` entries under `node_modules/`, externalize the glob.
- Verify by running `npm run build` locally before publishing — the failure only surfaces in the production esbuild step.
