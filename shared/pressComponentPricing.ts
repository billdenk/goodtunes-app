// Task #3227 — Associate press component choices with their prices.
//
// A press's package components (jacket style, inner sleeve, inserts,
// download cards, stickers, poly-bags, shrink-wrap, insertion) can each be
// linked to a PRICE SOURCE so operators see a true itemized cost build-up
// per package:
//   • "ladder"       — a quantity-break component price ladder (MRP Tier 3
//                      sheets live under press_components 'pricing'
//                      config.componentLadders; the chosen ladder's rungs
//                      are SNAPSHOTTED onto the link row at save time).
//   • "service"      — a press_service_items row (Viryl-style setup &
//                      services pricing).
//   • "included"     — included in the record price (the tier×jacket
//                      all-in ladder already covers it).
//   • "custom_quote" — genuinely unpriced; needs a human quote.
// No link at all = "no price on file" (NEVER $0, never another press's
// number — each press resolves exclusively from its own rows).
//
// Everything here is PURE (no DB) so the resolver unit-tests run without a
// database and the client can share the vocabulary. The DB wrapper +
// routes live in server/pressComponentPricing.ts. Fan-facing quote math
// (Sell-panel ladder, checkout) deliberately does NOT touch this module.

import { z } from "zod";
import { JACKET_STYLE_IDS, SLEEVE_STYLE_IDS, INSERT_STYLE_IDS } from "./pressComponents";
import type { PressServiceUnitBasis } from "./schema";

// ── Component/option vocabulary ────────────────────────────────────────
export const PACKAGE_EXTRA_IDS = [
  "download_card",
  "sticker",
  "poly_bag",
  "shrink_wrap",
  "insertion",
] as const;

export const PACKAGE_COMPONENT_KEYS = ["jacket", "inner_sleeve", "insert", "extras"] as const;
export type PackageComponentKey = (typeof PACKAGE_COMPONENT_KEYS)[number];

export const PACKAGE_COMPONENT_OPTIONS: Record<PackageComponentKey, readonly string[]> = {
  jacket: JACKET_STYLE_IDS,
  inner_sleeve: SLEEVE_STYLE_IDS,
  insert: INSERT_STYLE_IDS,
  extras: PACKAGE_EXTRA_IDS,
};

export const PACKAGE_COMPONENT_GROUP_LABEL: Record<PackageComponentKey, string> = {
  jacket: "Jacket",
  inner_sleeve: "Inner sleeve",
  insert: "Inserts",
  extras: "Extras",
};

export const PACKAGE_OPTION_LABEL: Record<PackageComponentKey, Record<string, string>> = {
  jacket: {
    single: "Single jacket",
    gatefold: "Gatefold jacket",
    trifold: "Trifold jacket",
    discobag: "Discobag",
    pvc: "PVC sleeve jacket",
  },
  inner_sleeve: {
    "printed-paper": "Printed paper sleeve",
    "printed-board": "Printed board (Euro) sleeve",
    white: "White paper sleeve",
    black: "Black paper sleeve",
    "white-poly": "White poly-lined sleeve",
    "black-poly": "Black poly-lined sleeve",
  },
  insert: {
    sheet: "Insert sheet",
    gatefold: "Gatefold insert",
    booklet: "Booklet",
    poster: "Poster",
  },
  extras: {
    download_card: "Download card",
    sticker: "Sticker",
    poly_bag: "Poly-bag",
    shrink_wrap: "Shrink-wrap",
    insertion: "Insertion (assembly)",
  },
};

export function isValidPackageOption(componentKey: string, optionId: string): componentKey is PackageComponentKey {
  const opts = PACKAGE_COMPONENT_OPTIONS[componentKey as PackageComponentKey];
  return !!opts && opts.includes(optionId);
}

// ── Link shape ─────────────────────────────────────────────────────────
export const PRICE_LINK_MODES = ["ladder", "service", "included", "custom_quote"] as const;
export type PriceLinkMode = (typeof PRICE_LINK_MODES)[number];

export const PRICE_LINK_MODE_LABEL: Record<PriceLinkMode, string> = {
  ladder: "Price ladder",
  service: "Service item",
  included: "Included in record price",
  custom_quote: "Custom quote",
};

// Typed rungs must be POSITIVE — a $0 price on a component choice must be
// expressed as priceMode='included', never as a $0 "priced" line (the
// no-price-on-file invariant would otherwise leak $0 into cost totals).
export const ladderRungSchema = z.object({
  qty: z.number().int().min(1),
  unitCents: z.number().int().min(1),
});
export type LadderRung = z.infer<typeof ladderRungSchema>;

/** Validates operator-typed rungs beyond the per-rung schema: no duplicate
 *  quantities (they'd make rung-snap ambiguous). Returns an error message
 *  or null when valid. */
export function validateTypedRungs(rungs: LadderRung[]): string | null {
  const seen = new Set<number>();
  for (const r of rungs) {
    if (seen.has(r.qty)) return `Duplicate ladder quantity ${r.qty}`;
    seen.add(r.qty);
  }
  return null;
}

// ── Jacket style → press jacket row (record-ladder leg) ───────────────
// The record price is the tier×jacket all-in ladder, so the SELECTED
// jacket style must map to the corresponding press_jackets row of the
// SAME press (bridged by NAME — jackets carry no style column). "Records
// only / no jacket" configuration rows are never matched. A style with
// no matching row returns null: the caller surfaces an honest gap, never
// silently prices the default jacket.
const JACKETLESS_NAME = /no jacket|no gatefold|no printed jacket|sleeve only|sleeves only/i;
const JACKET_STYLE_NAME_MATCH: Record<string, RegExp> = {
  gatefold: /gatefold/i,
  trifold: /tri.?fold/i,
  discobag: /disco.?bag/i,
  pvc: /pvc/i,
  single: /single|standard/i,
};
export function matchJacketRowForOption(
  optionId: string,
  jackets: { id: string; name: string; isDefault?: boolean | null; applicableFormats?: string[] | null }[],
  format?: string | null,
): string | null {
  const usable = jackets.filter(
    (j) =>
      !JACKETLESS_NAME.test(j.name) &&
      (!format || !j.applicableFormats || j.applicableFormats.includes(format)),
  );
  const re = JACKET_STYLE_NAME_MATCH[optionId];
  if (re) {
    // A "Tri-Fold Gatefold" belongs to the trifold style, never the plain
    // gatefold one.
    const hits = usable.filter(
      (j) =>
        re.test(j.name) &&
        (optionId !== "gatefold" || !JACKET_STYLE_NAME_MATCH.trifold.test(j.name)),
    );
    if (hits.length > 0) {
      // Prefer the shortest / default name (plain "Gatefold Jacket" over
      // "Old-Style Tip-On Gatefold").
      hits.sort((a, b) => Number(!!b.isDefault) - Number(!!a.isDefault) || a.name.length - b.name.length);
      return hits[0].id;
    }
  }
  // The single/default style falls back to the press's default jacket —
  // that IS the record ladder every press quotes by default.
  if (optionId === "single") {
    const def = usable.find((j) => j.isDefault);
    if (def) return def.id;
  }
  return null;
}

export type ComponentPriceLinkData = {
  componentKey: PackageComponentKey;
  optionId: string;
  priceMode: PriceLinkMode;
  /** press_service_items id when priceMode='service' (same press ONLY). */
  serviceItemId: string | null;
  /** Provenance of a snapshotted ladder (group + item label in the press's
   *  componentLadders blob). Display-only. */
  ladderSource: { groupKey: string; itemLabel: string } | null;
  /** Snapshotted rungs when priceMode='ladder'. */
  ladderRungs: LadderRung[] | null;
};

// Minimal service-item shape the resolver needs (subset of PressServiceItem).
export type ResolvableServiceItem = {
  id: string;
  label: string;
  amountCents: number;
  unitBasis: PressServiceUnitBasis;
  archivedAt?: Date | string | null;
};

// ── Rung snap (same semantics as the record ladders) ──────────────────
// Mirrors server/pressCatalog.ts snapToCatalogQuantityTier: sort asc,
// snap UP to the next rung; beyond the top rung = requiresQuote (custom
// quote), empty ladder = null (no price on file).
export function snapComponentLadder(
  rungs: LadderRung[] | null | undefined,
  input: number | null | undefined,
): { qty: number; unitCents: number; requiresQuote: boolean } | null {
  if (!Array.isArray(rungs) || rungs.length === 0) return null;
  const sorted = [...rungs].sort((a, b) => a.qty - b.qty);
  const n = typeof input === "number" && Number.isFinite(input) ? Math.max(1, Math.floor(input)) : 1;
  for (const r of sorted) if (n <= r.qty) return { qty: r.qty, unitCents: r.unitCents, requiresQuote: false };
  const top = sorted[sorted.length - 1];
  return { qty: top.qty, unitCents: top.unitCents, requiresQuote: true };
}

// ── componentLadders blob shape (seeded by scripts/seed-mrp-services-tier3.ts
// under press_components 'pricing' config.componentLadders) ────────────
export type ComponentLadderCatalog = {
  source?: string;
  priceList?: string;
  quantities: number[];
  groups: { key: string; label: string; items: { label: string; unitCents: number[]; note?: string }[] }[];
};

// Zip a catalog item's unitCents against the blob's quantities into rungs.
// Zero/absent cells are dropped — a $0 rung must never exist.
export function ladderItemToRungs(
  catalog: ComponentLadderCatalog,
  groupKey: string,
  itemLabel: string,
): LadderRung[] | null {
  const group = catalog.groups.find((g) => g.key === groupKey);
  const item = group?.items.find((i) => i.label === itemLabel);
  if (!group || !item) return null;
  const rungs = catalog.quantities
    .map((qty, i) => ({ qty, unitCents: item.unitCents[i] }))
    .filter((r) => typeof r.qty === "number" && typeof r.unitCents === "number" && r.unitCents > 0);
  return rungs.length > 0 ? rungs : null;
}

// ── Cost-line resolution ───────────────────────────────────────────────
export type ComponentCostStatus = "priced" | "included" | "custom_quote" | "no_price_on_file";

export type ComponentCostLine = {
  componentKey: PackageComponentKey;
  optionId: string;
  label: string;
  status: ComponentCostStatus;
  mode: PriceLinkMode | null;
  /** Per-unit cents when known (rounded for display; totals use raw). */
  unitCents: number | null;
  /** Extended total for the typed quantity; null when it can't honestly
   *  be computed (custom quote, no price, odd unit basis). */
  totalCents: number | null;
  /** Rung the quantity snapped to (ladder mode). */
  snappedQty: number | null;
  /** Unit basis of a service line ("per unit", "per order", …). */
  unitBasis: PressServiceUnitBasis | null;
  /** Human provenance ("MRP Tier 3 · Printed Gatefold Jackets — …" /
   *  service label / "Included in record price"). */
  sourceLabel: string | null;
  note: string | null;
};

// Unit bases we can honestly extend to (basis × quantity). per_order is a
// flat one-time amount. Everything else (per_side, per_box, per_1000_pairs)
// shows its rate but no extended total — no fabricated math.
const PER_UNIT_BASES: PressServiceUnitBasis[] = ["per_unit", "per_record", "per_disc", "per_pair"];

export function resolveComponentCostLine(args: {
  componentKey: PackageComponentKey;
  optionId: string;
  link: ComponentPriceLinkData | null | undefined;
  /** THIS press's service items only — caller scopes by pressId. */
  serviceItemsById: Map<string, ResolvableServiceItem>;
  quantity: number;
}): ComponentCostLine {
  const { componentKey, optionId, link, serviceItemsById, quantity } = args;
  const label = PACKAGE_OPTION_LABEL[componentKey]?.[optionId] ?? optionId;
  const base: ComponentCostLine = {
    componentKey,
    optionId,
    label,
    status: "no_price_on_file",
    mode: link?.priceMode ?? null,
    unitCents: null,
    totalCents: null,
    snappedQty: null,
    unitBasis: null,
    sourceLabel: null,
    note: null,
  };
  if (!link) return { ...base, note: "No price on file for this press" };

  switch (link.priceMode) {
    case "included":
      return { ...base, status: "included", totalCents: 0, sourceLabel: "Included in record price" };
    case "custom_quote":
      return { ...base, status: "custom_quote", note: "Custom quote required" };
    case "ladder": {
      const snap = snapComponentLadder(link.ladderRungs, quantity);
      const src = link.ladderSource ? link.ladderSource.itemLabel : "Component price ladder";
      if (!snap) return { ...base, sourceLabel: src, note: "Ladder has no rungs — no price on file" };
      if (snap.requiresQuote) {
        return {
          ...base,
          status: "custom_quote",
          snappedQty: snap.qty,
          sourceLabel: src,
          note: `Beyond top rung (${snap.qty.toLocaleString()}) — custom quote`,
        };
      }
      return {
        ...base,
        status: "priced",
        unitCents: snap.unitCents,
        totalCents: Math.round(snap.unitCents * quantity),
        snappedQty: snap.qty,
        sourceLabel: src,
      };
    }
    case "service": {
      const item = link.serviceItemId ? serviceItemsById.get(link.serviceItemId) : null;
      // Missing / archived / other-press item → honest gap, never $0 and
      // never another press's number (the map is press-scoped upstream).
      if (!item || item.archivedAt) {
        return { ...base, note: "Linked service item not found for this press — no price on file" };
      }
      // A $0 press-sheet service item means "included in the pressing price"
      // — surface it as included, never as a misleading $0.00 priced line.
      if (item.amountCents <= 0) {
        return {
          ...base,
          status: "included",
          totalCents: 0,
          unitBasis: item.unitBasis,
          sourceLabel: item.label,
          note: "Included in record price",
        };
      }
      if (PER_UNIT_BASES.includes(item.unitBasis)) {
        return {
          ...base,
          status: "priced",
          unitCents: item.amountCents,
          totalCents: item.amountCents * quantity,
          unitBasis: item.unitBasis,
          sourceLabel: item.label,
        };
      }
      if (item.unitBasis === "per_order") {
        return {
          ...base,
          status: "priced",
          unitCents: null,
          totalCents: item.amountCents,
          unitBasis: item.unitBasis,
          sourceLabel: item.label,
          note: "One-time per order",
        };
      }
      // per_side / per_box / per_1000_pairs — rate shown, no fabricated total.
      return {
        ...base,
        status: "priced",
        unitCents: item.amountCents,
        totalCents: null,
        unitBasis: item.unitBasis,
        sourceLabel: item.label,
        note: "Rate shown — total depends on sides/boxes",
      };
    }
    default:
      return { ...base, note: "No price on file for this press" };
  }
}

export type PackageSelection = { componentKey: PackageComponentKey; optionId: string };

export function resolvePackageComponentLines(args: {
  selections: PackageSelection[];
  links: ComponentPriceLinkData[];
  serviceItems: ResolvableServiceItem[];
  quantity: number;
}): ComponentCostLine[] {
  const linkByKey = new Map(args.links.map((l) => [`${l.componentKey}:${l.optionId}`, l] as const));
  const serviceItemsById = new Map(args.serviceItems.map((s) => [s.id, s] as const));
  return args.selections
    .filter((s) => isValidPackageOption(s.componentKey, s.optionId))
    .map((s) =>
      resolveComponentCostLine({
        componentKey: s.componentKey,
        optionId: s.optionId,
        link: linkByKey.get(`${s.componentKey}:${s.optionId}`) ?? null,
        serviceItemsById,
        quantity: args.quantity,
      }),
    );
}
