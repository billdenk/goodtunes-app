---
name: EasyPost label setup
description: EasyPost credential + carrier decisions for the GoodDeed cert signing round-trip labels
---

- `EASYPOST_API_KEY` secret is a **PRODUCTION** key (EZAK prefix) — any purchased label costs real money; there is no separate test key configured.
- **UPS = UPSDAP** (EasyPost's built-in UPS Digital Access Program), confirmed by Bill/gogoods 2026-08-12 ("UPSDAP is fine"). The GoodTunes-owned UPS account is deliberately NOT linked; billing rides EasyPost.
- Key has 7 carrier accounts (USPS, DHL Express, FedEx, UPSDAP, Canada Post, DHL eCom, Asendia); rate quotes verified working.
- Cert-batch flow: outbound label to artist/manager + prepaid return (`is_return: true`) to next destination (printer for hologram/shrinkwrap leg, else fulfillment); label PDFs must appear click-to-download in the printer portal ALONGSIDE the batch cert print PDFs; local pickup skips labels.
- **Why:** EasyPost chosen over Order Desk because the cert round-trip isn't a customer order and Order Desk isn't a label API.
- **How to apply:** label service must be idempotent (re-request returns stored labels, never double-buys — see task on proving this) and pick the UPS carrier account dynamically from the key, not a hardcoded ca_ id.
