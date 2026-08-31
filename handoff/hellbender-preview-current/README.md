# Hellbender preview handoff — current

## Target

Publish this partner-review journey through Otis at /hellbender-preview on the configured production origin. Requested public URL: https://get.goodtunes.music/hellbender-preview. Use Otis routing and deployment configuration; do not hardcode the hostname in browser code.

## Supersession

This handoff supersedes every earlier Hellbender preview handoff. In particular, do not preserve the legacy dark artist shell, the old Alex-with-Hellbender header sentence, the solid red footer, or the removed lifecycle callout on the review index.

## Authority

- Otis remains authoritative for routes, permissions, payloads, calculations, data contracts, loading/error states, lifecycle, and behavior.
- The source files in this handoff are authoritative for the approved Hellbender review presentation and partner visual treatment.
- Preserve real Hellbender journey data, including Alex Tebeleff, How???, estimate 071500-02, quantities, pricing, statuses, and links. Do not substitute Niina Soleil.
- Do not invent values, dates, URLs, totals, fields, or workflows.

## Review journey

HellbenderGoodStudioReview presents exactly seven linked steps in this order:

1. PressClientEstimateEmailHellbender
2. PressClientEstimateHellbender
3. PressClientEstimateAcceptedHellbender
4. PressClientNextStepsHellbender
5. ArtistDashboardHellbender
6. ArtistProjectHomeHellbender
7. PressCatalogHellbenderDark

Keep all seven links and their order. The review index goes directly from the introduction to the screen cards; it does not include a package-lifecycle callout.

## Final visual requirements

- User-visible lifecycle language is Estimate, never Quote. Internal legacy identifiers may remain when renaming would break contracts.
- Artist Dashboard and Project Home render in the current LIGHT Artist visual system by default: light canvas and rail, translucent light header, rounded active rows/cards/controls, restrained shadows and hairlines, current type hierarchy.
- Hellbender Vinyl owns the top-left brand position. Use the same symbol-only hellbender-icon.svg used on the vinyl center labels, rendered in Hellbender red, with no white circular carrier and no alternate/full wordmark. The adjacent Hellbender Vinyl name may remain.
- Alex Tebeleff is the signed-in artist and appears in the top-right account/avatar control, not in the top-left brand identity sentence.
- Artist rail remains Search, Dashboard, Releases, Audience, Acquisition, Orders, Buyers, Referrals, Shopify, Reports; Settings at bottom; Powered by GoodTunes footer. Do not add Team.
- Do not recreate the legacy solid red footer. Hellbender red is reserved for earned actions and the red symbol mark.
- The package builder is LIGHT by default. PressCatalogHellbenderDark remains only as a compatibility route name/wrapper into the shared builder; its rendered Hellbender experience is light.
- The builder top-left uses the same red symbol-only icon rule.
- Vinyl center labels remain neutral black with the white symbol-only icon. Never use the Hellbender wordmark or generated circular text on the center label.
- Appearance controls remain worded Light / Dark / System segmented controls, with Light active by default.

## Lifecycle integration

Package building occurs before conversion. After acceptance/conversion, Release → Package shows the agreed package record, not package choices or an always-editable builder. Request change is explicit and permission-gated. This rule belongs in the product behavior; it should not be restated as a callout on the seven-screen review index.

## Verification

The final light Dashboard, light Project Home, and light Hellbender package builder were rendered at desktop after the correction. The red symbol-only top-left mark was visually confirmed on all three. TypeScript and git diff validation pass.

## Source

Files in source/ are copied verbatim from the approved GoodStudio implementation. Integrate them against current Otis primitives and contracts; do not redraw from screenshots.
