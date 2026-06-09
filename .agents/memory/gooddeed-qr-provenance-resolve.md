---
name: GoodDeed QR provenance resolver
description: How the public /g/:shortId page resolves a scanned GoodDeed cert QR, including the synthetic/preview fallback for digital + legacy certs and the LIKE-wildcard hardening.
---

# GoodDeed QR provenance resolver

A GoodDeed cert's QR encodes `<origin>/g/<shortId>`; `GET /api/g/:shortId`
(server/certificates.ts) returns the public provenance payload (album, GoodDeed
#, recipient name, issued date — NO PII) that CertProvenance.tsx renders. No auth:
the shortId IS the bearer token, consistent across both paths below.

Two shortId shapes, both must resolve or the QR dead-ends on "Certificate not found":
- **Real-row id** — physical signed-cert orders store a random shortId in
  `signed_cert_certificates`. Looked up directly.
- **Synthetic / preview id** — digital-only GoodDeed orders AND all legacy
  gogoods imports never mint a cert row (see digital-cert-name-confirm.md); their
  PDF synthesizes the cert in-memory with `synthetic<orderId>` (admin preview:
  `preview<orderId>`). These can NEVER match the row table, so the resolver
  strips the prefix and maps it back to the owned, finalized order.

**Recipient-name fallback must mirror the PDF's Path 2 chain:**
`orders.certConfirmedName → realName → displayName → username`. Drift between the
QR page and the printed cert is a bug.

## Synthetic-id format + the LIKE-wildcard trap

- NEW certs embed the **full** order UUID → exact `eq(orders.id, ...)`.
- Already-printed legacy certs embedded only `order.id.slice(0,8)` → prefix match.
- **Rule:** strictly regex-validate the id shape (full-UUID regex OR 8-hex-char
  regex) BEFORE building the query; never feed the raw URL tail into `like()`.
  **Why:** an unvalidated tail smuggles SQL `LIKE` wildcards (`%`, `_`) →
  `synthetic________` / `synthetic%%%%%%%%` matches many orders and returns a
  stranger's provenance payload (IDOR-style record discovery). It's parameterized
  so not SQL injection, but wildcard abuse is just as bad here.
  **How to apply:** legacy prefix is only safe to pass to `like()` because the
  regex already constrained it to `[0-9a-f]{8}` (no wildcard chars survive).
- Gate the fallback to `FINALIZED_CERT_ORDER_STATUSES` + non-null goodDeedNumber.
  Resolve deterministically (`orderBy goodDeedNumber asc, id asc` + limit 1);
  verified zero 8-char prefix collisions across finalized certs in prod.
