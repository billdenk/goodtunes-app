---
name: Rebase multi-region leftover markers
description: A single conflicted file can have >1 conflict region; resolving only the first and git-adding commits leftover markers silently.
---

A conflicted file can contain MORE THAN ONE conflict region. If you resolve the
first `<<<<<<< / ======= / >>>>>>>` block and `git add` the file, git does NOT
check for remaining markers — the leftover `=======` / `>>>>>>>` (and any
duplicated lines from the second region) get committed cleanly into the rebased
history. They only surface later as a build/syntax error (e.g. esbuild
`Unexpected "==="`) once the whole branch is built.

**Why:** during a rebase onto main, `client/src/lib/platform.ts` had two conflict
regions. The top `<<<<<<< HEAD` was removed but the trailing `=======` /
`>>>>>>>` + a duplicate `export const buyEnabled` were left, committed, and broke
the production build only after the rebase finished.

**How to apply:** after resolving ANY conflicted file and before `git add`, verify
zero markers in THAT file: `grep -c '^<<<<<<<\|^=======\|^>>>>>>>' <file>` must be
0. After the rebase finishes, sweep the whole repo:
`rg -n '^(<<<<<<<|>>>>>>>|=======$)' --glob '!node_modules'`. The fast
rebase-continue loop prints a `markers: N` count per file — N must be 0; do not
let a non-zero count scroll past.

Also: a task agent's isolated dev DB can be missing schema objects that main (and
prod) already have. After a schema-touching rebase, re-run `runPostMergeSetup()`
and confirm `schema-drift-smoke` is clean on BOTH dev and prod — dev missing a
table/column that prod has would make the publish dev→prod diff try to DROP it.
