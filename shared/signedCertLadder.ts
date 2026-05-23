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

// Default rung shape. The live ladder is editable in god-view and stored
// on `payout_settings.signed_cert_ladder` (jsonb). Callers should read
// the live rungs off PayoutSettings and pass them to `lookupSignedCertRung`;
// this default is used as a seed for the DB column and as a fallback when
// the column is empty or malformed.
export const DEFAULT_SIGNED_CERT_LADDER: SignedCertLadderRung[] = [
  { minQty: 25, label: "25–49", wholesaleCents: 1300 },
  { minQty: 50, label: "50–99", wholesaleCents: 1200 },
  { minQty: 100, label: "100–199", wholesaleCents: 900 },
  { minQty: 200, label: "200–299", wholesaleCents: 700 },
  { minQty: 300, label: "300+", wholesaleCents: 600 },
];

// 25-unit minimum — below this we auto-refund the add-on and don't print.
export const SIGNED_CERT_MIN_BATCH = 25;

// Return the rung that applies at `qty`, or `null` if qty is below the
// 25-unit minimum (no print run happens in that case). Caller passes the
// live rungs read off PayoutSettings.signedCertLadder; pass
// DEFAULT_SIGNED_CERT_LADDER if no override is configured yet.
export function lookupSignedCertRung(
  qty: number | null | undefined,
  rungs: SignedCertLadderRung[] = DEFAULT_SIGNED_CERT_LADDER,
): SignedCertLadderRung | null {
  if (qty == null || qty < SIGNED_CERT_MIN_BATCH) return null;
  // Defensive: sort by minQty asc so a misordered DB payload still resolves
  // to the highest-qty rung the qty clears.
  const sorted = [...rungs].sort((a, b) => a.minQty - b.minQty);
  let hit: SignedCertLadderRung | null = null;
  for (const rung of sorted) {
    if (qty >= rung.minQty) hit = rung;
  }
  return hit;
}

// Validate a candidate ladder coming off the wire (PUT body or DB row).
// Returns the cleaned rung array on success or a string message on failure.
// Rules:
//   - 1..10 rungs
//   - every rung has integer minQty >= 1, integer wholesaleCents >= 0, non-empty label
//   - rungs strictly ascending on minQty (no dupes)
//   - the first rung's minQty must equal SIGNED_CERT_MIN_BATCH (the print
//     floor is a separate constant, not negotiable per-row)
export function validateSignedCertLadder(
  input: unknown,
): { ok: true; rungs: SignedCertLadderRung[] } | { ok: false; message: string } {
  if (!Array.isArray(input)) return { ok: false, message: "Ladder must be an array" };
  if (input.length < 1 || input.length > 10) {
    return { ok: false, message: "Ladder must have between 1 and 10 rungs" };
  }
  const cleaned: SignedCertLadderRung[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== "object") return { ok: false, message: "Each rung must be an object" };
    const r = raw as Record<string, unknown>;
    const minQty = Number(r.minQty);
    const wholesaleCents = Number(r.wholesaleCents);
    const label = typeof r.label === "string" ? r.label.trim() : "";
    if (!Number.isInteger(minQty) || minQty < 1) {
      return { ok: false, message: "Each rung needs a positive whole-number batch size" };
    }
    if (!Number.isInteger(wholesaleCents) || wholesaleCents < 0) {
      return { ok: false, message: "Each rung needs a non-negative wholesale price" };
    }
    if (!label) return { ok: false, message: "Each rung needs a batch-size label" };
    cleaned.push({ minQty, wholesaleCents, label });
  }
  cleaned.sort((a, b) => a.minQty - b.minQty);
  for (let i = 1; i < cleaned.length; i++) {
    if (cleaned[i].minQty <= cleaned[i - 1].minQty) {
      return { ok: false, message: "Batch sizes must be strictly increasing" };
    }
  }
  if (cleaned[0].minQty !== SIGNED_CERT_MIN_BATCH) {
    return {
      ok: false,
      message: `First rung must start at the ${SIGNED_CERT_MIN_BATCH}-unit print minimum`,
    };
  }
  return { ok: true, rungs: cleaned };
}
