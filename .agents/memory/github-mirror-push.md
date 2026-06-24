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
HEAD to GitHub `main` on **every merge to project main**. It runs three steps, all
best-effort (a failure only logs a WARNING, never fails the merge):

1. **Fetch GitHub's tip first** into `refs/remotes/ghmirror/main`. Load-bearing, not
   optional — see "Always fetch before you push" below.
2. **Upload any new LFS objects** the merged commits added, targeted by `--object-id`
   (never `git lfs push --all`) — see "GH008 / LFS" below.
3. **Force-push** HEAD to `main` via the URL directly (token header + `--no-verify` +
   `GIT_LFS_SKIP_PUSH=1`), capturing stderr so a WARNING prints the real git error.

Steady-state pushes are a handful of commits and finish in seconds. The manual recipe below
is the fallback for a one-time catch-up if the auto-sync ever WARNs repeatedly (e.g. token
revoked, GitHub outage, LFS quota) and GitHub drifts behind.

## Time-budget coupling: keep the mirror's per-step timeouts UNDER the platform budget

`sync_github_build_mirror` is the LAST, best-effort step of `scripts/post-merge.sh`, but the
platform kills the **entire** post-merge script at its configured timeout (`[postMerge]` in
`.replit`, set via `setPostMergeConfig`). The idempotent dual-DB migration suite ahead of it
already burns ~110-120s every merge. So if the mirror step's own per-step `timeout`s are
bigger than the remaining budget, a slow/diverged GitHub makes the platform kill the whole
script **mid-push** → the merge's post-merge reports SETUP_FAILED even though all DB work
already finished. (Symptom seen once: post-merge timed out at 180000ms, stdout's last line was
"syncing GitHub build mirror" with no "sync ok" after — i.e. the push, not a migration, ate
the budget.)

**Two-part fix, both load-bearing:**
1. Platform budget bumped to **300000ms** so the ~120s migration suite + bounded mirror fit
   with headroom. Don't drop it back to 180000.
2. The mirror step is **deadline-aware**: a hard wall-clock cap (`MIRROR_BUDGET=150s` from the
   function's start, via `mirror_deadline=$((SECONDS+150))`) and EVERY step clamped to the time
   that actually remains (fetch ≤60s, each LFS object ≤120s, push ≤90s) — including the rare
   new-LFS-object loop, which checks remaining budget per object and breaks (WARN) rather than
   overrun. If the budget is exhausted the function returns 0 with a WARNING; a slow GitHub OR a
   big new LFS object degrades to "Codemagic catches up next merge" instead of blowing the
   budget. **Never raise these to match a manual full-push time** — a real full push is the rare
   diverged case the fetch-first already collapses. A bounded-out mirror is harmless (self-heals
   on the next merge's force-push); a budget-blown post-merge is a scary false failure. NB the
   step is best-effort and uses `set -e`, so keep numeric comparisons inside `if [ … ]` guards
   (a bare `[ … ]` that's false would exit the whole script). The token-bearing temp `ghlfs`
   remote is wrapped in a `trap '… remote remove ghlfs' RETURN` so the token can't linger in
   `.git/config` on any early-return/out-of-budget path.

**Silent-staleness coupling (matters now that Android auto-builds).** `codemagic.yaml`'s
`android-internal` workflow auto-triggers on every push to `main` of this mirror (iOS stays
manual). So a failing mirror push no longer just blocks a button you'd click — internal-track
testers SILENTLY keep getting the old `.aab` with no failed-build signal. If Bill reports
"Android testers are on an old build," check the post-merge `sync_github_build_mirror` WARNING
first before suspecting Codemagic. The WARNING now prints the tail of the real git error
(stderr is captured, not `>/dev/null`), so it should say WHY: HTTP 500 (fetch-before-push
regressed → full pack), GH008 (a new LFS object wasn't uploaded), or auth/quota.

## The two gotchas that make a naive `git push` fail

1. **Password auth is dead.** `git push subrepl-8shaawlm ...` fails instantly with
   "Password authentication is not supported." Auth via the `GITHUB_TOKEN` env var
   (Replit-provided, has admin/push on this repo) using an HTTP header:
   `AUTH=$(printf 'x-access-token:%s' "$GITHUB_TOKEN" | base64); git -c http.extraheader="Authorization: Basic $AUTH" push ...`
   Never print the token; redact base64 blobs in any logged output.

2. **LFS pre-push hook hangs.** The remote has
   `remote.subrepl-8shaawlm.lfsurl ssh://git@ssh.kirk.replit.dev/...` and a `pre-push`
   hook running `git lfs pre-push`, which tries to upload LFS objects to the Replit SSH
   host and blocks on a `git@ssh.kirk.replit.dev's password:` prompt. The LFS-tracked files
   are screen recordings/audio/zips in `attached_assets/` (irrelevant to the build), so push
   the *refs* with `--no-verify` (skips the hook) + `GIT_LFS_SKIP_PUSH=1`. But that alone is
   NOT enough — the LFS *objects* must still reach GitHub or you hit GH008; see "GH008 / LFS"
   below. The real iOS assets (AppIcon PNGs) are normal git blobs, not LFS.

## Always fetch before you push (HTTP 500 = diverged history)

If GitHub's `main` tip is NOT in local history (diverged — happens across rebases/rewrites or
when a force-push from elsewhere lands), a plain push can't negotiate a common base and
re-sends the **entire** ~2.8 GB closure (`pack-reused 0`), which exceeds GitHub's per-push
limit → **HTTP 500 (`the remote end hung up`)** and the mirror falls permanently behind. Fix:
`git -c http.extraheader=... fetch --no-tags <URL> main:refs/remotes/ghmirror/main` FIRST, then
push — this collapses the upload to the true delta (~70 MiB / a few seconds). The post-merge
sync does this automatically (STEP 1); any manual catch-up must too.

**Use a FORCE refspec (`+main:...`) for that fetch.** Across prior failed syncs the local
tracking ref `refs/remotes/ghmirror/main` can drift AHEAD of GitHub's real tip (e.g. a manual
catch-up advanced GitHub but a plain `main:...` fetch left the tracking ref stale, or vice
versa). A non-force fetch then fails **`non-fast-forward`**, which silently sets
`have_remote=0` → STEP 2 (LFS upload) is skipped entirely → every NEW LFS object GH008-rejects
the push forever, even though the object exists locally. The symptom is deceptive: the failure
looks like a missing object, but the actual cause is the gated fetch. Fix is a one-char
refspec change — leading `+` forces the tracking ref to reset to GitHub's actual tip so the
LFS diff is real. This is already applied in `sync_github_build_mirror`; never drop the `+`.

## GH008 / LFS: upload the new object, don't skip it, don't `--all`

`attached_assets/` video/audio/zip are LFS-tracked (`.gitattributes`). Because we push refs
with `GIT_LFS_SKIP_PUSH=1` (the pre-push hook hangs on Replit's SSH lfsurl), the LFS *objects*
don't ride along — and GitHub's **`GH008`** pre-receive hook then REJECTS any commit that
references an LFS object GitHub's LFS store lacks (this is what broke every push the day a 99 MB
recording landed). Fix: upload the missing object(s) to GitHub LFS **before** the ref push,
**targeted by id**, against a temp token-URL remote:
`git lfs push --object-id <remote> <oid>`. Compute the missing set as oids in HEAD not in the
fetched remote tip: `comm -23 <(git lfs ls-files -l HEAD | awk '{print $1}' | sort -u) <(git lfs ls-files -l refs/remotes/ghmirror/main | awk '{print $1}' | sort -u)`.
- **Never `git lfs push --all`** — it runs `rev-list --do-walk` over the whole fat history and
  effectively HANGS (observed minutes with no progress, had to kill it).
- **Residual GH008 case (rare):** GitHub validates EVERY pushed commit, not just HEAD. An LFS
  object added in an intermediate commit and deleted before HEAD won't show in
  `git lfs ls-files HEAD`, so the STEP-2 diff misses it → push still GH008s. Unlikely between
  merges; the WARNING is now loud and the manual catch-up (upload that oid by id) is the fix.
- LFS objects DO live on GitHub now (free tier: 1 GiB storage + 1 GiB/mo bandwidth; total
  ~283 MB today). Each new screen recording is ~100 MB → headroom for only a handful more; the
  real long-term fix is the operator history-shrink, which strips them from history entirely.

## Why it needs a workflow, not bash

The delta is large (~2.4 GB / ~20k objects even though `.git/lfs` is only ~283 MB — many
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

## The token is a manually-managed PAT that EXPIRES (rotate on a schedule)

`GITHUB_TOKEN` is a **fine-grained PAT** named **"GoodTunes Push"** on Bill's account, scoped
to `billdenk/goodtunes-app` with **Contents: Read and write**. GitHub caps its expiry, so it
must be rotated by hand. On lapse the post-merge push fails *silently* (best-effort WARNING
only) → iOS builds stale + Android internal testers get the old `.aab` with no failed-build
signal. **Operator rotation runbook + the current expiry date live in `docs/codemagic-builds.md`
("Rotating the GitHub mirror push token") — that doc is the source of truth for the date; don't
duplicate it here.** Bill regenerates it in GitHub (agent can't); the agent only updates the
secret + verifies.

**Verify a rotated token WITHOUT pushing** (isolated task env: don't force-push the task HEAD to
mirror `main` — only the real post-merge sync should): hit the mirror's git smart-HTTP
advertisements with the token. `git-upload-pack` 200 = fetch/read auth works; **`git-receive-pack`
200 = push permission works** (403 = insufficient perms, 401 = bad token). Read real expiry from
the `github-authentication-token-expiration` header on any authenticated `api.github.com`
response. Note the bash tool's `$GITHUB_TOKEN` can lag a freshly-saved secret — an unchanged
exact-second expiry after a "rotation" means the OLD token is still in the shell's env; re-check
after the secret actually propagates.

## Auto pre-warn before the token expires (in-app, not CI)

`server/githubTokenExpiry.ts` (armed from `server/index.ts`, same boot-daemon shape as the
other schedulers) reads the token's REAL expiry from the
`github-authentication-token-expiration` header on an authenticated `api.github.com` request
twice a day and fires a throttled `alertOps` (the existing 5xx email/log path) when <14 days
remain (or already expired). It names the "GoodTunes Push" token + points at the runbook;
only the expiry DATE is ever surfaced, never the token value. Quiet no-op when `GITHUB_TOKEN`
is unset; never throws / never blocks a merge. Imports `log` from `./index` (circular but fine
— index dynamically imports it after listen, like odoo.ts/giftScheduler.ts), so it can't be
unit-imported standalone without booting the server (test the fetch+parse logic separately).
