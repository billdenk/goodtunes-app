---
name: Fan search nullable-.length crash + self-diagnosing reports
description: Why optional-chaining only the parent (r?.x.length) crashed the whole fan app on iOS, and how prod error reports name the screen now.
---

# Whole-fan-app crash: `r?.category.length`

`TypeError: null is not an object (evaluating 'X.length')` taking down the
entire fan app on iOS Safari traced to `useFanSearch` (`client/src/hooks/useFanSearch.ts`),
which backs the BottomNav search dock mounted on **every** fan page — so a
crash there blanks the whole app, and the componentStack ("under
TooltipProvider") is useless for locating it.

**Root cause:** `r?.artists.length` only guards `r` being null. If the
`/api/search` payload has `r` present but a *category array* null (partial /
malformed payload), `r.artists` → null → `.length` throws. Same trap in the
spread (`...r.artists` → "not iterable") and in FullResults
(`client/src/components/search/views.tsx`), which renders whenever
`counts.top > 0` even if an individual category is null.

**Rule:** optional-chain BOTH the parent AND the nullable array: `r?.x?.length ?? 0`,
`...(r.x ?? [])`, `(arr ?? []).slice()`. A field typed as a non-null array
(`tracks: Array<…>`, `instruments: Array<…>`) is a TS *promise*, not a runtime
guarantee — any value that comes straight off a JSON response can still be
null. The same fix was applied to AlbumDetail PersonProfile.tracks /
VendorProfile.instruments sites.

**Why:** TS sees these as safe and won't flag them; the crash only shows up at
runtime with a real (partial) API response, and the blast radius is the whole
app because the surface is global chrome.

# Self-diagnosing prod error reports

Prod ships **no source maps** and minifies names, so componentStacks read like
`U.length`. Two changes make the next tap-to-report identify itself:

- `esbuild: { keepNames: true }` in `vite.config.ts` — keeps real component
  names through minification so the React componentStack says `AlbumDetail`,
  not `U`. Negligible bundle cost; this is the lever for readable prod stacks.
- `parseComponentName(componentStack)` in
  `client/src/components/GlobalErrorBoundary.tsx` (pure, unit-tested) pulls the
  throwing component's name (skips lowercase host elements), threaded with the
  throw-time route through `FriendlyErrorContext.{componentName,route}` →
  `errorReport.buildPayload`/`buildMailto` → `POST /api/error-reports`
  (`server/routes.ts`) → `sendErrorReportEmail` (`server/mail.ts`, adds a
  "Component:" line). buildPayload prefers context.route over live URL so the
  report names the screen that broke, not where the user drifted to.
