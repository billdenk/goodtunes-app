---
name: Deployment image > 8 GiB limit
description: Publish fails at the final layer step with "image size is over the limit of 8 GiB" — cause + fix via .replitignore
---

# Deploy fails: "image size is over the limit of 8 GiB"

**Symptom:** Publish/deploy fails but the build itself succeeds. `getDeploymentBuild({buildId})`
logs show vite ✓ built, `dist/index.cjs` written, security scan complete, then the LAST line is
`error: image size is over the limit of 8 GiB`. `npm run build` passes locally. `fetchDeploymentLogs`
returns nothing (never reached runtime). This is NOT a code/compile/esbuild-stage failure — do not
chase compile errors or the stale-deploy triage.

**Root cause:** the autoscale/cloud_run deployment image packages the whole workspace. The bloat here
is committed non-runtime bulk: `.git` history (multi-GB, because large media is committed) and
`attached_assets/` (thousands of historical chat attachments — screenshots/PSD zips/screen
recordings/PDFs). The deployed web app only needs the build inputs + the handful of `attached_assets`
the client bundle imports, and at runtime only `dist/` + node_modules.

**Fix:** a `.replitignore` at repo root (gitignore syntax; Replit docs confirm this excludes files
from the deployment image). Exclude `.git`, agent/tooling dirs (`.local`, `.agents`, `.canvas`,
`.cache`, `exports`, `.upm`), the `artifacts` mockup-sandbox, native `ios`/`android` projects, and
almost all of `attached_assets`.

**How to apply safely — the TWO landmines (a build-time set AND a runtime set):**
`attached_assets` is consumed two different ways, and BOTH must survive:
- Build-time: files imported via the `@assets/` alias (vite.config.ts `@assets` → `attached_assets`)
  — `npm run build` runs inside the deployment, so a dropped import = deploy-build break (loud).
- Runtime: files the server reads from disk with `path.resolve(process.cwd(), "attached_assets",
  "<file>")` (e.g. cert / GoodDeed print-PDF generation in server/certificates.ts +
  server/goodDeedPrintTemplate.ts). A dropped runtime file does NOT fail the build — it ENOENTs
  silently the first time that feature runs in prod (SILENT). An `@assets/`-only grep MISSES these
  because the path is split across `path.resolve()` args, so no single string matches.

Recipe:
1. Build set: `rg -oN "@assets/[A-Za-z0-9._/-]+\.(png|jpg|jpeg|svg|webp)" client shared server`
   (ignore literal `@assets/...` ellipsis examples from doc comments — not real files).
2. Runtime set: `rg -n "attached_assets" server shared` → any `path.resolve(..., "attached_assets",
   "<file>")` fs reads; keep every such `<file>` too.
3. Ignore the dir then re-include exactly those: `attached_assets/*` + `!attached_assets/instruments`
   + `!attached_assets/*.jpg|*.jpeg|*.svg|*.webp` + `!` each imported/read `.png` by name.
4. Simulate coverage before trusting it (classify every ref against the keep-rules; assert 0 dropped).

**Why the keep-set is mostly jpg/svg:** the imported assets are small logos/instrument photos;
the ~3.6 GB of PNGs in attached_assets are unreferenced screenshots. Do NOT blanket-ignore `*.png`
repo-wide (client build imports some) — always scope png rules to `attached_assets/`.

After fixing, call `suggestDeploy()` to prompt a re-publish; don't trigger the deploy directly.
