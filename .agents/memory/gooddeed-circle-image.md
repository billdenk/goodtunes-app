---
name: GoodDeed circle image — artist vs owner per surface
description: Which photo goes in the small circular avatar on a GoodDeed certificate, split by surface (printed/PDF cert vs social share card).
---

The circular avatar next to the artist/title row on a GoodDeed differs by surface:

- **Printed / PDF certificate** (the framed cert that owners hang) → the circle is the **artist/band** image (the release's artist imagery), NOT the owner's headshot.
- **Social / share cards** (the boasting graphics owners post) → the circle is the **owner/person** photo, because the fan is showing off that *they* own it.

**Why:** Bill's rule — the printed cert is about the artist's work being certified; the social card is the fan bragging. Putting the owner headshot on the printed cert reads wrong.

**How to apply:** In the print-cert mockup engine the circle uses the cert's own `art` (album/artist) source. Any social-card surface keeps the owner photo. If you wire this into the real server PDF template (server/goodDeedPrintTemplate.ts), feed the artist image into the avatar slot for print, owner image for social.
