// Pure view helpers for the per-size component Pricing page. Extracted so
// size filtering, grouping, and the priced counter are unit-testable without
// rendering the component.
import type { PricingRow, VinylSizeId } from "@shared/pressComponents";

// Largest-first, no marketing words — size-pill canon (Aug 2026).
export const SIZE_CHIPS: { id: VinylSizeId; size: string; note: string }[] = [
  { id: '12"', size: "12″", note: "" },
  { id: '10"', size: "10″", note: "" },
  { id: '7"', size: "7″", note: "" },
];

/** A row shows under a size when its type/color is pressed in that size;
 * rows with no size scoping (orphans, labels/stickers) show everywhere. */
export function rowInSize(r: PricingRow, s: VinylSizeId): boolean {
  return !r.sizes?.length || r.sizes.includes(s);
}

export function priceForSize(r: PricingRow, s: VinylSizeId): number | null {
  // Vinyl rows are strictly per-size. Flat rows (labels, jackets, sleeves,
  // inserts, stickers, services) carry ONE price regardless of the selected
  // size chip: any per-size cell (or the legacy flat priceCents) shows —
  // and counts as priced — under every size.
  if (r.kind === "type" || r.kind === "color") return r.pricesBySize?.[s] ?? null;
  const direct = r.pricesBySize?.[s];
  if (direct != null) return direct;
  for (const v of Object.values(r.pricesBySize ?? {})) {
    if (v != null) return v;
  }
  return r.priceCents ?? null;
}

export type PricingGroups = {
  out: { type: PricingRow; colors: PricingRow[] }[];
  orphans: PricingRow[];
};

/** Group VISIBLE rows: each type row heads a card; its color rows nest under
 * it — filtered to the selected size (e.g. Splatter under 10″/12″ only). */
export function groupPricingRows(rows: PricingRow[], size: VinylSizeId): PricingGroups {
  const out: { type: PricingRow; colors: PricingRow[] }[] = [];
  const orphans: PricingRow[] = [];
  let current: { type: PricingRow; colors: PricingRow[] } | null = null;
  for (const r of rows) {
    if (r.kind === "type") {
      current = rowInSize(r, size) ? { type: r, colors: [] } : null;
      if (current) out.push(current);
    } else if (r.kind === "color" && current && r.key.startsWith(`color:${current.type.key.slice(5)}:`)) {
      if (rowInSize(r, size)) current.colors.push(r);
    } else if (r.kind !== "color" || rowInSize(r, size)) {
      orphans.push(r);
    }
  }
  return { out, orphans };
}

export function visibleRowsForSize(rows: PricingRow[], size: VinylSizeId): PricingRow[] {
  return rows.filter((r) => rowInSize(r, size));
}

// ── Imported ladders + style inheritance (Task #3325) ────────────────────
// Reference display rung: the 1,000-unit break (the builders' anchor qty).
const REF_QTY = 1000;

/** The imported-ladder price for a size at the reference qty (cents). */
export function ladderCentsForSize(r: PricingRow, s: VinylSizeId): number | null {
  const ladder = r.rungsBySize?.[s];
  if (!Array.isArray(ladder) || ladder.length === 0) return null;
  const sorted = [...ladder].sort((a, b) => a.qty - b.qty);
  for (const rung of sorted) {
    if (REF_QTY <= rung.qty) return rung.unitCents;
  }
  return sorted[sorted.length - 1]?.unitCents ?? null;
}

/** A style (type) row's effective cents for the size: operator cell wins,
 * else the imported ladder's reference rung. Surcharge rows (Splatter)
 * return the ADDER, not a standalone price. */
export function effectiveTypeCentsForSize(r: PricingRow, s: VinylSizeId): number | null {
  const op = r.pricesBySize?.[s];
  if (op != null) return op;
  return ladderCentsForSize(r, s);
}

/** What a color row effectively costs: its own operator override, else its
 * parent style's price (surcharge styles add their adder on top of the base
 * style referenced by surchargeOver). Returns cents + whether it's inherited. */
export function colorEffectiveCents(
  color: PricingRow,
  rows: PricingRow[],
  s: VinylSizeId,
): { cents: number | null; inherited: boolean } {
  const own = color.pricesBySize?.[s];
  if (own != null) return { cents: own, inherited: false };
  const catId = color.key.startsWith("color:") ? color.key.split(":")[1] : null;
  const type = catId ? rows.find((r) => r.key === `type:${catId}`) : undefined;
  if (!type) return { cents: null, inherited: false };
  if (type.surchargeOver) {
    const base = rows.find((r) => r.key === type.surchargeOver);
    const baseCents = base ? effectiveTypeCentsForSize(base, s) : null;
    const adder = effectiveTypeCentsForSize(type, s);
    if (baseCents == null || adder == null) return { cents: null, inherited: false };
    return { cents: baseCents + adder, inherited: true };
  }
  const cents = effectiveTypeCentsForSize(type, s);
  return { cents, inherited: cents != null };
}

/** Style-first priced counter (Task #3325): color rows inherit their style's
 * price, so the counter counts STYLES (type rows) and flat/orphan rows — a
 * style counts as priced from an operator cell OR an imported ladder. */
export function pricedCountForSize(rows: PricingRow[], size: VinylSizeId): number {
  return styleRowsForSize(rows, size).filter((r) => {
    if (r.kind === "type") return effectiveTypeCentsForSize(r, size) != null;
    return priceForSize(r, size) != null || ladderCentsForSize(r, size) != null;
  }).length;
}

/** The counter's denominator: every visible row EXCEPT color rows (colors
 * inherit; they're never individually counted). */
export function styleRowsForSize(rows: PricingRow[], size: VinylSizeId): PricingRow[] {
  return visibleRowsForSize(rows, size).filter((r) => r.kind !== "color");
}

/** Default chip: the first size that has any rows, so a 12"-only press opens
 * on 12″ instead of an empty 7″ view. */
export function defaultSizeChip(rows: PricingRow[]): VinylSizeId {
  const chip = SIZE_CHIPS.find((c) => rows.some((r) => rowInSize(r, c.id)));
  return chip?.id ?? '12"';
}
