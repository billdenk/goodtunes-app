---
name: Admin album editor completeness dots
description: Where the old "Path to press" strip went and how section completeness/submit now work in the album editor.
---

The 5-step "Path to press" strip (PressingOrderStepper) was removed from the
**admin album editor** (AdminAlbum.tsx). It was replaced by three-state
completeness dots on each section tab (Overview · Package · Digital ·
Physical/Shopify), and the submit actions were relocated into the tabs.

- Completeness is derived **client-side** in `client/src/lib/sectionCompleteness.ts`
  (pure `deriveSectionCompleteness` → per-section {state, missing[]} +
  `pressReadyToSend` / `shopifyReadyToPush`). No backend/schema involved.
- The "Go to Press" submit + status (Awaiting review / Approved / Rejected
  note + resubmit) now lives **inside PressPanel** (GoToPressAction), gated on
  `pressReadyToSend`. The Shopify push button gating lives in ShopifyPanel,
  gated on `shopifyReadyToPush`.
- Both submit surfaces reuse the SAME query key the strip used
  (`["/api/admin/albums", id, "pressing-order"]`), so status stays in sync.

**Don't assume PressingOrderStepper / pathToPressNav.ts are dead** — they were
NOT deleted. `PressPortal.tsx` still renders PressingOrderStepper (which still
dispatches the path-to-press navigate CustomEvent + SellPanel listens). Only
the album editor's copy of the strip + its navigate listener were removed.

**Why:** Task #1530 wanted a quieter, per-section progress affordance in the
album editor without touching the partner-facing PressPortal flow.
