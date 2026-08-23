# Handoff — AdminPressPricingSetup (super-admin pricing model & source)

**What this is:** the GoodTunes SUPER ADMIN screen where GoodTunes chooses,
per press, (1) the pricing MODEL — Tier ladder ("how Memphis prices": the
press prices the tier/style, colors inherit) vs Component-itemized ("how
Viryl prices": every color/component priced individually) — and (2) the
pricing SOURCE — GoodTunes native / CODA.io / Odoo. Companion to the Aug 22
flag in docs/handoff-briefs/ruby-briefs-mrp-sow.md (briefs 6/8/9).

**Framing (handoff law):** the tsx is a VERBATIM-replacement mock — copy the
layout, states, and copy exactly; swap MOCK_ consts for live data. It is
self-contained (no imports from other mocks; assets alongside).

## Must work
- [ ] Model choice is per press, super-admin only. The press NEVER sees the
      switch — their Components > Pricing page takes the chosen shape:
      ladder = one row per tier with a single type upcharge; itemized = the
      full per-color grid.
- [ ] Since pricing already links to component options by stable id, a model
      switch must NOT orphan existing rows: ladder view aggregates/reads the
      same rows, it never deletes them.
- [ ] Source cards behave like Shopify connect: pick, authorize, map once.
      Connecting an external source sync-locks in-app editing; rows show
      "Synced from <source> - last sync <time>"; a missing price stays an
      honest gap ("no price on file"), never $0 and never stale.
- [ ] Hand-edited locked rungs survive re-sync (brief 8 rule).
- [ ] "What Memphis will see" preview restates the current choices in words
      and updates live with both pickers.
- [ ] Exactly ONE filled accent action (Save pricing setup). Word + icon
      statuses everywhere - never color alone. Light + dark themes.

## Acceptance bar
An operator can put MRP on Tier ladder + native source today, flip Viryl to
Component-itemized + CODA.io later, and at no point does a press see the
switch, lose a price, or see a made-up $0.
