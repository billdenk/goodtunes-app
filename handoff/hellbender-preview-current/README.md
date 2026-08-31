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


## Agreed Package visual production record

- Release → Package must present the agreed package as a visual production record, not only a text table.
- Show jacket artwork and a vinyl/product preview beside organized Record, Packaging, and Production specification groups.
- Expected rows: format, size, disc count/configuration, weight, vinyl type, color, center label, jacket, inner sleeve, insert/add-ons, quantity/minimum run, unit cost, setup, manufacturing total, paid, outstanding, partner, estimate, production status, and source/provenance.
- Render only source-backed values. Unknown values say Not exposed. A neutral/ghost vinyl preview must be explicitly labeled Color not exposed or Preview incomplete so it is not mistaken for a selected color.
- CALIFORNIALAND currently exposes only Vinyl; Single LP; Memphis Record Pressing; At press; MRP estimate · CALIFORNIALAND · Single LP; $5,430 estimated; $1,295 paid; and $4,135 outstanding. Do not import historical Ruby/Black/Seafoam, quantities, or unit prices from unrelated mocks.
- Newly agreed package snapshots use the same visual hierarchy and may render only their stored title, component summary, minimum run, calculated unit cost, and source.
- Agreed state remains read-only with Request change; do not show presets or an editable builder.


## Complete asset bundle

The assets/ directory contains every local asset referenced by the supplied source files, preserving the same ../assets/... relative import structure from source/. Do not substitute initials, album art, generated marks, or other fallbacks. In particular, use the supplied alex-tebeleff.jpg and how-inner-sleeve.png exactly.


## Required vinyl material layers

The estimate and estimate-email vinyl preview is a three-pass renderer: emerald base color, translucent-vinyl.png material texture (multiply at 0.52), and a fixed sheen using vinyl-highlights.png as the mask over a white-to-transparent gradient. Both exact runtime assets are bundled under public/vinyl-layers/. Do not flatten the preview to a solid green disc. When adapting paths for /hellbender-preview, either import these images as modules or serve/map them under the isolated route; preserve maskImage and WebkitMaskImage. Verify both PressClientEstimateHellbender and PressClientEstimateEmailHellbender show the groove texture, radial highlight sweep, translucent variation, and edge depth.


## Complete vinyl layer inventory

The complete runtime set is bundled under public/vinyl-layers/: opaque-vinyl.png, translucent-vinyl.png, splatter-one.png, splatter-two.png, splatter-three.png, vinyl-highlights.png, and inner-circle.png. PressClientEstimateHellbender and PressClientEstimateEmailHellbender require translucent-vinyl.png plus vinyl-highlights.png. PressPackageBuilder requires all seven. Treat missing network requests for any layer as a failed integration even when the flat base color still renders.


## Builder layout and account-menu correction

Use the updated PressPackageBuilder.tsx verbatim. In Pick a quantity, remove only the album/vinyl/sleeve visual; keep the quantity controls at their original compact 520px width in the existing right-hand lane. Do not center them and do not stretch them full width. Keep the single physical package preview beside the final price in The build, bounded to its own responsive column so it cannot overlap pricing. The Alex account popover must be fully opaque with explicit background, shadow, clipping, and z-index 100. The inner-circle runtime image has a fail-safe onError guard so a missing path can never draw a browser broken-image glyph over the Hellbender center mark; still fix the path and load the bundled file. Acceptance: no duplicate package visual, no pricing overlap at 1440/1024, readable account menu, no broken-image glyph.


## Builder step-heading grammar

Every two-tone StepHeading uses a one-word dark lead, or two words only when necessary, followed by the gray explanatory sentence. Current leads: Size, Discs, Weight, Type, Color, Jacket, Inner sleeve, Hole, Label, Insert, Sticker, Sticker size, and Quantity. Do not restore instructional leads such as Pick a size, How many discs, or Add an insert.


## Final stage hierarchy — authoritative

The updated PressPackageBuilder.tsx is authoritative and supersedes prior builder corrections. Record-selection steps Size through Color show the standalone vinyl DiscStage in the left column. Package-selection steps Jacket through Sticker retain their relevant left-side package/component previews. Quantity alone has hideLeft: zero album/jacket/sleeve/vinyl imagery; the unchanged 520px controls stay in the right lane. The build has exactly one assembled package in a bounded left column and pricing in a separate right column; their boxes must not intersect at 1440 or 1024. The final preview owns the existing Cover / Inner sleeve / Center label artwork intake. Do not move hideLeft to the first Vinyl SplitSection.


## Samples review landing

Use source/HellbenderGoodStudioReview.tsx for the landing presentation at the review entry. The header uses the larger horizontal Hellbender lockup (circle-h symbol left, HELLBENDER VINYL right). Hero copy is exactly “Samples. Artist experience.” Supporting copy is “A review of the Hellbender artist experience, from email estimate to project.” The floating Comment control belongs only to Ruby’s internal canvas review surface and must not be shipped to Hellbender.
