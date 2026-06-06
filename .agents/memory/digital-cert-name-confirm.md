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
