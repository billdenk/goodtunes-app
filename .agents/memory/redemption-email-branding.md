---
name: Per-album transactional email branding
description: Durable rules for branding album-scoped emails (hero art + button color) — resolution ladder ownership, Shopify format caveat, email-client constraints.
---

Rules worth keeping (the schema/routes/components are all greppable — this is the why):

- **Shopify bundles can't be format-classified by SKU sentinel.** The coarse SKU classifier treats every Shopify-bundled line as vinyl by default; any per-format behavior (hero graphics, etc.) must classify from the human-readable line/mapping titles instead (word-bounded matching, cassette/CD win over vinyl, vinyl is the unrecognized default).
- **The email sender must receive fully resolved, public absolute https URLs.** Email clients can't run the app's fallback chains, and mail goes out as raw HTML — resolve the hero ladder (format graphic → album default → cover art) in the caller, absolutize against the fan host, and **skip .svg** (branded placeholder covers don't render in Gmail/Outlook; no hero beats a broken one).
- **Custom button colors must drive BOTH the CSS gradient and the VML flat `fillcolor`** or Outlook keeps the old color.
- **Keep email HTML builders pure and exported** so renders are testable without sending mail.
- **How to apply:** when branding another transactional email, reuse the existing jsonb-on-albums appearance blob + pure-builder pattern rather than inventing a second store.
