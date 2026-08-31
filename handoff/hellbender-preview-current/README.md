# Hellbender preview handoff — current

## Target

Publish this partner-review journey through Otis at /hellbender-preview on the configured production origin. Requested public URL: https://get.goodtunes.music/hellbender-preview. Use Otis routing and deployment configuration; do not hardcode the hostname in browser code.

## Supersession

This handoff supersedes every earlier Hellbender preview handoff. Do not preserve the legacy dark artist shell, the old Alex-with-Hellbender header sentence, the solid red footer, the removed lifecycle callout, or the press-admin shell previously shown on the artist builder step.

## Authority

- Otis remains authoritative for routes, permissions, payloads, calculations, data contracts, loading/error states, lifecycle, and behavior.
- This handoff is authoritative for the approved Hellbender review presentation and partner visual treatment.
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

Keep all seven links and their order. The step-7 route name is legacy compatibility only; its rendered caller is an artist, not a press operator.

## White-label artist ownership

- Hellbender Vinyl owns the top-left brand position. Use the symbol-only hellbender-icon.svg in Hellbender red, without a white carrier circle. Adjacent Hellbender Vinyl text may remain.
- Alex Tebeleff is the signed-in artist in the top-right account/avatar control.
- Artist Dashboard, Project Home, and artist package builder render LIGHT by default.
- Artist rail is exactly Search; Dashboard; Releases; Audience; Acquisition; Orders; Buyers; Referrals; Shopify; Reports; Settings pinned at bottom; Powered by GoodTunes.
- On the package builder, Releases is active. Never show Clients, Create, Estimates, Packages, Projects, Product Specs, Components, White Label, Team, or other press-admin destinations.
- Do not recreate the legacy solid red footer. Hellbender red is reserved for earned actions and the red symbol mark.

## Artist package builder

- Reuse the same production component/pricing engine as the press builder, but call it with artist audience/chrome. Do not fork calculations or availability.
- Heading: “Build your package. From scratch.” Copy explains that selections become this release's package.
- Completely omit the press-only “How artists will see it. Your package, their rail.” section in artist context. Do not ask the artist for a reusable package name, sell line, catalog-card cover/background, or card preview.
- Final artist action is “Use this package.” The release is already a draft; do not say Convert to draft or Save to catalog.
- Success copy says the package was attached/added to the release draft. Never mention Product Specs or catalog.
- Press context remains unchanged and still uses press navigation, package-card controls, Save to catalog / Save changes, and catalog confirmation.
- Appearance storage is separated by audience and press. Hellbender artist builder defaults light and must not inherit legacy gt-appearance or a press/operator dark choice. An explicit artist choice may persist under gt-artist-appearance-hellbender.
- Vinyl center labels remain neutral black with the white symbol-only icon. Never use the full wordmark or generated circular text there.

## Other requirements

- User-visible lifecycle language is Estimate, never Quote.
- Package building occurs before conversion. After acceptance/conversion, Release → Package shows the agreed package record. Request change is explicit and permission-gated.
- The review index goes directly from its introduction to the seven screen cards; no lifecycle callout.

## Verification

The final light Dashboard, light Project Home, and light artist-context Hellbender package builder were rendered at desktop. The artist rail, red symbol-only top-left mark, release-specific builder copy, and absence of press navigation were visually confirmed. TypeScript and git diff validation pass.

## Source

Files in source/ are copied verbatim from approved GoodStudio. Integrate against current Otis primitives and contracts; do not redraw from screenshots.
