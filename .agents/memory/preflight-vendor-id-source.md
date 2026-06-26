---
name: Adding a pressing-plant preflight vendor
description: The full set of edits required to make a new plant first-class in preflight/print — and the server allowlist gotcha that the UI hides.
---

# Adding a pressing-plant preflight vendor

A new pressing plant becomes first-class in preflight/print by editing
`shared/vendorSpecs.ts`: add the id to the `VENDOR_IDS` tuple (the single
source of truth — `VendorId` is derived from it), add a `VENDOR_SPECS` entry
(art + audio specs, templates), and (optionally) measured artboards. Name
matching to the invited press is generic over `VENDOR_SPECS.label`
(`matchInvitedPressToVendor` / `resolveVendorIdForPress`), so the manufacturer
row name must match the spec `label`. Leave the plant OUT of
`HIDDEN_PREFLIGHT_VENDORS` to show it in pickers. The UI pickers
(`PrintPdfsPanel`, `UploadValidationsPanel`) are driven by `VENDOR_SPECS`, so
they auto-include any new id.

**Gotcha (the part the UI hides):** the server request schemas in
`server/routes.ts` validate `vendorId` with zod. These MUST be
`z.enum(VENDOR_IDS)`, never a hand-listed `z.enum(["mrp","pmp",...])`. A
hardcoded enum lets the UI offer the new plant but every server call
(validate-art, validate-audio, preflight-masters, completed-template config,
print-pdfs generate) 400s on it. Five such sites existed and were migrated to
`z.enum(VENDOR_IDS)`.

**Why:** the picker reads `VENDOR_SPECS` but the route enums were a separate
hardcoded list, so they silently drifted; a code review caught Viryl 400ing
end-to-end. Deriving both from `VENDOR_IDS` keeps them in lockstep.

**How to apply:** when adding a plant, edit only `VENDOR_IDS` + `VENDOR_SPECS`
(+ docs); never re-list vendor ids in a route enum. After adding, grep
`z.enum(\["mrp"` to confirm no hand-rolled enum was reintroduced.
