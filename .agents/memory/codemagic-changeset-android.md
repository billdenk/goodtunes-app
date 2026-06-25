---
name: Codemagic when.changeset for the Android shell
description: How/why android-internal only auto-builds on native-shell changes, and why it's safe under the force-pushed mirror.
---

# Codemagic `when.changeset` — Android native-shell-only auto-build

`android-internal` in `codemagic.yaml` carries a workflow-level `when.changeset`
(includes: `android/`, `capacitor.config.ts`, `package.json`, `package-lock.json`;
`codemagic.yaml` is always included by default). So an automatic (webhook) build
only RUNS when a merge touched the native shell. iOS workflows have no `when`.

**Why:** the apps are thin Capacitor shells loading the live site, so
web/server/content/docs merges reach devices on republish — a new `.aab` is only
needed when the shell changes. Without the filter, every mirror push auto-built a
~$0.50 no-op (≈all of the last 200 merges touched zero native files).

**Why it's safe under the force-pushed mirror (the non-obvious part):** Codemagic
computes the changeset against the **LAST SUCCESSFUL build's commit**, NOT the
webhook's before-SHA. Project `main` is append-only, so `scripts/post-merge.sh`'s
defensive `git push --force HEAD:refs/heads/main` still presents a fast-forward and
the diff is clean. It **fails OPEN** (builds anyway) on the first build after the
filter lands and whenever the base is unreachable. If a native build fails, the
native diff stays "included" until a later successful native build re-anchors the
base.

**How to apply / gotchas:**
- `includes` DISABLES the default include-all — list every native path explicitly,
  or a real native change skips (the dangerous direction). The include set is
  complete because the Android shell can only change via those paths.
- Bias is toward BUILD: listing `package.json`/lock also rebuilds on non-native
  dep bumps (acceptable). A wasted ~$0.50 beats shipping testers a stale shell.
- Don't add `ios/` to this workflow — iOS-only changes don't affect the `.aab`.
- Manual "Start new build" ignores `when` (when-conditions apply to webhook builds
  only) — that's the backstop for a rare wrong-skip.
- Don't try a script-level early-guard skip: it runs AFTER the build starts and
  breaks the declarative `publishing.google_play` step (no `.aab`). `when` is the
  right control point.
- The mirror still syncs every merge (the per-merge "force-push to GitHub" lines in
  docs are still accurate); only the BUILD is now conditional.
