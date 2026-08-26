---
name: Press setup-fee rules engine
description: Press-generic setup-fee rules — resolution order, refusal vs unknown, and the byte-identical no-rules guarantee.
---

# Press setup-fee rules engine

Quote-builder one-time setup lines can be DERIVED from the build by a press-generic
rules engine. The rule vocabulary is shared platform code; each press's values are
DATA on its pricing component config (namespaced `setupRules` key, seeded by a
marker-guarded script — never hardcode a press's numbers in the engine).

**Resolution order per line:** per-quote operator override → rule evaluation →
stored manual `service:` row → honest "Pricing pending". A configured rule WINS over
a stale manual row. Overrides are ignored entirely when the press has no rules —
no-rules presses stay byte-identical to pre-engine behavior.

**Refusal ≠ unknown (review-enforced):** a rule input that is *absent* (operator
never picked it) returns null → manual-row fallback, honest. A rule input that is
*present but outside what the press offers* (e.g. splatter count above the
configured maximum, non-integer, forged persisted state) must be a REFUSAL: the
line stays pending with no row fallback, so the send gate fails closed.

**Why:** white-label platform rule — engine improvements reach all presses,
per-press numbers are data; honest pricing forbids invented defaults; and a
completion review will reject any engine that prices a persisted build the press
doesn't actually sell (a stale row fallback is such a pricing).

**How to apply:** any operator-supplied count/flag feeding a rule needs a
press-configurable bound in the rule schema, UI controls capped to it, and the
shared evaluator refusing out-of-range persisted values — all three consumers
(builder UI, server send gate, estimate email) evaluate through the one shared
function so they can't drift.
