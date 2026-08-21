// Task #3248 — GTIN-12 (UPC-A) validation shared by client + server.
//
// Artists/presses enter a UPC they already own for a sellable format
// (album_skus.upc); we validate the number and render barcode ARTWORK
// only. Validation proves the check digit math works — it does NOT
// prove ownership, GS1 registration, uniqueness, or retailer
// acceptance. We never issue or invent numbers.
//
// Accepted input: 12 digits (check digit verified) or 11 digits (check
// digit auto-computed and appended). Spaces/hyphens are tolerated and
// stripped; anything else rejects with a human-readable message.

export type UpcResult =
  | {
      ok: true;
      /** Canonical 12-digit GTIN-12 (what we persist + render). */
      upc12: string;
      /** The verified/computed check digit (last digit of upc12). */
      checkDigit: number;
      /** True when the caller supplied 11 digits and we appended the check digit. */
      completedFrom11: boolean;
    }
  | { ok: false; error: string };

/** GS1 check digit for the first 11 digits of a GTIN-12.
 *  Odd positions (1st, 3rd, … — 0-indexed even) weigh 3, even weigh 1. */
export function upcCheckDigit(digits11: string): number {
  if (!/^\d{11}$/.test(digits11)) {
    throw new Error("upcCheckDigit expects exactly 11 digits");
  }
  let sum = 0;
  for (let i = 0; i < 11; i++) {
    const d = digits11.charCodeAt(i) - 48;
    sum += i % 2 === 0 ? d * 3 : d;
  }
  return (10 - (sum % 10)) % 10;
}

/** Validate + canonicalize a UPC-A / GTIN-12 entry. */
export function normalizeUpc(input: string | null | undefined): UpcResult {
  const raw = (input ?? "").trim();
  if (!raw) return { ok: false, error: "Enter a UPC." };
  // Tolerate common paste formatting (spaces, hyphens) only.
  const cleaned = raw.replace(/[\s-]+/g, "");
  if (!/^\d+$/.test(cleaned)) {
    return { ok: false, error: "UPC must contain digits only." };
  }
  if (cleaned.length === 11) {
    const cd = upcCheckDigit(cleaned);
    return { ok: true, upc12: cleaned + String(cd), checkDigit: cd, completedFrom11: true };
  }
  if (cleaned.length === 12) {
    const expected = upcCheckDigit(cleaned.slice(0, 11));
    const actual = cleaned.charCodeAt(11) - 48;
    if (actual !== expected) {
      return {
        ok: false,
        error: `Check digit doesn't verify — expected ${expected}, got ${actual}. Double-check the number.`,
      };
    }
    return { ok: true, upc12: cleaned, checkDigit: expected, completedFrom11: false };
  }
  return {
    ok: false,
    error: `UPC must be 12 digits (or 11 — we'll compute the check digit). Got ${cleaned.length}.`,
  };
}

/** Disclaimer copy shared by the SKU editor + any barcode surface.
 *  Single source so the wording can't drift between surfaces. */
export const UPC_ARTWORK_DISCLAIMER =
  "Barcode artwork only. Validation checks the number's math — it does not prove ownership, " +
  "GS1 registration, uniqueness, or retailer acceptance. Each distinct sellable product or " +
  "version may need its own UPC.";
