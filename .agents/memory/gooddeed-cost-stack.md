---
name: GoodDeed per-cert cost = tiered ladder, not the flat default
description: How to price a signed GoodDeed certificate on any Sell-panel / Design-tab readout — the rung is keyed off the resolved signed-copy count, with CC fee on the cert retail as the only other line.
---

# The rule

Per-cert wholesale on a signed GoodDeed certificate is the **tiered ladder rung** keyed off the **resolved signed-copy count** for the current vinyl run — not the flat `payout_settings.cert_cost_cents`. The ladder lives in `shared/signedCertLadder.ts` and is served by `/api/admin/albums/:id/gooddeed-pricing-preview?runQty=<certCount>` (`totalPerUnitCents` on the response). CC fee on the cert retail (2.9% + $0.30, computed client-side) is the **only other cost line** — the rung already bundles print + hologram + shrinkwrap + insertion into the jacket and all three shipping legs.

# Why

Bill has had to re-explain this to several agents. The flat `cert_cost_cents` is $12 and never moves; the real ladder steps $13 → $12 → $9 → $7 → $6 as the run grows, so a 1,000-unit pressing at the 20% default attach (= 200 signed copies) **understates the artist's take-home by ~$5/cert** when the readout uses the flat value. The Shopify-side cost preview (`SignedCertVendorPanel.tsx`) was already wired correctly; the Sell-panel Design tab readouts were not. The flat value is fallback-only, used when the live preview hasn't loaded or the platform-default Printing/Hologram/Insertion vendors aren't configured.

# How to apply

- Any Sell-panel / Design-tab readout of cert cost (per-cert net, per-rung Artist-Net header range, GoodDeed pill breakdown) must consume the rung from `/gooddeed-pricing-preview`, keyed off the cert count for *that* row — not the vinyl quantity, not the flat default.
- Per-rung readouts (`perRungArtistNet`) must price each rung's own cert count separately; one fetch per distinct cert count via `useQueries`. Caching is by `[albumId, "gooddeed-pricing-preview", certCount]` so all readers share the same in-flight request.
- The flat `payout_settings.cert_cost_cents` stays only as a last-resort fallback when the preview hasn't loaded or the platform default ladder is empty — surface a one-line note in that case (the pill already does).
- CC fee on the cert retail is the only additional line: `Math.round(certPrice * 0.029) + 30`. Do not add a separate shipping, hologram, or insertion line — they're all in the rung.
- Canonical rung values + cost-stack math live in `docs/shopify-pricing-strategy.md` § "Signed-cert wholesale ladder"; the artist-facing explanation lives in `docs/credits-and-chat.md` § "GoodDeed cost stack & ladder".
