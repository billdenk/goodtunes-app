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

/** The seeded quantity ladder backing a row under a size, or null. Vinyl
 * rows are strictly per-size; flat rows mirror priceForSize's "any size's
 * value shows everywhere" semantics. Display + counting only — the flat
 * cell stays the editable surface and overrides the ladder when typed. */
export function ladderForSize(
  r: PricingRow,
  s: VinylSizeId,
): { qty: number; unitCents: number }[] | null {
  const clean = (l?: { qty: number; unitCents: number }[]) =>
    l && l.length ? [...l].sort((a, b) => a.qty - b.qty) : null;
  if (r.kind === "type" || r.kind === "color") return clean(r.rungsBySize?.[s]);
  const direct = clean(r.rungsBySize?.[s]);
  if (direct) return direct;
  for (const l of Object.values(r.rungsBySize ?? {})) {
    const got = clean(l);
    if (got) return got;
  }
  return null;
}

/** Priced = a typed flat cell OR a backing quantity ladder. Drives the
 * "N of M priced" counter so ladder-priced rows stop reading as gaps. */
export function rowPricedForSize(r: PricingRow, s: VinylSizeId): boolean {
  return priceForSize(r, s) != null || ladderForSize(r, s) != null;
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

export function pricedCountForSize(rows: PricingRow[], size: VinylSizeId): number {
  return visibleRowsForSize(rows, size).filter((r) => rowPricedForSize(r, size)).length;
}

/** Default chip: the first size that has any rows, so a 12"-only press opens
 * on 12″ instead of an empty 7″ view. */
export function defaultSizeChip(rows: PricingRow[]): VinylSizeId {
  const chip = SIZE_CHIPS.find((c) => rows.some((r) => rowInSize(r, c.id)));
  return chip?.id ?? '12"';
}
