---
name: Toast setTimeout hangs client tests
description: Why a passing client component test under tsx --test hangs forever (no summary, timeout) when the component toasts, and how to fix it.
---

# Toast setTimeout hangs client component tests

A client component that calls `toast()` (shadcn `use-toast`) schedules an
auto-dismiss `setTimeout(..., TOAST_REMOVE_DELAY)` where `TOAST_REMOVE_DELAY`
is **1,000,000ms** (`client/src/hooks/use-toast.ts`). In a test, any code path
that fires a toast (e.g. a mutation's `onSuccess` toast) arms that timer.

`client/src/pages/jsdomHarness.ts` (`installTestDom`) only captures+clears
**setInterval** (analytics' flush loop) on teardown — it does NOT touch
`setTimeout`. So the toast timer survives, keeping the buffered `tsx --test`
process alive for ~1000s. Symptom: every subtest prints `ok`, but there is **no
`# tests N` TAP summary footer** and the run dies on the outer timeout
(`EXIT=124`). It looks like a hang even though the assertions all passed.

**Why:** `tsx --test` buffers TAP and only flushes on clean process exit; one
lingering timer blocks exit.

**Durable fix (load-bearing):** the `test` validation command now runs with
Node's `--test-force-exit` (in `.replit`, right after `--test` so tsx forwards
it). The runner exits deterministically once every test finishes REPORTING,
regardless of leftover handles (toast setTimeout, analytics setInterval, pg
pools, server `*.db.test.ts` booting `server/index.ts` + binding :5000). So the
suite no longer stalls ~1000s / dies as a "generic infrastructure error". The
per-test timer/global cleanup here + in jsdomHarness stays for cross-file
isolation hygiene but is NO LONGER what keeps the process exiting — don't drop
the flag thinking the cleanup covers it (server tests were never harness-covered
at all). Change the command via the validation tooling (setValidationCommand) so
`.replit` + the registry stay in sync; don't hand-edit one.

**How to apply:** in any client test that renders a component which toasts,
capture+clear `setTimeout` yourself (mirror the harness's setInterval trick):
wrap `globalThis.setTimeout` to record ids in a Set right after `installTestDom`,
and `clearTimeout` them in a `node:test` `after()` hook. act()/`settle`'s own
`setTimeout(0)`s have already fired by then, so clearing is a no-op for them.
Reference: `client/src/pages/ordersCertPaperSize.test.ts`.
Diagnose lingering handles with `process.getActiveResourcesInfo()` in an
`after()` (a bare `["PipeWrap","PipeWrap"]` = just stdout/stderr, harmless).
