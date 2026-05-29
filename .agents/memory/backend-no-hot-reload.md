---
name: Backend has no hot-reload
description: Server route/code changes require a workflow restart before they take effect; Vite HMR is client-only and misleads you.
---

The dev workflow runs `tsx server/index.ts` with **no `--watch`**. Editing any
file under `server/` does NOT restart the Express process.

**Why:** Vite HMR logs ("hot updated /src/...") fire on every frontend save,
which makes it look like everything reloaded. The backend silently keeps running
the old code, so `curl` against a new/changed route returns the pre-edit
behavior and you chase a phantom bug.

**How to apply:** After any `server/**` edit, restart the **"Start application"**
workflow before testing endpoints. If a route change "isn't taking effect" but
the SQL/logic checks out when run directly, restart first, then re-test.
