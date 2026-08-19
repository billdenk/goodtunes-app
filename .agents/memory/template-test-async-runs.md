---
name: Template test runs are async
description: Press template certification scans are detached background work with guarded terminal states; verdicts include processing/error.
---

The template live-test Save no longer awaits the certification scan — the run row is minted as `processing` and a detached worker lands the final verdict later (auto-certifying on pass when the client asked for it).

**Why:** hundreds-of-MB art PDFs made the synchronous scan outlive the deployed edge's request timeout, freezing Save on "Saving…" forever.

**How to apply:**
- Run verdicts include `processing` and `error` beyond pass/warn/fail/unverified; anything switching on run verdict must handle both (shelf shows "Checking…" and polls while processing; the templates GET sweeps stale processing runs to error so a restart can't strand the state).
- Terminal transitions are GUARDED: a result may only land while the run is still `processing`. A worker resuming after its deadline/sweep must be rejected — never let a late pass overwrite a reported error and auto-certify.
- Deadline timeouts must not delete objects the still-running worker may read; cleanup belongs to whichever side actually settles.
- Save reuses the art object the ink inspection already uploaded (finalize + reuse path) instead of re-pushing; every non-progress network leg of a save/upload flow gets a bounded timeout with an actionable message.
