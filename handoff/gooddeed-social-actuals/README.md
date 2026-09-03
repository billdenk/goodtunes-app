# Otis return — production GoodDeed social actuals

This directory is the production return package requested by
`handoff/artist-assets-september-2026/OTIS-RETURN.md`.

It is evidence of what the unchanged GoodTunes production renderer currently
ships. It is **not** a GoodStudio Canon declaration and contains no redesign.
GoodStudio can compare these actuals with its approved work, promote only
verified matches, and keep unresolved work in R&D.

## Contents

- `source/GoodDeedCertificate.tsx` — exact production source snapshot.
- `assets/goodtunes-logo-white.png` — exact production logo used inside the
  serial pill.
- `assets/representative-album-art.jpg` — the public, production-owned sample
  artwork used for these representative renders.
- `renders/square-1080x1080.png`
- `renders/portrait-1080x1350.png`
- `renders/story-1080x1920.png`
- `MANIFEST.md` — source, geometry, assets, sample-data boundaries, rendering
  provenance, and safe-zone status.
- `SHA256SUMS.txt` — checksums for every returned source, asset, render, and
  documentation file except the checksum file itself.

## Important boundaries

- `client/src/components/GoodDeedCertificate.tsx` was not changed.
- The PNGs were freshly generated from its actual production `CertCard`
  implementation, not copied from the GoodStudio/Canvas archive.
- The owner and serial are representative fictional sample data.
- No Story safe-zone overlay is included. No target platform plus verified
  1080×1920 pixel bounds are documented in production, so that option remains
  unavailable.
