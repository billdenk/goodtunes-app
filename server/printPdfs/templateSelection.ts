// Task #217 — Pick which vendor templates a release needs.
//
// Given the album's `album_skus` rows (snapshotted with vinyl_color,
// jacket_upgrade, format) and a chosen vendor, enumerate the
// templates that must be printed to fulfill every active vinyl SKU:
//   • center label for every vinyl size present
//   • jacket (single / gatefold) per the SKU's jacket_upgrade
//   • insert when jacket_upgrade includes "insert"
// Cassette / CD / digital SKUs are ignored — this generator is
// vinyl-only for v1. Non-vinyl plant docs (cassette duplication etc.)
// land alongside their respective compositors.

import { VENDOR_SPECS, type TemplateSpec, type VendorId } from "@shared/vendorSpecs";

type SkuRow = {
  format: string | null;
  active: boolean | null;
  jacketUpgrade: string | null;
};

function sizeForFormat(format: string | null): '7"' | '10"' | '12"' | null {
  if (format === "7_inch") return '7"';
  if (format === "10_inch") return '10"';
  if (format === "12_lp") return '12"';
  return null;
}

function pickJacketTemplate(vendorId: VendorId, size: '7"' | '10"' | '12"', upgrade: string | null): string | null {
  const isGatefold = upgrade === "gatefold" || upgrade === "gatefold_insert";
  const all = VENDOR_SPECS[vendorId].art.templates;
  const candidates = all.filter((t) => t.size === size);
  if (isGatefold) {
    const gate = candidates.find((t) => /gatefold/i.test(t.id) || /gatefold/i.test(t.label));
    if (gate) return gate.id;
  }
  const jacket = candidates.find((t) => /jacket/i.test(t.id) || /jacket/i.test(t.label));
  return jacket?.id ?? null;
}

function pickCenterLabel(vendorId: VendorId, size: '7"' | '10"' | '12"'): string | null {
  const t = VENDOR_SPECS[vendorId].art.templates.find(
    (x) => x.size === size && /center_?label/i.test(x.id),
  );
  return t?.id ?? null;
}

function pickInsert(vendorId: VendorId, size: '7"' | '10"' | '12"'): string | null {
  const t = VENDOR_SPECS[vendorId].art.templates.find(
    (x) => x.size === size && /insert/i.test(x.id),
  );
  return t?.id ?? null;
}

export function selectRequiredTemplates(
  vendorId: VendorId,
  skus: SkuRow[],
): TemplateSpec[] {
  const wanted = new Set<string>();
  const vinylSkus = skus.filter((s) => s.active !== false && sizeForFormat(s.format) !== null);
  for (const sku of vinylSkus) {
    const size = sizeForFormat(sku.format)!;
    const cl = pickCenterLabel(vendorId, size);
    if (cl) wanted.add(cl);
    const jk = pickJacketTemplate(vendorId, size, sku.jacketUpgrade);
    if (jk) wanted.add(jk);
    if (sku.jacketUpgrade === "insert" || sku.jacketUpgrade === "gatefold_insert") {
      const ins = pickInsert(vendorId, size);
      if (ins) wanted.add(ins);
    }
  }
  // No fallback when an album has no vinyl SKUs — the route returns
  // 400 instead. Generating templates the release won't ship would
  // produce unused files and confuse the plant operator.
  const tpls = VENDOR_SPECS[vendorId].art.templates;
  return tpls.filter((t) => wanted.has(t.id));
}
