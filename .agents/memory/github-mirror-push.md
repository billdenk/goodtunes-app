---
name: GitHub build-mirror push (Codemagic)
description: How to manually sync this Replit project's main to github.com/billdenk/goodtunes-app for Codemagic iOS builds.
---

# Pushing to the GitHub build mirror (Codemagic source)

Codemagic builds iOS from `github.com/billdenk/goodtunes-app` branch `main`. Replit is the
source of truth; GitHub is only a build mirror. The remote already exists locally as
`subrepl-8shaawlm` -> `https://github.com/billdenk/goodtunes-app.git`, but the remote NAME
differs per environment and may be absent in a fresh post-merge clone, so always push to the
**URL directly**, not a remote name.

## This is now automatic (post-merge), so you rarely push by hand

`scripts/post-merge.sh` ends with `sync_github_build_mirror`, which force-pushes the merged
HEAD to GitHub `main` on **every merge to project main**. It uses the same recipe below
(token header + `--no-verify` + `GIT_LFS_SKIP_PUSH=1`), pushes to the URL directly, is
best-effort (a failure only logs a WARNING, never fails the merge), and is `timeout 90`-bounded.
So GitHub tracks project main within the post-merge window with no manual steps. The manual
recipe below is the fallback for a one-time catch-up if the auto-sync ever WARNs repeatedly
(e.g. token revoked, GitHub outage) and GitHub drifts behind. The big ~2.4 GB catch-up only
happens once after a long stall; steady-state incremental pushes are a handful of commits and
finish in seconds, which is why the foreground post-merge step is safe.

## The two gotchas that make a naive `git push` fail

1. **Password auth is dead.** `git push subrepl-8shaawlm ...` fails instantly with
   "Password authentication is not supported." Auth via the `GITHUB_TOKEN` env var
   (Replit-provided, has admin/push on this repo) using an HTTP header:
   `AUTH=$(printf 'x-access-token:%s' "$GITHUB_TOKEN" | base64); git -c http.extraheader="Authorization: Basic $AUTH" push ...`
   Never print the token; redact base64 blobs in any logged output.

2. **LFS pre-push hook hangs.** The remote has
   `remote.subrepl-8shaawlm.lfsurl ssh://git@ssh.kirk.replit.dev/...` and a `pre-push`
   hook running `git lfs pre-push`, which tries to upload LFS objects to the Replit SSH
   host and blocks on a `git@ssh.kirk.replit.dev's password:` prompt. Only TWO files are
   LFS-tracked (screen recordings in `attached_assets/`, irrelevant to the build), so push
   with `--no-verify` (skips the hook) + `GIT_LFS_SKIP_PUSH=1`. GitHub gets the tiny LFS
   pointer blobs, which is fine for the build mirror. The real iOS assets (AppIcon PNGs)
   are normal git blobs, not LFS.

## Why it needs a workflow, not bash

The delta is large (~2.4 GB / ~20k objects even though `.git/lfs` is only ~184 MB — many
big non-LFS blobs live in history). It exceeds the 2-minute bash tool timeout, and
backgrounded bash processes get REAPED when the tool's shell session ends (empty log,
process gone). Run the push as a platform **workflow** (`configureWorkflow` console type,
no port), poll `getWorkflowStatus` / `git ls-remote`, then `removeWorkflow` when done.
A full push takes ~2 min of upload at ~20 MB/s after enumerate/compress.

## Why the history is fat, and how to shrink it

The ~2.4 GB is almost entirely `attached_assets/` — the chat-upload dir (~3.1 GB / ~3,800
files in the tree). The build imports only ~23 small IMAGES from it via the `@assets/...`
alias (all static `.png`/`.jpg`, e.g. in `client/src/data/musicData.ts`); the rest is
screen recordings / screenshots / zips nothing references. Two layers:

1. **Forward-looking (in repo):** `.gitattributes` LFS-tracks large *non-build* media
   under `attached_assets/` (video/recording/audio/archive extensions, case-insensitive,
   root + nested). It deliberately tracks NO image globs — build-imported images and the
   iOS AppIcon PNGs must stay normal blobs, because the mirror is pushed with
   `GIT_LFS_SKIP_PUSH=1` (no LFS objects on GitHub) so any build-imported file in LFS is
   a broken pointer at Codemagic checkout. Verify patterns with `git check-attr filter -- <path>`.

2. **One-time history rewrite (operator/Bill action — NOT the agent; needs git, which is
   platform-managed/forbidden in the isolated task env):** `scripts/shrink-git-history.sh`
   auto-derives the ~23 keep paths from live `@assets` refs, enumerates every
   `attached_assets/` path across all history, strips the rest with `git filter-repo`
   (`--invert-paths --paths-from-file`). Dry-run by default, `--apply` to rewrite. Run on a
   throwaway clone, `npm run build` to verify the kept assets resolve, then **force-push the
   mirror** (recipe above) — it changes every SHA, so all clones (incl. the Replit project)
   must re-clone. `git-filter-repo` is NOT installed in the Replit env; only `git lfs` is.
   Operator runbook: `docs/codemagic-builds.md` → "Keeping the GitHub mirror small".

## Verify after

`git ls-remote subrepl-8shaawlm refs/heads/main` must equal local HEAD. Spot-check the
pushed commit via GitHub API: `AppIcon.appiconset` PNGs present, codemagic.yaml guard
steps present, guard scripts return HTTP 200. Histories diverge (GitHub tip is not in
local history) but share a common ancestor, so it is a force-push of the delta, not a
full-repo upload.
