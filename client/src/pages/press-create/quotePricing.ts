// Honest component-quote pricing (Task #3243) — the pure module moved to
// shared/quotePricing.ts so the server /send gate can derive completeness
// from the same logic. This re-export keeps builder imports stable.
export * from "@shared/quotePricing";
