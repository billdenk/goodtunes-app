---
name: Press component→price linkages
description: Durable pricing/isolation rules for package component price links.
---

Package component options link to a per-press price source: a snapshotted component ladder, a service item, "included in record price", or custom quote.

**Rules (why: operator itemized costs must be per-press honest):**
- No cross-press fallback; a service/ladder ref must belong to the SAME press.
- A missing/archived/unlinked source = "no price on file" — NEVER $0.
- $0 on a press's own sheet ("Included in pressing price") = link mode `included`, never a $0 priced line; typed ladder rungs must be positive.
- The record leg is the tier×jacket ladder, so the SELECTED jacket style must resolve to that press's matching jacket row (bridged by NAME, jacketless "Records only" rows excluded); no match = honest gap, never silently the default jacket. Viryl has no gatefold ladder — gatefold there is honestly unpriced.
- The namespaced componentLadders blob on the 'pricing' component config must survive every config rewrite (both write sites spread existing config).
- Seed/backfill scripts must identify a press by stable evidence (exact domain, or the single candidate carrying catalog tiers), never a fuzzy first name match — prod carries empty decoy shells; ambiguity = FATAL, never stamp the marker.

**Jacket counted exactly once:** tier×jacket record ladders are ALL-IN — when the
breakdown's record line prices with the selected jacket's own ladder, the jacket
component line is forced to "included" (never summed again), even if a ladder
link exists for it. Jacket component ladder links only price standalone when the
record leg couldn't price.
