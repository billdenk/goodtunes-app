---
name: Handoff functionality boundary
description: Classify approved mock handoffs by the behavior and data transitions they intentionally change.
---

When an approved mock changes clicks, state transitions, persistence, or data
meaning, classify the handoff as **UI + functionality + data-contract changes**.
The handoff must explicitly authorize those transitions and say not to preserve
conflicting legacy behavior. Protect only unrelated production behavior.

**Why:** A blanket “skin only” instruction tells the receiving implementation
agent to preserve existing behavior even when the approved design intentionally
changes it. That contradiction can produce a visually accurate but functionally
wrong integration.

**How to apply:** Audit each handoff interaction before declaring it
presentational. Name every authorized mutation and persistence transition,
including default behavior for old records and non-mutating cancel/close paths.
Use “skin only” only when clicks, state, persistence, and data meaning are
genuinely unchanged.