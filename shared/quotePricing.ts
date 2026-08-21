// Honest component-quote pricing (Task #3243). Pure helpers that resolve a
// quote line's per-unit dollars from the press's Pricing component rows —
// and ONLY from them. There are no demo/default prices any more: a component
// with no real price resolves to null, renders as "Pricing pending / custom
// quote" in the builder, is excluded from the total, and blocks the
// send-to-artist path (drafts still save).
//
// Shared between the builder client and the server: the /send route derives
// the pending state itself from the stored builder state + the press's
// CURRENT pricing rows (computeQuotePendingIds below) — it never trusts a
// client-supplied "pricingPending" boolean.
//
// Row-key vocabulary the resolver understands (see shared/pressComponents):
//   type:<categoryId> / color:<categoryId>:<swatchId>  — vinyl, per size
//   labels:<styleId> · stickers:<shapeId> · jackets:<styleId>
//   sleeves:<styleId> · inserts:<styleId> · service:<id>
// Vinyl rows are matched by NAME (row label/detail vs the catalog color/tier
// names) because the builder's swatches come from the relational catalog
// while pricing rows key off the vinyl component's slugs.
import type { PricingRow } from "./pressComponents";

export type QuoteSizeId = "7" | "10" | "12";
const SIZE_TO_VINYL: Record<QuoteSizeId, string> = { "7": '7"', "10": '10"', "12": '12"' };

const norm = (s: string | null | undefined) => String(s ?? "").trim().toLowerCase();

/** A row's per-unit dollars — per-size cell when a size is given, else the
 * first non-null per-size cell, else the legacy flat priceCents. null = no
 * real price (pending). */
export function rowDollars(row: PricingRow | undefined | null, size?: QuoteSizeId): number | null {
  if (!row) return null;
  const bySize = (row.pricesBySize ?? {}) as Record<string, number | null | undefined>;
  if (size) {
    const v = bySize[SIZE_TO_VINYL[size]];
    if (typeof v === "number") return v / 100;
  } else {
    for (const v of Object.values(bySize)) {
      if (typeof v === "number") return v / 100;
    }
  }
  if (typeof row.priceCents === "number") return row.priceCents / 100;
  return null;
}

export type QuotePricer = {
  /** Flat component price by exact row key (labels:bw, jackets:gatefold, …). */
  flat: (key: string) => number | null;
  /** Vinyl per-record price for a color, per size. Color row (by name within
   * its tier) wins; falls back to the tier's type row. 180 g has no
   * component price slot yet → always pending. */
  vinyl: (colorName: string, tierName: string, size: QuoteSizeId, weightId: string) => number | null;
};

export function makeQuotePricer(rows: PricingRow[] | undefined | null): QuotePricer {
  const list: PricingRow[] = Array.isArray(rows) ? rows.filter((r) => r && typeof r.key === "string") : [];
  const byKey = new Map(list.map((r) => [r.key, r] as const));
  return {
    flat: (key: string) => rowDollars(byKey.get(key)),
    vinyl: (colorName, tierName, size, weightId) => {
      if (weightId && weightId !== "140") return null; // no heavyweight slot yet
      const colorRow = list.find(
        (r) =>
          r.kind === "color" &&
          norm(r.label) === norm(colorName) &&
          (!tierName || !r.detail || norm(r.detail) === norm(tierName)),
      );
      const c = rowDollars(colorRow, size);
      if (c != null) return c;
      const typeRow = tierName
        ? list.find((r) => r.kind === "type" && norm(r.label) === norm(tierName))
        : undefined;
      return rowDollars(typeRow, size);
    },
  };
}

export type QuoteLine = {
  id: string;
  name: string;
  note?: string;
  /** Per-unit dollars, BEFORE the run-size factor. null = pricing pending. */
  v: number | null;
};

/** Sum only the lines with real prices — pending lines never fabricate. */
export function pricedSum(lines: QuoteLine[]): number {
  return lines.reduce((acc, l) => acc + (l.v ?? 0), 0);
}

export function pendingLines(lines: QuoteLine[]): QuoteLine[] {
  return lines.filter((l) => l.v == null);
}

// ── Server-side pending derivation ──────────────────────────────────────
// The one-time setup lines the builder always shows: every one must resolve
// from a `service:<id>` pricing row (0 renders "Included"); missing = pending.
export const QUOTE_SETUP_SERVICE_KEYS = [
  "service:cutting",
  "service:plating",
  "service:test",
  "service:stampers",
  "service:colorfee",
] as const;

/** The builder's persisted control snapshot (payload.builderState) — loose on
 * purpose: old drafts may lack newer fields, and every miss fails CLOSED
 * (counts as pending) rather than silently pricing. */
export type QuoteBuilderState = {
  sizeId?: string;
  weightId?: string;
  colorId?: string;
  /** Catalog color + tier names, persisted so the server can re-resolve the
   * vinyl price row by name exactly like the builder does. */
  colorName?: string | null;
  colorTierName?: string | null;
  jacketId?: string;
  sleeveId?: string;
  labelId?: string;
  insertId?: string;
  stickerShapeId?: string;
  done?: string[];
  [k: string]: unknown;
};

/** The builder's step ladder (send is client-gated on every step done; the
 * server re-checks). 'hole' only exists for 7″; 'insert' may be skipped when
 * the size offers none (then insertId must be absent/none). */
export const REQUIRED_QUOTE_STEPS = [
  "size",
  "discs",
  "weight",
  "ctype",
  "color",
  "jacket",
  "sleeve",
  "label",
  "sticker",
  "qty",
] as const;

/**
 * Structural validation of a persisted builder state before the /send gate
 * consults it. Returns a human-readable reason when the state is missing,
 * incomplete, or internally inconsistent — the caller must fail CLOSED (409)
 * on any non-null result. Presence of a builderState object alone is NOT
 * proof of a complete build: a forged/minimal state (empty done, omitted
 * selections) must be rejected, never treated as "no lines to price".
 */
export function invalidQuoteBuilderState(bs: unknown): string | null {
  if (!bs || typeof bs !== "object" || Array.isArray(bs)) return "no saved build";
  const state = bs as QuoteBuilderState;
  if (!Array.isArray(state.done)) return "no step record";
  const done = new Set(state.done.map(String));
  for (const s of REQUIRED_QUOTE_STEPS) {
    if (!done.has(s)) return `build incomplete (step "${s}" not finished)`;
  }
  if (String(state.sizeId) === "7" && !done.has("hole")) return 'build incomplete (step "hole" not finished)';
  if (typeof state.qty !== "number" || !(state.qty > 0)) return "no run size";
  if (!state.colorName || typeof state.colorName !== "string") return "no vinyl color recorded";
  for (const key of ["labelId", "jacketId", "sleeveId"] as const) {
    if (!state[key] || typeof state[key] !== "string") return `no ${key.replace("Id", "")} selection recorded`;
  }
  // Optional components: a recorded selection must have completed its step
  // (an omitted step can never hide a picked component from pricing).
  if (state.insertId && state.insertId !== "none" && !done.has("insert")) return 'build inconsistent (insert picked but step not finished)';
  if (state.stickerShapeId && state.stickerShapeId !== "none" && !done.has("sticker")) return "build inconsistent (sticker picked but step not finished)";
  return null;
}

/**
 * Recompute which quote lines are missing a real price, from the persisted
 * builder state + the press's CURRENT pricing rows. Mirrors the builder's
 * line construction exactly; used by the server /send gate so completeness
 * is server-owned (the client's pricingPending flag is display-only).
 * Returns pending line ids ([] = fully priced build).
 */
export function computeQuotePendingIds(
  bs: QuoteBuilderState | null | undefined,
  rows: PricingRow[] | undefined | null,
): string[] {
  const state = bs && typeof bs === "object" ? bs : {};
  const done = new Set(Array.isArray(state.done) ? state.done.map(String) : []);
  const picked = (k: string) => done.has(k);
  const pricer = makeQuotePricer(rows);
  const pending: string[] = [];

  // A quote always includes the record itself: if the vinyl steps aren't
  // done the build is incomplete → the vinyl line is pending (fail closed;
  // an omitted `done` entry can never hide a line from pricing).
  const vinylDone = picked("size") && picked("weight") && picked("color");
  if (vinylDone) {
    const sizeId = String(state.sizeId ?? "12") as QuoteSizeId;
    const v =
      state.colorName == null
        ? null // pre-name draft: fail closed, re-save from the builder
        : pricer.vinyl(String(state.colorName), String(state.colorTierName ?? ""), sizeId, String(state.weightId ?? ""));
    if (v == null) pending.push("vinyl");
    if (pricer.flat("service:assembly") == null) pending.push("assembly");
    if (pricer.flat("service:shrink") == null) pending.push("shrink");
  } else {
    pending.push("vinyl");
  }
  // Components count when their step is done OR a selection is recorded —
  // a selection can never dodge pricing by leaving its step out of `done`.
  if ((picked("label") || state.labelId) && pricer.flat(`labels:${state.labelId}`) == null) pending.push("label");
  if ((picked("jacket") || state.jacketId) && pricer.flat(`jackets:${state.jacketId}`) == null) pending.push("jacket");
  if ((picked("sleeve") || state.sleeveId) && pricer.flat(`sleeves:${state.sleeveId}`) == null) pending.push("sleeve");
  if (state.insertId && state.insertId !== "none" && pricer.flat(`inserts:${state.insertId}`) == null) {
    pending.push("insert");
  }
  if (state.stickerShapeId && state.stickerShapeId !== "none" && pricer.flat(`stickers:${state.stickerShapeId}`) == null) {
    pending.push("sticker");
  }
  for (const key of QUOTE_SETUP_SERVICE_KEYS) {
    if (pricer.flat(key) == null) pending.push(key.slice("service:".length));
  }
  return pending;
}
