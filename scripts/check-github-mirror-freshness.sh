#!/bin/bash
# Read-only freshness check for the Codemagic GitHub build mirror.
#
# WHY THIS EXISTS
#   Codemagic builds iOS + Android from the GitHub mirror
#   github.com/billdenk/goodtunes-app (branch main). The mirror only auto-syncs
#   when an isolated task agent MERGES to project main — that's when
#   scripts/post-merge.sh runs sync_github_build_mirror. When a fix instead lands
#   via a MAIN-AGENT CHECKPOINT (no task merge), post-merge never fires, so the
#   mirror silently stays behind and Codemagic keeps building STALE code with no
#   failed-build signal. That is exactly what happened with the CarPlay iOS-14
#   fix: the fix was on project main but the mirror sat at an older tip until a
#   manual catch-up push. There was no automated signal that the mirror drifted.
#
# WHAT THIS DOES (read-only — it NEVER pushes)
#   Uses the same repo-scoped SSH deploy key + pinned known_hosts as the
#   post-merge sync (reused directly from scripts/post-merge.sh so there is one
#   source of truth for auth + host pins) to `git ls-remote` the mirror's
#   refs/heads/main tip, then compares it to local project main (HEAD):
#     - equal            -> mirror is current (exit 0)
#     - ancestor of HEAD -> mirror is BEHIND by N commits; prints the missing
#                           commits so an operator notices (exit 0 — behind
#                           self-heals on the next merge's force-push, and every
#                           in-flight task legitimately sits ahead of the mirror,
#                           so failing here would false-alarm every task)
#     - anything else    -> mirror has DIVERGED from project main; this needs a
#                           manual force-push through an isolated task agent (a
#                           real --force is blocked for the main agent), so this
#                           is the one genuinely actionable state -> exit 1
#     - key unset / mirror unreachable -> SKIP (infra, not drift) -> exit 0
#
# Run: bash scripts/check-github-mirror-freshness.sh
# Optional: pass a base ref/commit as $1 to compare the mirror against instead of
#   HEAD (defaults to HEAD).
#
# See .agents/memory/github-mirror-push.md and docs/codemagic-builds.md.
set -euo pipefail

GITHUB_MIRROR_URL="git@github.com:billdenk/goodtunes-app.git"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
POST_MERGE="$SCRIPT_DIR/post-merge.sh"
BASE_REF="${1:-HEAD}"

log() { echo "mirror-check: $*"; }

# The deploy key is optional in most environments (it is a Replit Secret). Without
# it we cannot authenticate the ls-remote, but that is an infra gap, not drift, so
# skip cleanly (exit 0) rather than failing the validation.
if [ -z "${GITHUB_MIRROR_DEPLOY_KEY:-}" ]; then
  log "SKIP — GITHUB_MIRROR_DEPLOY_KEY not set (cannot ls-remote the mirror; not a drift failure)"
  exit 0
fi

if [ ! -f "$POST_MERGE" ]; then
  log "SKIP — cannot find $POST_MERGE to reuse the mirror auth helpers (not a drift failure)"
  exit 0
fi

# Reuse the EXACT auth helpers from post-merge.sh without executing the whole
# script (which would run the DB migration suite). sed extracts just the two
# function definitions; eval defines them here. Both functions end on a line that
# is a bare `}` at column 0, so the ranges are unambiguous. This keeps GitHub's
# pinned host keys + the key-normalization logic in ONE place — if post-merge.sh
# re-pins a rotated GitHub host key, this check picks it up automatically.
eval "$(sed -n '/^github_mirror_known_hosts_contents() {/,/^}/p' "$POST_MERGE")"
eval "$(sed -n '/^write_normalized_deploy_key() {/,/^}/p' "$POST_MERGE")"

if ! declare -F github_mirror_known_hosts_contents >/dev/null 2>&1 \
   || ! declare -F write_normalized_deploy_key >/dev/null 2>&1; then
  log "SKIP — could not load mirror auth helpers from post-merge.sh (not a drift failure)"
  exit 0
fi

# Write the deploy key + pinned known_hosts to 600 temp files and shred them on
# EVERY exit path. The key value is never echoed; only file PATHS appear in
# GIT_SSH_COMMAND.
keyfile="$(mktemp)"
knownhosts="$(mktemp)"
trap 'rm -f "$keyfile" "$knownhosts" >/dev/null 2>&1 || true' EXIT
chmod 600 "$keyfile" "$knownhosts"
write_normalized_deploy_key "$GITHUB_MIRROR_DEPLOY_KEY" "$keyfile"
github_mirror_known_hosts_contents > "$knownhosts"
export GIT_SSH_COMMAND="ssh -i $keyfile -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile=$knownhosts -o BatchMode=yes"

# Resolve the base (project main) commit we compare the mirror against.
base_sha=""
if ! base_sha="$(git rev-parse --verify "$BASE_REF^{commit}" 2>/dev/null)"; then
  log "SKIP — could not resolve base ref '$BASE_REF' locally (not a drift failure)"
  exit 0
fi

# READ-ONLY: ls-remote just reads the remote's ref advertisement; it never
# writes. Bounded so a hung network can't stall a validation.
lsr_out=""
lsr_rc=0
lsr_out="$(GIT_TERMINAL_PROMPT=0 timeout --kill-after=10 60 \
  git ls-remote "$GITHUB_MIRROR_URL" refs/heads/main 2>&1)" || lsr_rc=$?

if [ "$lsr_rc" != 0 ]; then
  log "SKIP — could not reach the GitHub mirror (rc=$lsr_rc; offline / auth / quota — not a drift failure)"
  printf '%s\n' "$lsr_out" | tail -4 | sed 's/^/mirror-check:   ls-remote> /'
  exit 0
fi

mirror_tip="$(printf '%s\n' "$lsr_out" | awk '/refs\/heads\/main$/ {print $1; exit}')"
if [ -z "$mirror_tip" ]; then
  log "WARNING — mirror has no refs/heads/main yet (empty mirror?). Local project main is $base_sha."
  exit 0
fi

log "mirror refs/heads/main = $mirror_tip"
log "local project main ($BASE_REF) = $base_sha"

if [ "$mirror_tip" = "$base_sha" ]; then
  log "OK — mirror is current with project main. Codemagic builds the latest code."
  exit 0
fi

# ls-remote reports the tip SHA but does not fetch its objects. If the mirror tip is
# not a commit we already have in this clone's history, it cannot be an ancestor of
# project main here, so it is a DIVERGED tip (force-pushed from elsewhere / ahead of
# anything on this clone). That is the actionable state, so we hard-fail (exit 1) —
# same as the explicit diverged branch below.
if ! git cat-file -e "${mirror_tip}^{commit}" 2>/dev/null; then
  log "WARNING — mirror tip $mirror_tip is not present in this clone's history."
  log "          It is not an ancestor of project main here, so the mirror looks DIVERGED"
  log "          (or was force-pushed from elsewhere). A manual catch-up force-push through"
  log "          an isolated task agent is needed — the main agent cannot force-push. See"
  log "          .agents/memory/github-mirror-push.md."
  exit 1
fi

if git merge-base --is-ancestor "$mirror_tip" "$base_sha"; then
  behind="$(git rev-list --count "${mirror_tip}..${base_sha}")"
  log "WARNING — mirror is BEHIND project main by ${behind} commit(s)."
  log "          Codemagic is building STALE code until the mirror catches up. This"
  log "          self-heals on the next task-agent MERGE (post-merge re-syncs the mirror);"
  log "          if it persists, a fix likely landed via a main-agent checkpoint (no merge)."
  log "          Commits on project main that the mirror is missing:"
  git log --oneline --no-decorate "${mirror_tip}..${base_sha}" | sed 's/^/mirror-check:   missing> /'
  exit 0
fi

# mirror_tip is a known commit but NOT an ancestor of project main -> diverged.
log "WARNING — mirror has DIVERGED from project main (its tip is not an ancestor of"
log "          project main). This needs a manual catch-up force-push through an isolated"
log "          task agent — a real --force is blocked for the main agent. See"
log "          .agents/memory/github-mirror-push.md."
exit 1
