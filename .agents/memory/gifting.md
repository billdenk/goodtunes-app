---
name: Gifting ownership transfer
description: How an album gift moves ownership from buyer → claimer, and which row drives the certificate name.
---

A claimed GoodTunes gift transfers ownership of **the order** (`orders.customerId`) **and** the library entitlement (`user_albums.userId`) to the claimer. Buyer history still surfaces these orders via `gifts.buyerUserId` — `/api/orders` UNIONs both paths, so a buyer doesn't lose sight of orders they gave away.

**Why:** the GoodDeed certificate is rendered from `userAlbum.userId`'s identity (real name → display name → username). Moving the `user_albums` row is what makes the cert print in the claimer's name. Reassigning `orders.customerId` alone is not enough.

**How to apply:**
- Anytime ownership moves between customers (gift, transfer, refund-reissue), update **both** `orders.customerId` and `user_albums.userId`. Forget one and the library/cert/history will disagree.
- If the claimer has no `realName` set yet, seed it from `gift.recipientFirstName/LastName` during claim — otherwise the cert defaults to their email local-part. Never overwrite an existing `realName`.
- The claim token is rotated whenever the buyer changes the recipient (within 24h) so a previously-shared link can't be redeemed by the wrong person.
