# GoodTunes Architecture Alignment: Release / Drafts / Projects

**To:** Otis, Ruby
**From:** Bill
**Date:** August 11, 2026
**Type:** Terminology and structure alignment. Log and align. No schema migrations, renames, or builds from this document unless an item is explicitly marked BUILD. Nothing here is marked BUILD.

---

## 1. What changed and why

The word "project" has been carrying two meanings: artists think of their album as the project, while pressing plants call each manufacturing job a project (confirmed with at least one press; we will confirm the vocabulary with others). We are resolving this by giving each level its own name and retiring the ambiguity.

## 2. The hierarchy (locked)

**Release → Drafts / Projects → Variants (line items) → downstream (inventory, allocation, sales channels)**

- **Release** is the new top-level container. It is the album, EP, single, or box set as a creative work. Example: CALIFORNIALAND is a Release. Shared assets (audio, artwork, metadata, credits) live at the Release level so all formats inherit them.
- **Draft** is a pre-real workspace inside a Release. See Section 4 for visibility rules.
- **Project** is one format at one press for one press engagement. CALIFORNIALAND Vinyl is a Project. CALIFORNIALAND CD is a separate Project. This matches how presses already use the word, so their vocabulary and ours now align.
- **Variants** are line items inside a Project, not separate Projects. See Section 5.

The prior brief used Project as the root object. That root is now named Release. The structure beneath it (assets, formats, variants, inventory with source, fulfillment node, and allocation pools, sales channels, digital exclusives, physical add-ons) is unchanged in shape; only the labels at the top two levels move.

## 3. Navigation by audience

- **Artist tab: "Releases."** Artists land on their Releases. Opening a Release shows its Drafts and Projects. Drilling into a Project shows variants, status, and sales. Artists never land on a raw list of projects.
- **Press tab: "Projects."** A flat list of what belongs to that press: earmarked, in queue, on press, complete. Variant line items and run status live inside each Project. A passive "Part of: [Release name]" context label on a Project is fine; the press does not need the Release layer to operate.
- **GoodTunes admin:** sees both lenses plus the Draft layer, which no one else sees.

## 4. Draft state rules

- Drafts are **invisible to presses, without exception by default**. This holds even when a press has been assigned or earmarked: assignment does not grant visibility. The press sees nothing until the Draft converts to a Project. A press dashboard must never show speculative or demo work as incoming orders.
- **Share link (the one deliberate exception):** the artist can generate a share link (Replit-support-style) for a specific Draft or Release and send it to a press for help getting it to Project. Design rules:
  - Artist-initiated only. The press can never request or self-grant access.
  - Scoped to the one Draft or Release it was created for; scope enforced server-side from the token, never from client-supplied IDs.
  - Revocable by the artist at any time; consider a default expiry.
  - View-and-assist access only; whether "assist" includes suggested edits vs. view-only is TBD, start with view-only.
  - Shared items appear to the press in a separate "Shared with you" area, never in the Projects pipeline, so they cannot be mistaken for incoming orders.
  - The share link changes nothing about conversion: the Draft still becomes visible in the press pipeline only at Convert to Project.
- Drafts are **visible to GoodTunes admin and sales** as activity signal: artist name, number of drafts, completion percentage. This enables sales outreach ("saw you started a few, how can I help?").
- **Abuse flag:** a volume threshold on drafts per account (exact number TBD) raises an internal flag for possible scraping or competitive probing. Flag only; no automated action.
- **Convert to Project** is the moment a Draft becomes real. The conversion step attaches:
  1. Press assignment. If the artist arrived through a press's white-label funnel, that press is assigned automatically with no chooser shown. If the artist arrived through GoodTunes direct, MRP is suggested as default; how much alternative choice is offered is an open business question (Section 6), so build nothing rigid here.
  2. Sunrise and sunset dates.
  3. Pre-order yes/no.
  4. Sales channel decisions (GoodTunes only vs. GoodTunes plus Shopify).

## 5. Variants stay inside the Project (provisional, pending press confirmation)

Working rule: **one press engagement = one Project. Variants ordered together are line items within it. Variants ordered later are a new Project under the same Release.**

- Rationale: cutting, plating, and test pressings happen once per format. The test pressing milestone fires once per Project. Presses already quote multi-variant runs as one job.
- Each variant line item carries its own quantity, spec, and run status (e.g., Green 500 on press, Blue 250 queued next). This preserves the existing decision that status pills attach at the variant level, and GoodDeed certificate numbering remains per variant.
- A repress or a newly added variant months after launch is a **new Project** under the same Release: new schedule slot, new engagement.
- **Provisional:** we will confirm this matches how MRP and other presses want jobs represented (in-person conversations, late August). Model variant line items so they could be split out or regrouped later without a destructive migration. Do not hard-couple anything to the assumption that a Project always contains all variants of a format.

## 6. Open questions (log, do not build)

1. **Unfiled drafts:** should an artist be able to start a Draft before any Release exists and attach it later, or does creating a first Draft auto-create a Release? Leaning toward supporting drafts-first with later filing (Webflow folder pattern), but not decided.
2. **Press choice at conversion** for GoodTunes-originated artists: how the default suggestion and alternatives are presented. Business decision pending.
3. **Mid-queue quantity increases:** whether a press can accept order growth on a scheduled Project up to a lock date (e.g., a pre-paid 500 growing to 1,000 before it hits the press). Being raised with the press directly; no system behavior yet.
4. **"Release" word audit:** every current use of "release" in schema, UI copy, and docs needs cataloguing so the word only ever means the top-level container going forward. "Release date" on a Release is coherent and likely survives; any place where "release" currently means a single format or a single sales event needs a new name. **Deliverable: produce the catalogue of current usages for Bill's review. Do not rename anything yet.**

## 7. Guardrails

- No destructive migrations or renames from this document.
- The Draft visibility rules in Section 4 are firm regardless of open questions: presses never see drafts, even when assigned, except through an artist-initiated share link.
- This document is terminology and structure only. It does not touch the component quote builder workstream or any other active session's scope.
