# Otis return package — GoodDeed social actuals

After applying the approved handoff, commit a return package at:

`handoff/gooddeed-social-actuals/`

Include:

1. The exact current production `GoodDeedCertificate` source snapshot.
2. Every logo, image, font, and styling asset used by that renderer, or an
   explicit path to the production-owned source when an asset must not be
   duplicated.
3. Representative output PNGs rendered by Otis itself:
   - `square-1080x1080.png`
   - `portrait-1080x1350.png`
   - `story-1080x1920.png`
4. A manifest containing:
   - source commit
   - exact dimensions
   - current card-corner geometry
   - orange-frame dimensions/color source
   - avatar placement rules
   - production GoodTunes logo asset path
   - font sources
   - identity/serial sample-data boundaries
5. If a Story safe zone is supported:
   - target platform name
   - platform guidance source and date
   - exact top, right, bottom, and left pixel bounds on 1080×1920
   - confirmation that the overlay is preview-only and excluded from exports

Do not send a screenshot-only reconstruction, a GoodStudio approximation, or
an old certificate PDF as the source package. GoodStudio will archive the
returned Otis package as the Canon baseline before any future social redesign.