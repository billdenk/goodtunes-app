---
name: Operator sign-in link (welcome-back token reuse)
description: How a locked-out fan gets signed in when email fails; welcome-back tokens double as a generic operator sign-in link
---

A welcome-back token (`welcome_back_tokens`, sha256-at-rest, single-use, 30-day) is a GENERIC sign-in link: redeem (server/welcomeBack.ts) has NO eligibility check — it only validates existence/consumed/expiry/merged, then routes onboarded→/account else /welcome-back. So it signs in ANY fan regardless of password or onboarded state.

Contrast the SELF-SERVICE "email me a link" flow, which gates on `isEligible()` and no-ops for already-onboarded fans — that's why an onboarded, spam-filtered fan silently gets nothing even though Resend accepted the send.

Operator tool: `POST /api/admin/customers/:id/signin-link` (super_admin only — account-takeover power; `requireAdmin` alone admits partner accounts) mints one and returns `{ url, expiresAt }`; 409s on merged accounts. Surfaced as a super_admin-gated "Sign-in link" button + reveal panel on AdminCustomerDetail.

**Why customerOriginFromReq, not originForKind:** build the customer-host URL with `customerOriginFromReq(req)` (exported from welcomeBack.ts). `originForKind("customer", req)` has NO dev branch for the customer kind — it hardcodes `https://my.goodtunes.music` in EVERY env, so a dev/preview-minted link points at prod where the token doesn't exist in that DB. `customerOriginFromReq` pins the prod host only when `NODE_ENV === "production"`, else the request host (dev-clickable). originForKind stays correct for OAuth/canonical redirects where always-canonical is the point.

**How to apply:** any new admin-host route that hands a fan a customer-host URL.
