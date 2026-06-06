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
