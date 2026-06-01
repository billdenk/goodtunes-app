---
name: GoodDeed cert/card design lives on the canvas
description: Workflow convention — iterate GoodDeed certificate/share-card *design* in the canvas mockups, not via old project-board tasks.
---

GoodDeed **certificate / share-card visual design** (print certs Letter + A4, social share cards Square/Portrait/Story) is iterated in the **canvas mockups** under `artifacts/mockup-sandbox/src/components/mockups/gooddeed-print/` and `.../gooddeed-cert/`, approved by Bill on the canvas, then graduated into the shipped app.

**Rule:** Do NOT pick up older project-board tasks that ask for GoodDeed cert/card *design* changes — treat them as superseded by the canvas work. As of this convention the one open design Draft that overlaps is **"Match GoodDeed preview to Figma"** (its sibling "GoodDeed Cert Figma Mockup" is already archived).

**Why:** Bill explicitly said all GoodDeed cert/card design is now done on the canvas; old board tasks for it are stale and would duplicate/conflict.

**How to apply:** Scope is *design/layout/visual* of the cert + share cards only. Do NOT lump in unrelated GoodDeed board tasks — commerce/pricing ladders, print-pipeline (e.g. new 12×18 size), link-unfurl/OG image generation, fan emails, demo-data hygiene, IconButton/button-style cleanup are separate deliverables and stay active unless Bill says otherwise.

## Locked decisions

- **Square share card background — Bill locked TWO approved treatments** (both full-bleed SHARP album art, NOT the old blurred-everything look, which he rejected because "people don't really see the album"):
  - **D** = full-bleed sharp art + a DARKER navy scrim that ramps to solid navy at the bottom (album visible up top, blends into navy where the name/pill sit like the slab).
  - **E** = D plus a *graduated* bottom blur (blurred at the very bottom, clearing to fully sharp by the midway line) — a blurred copy of the cover masked over the sharp one.
  - **Why:** Bill wants the cover clearly readable while keeping the lower text block clean; pure blur hid the album, pure bleed felt too light.
  - These are exposed as knobs on the mockup (`bg=bleed-dark`, optional `gblur=NN`), default render still untouched. Not yet graduated into the shipped card.
