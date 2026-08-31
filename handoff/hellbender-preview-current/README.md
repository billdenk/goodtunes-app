# Hellbender preview handoff — current

## Target

Publish this partner-review journey through Otis at the route /hellbender-preview on the configured production origin (requested public URL: https://get.goodtunes.music/hellbender-preview). Do not hardcode the hostname in application code; use Otis routing and deployment configuration.

## Authority

- Otis remains authoritative for real routes, permissions, payloads, calculations, data contracts, loading/error states, lifecycle, and behavior.
- The source files in this handoff are authoritative for the approved Hellbender review presentation and partner-specific visual treatment.
- Preserve real Hellbender journey data, including Alex Tebeleff. Do not substitute Niina Soleil from the separate Artist Admin canon.
- Do not invent pages, values, dates, URLs, totals, fields, or workflows.

## Review journey

HellbenderGoodStudioReview presents exactly seven linked steps in this order:

1. PressClientEstimateEmailHellbender
2. PressClientEstimateHellbender
3. PressClientEstimateAcceptedHellbender
4. PressClientNextStepsHellbender
5. ArtistDashboardHellbender
6. ArtistProjectHomeHellbender
7. PressCatalogHellbenderDark

The review wrapper uses the heading “Journey. Review the Hellbender artist experience.” and explains the lifecycle before the cards. Keep the seven-step order and links.

## Required behavior and presentation

- User-visible lifecycle language is Estimate, never Quote. Internal legacy identifiers do not need renaming when doing so would break contracts.
- Estimate, acceptance, and next-steps links remain connected.
- Artist Dashboard and Project Home use the consistent dark Hellbender artist shell with Alex identity at top-left; Search; Dashboard, Releases, Audience, Acquisition, Orders, Buyers, Referrals, Shopify, Reports; Settings at the bottom; and Powered by GoodTunes footer.
- Appearance controls are the worded Light / Dark / System rounded segmented control.
- Hellbender controls/actions follow current rounded-pill canon; chooser tiles remain tiles.
- PressCatalogHellbenderDark remains a compatibility route into the shared PressPackageBuilder Hellbender variant.
- Hellbender vinyl previews use a neutral-black center label with the white symbol-only hellbender-icon.svg. Never use the Hellbender wordmark or generated circular text on the center label.
- The package builder is pre-conversion. After acceptance/conversion, the release carries the agreed package summary rather than continuing to show package choices and the editable builder.
- Keep the builder under Release → Package. Do not add Builder to the global artist rail.

## Responsive verification

The seven-route review, both artist shells, the Light/Dark/System menus, estimate-to-next-steps path, and symbol-only center label were verified at desktop and 768px. No app-breaking browser errors were found.

## Source

All files in source/ are copied verbatim from the approved GoodStudio implementation. Integrate them against current Otis components and contracts; do not redraw from screenshots.
