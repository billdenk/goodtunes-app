---
name: Digital GoodDeed cert name confirm
description: How digital-only owners review/edit the name printed on their GoodDeed certificate, and why it's a per-order field not a cert row.
---

# Digital GoodDeed cert name confirm

Digital-only GoodDeed owners (bought without the physical signed-cert add-on, so
NO `signed_cert_certificates` row) can review+edit the name on their certificate.

**Decision:** the confirmed name is a lightweight per-order field
(`orders.certConfirmedName` + `certConfirmedAt`), NOT a real
`signed_cert_certificates` row.
**Why:** minting a cert row would pollute the admin print queue with copies the
fan only owns digitally. The PDF name fallback (server/certificates.ts Path 2)
prefers `certConfirmedName` before the synthesized realName→displayName→username.

**How to apply:**
- Editing is allowed (`editable=true` from GET /api/orders/:id/cert/digital-name)
  ONLY when no real signed_cert_certificates row exists. POST refuses with 409 if
  one does — physical signed-cert copies keep the operator-driven
  CertConfirmationCard flow in client/src/pages/Orders.tsx, untouched.
- Endpoints gate on auth + ownership + finalized order status + non-null
  goodDeedNumber. Name is trimmed, 1–80 chars.
- The editor lives in the SHARED `CertNameConfirmCard` component. It self-gates
  via the GET endpoint (renders nothing unless editable), so callers drop it in
  unconditionally. `variant="bar"` = compact row inside CertPdfViewerSheet (used
  by Orders, AlbumDetail, AlbumDetailDesktop, AlbumCard; pass onSaved to
  re-render the PDF); `variant="card"` = standalone card on the post-checkout
  /welcome screen so fresh digital buyers catch a wrong synthesized name before
  the first download.
- Buyers can ALSO set the name up front in the Buy sheet (before Stripe Embedded
  Checkout). The optional field shows only for a digital-only GoodDeed purchase
  (album offers a signed-cert add-on AND no copy has the physical signed cert);
  it rides the checkout POST as `certName`, into session metadata as
  `gt_cert_name` (only stamped when `signedCertCount===0`), and is written to
  `orders.certConfirmedName`/`certConfirmedAt` in BOTH materialize branches.
  The pending→paid branch preserves a name the fan already confirmed (never
  clobbers a later /welcome edit). Physical signed-cert orders carry no
  gt_cert_name and are double-gated (`!signedCert`) at materialization, so the
  operator confirm flow is untouched.

## Paper size has TWO parallel edit paths — don't confuse them

Paper size (`letter`/`a4`) is fan-editable for BOTH kinds of owner, but via
DIFFERENT endpoints writing DIFFERENT columns:
- **Digital-only** (no cert row): rides the digital-name path; paper size lives
  alongside `orders.certConfirmedName`. Editable even after the one-time NAME lock.
- **Physical signed-cert** (HAS a `signed_cert_certificates` row): its own
  `POST /api/orders/:orderId/cert/paper-size` writes
  `signed_cert_certificates.paperSize` (+ `paperSizeOverridden=true`). The
  digital path 409s these (a cert row exists), so they MUST use this endpoint.

**Decision:** "editable any time" = independent of the recipient-NAME lock, NOT
after the print run commits. The physical endpoint gates on auth + ownership
(via signedCertCertificates⋈orders), validates paperSize, 404s when no cert row /
non-owner, and **409s once `nameStatus` is `locked_for_print` or `printed`**
(stock is committed at the printer). It never touches `nameStatus`/`confirmedName`.
**Why:** the name lock and the print-run lock are separate axes; a fan correcting
their paper choice must not be able to reopen the frozen name, and must not move
stock that's already queued/printed.

The admin print queue (AdminPrintQueue.tsx) splits batch downloads by
`row.paperSize` CLIENT-SIDE — a US-Letter-only and an A4-only merged PDF
(`gooddeed-print-<size>.pdf`) alongside the existing mixed ZIP + merged PDF. Each
split marks only the certs it contained as printed and leaves the other stock
selected. (The ZIP path still mixes stocks.)
