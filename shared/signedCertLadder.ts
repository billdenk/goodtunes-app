// Source of truth for the signed-cert wholesale ladder.
// Mirrors docs/shopify-pricing-strategy.md ("Signed-cert wholesale ladder")
// and the read-only reference rendering on AdminPlatformPricing.
//
// Used by:
//   - The Push-to-Shopify earnings preview on the album editor.
//   - The auto-charge logic on Shopify order webhooks (future task).
//
// `minQty` is inclusive; the rung applies for batch sizes >= minQty and
// < the next rung's minQty. The top rung (300+) has no upper bound.
export type SignedCertLadderRung = {
  minQty: number;
  label: string;
  wholesaleCents: number;
};

export const SIGNED_CERT_LADDER: SignedCertLadderRung[] = [
  { minQty: 25, label: "25–49", wholesaleCents: 1300 },
  { minQty: 50, label: "50–99", wholesaleCents: 1200 },
  { minQty: 100, label: "100–199", wholesaleCents: 900 },
  { minQty: 200, label: "200–299", wholesaleCents: 700 },
  { minQty: 300, label: "300+", wholesaleCents: 600 },
];

// 25-unit minimum — below this we auto-refund the add-on and don't print.
export const SIGNED_CERT_MIN_BATCH = 25;

// Return the rung that applies at `qty`, or `null` if qty is below the
// 25-unit minimum (no print run happens in that case).
export function lookupSignedCertRung(qty: number | null | undefined): SignedCertLadderRung | null {
  if (qty == null || qty < SIGNED_CERT_MIN_BATCH) return null;
  let hit: SignedCertLadderRung | null = null;
  for (const rung of SIGNED_CERT_LADDER) {
    if (qty >= rung.minQty) hit = rung;
  }
  return hit;
}
