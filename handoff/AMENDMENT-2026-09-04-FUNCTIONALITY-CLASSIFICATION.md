# Functionality-classification amendment — September 4, 2026

This amendment supersedes any blanket **ZERO FUNCTIONALITY CHANGES — SKIN ONLY** instruction in the September 4 handoffs named below.

## Controlling rule

A handoff changes functionality whenever it changes click reachability, visible state transitions, validation, persistence, permissions, calculations, or data meaning. Client-only React state still describes functionality when a control changes what the user can see or do.

An inert control in a GoodStudio mock never authorizes Otis to disable or omit an existing live control. Each handoff must be read in four explicit groups:

1. New or changed behavior Otis must implement.
2. Existing production behavior Otis must preserve, whether or not the mock exercises it.
3. Mock-only or decorative controls that may remain inert.
4. Data, API, persistence, or permission changes.

## Affected handoffs

### Press Vinyl Styles

Classification: **UI + functionality + data-contract changes**.

The earlier skin-only label is invalid. The controlling Press Vinyl Styles README must enumerate the image-backed representation, Replace image, Build with colors, Keep image, generated-save replacement, reviewed-image persistence, unresolved-image counts, PNG/WebP validation, contained rendering, and non-mutating cancel paths. Existing press routes, permissions, catalog identity, pricing boundaries, and unrelated production controls remain protected.

### Final Canon readiness: Artist Profile

Classification: **presentation + interaction reachability; no new data contract**.

The profile keeps its existing routes, handlers, persistence, permissions, and audit rules, but restoring visible actions and changing which rows or links open production destinations are interaction changes. Every Must work action remains required. Mock-local timers and arrays remain non-contractual.

### Final Canon readiness: Template proofing

No correction required. It was already classified as an approved functionality upgrade.

## Not yet sent: Artist Release Payments

Before any future push, classify it as **UI + interaction changes; existing payment contracts preserved**. Money out / Money in switching, estimate opening, payment-method selection, Pay actions, server-side card gross-up, and payout-ledger loading are functional requirements, not skin-only presentation.

## Otis receipt

Otis must report per item whether it was applied verbatim, adapted, superseded, or blocked. Canon promotion remains blocked until GoodStudio reconciles that receipt with verified published behavior.
