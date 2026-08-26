// Task #3385 — Press ERP reference vocabulary + press-customer profile
// options. Every white-label press runs its own ERP (MRP → Coda,
// Hellbender → Odoo, Viryl/PMP → spreadsheets), so the two order-level
// reference numbers are GENERIC fields with per-press display labels:
// MRP shows "MRP #" / "SO #", another press can name them differently or
// leave them unused. Improvements to the mechanism land for all presses
// at once; only labels and values vary per press (same spirit as the
// per-press editable catalog headings).

/** Per-press display labels for the two generic press-ERP reference
 *  fields, stored on `manufacturers.erp_ref_labels`. Null/absent keys
 *  fall back to the generic defaults below. */
export type PressErpRefLabels = {
  /** Label for the press's job/master reference (MRP: "MRP #"). */
  jobNumber?: string | null;
  /** Label for the press's sales-order reference (MRP: "SO #"). */
  salesOrder?: string | null;
};

export const DEFAULT_PRESS_ERP_REF_LABELS = Object.freeze({
  jobNumber: "Press job #",
  salesOrder: "Press SO #",
});

/** Resolve the display labels for a press, falling back to the generic
 *  defaults when the press hasn't customized them (or has no config). */
export function resolvePressErpRefLabels(
  labels?: PressErpRefLabels | null,
): { jobNumber: string; salesOrder: string } {
  const jobNumber = labels?.jobNumber?.trim();
  const salesOrder = labels?.salesOrder?.trim();
  return {
    jobNumber: jobNumber || DEFAULT_PRESS_ERP_REF_LABELS.jobNumber,
    salesOrder: salesOrder || DEFAULT_PRESS_ERP_REF_LABELS.salesOrder,
  };
}

// ─── Press-scoped customer profile (press_customer_profiles) ──────────
// How the press's OWN customer record classifies us (or a label/artist
// buying direct). MRP's vocabulary supplied the first data set — category
// major / broker / indie and pricing tiers 1/2/3 — but the columns are
// loose text so another press's scheme fits without a schema change.
// GoodTunes is customer-of-record for brokered orders (tracker 10.11),
// which is why the sensible default category is "broker".

export const PRESS_CUSTOMER_CATEGORIES = ["major", "broker", "indie"] as const;
export type PressCustomerCategory = (typeof PRESS_CUSTOMER_CATEGORIES)[number];

export const PRESS_CUSTOMER_PRICING_TIERS = ["1", "2", "3"] as const;
export type PressCustomerPricingTier = (typeof PRESS_CUSTOMER_PRICING_TIERS)[number];

/** Default (virtual) profile served when a press has no saved row yet —
 *  GoodTunes-brokered is the platform's standing relationship shape. */
export const DEFAULT_PRESS_CUSTOMER_PROFILE = Object.freeze({
  customerKind: "goodtunes" as const,
  category: "broker" as const,
  pricingTier: null,
  paymentTerms: null,
  billingBasis: null,
});
