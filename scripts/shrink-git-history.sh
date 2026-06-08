#!/usr/bin/env bash
#
# Shrink the GitHub build-mirror by purging unreferenced attached_assets/ blobs
# from ALL git history.
#
# WHY THIS EXISTS
#   attached_assets/ accumulates every file uploaded in chat. As of this writing
#   it holds ~3.1 GB across ~3,800 files, but the web/iOS build imports only ~23
#   small images from it (everything referenced via the `@assets/...` alias).
#   The other ~3.1 GB is screen recordings, screenshots and zips that never reach
#   the app. Because those blobs were committed as normal git objects (not LFS),
#   every clone / Codemagic checkout / mirror push drags the full ~2.4 GB of
#   history. This script rewrites history to drop the junk while KEEPING every
#   file the build actually imports.
#
# *** THIS REWRITES HISTORY — IT CHANGES EVERY COMMIT SHA AFTER THE FIRST TOUCHED
#     COMMIT. *** It must be coordinated with Bill: the GitHub mirror has to be
#     force-pushed afterwards and anyone with a local clone must re-clone. The
#     Replit Agent runs in an isolated, platform-managed git environment and CANNOT
#     run this — it is an operator action. Run it on a throwaway clone, verify, then
#     force-push the mirror.
#
# WHAT IT KEEPS (never stripped)
#   * Every attached_assets/ file currently imported via `@assets/...` (auto-derived
#     below) — these are real build inputs and the GitHub mirror has NO LFS objects,
#     so they must stay as normal in-tree blobs.
#   * Everything outside attached_assets/ (ios AppIcon PNGs, source, etc.).
#
# REQUIREMENTS
#   git-filter-repo (https://github.com/newren/git-filter-repo). Install with one of:
#     pip install git-filter-repo        # then ensure it is on PATH
#     brew install git-filter-repo
#     nix run nixpkgs#git-filter-repo -- ...   (adapt the invocation)
#
# USAGE
#   1. Make a FRESH bare-ish working clone of the repo (filter-repo refuses to run
#      on a clone with a configured remote unless --force; work on a scratch copy):
#        git clone <source> goodtunes-shrink && cd goodtunes-shrink
#   2. Run this script from the repo root:
#        bash scripts/shrink-git-history.sh            # dry run: prints the plan + sizes
#        bash scripts/shrink-git-history.sh --apply    # actually rewrites history
#   3. Sanity-check (the script does some of this for you):
#        - du -sh .git              # should drop dramatically
#        - npm ci && npm run build  # the 23 kept assets must still resolve
#        - git lfs ls-files | wc -l # LFS pointers preserved
#   4. Force-push the mirror (see docs/codemagic-builds.md → "Keeping the GitHub
#      mirror small" and .agents/memory/github-mirror-push.md). Then everyone with
#      a clone must re-clone.
#
set -euo pipefail

APPLY=0
[ "${1:-}" = "--apply" ] && APPLY=1

cd "$(git rev-parse --show-toplevel)"

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "ERROR: working tree is dirty. Run on a clean, throwaway clone." >&2
  exit 1
fi

echo "==> Deriving the KEEP list (attached_assets files imported via @assets) ..."
# Static `@assets/...` references across all source. Keep only paths that resolve
# to a real file under attached_assets/.
mapfile -t REFS < <(
  grep -rhoE "@assets/[A-Za-z0-9._/-]+" client server scripts shared 2>/dev/null \
    | sed 's#.*@assets/##' \
    | sed "s/[\"'\`].*//" \
    | sort -u
)
KEEP_FILE="$(mktemp)"
: > "$KEEP_FILE"
for r in "${REFS[@]}"; do
  [ -n "$r" ] || continue
  if [ -f "attached_assets/$r" ]; then
    echo "attached_assets/$r" >> "$KEEP_FILE"
  fi
done
KEEP_COUNT=$(wc -l < "$KEEP_FILE")
echo "    Keeping $KEEP_COUNT build-imported attached_assets files:"
sed 's/^/      /' "$KEEP_FILE"

if [ "$KEEP_COUNT" -eq 0 ]; then
  echo "ERROR: derived an empty keep list — refusing to run (would risk the build)." >&2
  exit 1
fi

echo
echo "==> Enumerating every attached_assets/ path that has EVER existed in history ..."
ALL_FILE="$(mktemp)"
git log --all --pretty=format: --name-only --diff-filter=ACMRT \
  | grep '^attached_assets/' | sort -u > "$ALL_FILE" || true
ALL_COUNT=$(wc -l < "$ALL_FILE")
echo "    $ALL_COUNT distinct attached_assets paths across all history."

echo
echo "==> Building the STRIP list (everything under attached_assets EXCEPT the keep list) ..."
STRIP_FILE="$(mktemp)"
grep -vxF -f "$KEEP_FILE" "$ALL_FILE" > "$STRIP_FILE" || true
STRIP_COUNT=$(wc -l < "$STRIP_FILE")
echo "    $STRIP_COUNT paths will be removed from ALL history."

echo
echo "Plan: keep $KEEP_COUNT, strip $STRIP_COUNT of $ALL_COUNT attached_assets paths."
echo "Current .git size: $(du -sh .git | cut -f1)"

if [ "$APPLY" -ne 1 ]; then
  echo
  echo "DRY RUN. Re-run with --apply to rewrite history."
  echo "(strip list written to: $STRIP_FILE)"
  exit 0
fi

if ! command -v git-filter-repo >/dev/null 2>&1 && ! git filter-repo --version >/dev/null 2>&1; then
  echo "ERROR: git-filter-repo not found. Install it first (see the header)." >&2
  exit 1
fi

echo
echo "==> Rewriting history (this changes commit SHAs) ..."
git filter-repo --invert-paths --paths-from-file "$STRIP_FILE" --force

echo
echo "==> Repacking ..."
git reflog expire --expire=now --all || true
git gc --prune=now --aggressive || true

echo
echo "Done. New .git size: $(du -sh .git | cut -f1)"
echo "Next: verify (npm ci && npm run build), then force-push the mirror."
