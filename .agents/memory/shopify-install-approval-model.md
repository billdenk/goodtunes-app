---
name: Shopify app install approval model
description: Who can approve a Shopify app install, why "Unauthorized Access" appears, and how the operator hands a label a shareable install link
---

# Shopify install = only a TARGET-STORE admin can approve; operator hands over a link

Installing the GoodTunes Shopify app on a label's store is an OAuth grant that must be approved by someone logged into Shopify with **admin/collaborator access to THAT store**. The GoodTunes operator (Bill) almost never has admin access to a label's Shopify store, so he **cannot** approve the install himself.

- **Symptom:** operator pastes a label's `.myshopify.com` URL, clicks Install, and Shopify shows **"forbidden — Unauthorized Access"** on `admin.shopify.com`. That is Shopify bouncing a logged-in identity that lacks access to the target store — NOT a bug in our redirect. Confirm our side by checking the live 302 `Location` is a standard `/admin/oauth/authorize?client_id=<present>&scope=…&redirect_uri=<callback>&state=<signed>`.
- **Normal flow / fix:** hand the label a shareable link `https://admin.goodtunes.music/api/shopify/install?shop=<sub>.myshopify.com`. `GET /api/shopify/install` has **no GoodTunes auth guard** (by design) — it only kicks off Shopify's own OAuth; the store owner authorizes in their own Shopify. The callback `upsertStore`s the connection BEFORE its final redirect to `/admin/shopify?installed=<id>`, so the store is saved even though the label lands on an operator page they can't see. AdminShopify has a **"Copy install link"** button for exactly this. **"Install directly"** (operator browser redirect) only works when the operator DOES have store admin access (e.g. a GoodTunes dev/test store).

**Also verify in the Shopify Partner Dashboard** for the multi-label model:
- App **Distribution** must be **Public** (Custom locks it to one store, installable only via a Shopify-generated per-store link).
- **Allowed redirection URL(s)** must include exactly the callback host (`https://admin.goodtunes.music/api/shopify/callback`). The redirect URI is derived from the request host, so every fan/admin host that starts an install needs its own callback whitelisted.

**Why:** the very first prod install (Niina Soleil, `71gsth-ev.myshopify.com`) failed with "Unauthorized Access" purely because the store belongs to the label's team and the operator has no admin access — a permission / product-flow fact, not a code defect.
