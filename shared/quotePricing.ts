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
import type { PricingRow, PricingRung, SetupFeeRules, StamperRule } from "./pressComponents";
import type { MrpCodaCrosswalkEntry } from "./mrpCodaPricing";

export type QuoteSizeId = "7" | "10" | "12";
const SIZE_TO_VINYL: Record<QuoteSizeId, string> = { "7": '7"', "10": '10"', "12": '12"' };

const norm = (s: string | null | undefined) => String(s ?? "").trim().toLowerCase();

// ── Imported quantity ladders (Task #3325) ──────────────────────────────
// Reference quantity when the caller hasn't picked a run size yet — matches
// the builders' 1,000-unit anchor.
export const LADDER_REFERENCE_QTY = 1000;

/** Snap UP to the smallest rung ≥ qty (sheet semantics: a 700-unit run prices
 * at the 1K break's per-unit rate only if the press quotes it that way — MRP
 * quotes at the NEXT break, so snapping up never understates). Beyond the top
 * rung = no honest price (custom quote). */
export function snapLadderCents(ladder: PricingRung[] | undefined | null, qty?: number): number | null {
  if (!Array.isArray(ladder) || ladder.length === 0) return null;
  const q = typeof qty === "number" && qty > 0 ? qty : LADDER_REFERENCE_QTY;
  const sorted = [...ladder].sort((a, b) => a.qty - b.qty);
  for (const r of sorted) {
    if (q <= r.qty && typeof r.unitCents === "number") return r.unitCents;
  }
  return null;
}

export type ResolvedUnit = {
  /** Dollars (per unit, or the one-time total for `oneTime` rows). */
  v: number;
  /** true = came from an imported quantity ladder already priced AT the run
   * size — the builder's synthetic run-size curve must NOT rescale it. */
  laddered: boolean;
  /** Present on surcharge compositions that mix provenances: `manualV` is the
   * operator-entered portion (dollars, MUST still ride the run-size factor)
   * and `ladderV` the imported-ladder portion (already at the run size).
   * v === manualV + ladderV. */
  parts?: { manualV: number; ladderV: number };
  /** Concrete pricing records composing this amount (base + surcharge). */
  sourceRows?: PricingRow[];
};

/** Structural shape accepted from pricingComponentConfigSchema. Optional on
 * every public API so old callers/presses remain byte-compatible. */
export type CodaPricingSnapshot = {
  source: string;
  entries: MrpCodaCrosswalkEntry[];
} | null | undefined;

function codaEntry(snapshot: CodaPricingSnapshot, code: string | null | undefined): MrpCodaCrosswalkEntry | null {
  if (!snapshot || !code) return null;
  const matches = snapshot.entries.filter((entry) => entry.code === code);
  if (matches.length !== 1 || matches[0].classification === "requires_mrp_decision") return null;
  return matches[0];
}

function rowCodaCode(row: PricingRow, size: QuoteSizeId, heavy = false): string | null {
  const sz = SIZE_TO_VINYL[size] as '7"' | '10"' | '12"';
  return (
    (heavy ? row.codaCodesBySizeHeavy?.[sz] : row.codaCodesBySize?.[sz]) ??
    row.codaCode ??
    null
  );
}

/** Multiplier for one finished unit. `null` means the selected concrete row
 * is not safely mapped under an active CODA snapshot. */
function rowCodaMultiplicity(
  row: PricingRow,
  size: QuoteSizeId,
  discs: number,
  snapshot: CodaPricingSnapshot,
  counts: { stickers?: number; touches?: number } = {},
  heavy = false,
): number | null {
  if (!snapshot) return 1;
  if (row.codaSource !== snapshot.source) return null;
  const entry = codaEntry(snapshot, rowCodaCode(row, size, heavy));
  if (!entry || entry.targetKey !== row.key) return null;
  if (entry.costType !== "job") return null;
  switch (entry.chargeType) {
    case "per_lp": return discs;
    case "per_unit": return 1;
    case "per_sticker": return Number.isInteger(counts.stickers) && (counts.stickers ?? 0) >= 0 ? counts.stickers! : null;
    case "per_touch": return Number.isInteger(counts.touches) && (counts.touches ?? 0) >= 0 ? counts.touches! : null;
    default: return null;
  }
}

function setupCodaMultiplicity(
  code: string | null | undefined,
  targetKey: string,
  discs: number,
  snapshot: CodaPricingSnapshot,
): number | null {
  if (!snapshot) return 1;
  const entry = codaEntry(snapshot, code);
  if (!entry || entry.targetKey !== targetKey || entry.costType !== "setup") return null;
  if (entry.chargeType === "per_lp") return discs;
  if (entry.chargeType === "per_unit" || entry.chargeType === "flat_fee") return 1;
  return null;
}

export function resolvedCodaMultiplicity(
  resolved: ResolvedUnit | null,
  size: QuoteSizeId,
  discs: number,
  snapshot: CodaPricingSnapshot,
  counts: { stickers?: number; touches?: number } = {},
  heavy = false,
): number | null {
  if (!resolved) return null;
  if (!snapshot) return 1;
  const rows = resolved.sourceRows ?? [];
  if (rows.length === 0) return null;
  const values = rows.map((row) => rowCodaMultiplicity(row, size, discs, snapshot, counts, heavy));
  if (values.some((value) => value == null)) return null;
  // A composed base+surcharge must share a basis. Applying different
  // multiplicities to one combined rate would be ambiguous and underquote.
  return values.every((value) => value === values[0]) ? values[0]! : null;
}

/** Scale a resolved line's per-unit dollars by the synthetic run-size factor,
 * applying it ONLY to operator-entered portions — ladder portions are already
 * priced at the run size. Single source of truth for builder + email. */
export function scaledUnitDollars(
  l: { v: number | null; laddered?: boolean; parts?: { manualV: number; ladderV: number } },
  factor: number,
): number {
  if (l.v == null) return 0;
  if (l.parts) return l.parts.manualV * factor + l.parts.ladderV;
  return l.v * (l.laddered ? 1 : factor);
}

/** Resolve a row's price with operator-edits-win semantics:
 * operator per-size cell → imported ladder rung at qty → legacy priceCents.
 * `heavy` (180 g) resolves ONLY from rungsBySizeHeavy — operator cells and
 * standard ladders are standard-weight prices. */
export function resolveRowUnit(
  row: PricingRow | undefined | null,
  size?: QuoteSizeId,
  qty?: number,
  heavy = false,
): ResolvedUnit | null {
  if (!row) return null;
  const sz = size ? SIZE_TO_VINYL[size] : undefined;
  if (heavy) {
    const ladders = (row.rungsBySizeHeavy ?? {}) as Record<string, PricingRung[] | undefined>;
    const ladder = sz ? ladders[sz] : Object.values(ladders).find((l) => (l ?? []).length > 0);
    const c = snapLadderCents(ladder, qty);
    return c == null ? null : { v: c / 100, laddered: true, sourceRows: [row] };
  }
  const bySize = (row.pricesBySize ?? {}) as Record<string, number | null | undefined>;
  if (sz) {
    const v = bySize[sz];
    if (typeof v === "number") return { v: v / 100, laddered: false, sourceRows: [row] };
  }
  // Flat rows (no size scoping) keep their any-cell operator semantics — a
  // price typed under any size chip applies everywhere.
  if ((row.sizes ?? []).length === 0) {
    for (const v of Object.values(bySize)) {
      if (typeof v === "number") return { v: v / 100, laddered: false, sourceRows: [row] };
    }
  } else if (!sz) {
    for (const v of Object.values(bySize)) {
      if (typeof v === "number") return { v: v / 100, laddered: false, sourceRows: [row] };
    }
  }
  const ladders = (row.rungsBySize ?? {}) as Record<string, PricingRung[] | undefined>;
  const ladder = sz ? ladders[sz] : Object.values(ladders).find((l) => (l ?? []).length > 0);
  const c = snapLadderCents(ladder, qty);
  if (c != null) return { v: c / 100, laddered: true, sourceRows: [row] };
  if (typeof row.priceCents === "number") return { v: row.priceCents / 100, laddered: false, sourceRows: [row] };
  return null;
}

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
  /** Flat component price by exact row key (labels:bw, jackets:gatefold, …).
   * Optional size + qty resolve imported quantity ladders; without them the
   * ladder prices at the 1,000-unit reference rung. */
  flat: (key: string, size?: QuoteSizeId, qty?: number) => number | null;
  /** Like flat, but reports whether the price came from an imported ladder
   * (already at the run size — don't rescale) and whether it's a one-time
   * total rather than per-unit. */
  flatEx: (key: string, size?: QuoteSizeId, qty?: number) => (ResolvedUnit & { oneTime: boolean }) | null;
  /** Vinyl per-record price for a color, per size. Color row (by name within
   * its tier) wins; falls back to the tier's type row — resolved structurally
   * from the color row's key when possible, so a catalog tier named
   * "Neon/Glow" still prices off a split "Neon" style row. Splatter-style
   * surcharge rows price as base style + adder. 180 g resolves from the
   * heavyweight ladder only. */
  vinyl: (colorName: string, tierName: string, size: QuoteSizeId, weightId: string, qty?: number) => number | null;
  vinylEx: (colorName: string, tierName: string, size: QuoteSizeId, weightId: string, qty?: number) => ResolvedUnit | null;
};

export function makeQuotePricer(rows: PricingRow[] | undefined | null): QuotePricer {
  const list: PricingRow[] = Array.isArray(rows) ? rows.filter((r) => r && typeof r.key === "string") : [];
  const byKey = new Map(list.map((r) => [r.key, r] as const));

  /** Resolve a type (style) row, honoring surcharge-over-base semantics. */
  const resolveType = (
    typeRow: PricingRow | undefined,
    size: QuoteSizeId,
    qty: number | undefined,
    heavy: boolean,
  ): ResolvedUnit | null => {
    if (!typeRow) return null;
    if (typeRow.surchargeOver) {
      const base = resolveType(byKey.get(typeRow.surchargeOver), size, qty, heavy);
      if (base == null) return null;
      // Operator cell on a surcharge row overrides the ADDER, not the total.
      const sz = SIZE_TO_VINYL[size];
      const cells = (typeRow.pricesBySize ?? {}) as Record<string, number | null | undefined>;
      const opCell = sz ? cells[sz] : undefined;
      const adderManual = typeof opCell === "number";
      const adderCents = adderManual
        ? (opCell as number)
        : snapLadderCents(((typeRow.rungsBySize ?? {}) as Record<string, PricingRung[] | undefined>)[sz ?? ""], qty);
      if (adderCents == null) return null;
      // Track provenance per portion — operator-entered (manual) dollars must
      // still ride the run-size factor; ladder dollars are already at the run
      // size. Sum in cents (float dollar addition drifts: 2.30+0.55 ≠ 2.85).
      const baseManualC = Math.round((base.parts ? base.parts.manualV : base.laddered ? 0 : base.v) * 100);
      const baseLadderC = Math.round((base.parts ? base.parts.ladderV : base.laddered ? base.v : 0) * 100);
      const manualC = baseManualC + (adderManual ? adderCents : 0);
      const ladderC = baseLadderC + (adderManual ? 0 : adderCents);
      return {
        v: (manualC + ladderC) / 100,
        laddered: manualC === 0,
        parts: { manualV: manualC / 100, ladderV: ladderC / 100 },
        sourceRows: [...(base.sourceRows ?? []), typeRow],
      };
    }
    return resolveRowUnit(typeRow, size, qty, heavy);
  };

  const vinylEx: QuotePricer["vinylEx"] = (colorName, tierName, size, weightId, qty) => {
    const heavy = weightId === "180";
    if (weightId && weightId !== "140" && weightId !== "180") return null;
    let colorRow = list.find(
      (r) =>
        r.kind === "color" &&
        norm(r.label) === norm(colorName) &&
        (!tierName || !r.detail || norm(r.detail) === norm(tierName)),
    );
    if (!colorRow) {
      // Relaxed pass: a catalog tier name like "Neon/Glow" won't equal a split
      // style row's detail ("Neon") — accept a UNIQUE name-only match, but only
      // when the tiers are compatible (one name contains the other); a "Ruby"
      // under Opaque must never price a "Ruby" asked for under Splatter.
      const byName = list.filter((r) => r.kind === "color" && norm(r.label) === norm(colorName));
      if (byName.length === 1) {
        const d = norm(byName[0].detail ?? "");
        const tn = norm(tierName ?? "");
        if (!d || !tn || d.includes(tn) || tn.includes(d)) colorRow = byName[0];
      }
    }
    if (colorRow && !heavy) {
      const c = rowDollars(colorRow, size);
      if (c != null) return { v: c, laddered: false, sourceRows: [colorRow] };
    }
    // Structural parent (color:<cat>:<sw> → type:<cat>) wins over name match.
    const parentKey = colorRow?.key.startsWith("color:") ? `type:${colorRow.key.split(":")[1]}` : null;
    const typeRow =
      (parentKey ? byKey.get(parentKey) : undefined) ??
      (tierName ? list.find((r) => r.kind === "type" && norm(r.label) === norm(tierName)) : undefined);
    return resolveType(typeRow, size, qty, heavy);
  };

  const flatEx: QuotePricer["flatEx"] = (key, size, qty) => {
    const row = byKey.get(key);
    const r = resolveRowUnit(row, size, qty);
    return r == null ? null : { ...r, oneTime: row?.oneTime === true };
  };

  return {
    flat: (key, size, qty) => flatEx(key, size, qty)?.v ?? null,
    flatEx,
    vinyl: (colorName, tierName, size, weightId, qty) =>
      vinylEx(colorName, tierName, size, weightId, qty)?.v ?? null,
    vinylEx,
  };
}

export type QuoteLine = {
  id: string;
  name: string;
  note?: string;
  /** Per-unit dollars, BEFORE the run-size factor. null = pricing pending. */
  v: number | null;
  /** true = priced from an imported quantity ladder at the run size — the
   * synthetic run-size curve must not rescale it (Task #3325). */
  laddered?: boolean;
  /** Mixed-provenance split (surcharge compositions): manual portion scales
   * with the run-size factor, ladder portion does not. */
  parts?: { manualV: number; ladderV: number };
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

// ── Per-press setup-fee rules engine (Task #3387) ───────────────────────
// Press-generic evaluation of the one-time setup lines from the build
// itself (quantity, weight, discs, color category, splatter colors, reorder
// flag). The rule VOCABULARY is shared platform code; each press's VALUES
// live in its pricing config (`setupRules`, shared/pressComponents.ts) —
// MRP's Day-2 numbers are the first configuration, seeded by
// scripts/seed-mrp-setup-rules.ts. A press with no rules resolves setup
// lines exactly as before (manual pricing rows only).
//
// Resolution order per setup line (single source of truth for the builder,
// the server /send gate, and the estimate email):
//   1. per-quote operator override (builderState.setupOverrides, cents) —
//      only honored when the press HAS rules (no-rules presses byte-identical)
//   2. rules-derived amount (with a human-readable derivation note)
//   3. the press's `service:<id>` pricing row (manual cell → ladder → legacy)
//   4. null → "Pricing pending" (honest; blocks send)

/** The build facts the rules evaluate — derived from live builder controls
 * on the client and from the persisted builderState on the server. */
export type SetupRuleContext = {
  sizeId: QuoteSizeId;
  /** Effective run size (the builder's 1,000-unit anchor pre-pick). */
  qty: number;
  discs: number;
  weightId: string;
  colorKind?: string | null;
  colorTierName?: string | null;
  reorder?: boolean;
  /** Splatter accent-color count (operator-set stepper). null = unknown. */
  splatterColors?: number | null;
  /** Per-quote operator overrides, cents by setup line id. */
  overrides?: Record<string, unknown> | null;
};

const moneyC = (cents: number) =>
  (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
const intFmt = (n: number) => n.toLocaleString("en-US");

function ruleHaystack(ctx: SetupRuleContext): string {
  return norm(`${ctx.colorTierName ?? ""} ${ctx.colorKind ?? ""}`);
}
const anyMatch = (list: string[] | undefined, hay: string) =>
  Array.isArray(list) && list.some((m) => hay.includes(norm(m)));

function stamperRuleMatches(r: StamperRule, ctx: SetupRuleContext, hay: string): boolean {
  if (r.sizes && !r.sizes.includes(String(ctx.sizeId))) return false;
  if (r.weights && !r.weights.includes(String(ctx.weightId))) return false;
  if (r.tierMatch && !anyMatch(r.tierMatch, hay)) return false;
  return true;
}

export type DerivedSetupFee = { dollars: number; note: string };
/** A rule REFUSING the build: the persisted value is present but the press
 * doesn't offer it (e.g. splatter count above maxSplatterColors). Unlike a
 * null (unknown → manual-row fallback), a refusal keeps the line "Pricing
 * pending" — it must never be priced off a stale manual row, and the /send
 * gate fails closed on it. */
export type RefusedSetupFee = { refused: true; note: string };

/** Stamper fee (MRP 16.1 shape): first matching rule wins; new audio gets the
 * rule's free allowance, reorders (and always-pay categories) pay every unit.
 * Fees are per RECORD, so multi-disc builds multiply by disc count. */
export function evaluateStamperFee(
  rules: SetupFeeRules | null | undefined,
  ctx: SetupRuleContext,
): DerivedSetupFee | null {
  const cfg = rules?.stamper;
  if (!cfg?.rules?.length || !(ctx.qty > 0)) return null;
  const hay = ruleHaystack(ctx);
  const rule = cfg.rules.find((r) => stamperRuleMatches(r, ctx, hay));
  if (!rule) return null;
  const discs = ctx.discs > 0 ? Math.floor(ctx.discs) : 1;
  const reorder = ctx.reorder === true && cfg.reordersAlwaysPay !== false;
  const free = reorder ? 0 : rule.freeUnits ?? 0;
  const charged = Math.max(0, Math.floor(ctx.qty) - free);
  const cents = rule.perUnitCents * charged * discs;
  const per = `${moneyC(rule.perUnitCents)}/record`;
  const lp = discs > 1 ? ` × ${discs} LP` : "";
  let note: string;
  if (charged === 0) {
    note = `New audio — first ${intFmt(rule.freeUnits ?? 0)} units included`;
  } else if (reorder && (rule.freeUnits ?? 0) > 0) {
    note = `Reorder — ${per} × ${intFmt(charged)} units${lp}`;
  } else if ((rule.freeUnits ?? 0) > 0) {
    note = `New audio — ${per} × ${intFmt(charged)} units over the first ${intFmt(rule.freeUnits ?? 0)}${lp}`;
  } else {
    note = `${rule.label ?? "Pays at all quantities"} — ${per} × ${intFmt(charged)} units${lp}`;
  }
  return { dollars: cents / 100, note };
}

/** Color setup fee (MRP 16.2 shape): $N per counted color per LP; splatter
 * composes base colors + a per-splatter-color fee; 2LP doubles. Returns null
 * (fall back to the manual row) when the category can't be derived, and a
 * refusal (line stays pending, no fallback) for an invalid/out-of-range
 * splatter-color count. */
export function evaluateColorSetupFee(
  rules: SetupFeeRules | null | undefined,
  ctx: SetupRuleContext,
): DerivedSetupFee | RefusedSetupFee | null {
  const cfg = rules?.colorSetup;
  if (!cfg) return null;
  const hay = ruleHaystack(ctx);
  if (!hay.trim()) return null; // no color picked yet — nothing to derive
  const discs = ctx.discs > 0 ? Math.floor(ctx.discs) : 1;
  const mult = cfg.perDisc !== false ? discs : 1;
  const lp = mult > 1 ? ` × ${discs} LP` : "";
  const isSplatter =
    !!cfg.splatter &&
    (norm(ctx.colorKind).includes("splatter") || anyMatch(cfg.splatter.match ?? ["splatter"], hay));
  if (isSplatter) {
    const n = ctx.splatterColors;
    // UNKNOWN (no count picked yet) → null: fall back to the manual row,
    // exactly like any other non-derivable rule (honest).
    if (n == null) return null;
    // INVALID — a count that IS present but the press doesn't offer
    // (non-integer, < 1, or above the configured maxSplatterColors) is
    // REFUSED: the line must stay "Pricing pending" (blocks /send), never
    // fall back to a stale manual row that would price a build the press
    // doesn't sell.
    const max = cfg.splatter!.maxSplatterColors;
    if (typeof n !== "number" || !Number.isInteger(n) || n < 1) {
      return { refused: true, note: "Splatter color count isn't valid — re-pick it" };
    }
    if (max != null && n > max) {
      return { refused: true, note: `This press offers up to ${intFmt(max)} splatter colors` };
    }
    const base = (cfg.splatter!.baseColors ?? 1) * cfg.perColorCents;
    const cents = (base + n * cfg.splatter!.perSplatterColorCents) * mult;
    return {
      dollars: cents / 100,
      note: `Base color + ${intFmt(n)} splatter color${n === 1 ? "" : "s"} × ${moneyC(cfg.splatter!.perSplatterColorCents)}${lp}`,
    };
  }
  let colors = cfg.categories.find((c) => anyMatch(c.match, hay))?.colors;
  if (colors == null) colors = cfg.defaultColors;
  if (colors == null) return null;
  if (colors === 0) return { dollars: 0, note: "No color setup fee" };
  const cents = colors * cfg.perColorCents * mult;
  return {
    dollars: cents / 100,
    note: `${colors} color${colors === 1 ? "" : "s"} × ${moneyC(cfg.perColorCents)}${lp}`,
  };
}

/** Press setup fee (MRP 16.3 shape): flat fee on runs under the threshold. */
export function evaluatePressSetupFee(
  rules: SetupFeeRules | null | undefined,
  ctx: SetupRuleContext,
): DerivedSetupFee | null {
  const cfg = rules?.pressSetup;
  if (!cfg || !(ctx.qty > 0)) return null;
  if (ctx.qty < cfg.underQty) {
    return { dollars: cfg.amountCents / 100, note: `Orders under ${intFmt(cfg.underQty)} units` };
  }
  return { dollars: 0, note: `Waived at ${intFmt(cfg.underQty)}+ units` };
}

/** Open-top poly bag as ONE per-unit line — insertion fee folded into the
 * bag price (MRP 16.4 / 4.11). Fixed cents, so it never rides the synthetic
 * run-size curve (laddered=true). */
export function polyBagUnitLine(
  rules: SetupFeeRules | null | undefined,
  coda?: CodaPricingSnapshot,
): QuoteLine | null {
  const pb = rules?.polyBag;
  if (!pb) return null;
  if (coda) {
    if (rules?.codaSource !== coda.source) return null;
    const bag = codaEntry(coda, pb.bagCodaCode);
    const insertion = codaEntry(coda, pb.insertionCodaCode);
    if (
      !bag || bag.targetKey !== "packaging:open-top-polybag" ||
      bag.costType !== "job" || bag.chargeType !== "per_unit" ||
      !insertion || insertion.targetKey !== "service:assembly" ||
      insertion.costType !== "job" || insertion.chargeType !== "per_touch"
    ) return null;
  }
  return {
    id: "polybag",
    name: pb.label?.trim() || "Open-top poly bag",
    note: "Insertion included",
    v: (pb.bagCents + pb.insertionCents) / 100,
    laddered: true,
  };
}

export type SetupLine = {
  id: string;
  name: string;
  note?: string;
  /** One-time dollars. 0 renders "Included"; null = pricing pending. */
  amount: number | null;
  /** true = rules-derived (the builder offers a per-quote override). */
  derived?: boolean;
  /** true = a per-quote operator override is in effect. */
  overridden?: boolean;
};

function overrideCents(ctx: SetupRuleContext, id: string): number | null {
  const o = ctx.overrides;
  if (!o || typeof o !== "object" || Array.isArray(o)) return null;
  const v = (o as Record<string, unknown>)[id];
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.round(v) : null;
}

/**
 * The one-time setup lines — single source of truth for the builder, the
 * server /send gate, and the estimate email. Without rules this reproduces
 * the previous behavior exactly (each line = its `service:<id>` pricing row,
 * overrides ignored). With rules, stampers / color setup are derived from
 * the build (manual row as fallback when a rule can't evaluate), and a
 * press-setup line is appended when configured.
 */
export function computeSetupLines(
  rows: PricingRow[] | undefined | null,
  rules: SetupFeeRules | null | undefined,
  ctx: SetupRuleContext,
  coda?: CodaPricingSnapshot,
): SetupLine[] {
  const pricer = makeQuotePricer(rows);
  const hasRules = !!rules && !!(rules.stamper || rules.colorSetup || rules.pressSetup || rules.polyBag);
  const rulesCodaValid = !coda || rules?.codaSource === coda.source;
  const resolve = (
    id: string,
    name: string,
    staticNote: string | undefined,
    derive: (() => DerivedSetupFee | RefusedSetupFee | null) | null,
    derivedCodaCode?: string | null,
    derivedTargetKey?: string,
  ): SetupLine => {
    const concreteRow = (rows ?? []).find((candidate) => candidate.key === `service:${id}`);
    if (hasRules) {
      const oc = overrideCents(ctx, id);
      if (oc != null) {
        const overrideCode = derivedCodaCode ?? (concreteRow ? rowCodaCode(concreteRow, ctx.sizeId) : null);
        const overrideTarget = derivedTargetKey ?? concreteRow?.key ?? `setup-rule:${id}`;
        if (
          (derivedCodaCode && !rulesCodaValid) ||
          setupCodaMultiplicity(overrideCode, overrideTarget, Math.max(1, Math.floor(ctx.discs)), coda) == null
        ) {
          return { id, name, amount: null, overridden: true, note: "CODA pricing identity pending" };
        }
        const rule = derive ? derive() : null;
        const priced = rule && !("refused" in rule) ? rule : null;
        return {
          id, name, amount: oc / 100, derived: !!rule, overridden: true,
          note: priced ? `Operator override — rules computed ${moneyC(Math.round(priced.dollars * 100))}` : "Operator override",
        };
      }
      const rule = derive ? derive() : null;
      if (rule && "refused" in rule) {
        // The rule REFUSED the build (e.g. splatter count above the press's
        // maximum): the line stays pending — never priced off a stale manual
        // row — so the /send gate fails closed.
        return { id, name, amount: null, derived: true, note: rule.note };
      }
      if (rule) {
        const mult = rulesCodaValid ? setupCodaMultiplicity(
          derivedCodaCode,
          derivedTargetKey ?? `setup-rule:${id}`,
          Math.max(1, Math.floor(ctx.discs)),
          coda,
        ) : null;
        if (mult == null) return { id, name, amount: null, derived: true, note: "CODA pricing identity pending" };
        // Existing rule evaluators already apply their documented LP
        // multiplicity. CODA validates that basis; it must not double-extend.
        return { id, name, amount: rule.dollars, derived: true, note: rule.note };
      }
    }
    const row = concreteRow;
    const resolved = pricer.flatEx(`service:${id}`, ctx.sizeId, ctx.qty);
    const mult = row
      ? setupCodaMultiplicity(rowCodaCode(row, ctx.sizeId), row.key, Math.max(1, Math.floor(ctx.discs)), coda)
      : null;
    const v = resolved == null || mult == null ? null : resolved.v * mult;
    return { id, name, amount: v, ...(staticNote ? { note: staticNote } : {}) };
  };
  const stamperRule = rules?.stamper?.rules.find((r) => stamperRuleMatches(r, ctx, ruleHaystack(ctx)));
  const isSplatter = norm(ctx.colorKind).includes("splatter") || norm(ctx.colorTierName).includes("splatter");
  const lines: SetupLine[] = [
    resolve("cutting", "Lacquer cutting", undefined, null),
    resolve("plating", "Lacquer plating", undefined, null),
    resolve("test", "Test pressing", "Includes 2-day domestic shipping", null),
    resolve("stampers", "Stampers", undefined, () => evaluateStamperFee(rules, ctx), stamperRule?.codaCode, stamperRule?.codaCode ? `setup-rule:stamper:${stamperRule.codaCode === "4021-0001" ? "140" : stamperRule.codaCode === "4021-0002" ? "180" : stamperRule.codaCode === "4021-0004" ? "7" : "special-effect"}` : undefined),
    resolve("colorfee", "Color setup fee", undefined, () => evaluateColorSetupFee(rules, ctx), isSplatter ? rules?.colorSetup?.splatter?.codaCode : rules?.colorSetup?.codaCode, isSplatter ? "setup-rule:splatter-color" : "setup-rule:color"),
  ];
  if (rules?.pressSetup) {
    // The press-setup line only EXISTS for presses that configured the rule
    // — no-rules presses keep today's five lines byte-identically. The rule
    // always evaluates (never null when configured), so `service:setup` rows
    // are not consulted.
    const oc = overrideCents(ctx, "setup");
    const rule = evaluatePressSetupFee(rules, ctx)!;
    const codaMult = rule.dollars === 0
      ? 1
      : rulesCodaValid
        ? setupCodaMultiplicity(rules.pressSetup.codaCode, "setup-rule:press-setup:under-500", Math.max(1, Math.floor(ctx.discs)), coda)
        : null;
    lines.push(
      codaMult == null
        ? { id: "setup", name: "Press setup", amount: null, derived: true, note: "CODA pricing identity pending" }
        : oc != null
        ? { id: "setup", name: "Press setup", amount: oc / 100, derived: true, overridden: true, note: `Operator override — rules computed ${moneyC(Math.round(rule.dollars * 100))}` }
        : { id: "setup", name: "Press setup", amount: rule.dollars, derived: true, note: rule.note },
    );
  }
  return lines;
}

/** Build the rules context from a persisted builder state — the server-side
 * twin of the builder's live controls. ABSENT fields fail SAFE (unknown →
 * manual-row fallback), but a PRESENT-yet-invalid splatter count must stay
 * distinguishable so the rule can refuse it (fail closed at /send). */
export function setupCtxFromState(state: QuoteBuilderState): SetupRuleContext {
  return {
    sizeId: String(state.sizeId ?? "12") as QuoteSizeId,
    qty: typeof state.qty === "number" && state.qty > 0 ? state.qty : LADDER_REFERENCE_QTY,
    discs: typeof state.discs === "number" && state.discs > 0 ? state.discs : 1,
    weightId: String(state.weightId ?? "140"),
    colorKind: typeof state.colorKind === "string" ? state.colorKind : null,
    colorTierName: typeof state.colorTierName === "string" ? state.colorTierName : null,
    reorder: state.reorder === true,
    // null/undefined = genuinely absent (never picked). Any other non-number
    // persisted value (forged string/boolean/object/…) maps to NaN — present
    // but invalid — which the color-setup rule REFUSES instead of falling
    // back to a stale manual row.
    splatterColors:
      state.splatterColors == null
        ? null
        : typeof state.splatterColors === "number"
          ? state.splatterColors
          : Number.NaN,
    overrides:
      state.setupOverrides && typeof state.setupOverrides === "object" && !Array.isArray(state.setupOverrides)
        ? (state.setupOverrides as Record<string, unknown>)
        : null,
  };
}

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
  // ── Setup-fee rules inputs (Task #3387) — persisted so the server /send
  // gate + estimate email re-derive the exact same setup lines. ──
  /** Reorder of existing audio: stamper free allowance does not apply. */
  reorder?: boolean;
  /** Splatter accent-color count (only meaningful on splatter builds). */
  splatterColors?: number | null;
  /** Open-top poly bag picked (prices via rules.polyBag, one folded line). */
  polyBag?: boolean;
  /** Per-quote operator overrides on derived setup lines, cents by line id. */
  setupOverrides?: Record<string, number> | null;
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
  rules?: SetupFeeRules | null,
  coda?: CodaPricingSnapshot,
): string[] {
  const state = bs && typeof bs === "object" ? bs : {};
  const done = new Set(Array.isArray(state.done) ? state.done.map(String) : []);
  const picked = (k: string) => done.has(k);
  const pricer = makeQuotePricer(rows);
  const pending: string[] = [];
  // Imported ladders resolve at the build's run size (reference 1K otherwise).
  const qty = typeof state.qty === "number" && state.qty > 0 ? state.qty : undefined;
  const size = String(state.sizeId ?? "12") as QuoteSizeId;

  // A quote always includes the record itself: if the vinyl steps aren't
  // done the build is incomplete → the vinyl line is pending (fail closed;
  // an omitted `done` entry can never hide a line from pricing).
  const vinylDone = picked("size") && picked("weight") && picked("color");
  if (vinylDone) {
    const v =
      state.colorName == null
        ? null // pre-name draft: fail closed, re-save from the builder
        : pricer.vinylEx(String(state.colorName), String(state.colorTierName ?? ""), size, String(state.weightId ?? ""), qty);
    const discs = typeof state.discs === "number" && state.discs > 0 ? Math.floor(state.discs) : 1;
    if (v == null || resolvedCodaMultiplicity(v, size, discs, coda, {}, String(state.weightId) === "180") == null) pending.push("vinyl");
    const assembly = pricer.flatEx("service:assembly", size, qty);
    if (assembly == null || resolvedCodaMultiplicity(assembly, size, discs, coda, { touches: discs }) == null) pending.push("assembly");
    const shrink = pricer.flatEx("service:shrink", size, qty);
    if (shrink == null || resolvedCodaMultiplicity(shrink, size, discs, coda) == null) pending.push("shrink");
  } else {
    pending.push("vinyl");
  }
  // Components count when their step is done OR a selection is recorded —
  // a selection can never dodge pricing by leaving its step out of `done`.
  const discs = typeof state.discs === "number" && state.discs > 0 ? Math.floor(state.discs) : 1;
  const flatPending = (key: string, counts: { stickers?: number; touches?: number } = {}) => {
    const resolved = pricer.flatEx(key, size, qty);
    return resolved == null || resolvedCodaMultiplicity(resolved, size, discs, coda, counts) == null;
  };
  if ((picked("label") || state.labelId) && flatPending(`labels:${state.labelId}`)) pending.push("label");
  if ((picked("jacket") || state.jacketId) && flatPending(`jackets:${state.jacketId}`)) pending.push("jacket");
  if ((picked("sleeve") || state.sleeveId) && flatPending(`sleeves:${state.sleeveId}`)) pending.push("sleeve");
  if (state.insertId && state.insertId !== "none" && flatPending(`inserts:${state.insertId}`)) {
    pending.push("insert");
  }
  if (state.stickerShapeId && state.stickerShapeId !== "none" && flatPending(`stickers:${state.stickerShapeId}`, { stickers: 1 })) {
    pending.push("sticker");
  }
  // Setup lines resolve through the shared rules engine (Task #3387): with
  // no rules configured this is exactly the old `service:<id>` row loop.
  for (const l of computeSetupLines(rows, rules ?? null, setupCtxFromState(state), coda)) {
    if (l.amount == null) pending.push(l.id);
  }
  // A recorded poly-bag pick with no poly-bag rule can't price — fail closed.
  if (state.polyBag === true && polyBagUnitLine(rules, coda) == null) pending.push("polybag");
  return pending;
}

// ── Client-estimate email breakdown (Ruby handoff e86b169) ──────────────
// The estimate email shows fully-expanded numbers for the ONE quantity the
// press prepared. This mirrors the builder's line construction + run-size
// curve exactly (quoteLines / QB_SETUP_LINES / tierFactor in
// PressQuoteBuilder.tsx) so the email's numbers match what the press saw
// when they hit Send. Returns null when the stored state can't produce an
// honest, fully-priced breakdown (the email then omits the totals card
// rather than showing wrong or partial numbers).

/** The builder's run-size discount curve, anchored so the 1,000-unit tier is
 * the baseline (same numbers as qtyScale/tierFactor in the builders). */
export function quoteTierFactor(qty: number): number {
  const raw = qty <= 100 ? 1.0 : qty <= 300 ? 0.88 : qty <= 500 ? 0.8 : qty <= 1000 ? 0.7 : qty <= 2000 ? 0.62 : 0.55;
  return raw / 0.7;
}

export type QuoteEmailLine = { id: string; name: string; note?: string; unitDollars: number };
export type QuoteEmailSetupLine = { id: string; name: string; note?: string; dollars: number };
export type QuoteEmailBreakdown = {
  qty: number;
  unitLines: QuoteEmailLine[];
  setupLines: QuoteEmailSetupLine[];
  /** Per-record total at the prepared quantity (sum of unitLines). */
  unitCost: number;
  setupTotal: number;
  /** unitCost × qty */
  subtotal: number;
  total: number;
};

const SIZE_LABEL: Record<string, string> = { "7": '7"', "10": '10"', "12": '12"' };

/** Prefer the press's own Pricing-row label when it reads like a human name
 * (seeded test rows carry the raw key as label — never surface those). */
function rowDisplayName(rows: PricingRow[], key: string, fallback: string): string {
  const row = rows.find((r) => r.key === key);
  const label = String(row?.label ?? "").trim();
  return label && !label.includes(":") ? label : fallback;
}

const JACKET_NAMES: Record<string, string> = {
  single: "Single Jacket", gatefold: "Gatefold Jacket", trifold: "Tri-Fold Gatefold Jacket", discobag: "Discobag",
};
const LABEL_NAMES: Record<string, string> = { color: "Full Color", bw: "Black & White", blank: "Blank" };
const titleCase = (s: string) => s.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
const withSuffix = (name: string, suffix: string) =>
  name.toLowerCase().includes(suffix.toLowerCase()) ? name : `${name} ${suffix}`;

export function computeQuoteEmailBreakdown(
  bs: QuoteBuilderState | null | undefined,
  rows: PricingRow[] | undefined | null,
  rules?: SetupFeeRules | null,
  coda?: CodaPricingSnapshot,
): QuoteEmailBreakdown | null {
  if (invalidQuoteBuilderState(bs)) return null;
  if (computeQuotePendingIds(bs, rows, rules, coda).length > 0) return null;
  const state = bs as QuoteBuilderState;
  const list: PricingRow[] = Array.isArray(rows) ? rows.filter((r) => r && typeof r.key === "string") : [];
  const pricer = makeQuotePricer(list);
  const qty = Number(state.qty);
  const discs = typeof state.discs === "number" && state.discs > 0 ? state.discs : 1;
  const sizeId = String(state.sizeId ?? "12") as QuoteSizeId;
  const unitFactor = quoteTierFactor(qty);

  // Ladder-priced lines are already AT the run size — only legacy flat prices
  // ride the synthetic run-size curve (Task #3325).
  const raw: Array<{ id: string; name: string; note?: string; v: number | null; laddered?: boolean; parts?: { manualV: number; ladderV: number } }> = [];
  const vinylBase = pricer.vinylEx(String(state.colorName), String(state.colorTierName ?? ""), sizeId, String(state.weightId ?? ""), qty);
  const vinylMult = resolvedCodaMultiplicity(vinylBase, sizeId, discs, coda, {}, String(state.weightId) === "180");
  raw.push({
    id: "vinyl",
    name: `${SIZE_LABEL[sizeId] ?? sizeId} · ${state.weightId ?? "140"}g ${state.colorName}`,
    note: discs > 1 ? `${discs} LP per record` : "Vinyl",
    v: vinylBase == null || vinylMult == null ? null : vinylBase.v * (coda ? vinylMult : discs),
    laddered: vinylBase?.laddered,
    parts: vinylBase?.parts
      ? { manualV: vinylBase.parts.manualV * (coda ? vinylMult! : discs), ladderV: vinylBase.parts.ladderV * (coda ? vinylMult! : discs) }
      : undefined,
  });
  const labelId = String(state.labelId);
  const labelV = pricer.flatEx(`labels:${labelId}`, sizeId, qty);
  const labelMult = resolvedCodaMultiplicity(labelV, sizeId, discs, coda);
  raw.push({
    id: "label",
    name: withSuffix(rowDisplayName(list, `labels:${labelId}`, LABEL_NAMES[labelId] ?? titleCase(labelId)), "label"),
    note: discs > 1 ? "Both discs" : undefined,
    v: labelV == null || labelMult == null ? null : labelV.v * (coda ? labelMult : discs),
    laddered: labelV?.laddered,
  });
  const jacketId = String(state.jacketId);
  const jacketV = pricer.flatEx(`jackets:${jacketId}`, sizeId, qty);
  const jacketMult = resolvedCodaMultiplicity(jacketV, sizeId, discs, coda);
  raw.push({
    id: "jacket",
    name: withSuffix(rowDisplayName(list, `jackets:${jacketId}`, JACKET_NAMES[jacketId] ?? titleCase(jacketId)), "jacket"),
    v: jacketV == null || jacketMult == null ? null : jacketV.v * jacketMult,
    laddered: jacketV?.laddered,
  });
  const sleeveId = String(state.sleeveId);
  const sleeveV = pricer.flatEx(`sleeves:${sleeveId}`, sizeId, qty);
  const sleeveMult = resolvedCodaMultiplicity(sleeveV, sizeId, discs, coda);
  raw.push({
    id: "sleeve",
    name: withSuffix(rowDisplayName(list, `sleeves:${sleeveId}`, titleCase(sleeveId)), "sleeve"),
    v: sleeveV == null || sleeveMult == null ? null : sleeveV.v * sleeveMult,
    laddered: sleeveV?.laddered,
  });
  if (state.insertId && state.insertId !== "none") {
    const insertV = pricer.flatEx(`inserts:${state.insertId}`, sizeId, qty);
    const insertMult = resolvedCodaMultiplicity(insertV, sizeId, discs, coda);
    raw.push({
      id: "insert",
      name: rowDisplayName(list, `inserts:${state.insertId}`, `${titleCase(String(state.insertId))} insert`),
      v: insertV == null || insertMult == null ? null : insertV.v * insertMult,
      laddered: insertV?.laddered,
    });
  }
  if (state.stickerShapeId && state.stickerShapeId !== "none") {
    const stickerV = pricer.flatEx(`stickers:${state.stickerShapeId}`, sizeId, qty);
    const stickerMult = resolvedCodaMultiplicity(stickerV, sizeId, discs, coda, { stickers: 1 });
    raw.push({
      id: "sticker",
      name: withSuffix(rowDisplayName(list, `stickers:${state.stickerShapeId}`, titleCase(String(state.stickerShapeId))), "sticker"),
      v: stickerV == null || stickerMult == null ? null : stickerV.v * stickerMult,
      laddered: stickerV?.laddered,
    });
  }
  const assemblyV = pricer.flatEx("service:assembly", sizeId, qty);
  const assemblyMult = resolvedCodaMultiplicity(assemblyV, sizeId, discs, coda, { touches: discs });
  raw.push({ id: "assembly", name: "Assembly", note: "Insert placed on top before shrink", v: assemblyV == null || assemblyMult == null ? null : assemblyV.v * assemblyMult, laddered: assemblyV?.laddered });
  const shrinkV = pricer.flatEx("service:shrink", sizeId, qty);
  const shrinkMult = resolvedCodaMultiplicity(shrinkV, sizeId, discs, coda);
  raw.push({ id: "shrink", name: "Shrinkwrap", note: "Retail-ready seal", v: shrinkV == null || shrinkMult == null ? null : shrinkV.v * shrinkMult, laddered: shrinkV?.laddered });
  // Open-top poly bag (Task #3387): ONE per-unit line, insertion folded in.
  if (state.polyBag === true) {
    const pb = polyBagUnitLine(rules, coda);
    if (pb == null) return null; // pending gate already failed closed; stay honest
    raw.push(pb);
  }

  // Pending gate above guarantees no nulls, but stay fail-closed anyway.
  if (raw.some((l) => l.v == null)) return null;
  const unitLines: QuoteEmailLine[] = raw.map((l) => ({
    id: l.id, name: l.name, ...(l.note ? { note: l.note } : {}), unitDollars: scaledUnitDollars(l, unitFactor),
  }));

  // Setup lines through the shared rules engine (Task #3387) — same
  // derivation (and derivation notes) the builder showed when Send was hit.
  // Without rules this is byte-identical to the old five-row loop.
  const setupLines: QuoteEmailSetupLine[] = [];
  for (const l of computeSetupLines(rows, rules ?? null, setupCtxFromState(state), coda)) {
    if (l.amount == null) return null;
    setupLines.push({ id: l.id, name: l.name, ...(l.note ? { note: l.note } : {}), dollars: l.amount });
  }

  // Keep persisted/email/public totals cents-stable; binary floating point
  // must not make a 2LP composition disagree with its saved estimate.
  const money = (dollars: number) => Math.round(dollars * 100) / 100;
  const unitCost = money(unitLines.reduce((a, l) => a + l.unitDollars, 0));
  const setupTotal = money(setupLines.reduce((a, l) => a + l.dollars, 0));
  const subtotal = money(unitCost * qty);
  return { qty, unitLines, setupLines, unitCost, setupTotal, subtotal, total: money(subtotal + setupTotal) };
}
