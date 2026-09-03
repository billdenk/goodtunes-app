# GoodDeed cert: fit-to-screen, orange border, inline name edit

## What & Why
The fan-facing GoodDeed® certificate experience has three problems Bill caught on his phone:

1. **The downloaded/previewed PDF doesn't fit the screen** and can't be pinch-zoomed, so fans can't read it or inspect it larger.
2. **The PDF is the wrong certificate design** — it has no orange border. Bill approved an orange-bordered Letter + A4 design on the canvas; the shipped PDF still renders the old navy-bleed-border template.
3. **The "Name on certificate" box has a plain "Edit" text link.** Bill wants a pencil (edit) affordance beside the name, and tapping it should let you type directly in the box — otherwise it just shows your name under "GoodDeed® Certificate".

## Done looks like
- Opening a GoodDeed certificate on a phone shows the whole certificate fitted to the screen width, and the fan can pinch-and-zoom in/out to inspect it.
- The downloaded/previewed certificate matches the **approved orange-bordered design** on the canvas: a thin GoodTunes-orange frame that is 0.25" total on US Letter (0.125" showing inside the mat + 0.125" bleed under the mat) and the proportionate 3mm equivalent on A4, on both the one-line and two-line ("LONG") recipient/title layouts.
- The **free** certificate the fan downloads carries the **GoodTunes logo** in the top-right of the navy band (the copy they can print themselves for free).
- The **purchased/printed** certificate (signed-cert add-on, fulfilled by GoodTunes) carries the **holographic-sticker placement guide** (rounded-rect) in that same spot instead of the logo.
- The "Name on certificate" row shows the name with a pencil/edit icon beside it; tapping it turns the row into an editable text field in place, and saving re-renders the certificate with the new name.

## Out of scope
- Redesigning the certificate layout beyond matching the already-approved canvas mockups (don't re-litigate type, spacing, signature placement — those are locked).
- The operator-driven physical signed-cert confirmation flow in admin Orders (untouched — only the fan-facing digital name editor changes).
- Share-card / Open Graph image work (separate surface).
- Any change to how paper size is chosen by country.

## Steps
1. **Fit-to-screen + pinch-zoom for the certificate viewer.** Make the in-page certificate viewer render the PDF fitted to the device width with pinch-to-zoom working on mobile (iOS WebKit in particular). Note: a raw PDF in an `<iframe>` does not give reliable fit + pinch-zoom on iOS — the executor will likely need a dedicated PDF renderer (e.g. a PDF.js-based canvas/page view) rather than relying on the native iframe viewer. Keep the existing blob-fetch-with-auth + Download behavior intact.

2. **Match the approved orange-bordered certificate design in the PDF template.** Update the server certificate renderer so the generated PDF matches the approved `gooddeed-print` canvas mockups: the orange "bordered" frame (0.125" inset inside the mat + 0.125" bleed outside on Letter, proportionate 3mm on A4), for both the one-line and two-line headline layouts on Letter and the A4 layout. Reuse the geometry/spec from the mockups rather than inventing new numbers.

3. **Free copy = logo, purchased copy = hologram guide.** Ensure the free certificate the fan downloads renders the GoodTunes logo in the top-right of the navy band, while the purchased/printed (signed-cert) copy renders the holographic-sticker placement guide (rounded-rect) in that spot. Confirm the fan-download endpoint serves the logo (free) version and the fulfillment/printed path produces the holo version.

4. **Pencil affordance + tap-to-edit-in-place for the name.** Replace the plain "Edit" text link on the "Name on certificate" row with a pencil/edit icon beside the name; tapping it makes the name editable in place (inline text field) and saving persists + re-renders the certificate. Preserve the self-gating behavior (the editor only appears for editable digital-only certs) and the existing save/cancel/validation logic.

5. **Keep the investor capabilities doc honest.** If this changes what fans can do/see, update the matching line in `docs/capabilities.md` as part of the change-set.

6. **Verify.** Run `npm run design:lint` (UI files are touched) and exercise the viewer + name editor end-to-end on a mobile-width viewport.

## Relevant files
- `client/src/components/ui/CertPdfViewerSheet.tsx`
- `client/src/components/ui/CertNameConfirmCard.tsx`
- `server/goodDeedPrintTemplate.ts`
- `server/certificates.ts`
- `artifacts/mockup-sandbox/src/components/mockups/gooddeed-print/_CertPrint.tsx`
- `artifacts/mockup-sandbox/src/components/mockups/gooddeed-print/LetterBorderThinSigned.tsx`
- `artifacts/mockup-sandbox/src/components/mockups/gooddeed-print/LetterBorderThinLongSigned.tsx`
- `artifacts/mockup-sandbox/src/components/mockups/gooddeed-print/A4BorderThinSigned.tsx`
