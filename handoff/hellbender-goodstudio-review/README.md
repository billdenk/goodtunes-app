# Hellbender GoodStudio review page

## Ship request

Publish one Hellbender-only review index at:

https://hellbender.pressesvinyl.com/goodstudio

This is a review surface for Hellbender. It must not expose the Playground, other press brands, or the full mock launcher.

## Source of truth

- mockups/HellbenderGoodStudioReview.tsx is the complete review index mock, copied verbatim from the Playground.
- assets/hellbender-full.svg and assets/thumbs/ contain every visual dependency used by that index.
- Keep the seven existing Hellbender screens exactly as completed. Do not redesign, rename personas, or substitute another press's header or assets.

## Journey order

1. PressClientEstimateEmailHellbender
2. PressClientEstimateHellbender
3. PressClientEstimateAcceptedHellbender
4. PressClientNextStepsHellbender
5. ArtistDashboardHellbender
6. ArtistProjectHomeHellbender
7. PressCatalogHellbenderDark

The public page's cards should open Otis-hosted review routes for those exact screens. Replace the mock's local hash links only as required by Otis routing.

## Canon that must survive integration

- Hellbender artist and project are How??? / How???. Californialand belongs only to Niina Soleil at MRP.
- Hellbender red is #DF0C15; filled Hellbender actions use white ink; action buttons are 40px pills while cards stay square.
- Never cross press assets or branding.
- Estimate pages do not receive a separate site header; their sticky estimate bar is the header.
- Word plus icon/shape for every status; never color alone.
- Estimate, never quote. Real registered trademark symbol only.
- Preserve the existing screen implementations and apple-canon decisions; this index is navigation, not permission to reinterpret the screens.

## Routing / host

The requested host is hellbender.pressesvinyl.com and the requested path is /goodstudio. Otis owns the public domain configuration and production route. If hostname mapping is not ready, ship the route first behind Otis's existing preview host, then attach the Hellbender hostname without changing this UI.
