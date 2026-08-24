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
import type { PricingRow, PricingRung } from "./pressComponents";

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
};

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
    return c == null ? null : { v: c / 100, laddered: true };
  }
  const bySize = (row.pricesBySize ?? {}) as Record<string, number | null | undefined>;
  if (sz) {
    const v = bySize[sz];
    if (typeof v === "number") return { v: v / 100, laddered: false };
  }
  // Flat rows (no size scoping) keep their any-cell operator semantics — a
  // price typed under any size chip applies everywhere.
  if ((row.sizes ?? []).length === 0) {
    for (const v of Object.values(bySize)) {
      if (typeof v === "number") return { v: v / 100, laddered: false };
    }
  } else if (!sz) {
    for (const v of Object.values(bySize)) {
      if (typeof v === "number") return { v: v / 100, laddered: false };
    }
  }
  const ladders = (row.rungsBySize ?? {}) as Record<string, PricingRung[] | undefined>;
  const ladder = sz ? ladders[sz] : Object.values(ladders).find((l) => (l ?? []).length > 0);
  const c = snapLadderCents(ladder, qty);
  if (c != null) return { v: c / 100, laddered: true };
  if (typeof row.priceCents === "number") return { v: row.priceCents / 100, laddered: false };
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
      if (c != null) return { v: c, laddered: false };
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
        : pricer.vinyl(String(state.colorName), String(state.colorTierName ?? ""), size, String(state.weightId ?? ""), qty);
    if (v == null) pending.push("vinyl");
    if (pricer.flat("service:assembly", size, qty) == null) pending.push("assembly");
    if (pricer.flat("service:shrink", size, qty) == null) pending.push("shrink");
  } else {
    pending.push("vinyl");
  }
  // Components count when their step is done OR a selection is recorded —
  // a selection can never dodge pricing by leaving its step out of `done`.
  if ((picked("label") || state.labelId) && pricer.flat(`labels:${state.labelId}`, size, qty) == null) pending.push("label");
  if ((picked("jacket") || state.jacketId) && pricer.flat(`jackets:${state.jacketId}`, size, qty) == null) pending.push("jacket");
  if ((picked("sleeve") || state.sleeveId) && pricer.flat(`sleeves:${state.sleeveId}`, size, qty) == null) pending.push("sleeve");
  if (state.insertId && state.insertId !== "none" && pricer.flat(`inserts:${state.insertId}`, size, qty) == null) {
    pending.push("insert");
  }
  if (state.stickerShapeId && state.stickerShapeId !== "none" && pricer.flat(`stickers:${state.stickerShapeId}`, size, qty) == null) {
    pending.push("sticker");
  }
  for (const key of QUOTE_SETUP_SERVICE_KEYS) {
    if (pricer.flat(key, size, qty) == null) pending.push(key.slice("service:".length));
  }
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
): QuoteEmailBreakdown | null {
  if (invalidQuoteBuilderState(bs)) return null;
  if (computeQuotePendingIds(bs, rows).length > 0) return null;
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
  raw.push({
    id: "vinyl",
    name: `${SIZE_LABEL[sizeId] ?? sizeId} · ${state.weightId ?? "140"}g ${state.colorName}`,
    note: discs > 1 ? `${discs} LP per record` : "Vinyl",
    v: vinylBase == null ? null : vinylBase.v * discs,
    laddered: vinylBase?.laddered,
    parts: vinylBase?.parts
      ? { manualV: vinylBase.parts.manualV * discs, ladderV: vinylBase.parts.ladderV * discs }
      : undefined,
  });
  const labelId = String(state.labelId);
  const labelV = pricer.flatEx(`labels:${labelId}`, sizeId, qty);
  raw.push({
    id: "label",
    name: withSuffix(rowDisplayName(list, `labels:${labelId}`, LABEL_NAMES[labelId] ?? titleCase(labelId)), "label"),
    note: discs > 1 ? "Both discs" : undefined,
    v: labelV == null ? null : labelV.v * discs,
    laddered: labelV?.laddered,
  });
  const jacketId = String(state.jacketId);
  const jacketV = pricer.flatEx(`jackets:${jacketId}`, sizeId, qty);
  raw.push({
    id: "jacket",
    name: withSuffix(rowDisplayName(list, `jackets:${jacketId}`, JACKET_NAMES[jacketId] ?? titleCase(jacketId)), "jacket"),
    v: jacketV?.v ?? null,
    laddered: jacketV?.laddered,
  });
  const sleeveId = String(state.sleeveId);
  const sleeveV = pricer.flatEx(`sleeves:${sleeveId}`, sizeId, qty);
  raw.push({
    id: "sleeve",
    name: withSuffix(rowDisplayName(list, `sleeves:${sleeveId}`, titleCase(sleeveId)), "sleeve"),
    v: sleeveV?.v ?? null,
    laddered: sleeveV?.laddered,
  });
  if (state.insertId && state.insertId !== "none") {
    const insertV = pricer.flatEx(`inserts:${state.insertId}`, sizeId, qty);
    raw.push({
      id: "insert",
      name: rowDisplayName(list, `inserts:${state.insertId}`, `${titleCase(String(state.insertId))} insert`),
      v: insertV?.v ?? null,
      laddered: insertV?.laddered,
    });
  }
  if (state.stickerShapeId && state.stickerShapeId !== "none") {
    const stickerV = pricer.flatEx(`stickers:${state.stickerShapeId}`, sizeId, qty);
    raw.push({
      id: "sticker",
      name: withSuffix(rowDisplayName(list, `stickers:${state.stickerShapeId}`, titleCase(String(state.stickerShapeId))), "sticker"),
      v: stickerV?.v ?? null,
      laddered: stickerV?.laddered,
    });
  }
  const assemblyV = pricer.flatEx("service:assembly", sizeId, qty);
  raw.push({ id: "assembly", name: "Assembly", note: "Insert placed on top before shrink", v: assemblyV?.v ?? null, laddered: assemblyV?.laddered });
  const shrinkV = pricer.flatEx("service:shrink", sizeId, qty);
  raw.push({ id: "shrink", name: "Shrinkwrap", note: "Retail-ready seal", v: shrinkV?.v ?? null, laddered: shrinkV?.laddered });

  // Pending gate above guarantees no nulls, but stay fail-closed anyway.
  if (raw.some((l) => l.v == null)) return null;
  const unitLines: QuoteEmailLine[] = raw.map((l) => ({
    id: l.id, name: l.name, ...(l.note ? { note: l.note } : {}), unitDollars: scaledUnitDollars(l, unitFactor),
  }));

  const setupDefs: Array<{ id: string; name: string; note?: string; key: string }> = [
    { id: "cutting", name: "Lacquer cutting", key: "service:cutting" },
    { id: "plating", name: "Lacquer plating", key: "service:plating" },
    { id: "test", name: "Test pressing", note: "Includes 2-day domestic shipping", key: "service:test" },
    { id: "stampers", name: "Stampers", key: "service:stampers" },
    { id: "colorfee", name: "Color setup fee", key: "service:colorfee" },
  ];
  const setupLines: QuoteEmailSetupLine[] = [];
  for (const d of setupDefs) {
    const v = pricer.flat(d.key, sizeId, qty);
    if (v == null) return null;
    setupLines.push({ id: d.id, name: d.name, ...(d.note ? { note: d.note } : {}), dollars: v });
  }

  const unitCost = unitLines.reduce((a, l) => a + l.unitDollars, 0);
  const setupTotal = setupLines.reduce((a, l) => a + l.dollars, 0);
  const subtotal = unitCost * qty;
  return { qty, unitLines, setupLines, unitCost, setupTotal, subtotal, total: subtotal + setupTotal };
}
