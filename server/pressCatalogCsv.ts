// Task #2116 — Catalog CSV: Upload & Export.
//
// Serializes a press's full catalog (color groups + swatches, per-product
// per-quantity pricing with offered flags, and per-product Specs template
// URLs) to a single flat CSV, and reads an edited CSV back: parse →
// validate every row → diff against the live catalog (added / updated /
// removed) → apply transactionally through the same write semantics the
// catalog UI uses (so back-compat + the default-jacket ladder stay
// intact). The CSV uses a `record_type` discriminator column so all four
// catalog concepts ride in one spreadsheet:
//
//   record_type   uses columns
//   ───────────   ─────────────────────────────────────────────────────
//   color_group   format, color_group
//   swatch        format, color_group, name, hex, photo_url
//   price         format, color_group, quantity, unit_price, offered
//   spec          format, component, variant, disc_count, template_url,
//                 artboard_w_in, artboard_h_in, pages, color_mode,
//                 fonts_rule
//
// Round-trips cleanly: exporting and re-uploading unchanged yields no
// changes. Removal detection is SCOPED to what the file references — a
// CSV that only carries `spec` rows never touches colors or pricing — so
// a partial upload can't silently wipe data it didn't address. The
// preview the operator confirms always names exactly what will be removed.

import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "./db";
import {
  pressColorTiers,
  pressColors,
  pressJackets,
  pressTierJacketLadders,
  pressTemplateSpecs,
  ALBUM_FORMATS,
  type AlbumFormat,
} from "@shared/schema";
import { getPressCatalog } from "./pressCatalog";

// ─── CSV primitives ──────────────────────────────────────────────────

export const CATALOG_CSV_COLUMNS = [
  "record_type",
  "format",
  "color_group",
  "name",
  "hex",
  "photo_url",
  "quantity",
  "unit_price",
  "offered",
  "component",
  "variant",
  "disc_count",
  "template_url",
  "artboard_w_in",
  "artboard_h_in",
  "pages",
  "color_mode",
  "fonts_rule",
] as const;
type CsvCol = (typeof CATALOG_CSV_COLUMNS)[number];

function csvCell(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  // Quote when the cell carries a comma, quote, CR, or LF; escape inner
  // quotes by doubling them (RFC 4180).
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function csvRow(cells: (string | number | null | undefined)[]): string {
  return cells.map(csvCell).join(",");
}

// Parse a full CSV document into rows of cells, honoring quoted fields
// that contain commas / newlines / doubled quotes. Tolerates both CRLF
// and LF line endings and a trailing newline.
function parseCsvDocument(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  // Strip a leading UTF-8 BOM (Excel adds one on export).
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += c;
      }
      continue;
    }
    if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (c === "\r") {
      // swallow — the following \n closes the row
    } else {
      cell += c;
    }
  }
  // Flush the final cell/row if the file didn't end with a newline.
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

function centsToDollars(cents: number): string {
  return (cents / 100).toFixed(2);
}

// "$1,234.50" / "1234.5" / "" → cents | null (blank = TBD) | "error".
function parseDollarsToCents(raw: string): number | null | "error" {
  const s = raw.trim();
  if (s === "") return null;
  const cleaned = s.replace(/[$,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return "error";
  return Math.round(parseFloat(cleaned) * 100);
}

// Strict: a blank cell falls back to the default, recognized tokens map to
// true/false, and any other non-blank value is "invalid" so the caller can
// surface a loud row error instead of silently coercing a typo to a boolean.
function parseBool(raw: string, dflt: boolean): boolean | "invalid" {
  const s = raw.trim().toLowerCase();
  if (s === "") return dflt;
  if (["true", "t", "yes", "y", "1", "offered"].includes(s)) return true;
  if (["false", "f", "no", "n", "0"].includes(s)) return false;
  return "invalid";
}

// ─── Export ──────────────────────────────────────────────────────────

const SPEC_COMPONENTS = ["jacket", "labels", "inner_sleeve"] as const;
const SPEC_COLOR_MODES = ["process-4c", "cmyk-or-pms"] as const;

export async function serializeCatalogCsv(pressId: string): Promise<string> {
  const catalog = await getPressCatalog(pressId);
  const specs = await db
    .select()
    .from(pressTemplateSpecs)
    .where(eq(pressTemplateSpecs.pressId, pressId))
    .orderBy(
      asc(pressTemplateSpecs.format),
      asc(pressTemplateSpecs.componentKey),
      asc(pressTemplateSpecs.variantKey),
      asc(pressTemplateSpecs.discCount),
    );

  const lines: string[] = [csvRow([...CATALOG_CSV_COLUMNS])];
  const blanks: Partial<Record<CsvCol, string | number>> = {};
  const emit = (vals: Partial<Record<CsvCol, string | number | null | undefined>>) => {
    lines.push(csvRow(CATALOG_CSV_COLUMNS.map((c) => vals[c] ?? blanks[c] ?? "")));
  };

  for (const fmt of catalog.formats) {
    for (const tier of fmt.tiers) {
      emit({ record_type: "color_group", format: fmt.format, color_group: tier.name });
      for (const color of tier.colors) {
        emit({
          record_type: "swatch",
          format: fmt.format,
          color_group: tier.name,
          name: color.name,
          hex: color.swatchHex ?? "",
          photo_url: color.swatchImageUrl ?? "",
        });
      }
      const ladder = [...(tier.priceLadder ?? [])].sort((a, b) => a.qty - b.qty);
      for (const rung of ladder) {
        const confirmed = (rung as { confirmed?: boolean }).confirmed !== false;
        emit({
          record_type: "price",
          format: fmt.format,
          color_group: tier.name,
          quantity: rung.qty,
          // Unconfirmed rungs are TBD placeholders — export a blank price
          // so a round-trip preserves "offered but not yet priced".
          unit_price: confirmed ? centsToDollars(rung.unitCents) : "",
          offered: "TRUE",
        });
      }
    }
  }

  for (const spec of specs) {
    emit({
      record_type: "spec",
      format: spec.format,
      component: spec.componentKey,
      variant: spec.variantKey ?? "",
      disc_count: spec.discCount ?? 0,
      template_url: spec.templateFileUrl ?? "",
      artboard_w_in: spec.artboardWInches ?? "",
      artboard_h_in: spec.artboardHInches ?? "",
      pages: spec.expectedPages ?? "",
      color_mode: spec.color ?? "",
      fonts_rule: spec.fontsRule ?? "",
    });
  }

  return lines.join("\r\n") + "\r\n";
}

// ─── Parse + validate ────────────────────────────────────────────────

export type ParsedColorGroup = { format: AlbumFormat; group: string; rowNum: number };
export type ParsedSwatch = {
  format: AlbumFormat;
  group: string;
  name: string;
  hex: string | null;
  photoUrl: string | null;
  rowNum: number;
};
export type ParsedPrice = {
  format: AlbumFormat;
  group: string;
  qty: number;
  unitCents: number | null; // null = TBD (offered but not yet priced)
  offered: boolean;
  rowNum: number;
};
export type ParsedSpec = {
  format: AlbumFormat;
  componentKey: string;
  variantKey: string;
  discCount: number;
  templateUrl: string | null;
  artboardW: number | null;
  artboardH: number | null;
  pages: number | null;
  colorMode: string | null;
  fontsRule: string | null;
  rowNum: number;
};
export type RowError = { rowNum: number; message: string };

export type ParsedCatalogCsv = {
  colorGroups: ParsedColorGroup[];
  swatches: ParsedSwatch[];
  prices: ParsedPrice[];
  specs: ParsedSpec[];
  errors: RowError[];
};

const HEX_RE = /^#[0-9a-fA-F]{6}$/;
const PHOTO_URL_RE = /^(https?:\/\/\S+|\/objects\/uploads\/[A-Za-z0-9._-]+)$/i;
const TEMPLATE_URL_RE = /^(https?:\/\/|\/)/i;

export function parseCatalogCsv(text: string): ParsedCatalogCsv {
  const out: ParsedCatalogCsv = {
    colorGroups: [],
    swatches: [],
    prices: [],
    specs: [],
    errors: [],
  };
  const grid = parseCsvDocument(text);
  if (grid.length === 0) {
    out.errors.push({ rowNum: 0, message: "The file is empty." });
    return out;
  }
  const header = grid[0].map((h) => h.trim().toLowerCase());
  const colIdx = (name: CsvCol): number => header.indexOf(name);
  if (colIdx("record_type") === -1) {
    out.errors.push({
      rowNum: 1,
      message: "Missing required header column 'record_type'. Export a fresh CSV to see the expected format.",
    });
    return out;
  }
  const get = (cells: string[], name: CsvCol): string => {
    const i = colIdx(name);
    return i === -1 ? "" : (cells[i] ?? "").trim();
  };

  for (let r = 1; r < grid.length; r++) {
    const cells = grid[r];
    const rowNum = r + 1; // 1-based, including the header row, for humans
    // Skip fully-blank lines (trailing newlines, spacer rows).
    if (cells.every((c) => c.trim() === "")) continue;
    const recordType = get(cells, "record_type").toLowerCase();
    const fmtRaw = get(cells, "format");
    const err = (message: string) => out.errors.push({ rowNum, message });

    if (!["color_group", "swatch", "price", "spec"].includes(recordType)) {
      err(`Unknown record_type "${recordType}". Expected color_group, swatch, price, or spec.`);
      continue;
    }
    if (!ALBUM_FORMATS.includes(fmtRaw as AlbumFormat)) {
      err(`Unknown format "${fmtRaw}". Expected one of: ${ALBUM_FORMATS.join(", ")}.`);
      continue;
    }
    const format = fmtRaw as AlbumFormat;

    if (recordType === "color_group") {
      const group = get(cells, "color_group");
      if (!group) {
        err("color_group rows need a color_group name.");
        continue;
      }
      out.colorGroups.push({ format, group, rowNum });
      continue;
    }

    if (recordType === "swatch") {
      const group = get(cells, "color_group");
      const name = get(cells, "name");
      const hex = get(cells, "hex");
      const photoUrl = get(cells, "photo_url");
      if (!group) err("swatch rows need a color_group name.");
      if (!name) err("swatch rows need a name.");
      if (hex && !HEX_RE.test(hex)) err(`"${hex}" isn't a valid 6-digit hex color (e.g. #112233).`);
      if (photoUrl && !PHOTO_URL_RE.test(photoUrl))
        err(`"${photoUrl}" isn't a valid photo URL (http(s):// or /objects/uploads/<id>).`);
      if (!group || !name || (hex && !HEX_RE.test(hex)) || (photoUrl && !PHOTO_URL_RE.test(photoUrl)))
        continue;
      out.swatches.push({
        format,
        group,
        name,
        hex: hex || null,
        photoUrl: photoUrl || null,
        rowNum,
      });
      continue;
    }

    if (recordType === "price") {
      const group = get(cells, "color_group");
      const qtyRaw = get(cells, "quantity");
      const priceRaw = get(cells, "unit_price");
      const offeredRaw = get(cells, "offered");
      const offered = parseBool(offeredRaw, true);
      if (!group) err("price rows need a color_group name.");
      const qty = Number(qtyRaw);
      if (!qtyRaw || !Number.isInteger(qty) || qty < 1)
        err(`"${qtyRaw}" isn't a valid quantity (a whole number ≥ 1).`);
      const cents = parseDollarsToCents(priceRaw);
      if (cents === "error") err(`"${priceRaw}" isn't a valid dollar amount (e.g. 12.50 or leave blank for TBD).`);
      if (offered === "invalid")
        err(`"${offeredRaw}" isn't a valid offered value (TRUE or FALSE; leave blank for TRUE).`);
      if (
        !group ||
        !qtyRaw ||
        !Number.isInteger(qty) ||
        qty < 1 ||
        cents === "error" ||
        offered === "invalid"
      )
        continue;
      out.prices.push({ format, group, qty, unitCents: cents, offered, rowNum });
      continue;
    }

    // recordType === "spec"
    const componentKey = get(cells, "component").toLowerCase();
    const variantKey = get(cells, "variant");
    const discRaw = get(cells, "disc_count");
    const templateUrl = get(cells, "template_url");
    const wRaw = get(cells, "artboard_w_in");
    const hRaw = get(cells, "artboard_h_in");
    const pagesRaw = get(cells, "pages");
    const colorMode = get(cells, "color_mode").toLowerCase();
    const fontsRule = get(cells, "fonts_rule");
    let bad = false;
    if (!SPEC_COMPONENTS.includes(componentKey as (typeof SPEC_COMPONENTS)[number])) {
      err(`Unknown component "${componentKey}". Expected: ${SPEC_COMPONENTS.join(", ")}.`);
      bad = true;
    }
    const discCount = discRaw ? Number(discRaw) : 0;
    if (discRaw && (!Number.isInteger(discCount) || discCount < 0 || discCount > 12)) {
      err(`"${discRaw}" isn't a valid disc_count (a whole number 0–12).`);
      bad = true;
    }
    if (templateUrl && !TEMPLATE_URL_RE.test(templateUrl)) {
      err(`"${templateUrl}" isn't a valid template_url (an absolute URL or an /objects path).`);
      bad = true;
    }
    const parseDim = (raw: string, label: string): number | null => {
      if (!raw) return null;
      const n = Number(raw);
      if (!Number.isFinite(n) || n <= 0 || n > 120) {
        err(`"${raw}" isn't a valid ${label} (inches, 0–120).`);
        bad = true;
        return null;
      }
      return n;
    };
    const artboardW = parseDim(wRaw, "artboard_w_in");
    const artboardH = parseDim(hRaw, "artboard_h_in");
    let pages: number | null = null;
    if (pagesRaw) {
      pages = Number(pagesRaw);
      if (!Number.isInteger(pages) || pages < 1 || pages > 64) {
        err(`"${pagesRaw}" isn't a valid pages count (a whole number 1–64).`);
        bad = true;
      }
    }
    if (colorMode && !SPEC_COLOR_MODES.includes(colorMode as (typeof SPEC_COLOR_MODES)[number])) {
      err(`Unknown color_mode "${colorMode}". Expected: ${SPEC_COLOR_MODES.join(", ")}.`);
      bad = true;
    }
    if (bad) continue;
    out.specs.push({
      format,
      componentKey,
      // Labels / inner sleeves are always variant-less so the unique key
      // matches the resolver lookup (mirrors the template-specs route).
      variantKey: componentKey === "jacket" ? variantKey : "",
      discCount,
      templateUrl: templateUrl || null,
      artboardW,
      artboardH,
      pages,
      colorMode: colorMode || null,
      fontsRule: fontsRule || null,
      rowNum,
    });
  }

  return out;
}

// ─── Diff (preview) ──────────────────────────────────────────────────

export type CatalogCsvPlan = {
  errors: RowError[];
  colorGroups: { added: string[]; removed: string[] };
  swatches: {
    added: { group: string; name: string }[];
    updated: { group: string; name: string }[];
    removed: { group: string; name: string }[];
  };
  prices: {
    added: { group: string; qty: number }[];
    updated: { group: string; qty: number }[];
    removed: { group: string; qty: number }[];
  };
  specs: {
    added: { key: string }[];
    updated: { key: string }[];
    removed: { key: string }[];
  };
  hasChanges: boolean;
};

const norm = (s: string) => s.trim().toLowerCase();
const groupKey = (format: string, group: string) => `${format}::${norm(group)}`;
const specKey = (s: { format: string; componentKey: string; variantKey: string; discCount: number }) =>
  `${s.format}/${s.componentKey}/${s.variantKey}/${s.discCount}`;

export async function buildCatalogCsvPlan(
  pressId: string,
  parsed: ParsedCatalogCsv,
): Promise<CatalogCsvPlan> {
  const catalog = await getPressCatalog(pressId);
  const currentSpecs = await db
    .select()
    .from(pressTemplateSpecs)
    .where(eq(pressTemplateSpecs.pressId, pressId));

  const plan: CatalogCsvPlan = {
    errors: parsed.errors,
    colorGroups: { added: [], removed: [] },
    swatches: { added: [], updated: [], removed: [] },
    prices: { added: [], updated: [], removed: [] },
    specs: { added: [], updated: [], removed: [] },
    hasChanges: false,
  };

  // (format, group) that the file declares (group row OR swatch OR price).
  const fileGroups = new Map<string, { format: AlbumFormat; group: string }>();
  for (const x of [...parsed.colorGroups, ...parsed.swatches, ...parsed.prices])
    fileGroups.set(groupKey(x.format, x.group), { format: x.format, group: x.group });
  // Groups whose swatches/prices the file is authoritative over.
  const swatchScope = new Set<string>();
  for (const x of [...parsed.colorGroups, ...parsed.swatches]) swatchScope.add(groupKey(x.format, x.group));
  const priceScope = new Set<string>();
  for (const x of parsed.prices) priceScope.add(groupKey(x.format, x.group));

  // ── Color groups (tiers) ──
  // The CSV is a patch, not a full snapshot: a color group absent from the file
  // is left untouched (never deleted), so a partial upload that lists only one
  // group can't wipe its sibling groups. Swatch/price removals below stay scoped
  // to the groups the file explicitly addresses; deleting a whole color group is
  // an editor-only action.
  const currentTierByKey = new Map<string, { id: string; format: string; name: string }>();
  for (const f of catalog.formats)
    for (const t of f.tiers) currentTierByKey.set(groupKey(f.format, t.name), { id: t.id, format: f.format, name: t.name });
  for (const [k, g] of fileGroups) {
    if (!currentTierByKey.has(k)) plan.colorGroups.added.push(`${g.format} · ${g.group}`);
  }

  // ── Swatches ──
  const currentColorsByGroup = new Map<string, Map<string, { hex: string | null; photo: string | null }>>();
  for (const f of catalog.formats)
    for (const t of f.tiers) {
      const m = new Map<string, { hex: string | null; photo: string | null }>();
      for (const c of t.colors) m.set(norm(c.name), { hex: c.swatchHex, photo: c.swatchImageUrl });
      currentColorsByGroup.set(groupKey(f.format, t.name), m);
    }
  const fileSwatchesByGroup = new Map<string, Set<string>>();
  for (const s of parsed.swatches) {
    const gk = groupKey(s.format, s.group);
    const cur = currentColorsByGroup.get(gk)?.get(norm(s.name));
    if (!fileSwatchesByGroup.has(gk)) fileSwatchesByGroup.set(gk, new Set());
    fileSwatchesByGroup.get(gk)!.add(norm(s.name));
    if (!cur) plan.swatches.added.push({ group: `${s.format} · ${s.group}`, name: s.name });
    else if ((cur.hex ?? null) !== s.hex || (cur.photo ?? null) !== s.photoUrl)
      plan.swatches.updated.push({ group: `${s.format} · ${s.group}`, name: s.name });
  }
  for (const [gk, m] of currentColorsByGroup) {
    if (!swatchScope.has(gk)) continue;
    const fileSet = fileSwatchesByGroup.get(gk) ?? new Set<string>();
    const meta = fileGroups.get(gk);
    for (const [cname] of m) {
      if (!fileSet.has(cname))
        plan.swatches.removed.push({
          group: meta ? `${meta.format} · ${meta.group}` : gk,
          name: cname,
        });
    }
  }

  // ── Prices ──
  const currentLadderByGroup = new Map<string, Map<number, { unitCents: number; confirmed: boolean }>>();
  for (const f of catalog.formats)
    for (const t of f.tiers) {
      const m = new Map<number, { unitCents: number; confirmed: boolean }>();
      for (const rung of t.priceLadder ?? [])
        m.set(rung.qty, {
          unitCents: rung.unitCents,
          confirmed: (rung as { confirmed?: boolean }).confirmed !== false,
        });
      currentLadderByGroup.set(groupKey(f.format, t.name), m);
    }
  const fileRungsByGroup = new Map<string, Map<number, { unitCents: number | null; offered: boolean }>>();
  for (const p of parsed.prices) {
    const gk = groupKey(p.format, p.group);
    if (!fileRungsByGroup.has(gk)) fileRungsByGroup.set(gk, new Map());
    fileRungsByGroup.get(gk)!.set(p.qty, { unitCents: p.unitCents, offered: p.offered });
  }
  for (const [gk, rungs] of fileRungsByGroup) {
    const cur = currentLadderByGroup.get(gk) ?? new Map();
    const meta = fileGroups.get(gk);
    const label = meta ? `${meta.format} · ${meta.group}` : gk;
    for (const [qty, row] of rungs) {
      if (!row.offered) {
        if (cur.has(qty)) plan.prices.removed.push({ group: label, qty });
        continue;
      }
      const curRung = cur.get(qty);
      const wantConfirmed = row.unitCents !== null;
      const wantCents = row.unitCents ?? 0;
      if (!curRung) plan.prices.added.push({ group: label, qty });
      else if (curRung.confirmed !== wantConfirmed || (wantConfirmed && curRung.unitCents !== wantCents))
        plan.prices.updated.push({ group: label, qty });
    }
    // Rungs present in the DB but dropped from this group's price rows.
    for (const [qty] of cur) {
      if (!rungs.has(qty)) plan.prices.removed.push({ group: label, qty });
    }
  }

  // ── Specs ──
  // Upsert-only: specs are keyed by (format, component, variant, disc) with no
  // finer scope to anchor a safe deletion against, so a spec missing from the
  // file is treated as untouched (never deleted). Deleting a spec is an
  // editor-only action.
  const currentSpecByKey = new Map<string, (typeof currentSpecs)[number]>();
  for (const s of currentSpecs) currentSpecByKey.set(specKey(s), s);
  for (const s of parsed.specs) {
    const k = specKey(s);
    const cur = currentSpecByKey.get(k);
    if (!cur) plan.specs.added.push({ key: k });
    else if (
      (cur.templateFileUrl ?? null) !== s.templateUrl ||
      (cur.artboardWInches ?? null) !== s.artboardW ||
      (cur.artboardHInches ?? null) !== s.artboardH ||
      (cur.expectedPages ?? null) !== s.pages ||
      (cur.color ?? null) !== s.colorMode ||
      (cur.fontsRule ?? null) !== s.fontsRule
    )
      plan.specs.updated.push({ key: k });
  }

  plan.hasChanges =
    plan.colorGroups.added.length > 0 ||
    plan.colorGroups.removed.length > 0 ||
    plan.swatches.added.length > 0 ||
    plan.swatches.updated.length > 0 ||
    plan.swatches.removed.length > 0 ||
    plan.prices.added.length > 0 ||
    plan.prices.updated.length > 0 ||
    plan.prices.removed.length > 0 ||
    plan.specs.added.length > 0 ||
    plan.specs.updated.length > 0 ||
    plan.specs.removed.length > 0;

  return plan;
}

// ─── Apply (transactional) ───────────────────────────────────────────

export type ApplyResult = {
  tiersCreated: number;
  tiersRemoved: number;
  swatchesCreated: number;
  swatchesUpdated: number;
  swatchesRemoved: number;
  laddersWritten: number;
  specsUpserted: number;
  specsRemoved: number;
};

export async function applyCatalogCsv(
  pressId: string,
  parsed: ParsedCatalogCsv,
  userId: string | null,
): Promise<ApplyResult> {
  const result: ApplyResult = {
    tiersCreated: 0,
    tiersRemoved: 0,
    swatchesCreated: 0,
    swatchesUpdated: 0,
    swatchesRemoved: 0,
    laddersWritten: 0,
    specsUpserted: 0,
    specsRemoved: 0,
  };

  const fileGroups = new Map<string, { format: AlbumFormat; group: string }>();
  for (const x of [...parsed.colorGroups, ...parsed.swatches, ...parsed.prices])
    fileGroups.set(groupKey(x.format, x.group), { format: x.format, group: x.group });
  const swatchScope = new Set<string>();
  for (const x of [...parsed.colorGroups, ...parsed.swatches]) swatchScope.add(groupKey(x.format, x.group));
  const priceScope = new Set<string>();
  for (const x of parsed.prices) priceScope.add(groupKey(x.format, x.group));

  await db.transaction(async (tx) => {
    // Re-read live state INSIDE the transaction so the diff we apply
    // reflects the catalog as it is at write time.
    // Task #2998 — archived (soft-retired) tiers/colors are historical only:
    // the CSV never updates, deletes, or matches against them, so a
    // same-named import creates a fresh active row instead.
    const tiers = await tx.select().from(pressColorTiers).where(and(eq(pressColorTiers.pressId, pressId), sql`${pressColorTiers.archivedAt} IS NULL`));
    const jackets = await tx.select().from(pressJackets).where(eq(pressJackets.pressId, pressId));
    const tierIds = tiers.map((t) => t.id);
    const colors = tierIds.length
      ? await tx.select().from(pressColors).where(and(inArray(pressColors.tierId, tierIds), sql`${pressColors.archivedAt} IS NULL`))
      : [];

    // (format, group) → tier row. Mutable as we create new tiers.
    const tierByKey = new Map<string, { id: string; format: string; name: string }>();
    for (const t of tiers) tierByKey.set(groupKey(t.format, t.name), { id: t.id, format: t.format, name: t.name });
    const tierCountByFormat = new Map<string, number>();
    for (const t of tiers) tierCountByFormat.set(t.format, (tierCountByFormat.get(t.format) ?? 0) + 1);

    // 1. Create any tier the file references that doesn't exist yet.
    for (const [k, g] of fileGroups) {
      if (tierByKey.has(k)) continue;
      const position = tierCountByFormat.get(g.format) ?? 0;
      tierCountByFormat.set(g.format, position + 1);
      const [row] = await tx
        .insert(pressColorTiers)
        .values({ pressId, format: g.format, name: g.group, position, priceLadder: [] })
        .returning();
      tierByKey.set(k, { id: row.id, format: g.format, name: g.group });
      result.tiersCreated++;
    }

    // 2. The CSV is a patch, not a full snapshot: a color group absent from the
    //    file is left as-is (its colors + ladders too), so a partial upload that
    //    lists only one group can't wipe its sibling groups. Whole-group deletion
    //    is an editor-only action. (result.tiersRemoved stays 0.)
    const removed = new Set<string>();

    // 3. Swatches — create / update / delete per group in swatch scope.
    const colorsByTier = new Map<string, { id: string; name: string; hex: string | null; photo: string | null; position: number }[]>();
    for (const c of colors) {
      if (removed.has(c.tierId)) continue;
      const arr = colorsByTier.get(c.tierId) ?? [];
      arr.push({ id: c.id, name: c.name, hex: c.swatchHex, photo: c.swatchImageUrl, position: c.position });
      colorsByTier.set(c.tierId, arr);
    }
    const fileSwatchesByGroup = new Map<string, ParsedSwatch[]>();
    for (const s of parsed.swatches) {
      const gk = groupKey(s.format, s.group);
      if (!fileSwatchesByGroup.has(gk)) fileSwatchesByGroup.set(gk, []);
      fileSwatchesByGroup.get(gk)!.push(s);
    }
    for (const gk of swatchScope) {
      const tier = tierByKey.get(gk);
      if (!tier) continue;
      const existing = colorsByTier.get(tier.id) ?? [];
      const existingByName = new Map(existing.map((c) => [norm(c.name), c]));
      const wanted = fileSwatchesByGroup.get(gk) ?? [];
      const wantedNames = new Set(wanted.map((s) => norm(s.name)));
      let nextPos = existing.length;
      for (const s of wanted) {
        const cur = existingByName.get(norm(s.name));
        if (!cur) {
          await tx
            .insert(pressColors)
            .values({ tierId: tier.id, name: s.name, swatchHex: s.hex, swatchImageUrl: s.photoUrl, position: nextPos++ })
            .returning();
          result.swatchesCreated++;
        } else if ((cur.hex ?? null) !== s.hex || (cur.photo ?? null) !== s.photoUrl) {
          await tx
            .update(pressColors)
            .set({ swatchHex: s.hex, swatchImageUrl: s.photoUrl })
            .where(eq(pressColors.id, cur.id));
          result.swatchesUpdated++;
        }
      }
      // Delete colors absent from the file for this group.
      const dropIds = existing.filter((c) => !wantedNames.has(norm(c.name))).map((c) => c.id);
      if (dropIds.length) {
        await tx.delete(pressColors).where(inArray(pressColors.id, dropIds));
        result.swatchesRemoved += dropIds.length;
      }
    }

    // 4. Prices — rewrite the format's default-jacket ladder per group in
    //    price scope. Preserve any rung metadata on rungs we don't touch
    //    by starting from the existing ladder.
    const ladders = tierIds.length
      ? await tx.select().from(pressTierJacketLadders).where(inArray(pressTierJacketLadders.tierId, tierIds))
      : [];
    const ladderByTierJacket = new Map<string, { qty: number; unitCents: number; confirmed?: boolean }[]>();
    for (const l of ladders)
      ladderByTierJacket.set(`${l.tierId}::${l.jacketId}`, (l.priceLadder ?? []) as any);

    // Resolve / create the default jacket for a format (mirrors
    // getFormatDefaultJacketId + saveLadder's "Standard" fallback).
    const jacketsMut = [...jackets];
    const defaultJacketFor = async (format: string): Promise<string> => {
      const applicable = jacketsMut.filter(
        (j) => !j.applicableFormats || (j.applicableFormats as string[]).includes(format),
      );
      const found = (applicable.find((j) => j.isDefault) ?? applicable[0])?.id;
      if (found) return found;
      const [row] = await tx
        .insert(pressJackets)
        .values({ pressId, name: "Standard", position: jacketsMut.length, isDefault: jacketsMut.length === 0 })
        .returning();
      jacketsMut.push(row);
      return row.id;
    };

    const fileRungsByGroup = new Map<string, ParsedPrice[]>();
    for (const p of parsed.prices) {
      const gk = groupKey(p.format, p.group);
      if (!fileRungsByGroup.has(gk)) fileRungsByGroup.set(gk, []);
      fileRungsByGroup.get(gk)!.push(p);
    }
    for (const gk of priceScope) {
      const tier = tierByKey.get(gk);
      if (!tier) continue;
      const jacketId = await defaultJacketFor(tier.format);
      const existing = ladderByTierJacket.get(`${tier.id}::${jacketId}`) ?? [];
      const byQty = new Map<number, { qty: number; unitCents: number; confirmed?: boolean }>();
      for (const rung of existing) byQty.set(rung.qty, { ...rung });
      for (const p of fileRungsByGroup.get(gk) ?? []) {
        if (!p.offered) {
          byQty.delete(p.qty);
          continue;
        }
        if (p.unitCents === null) byQty.set(p.qty, { qty: p.qty, unitCents: 0, confirmed: false });
        else byQty.set(p.qty, { qty: p.qty, unitCents: p.unitCents, confirmed: true });
      }
      // Drop rungs the file omitted for this group (file is authoritative).
      const keepQtys = new Set((fileRungsByGroup.get(gk) ?? []).filter((p) => p.offered).map((p) => p.qty));
      for (const qty of [...byQty.keys()]) if (!keepQtys.has(qty)) byQty.delete(qty);
      const ladder = [...byQty.values()].sort((a, b) => a.qty - b.qty);

      const existingRow = ladders.find((l) => l.tierId === tier.id && l.jacketId === jacketId);
      if (existingRow) {
        await tx
          .update(pressTierJacketLadders)
          .set({ priceLadder: ladder })
          .where(eq(pressTierJacketLadders.id, existingRow.id));
      } else {
        await tx.insert(pressTierJacketLadders).values({ tierId: tier.id, jacketId, priceLadder: ladder });
      }
      result.laddersWritten++;
    }

    // 5. Specs — upsert-only, keyed by (format, component, variant, disc). A
    //    spec missing from the file is treated as untouched (never deleted), so
    //    the file can't silently wipe specs it didn't list. (specsRemoved stays 0.)
    for (const s of parsed.specs) {
      const values = {
        pressId,
        format: s.format,
        componentKey: s.componentKey,
        variantKey: s.variantKey,
        discCount: s.discCount,
        artboardWInches: s.artboardW,
        artboardHInches: s.artboardH,
        expectedPages: s.pages,
        color: s.colorMode,
        fontsRule: s.fontsRule,
        templateFileUrl: s.templateUrl,
        updatedByUserId: userId,
        updatedAt: new Date(),
      };
      await tx
        .insert(pressTemplateSpecs)
        .values(values)
        .onConflictDoUpdate({
          target: [
            pressTemplateSpecs.pressId,
            pressTemplateSpecs.format,
            pressTemplateSpecs.componentKey,
            pressTemplateSpecs.variantKey,
            pressTemplateSpecs.discCount,
          ],
          set: {
            artboardWInches: values.artboardWInches,
            artboardHInches: values.artboardHInches,
            expectedPages: values.expectedPages,
            color: values.color,
            fontsRule: values.fontsRule,
            templateFileUrl: values.templateFileUrl,
            updatedByUserId: userId,
            updatedAt: new Date(),
          },
        });
      result.specsUpserted++;
    }
  });

  return result;
}
