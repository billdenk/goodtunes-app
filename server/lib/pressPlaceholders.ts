// Single source of truth for WHICH press an album's cover placeholder should
// credit. Both the admin Albums LIST (batchEnrichWithPressPlaceholders in
// server/routes.ts) and the album DETAIL (/api/admin/albums/:id/invited-press
// in server/commerce.ts) must resolve the SAME press or the list logo won't
// match the detail header / package designer / GoodDeed cert (Parrot Time bug:
// list showed the SKU/default press while detail showed the invited press).
//
// Precedence (highest → lowest):
//   1. artist invited_by_press_id   (the referral stamp — also drives the lock)
//   2. label  invited_by_press_id
//   3. artist default_press_id      (explicit single "home" plant)
//   4. label  default_press_id
//   5. the album's SKUs, ONLY when they unambiguously agree on ONE press
//
// The detail endpoint composes this as `press` (steps 1-2, which also gates the
// post-sale lock) ?? `effectivePress` (steps 3-5); this helper flattens the
// same ordering so the list matches `press ?? effectivePress` exactly. When the
// SKUs span two or more presses there is no single plant to credit, so we
// return null and the surface falls back to the GoodTunes brand mark rather
// than arbitrarily crediting whichever SKU happened to sort first.
export function resolvePressIdFromCandidates(c: {
  artistInvitedPressId?: string | null;
  labelInvitedPressId?: string | null;
  artistDefaultPressId?: string | null;
  labelDefaultPressId?: string | null;
  distinctSkuPressIds?: string[] | null;
}): string | null {
  const unambiguousSku =
    c.distinctSkuPressIds && c.distinctSkuPressIds.length === 1
      ? c.distinctSkuPressIds[0]
      : null;
  return (
    c.artistInvitedPressId ||
    c.labelInvitedPressId ||
    c.artistDefaultPressId ||
    c.labelDefaultPressId ||
    unambiguousSku ||
    null
  );
}
