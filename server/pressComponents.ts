// Press Components (Ruby handoff, handoff/press-components/, 2026-08-12) —
// press-scoped API for the component setup surfaces: Vinyl color setup,
// Center labels, Stickers, and component-level Pricing. Mounted from
// registerPressPortalRoutes behind requireAdmin + requirePressScope, with
// mutations behind requirePressEditor (matching every other press-portal
// mutation surface).
//
// Binding rules (README):
// - GoodTunes Packages (press_formats / press_color_tiers / press_colors)
//   are UNTOUCHABLE. The Vinyl component is SEEDED from them once on first
//   read, then lives independently in press_components.config; component
//   edits never write back to the packages tables.
// - Pricing rows are seeded from the seeded types/colors with EMPTY price
//   cells (null). Package pricing is untouchable and never read here.
// - Press identity is data: name + logo ride on the payload.
import type { Express, Request, Response } from "express";
import { db } from "./db";
import { eq, and } from "drizzle-orm";
import { pressComponents } from "@shared/schema";
import {
  componentConfigSchemaByKey,
  PRESS_COMPONENT_KEYS,
  type PressComponentKey,
  type VinylComponentConfig,
  type VinylCategory,
  type VinylSwatch,
  type SwatchKind,
  type VinylSizeId,
  type LabelsComponentConfig,
  type JacketsComponentConfig,
  type SleevesComponentConfig,
  type InsertsComponentConfig,
  JACKET_STYLE_IDS,
  SLEEVE_STYLE_IDS,
  INSERT_STYLE_IDS,
  type StickersComponentConfig,
  type PricingComponentConfig,
  type PricingRow,
} from "@shared/pressComponents";
import { getPressCatalog } from "./pressCatalog";
import { storage } from "./storage";

// ── Seed defaults (mirror the handoff mocks' MOCK_ consts) ─────────────
const DEFAULT_WEIGHTS = [
  { id: "140", label: "140g", note: "Standard" },
  { id: "180", label: "180g", note: "Heavyweight" },
];
const DEFAULT_SIZE_OPTIONS = [
  { id: "7", label: '7"', note: "Single" },
  { id: "10", label: '10"', note: "EP" },
  { id: "12", label: '12"', note: "LP · Standard" },
];
const DEFAULT_QUANTITIES = [
  { id: "1", label: "1 LP", note: "Single" },
  { id: "2", label: "2 LP", note: "Double" },
  { id: "3", label: "3 LP", note: "Triple" },
  { id: "4", label: "4 LP", note: "Quad" },
];

const DEFAULT_LABEL_STYLES: LabelsComponentConfig = {
  styles: [
    { id: "blank", name: "Blank", note: "No artwork — plain label stock.", offered: true },
    { id: "bw", name: "Black & White", note: "Single-color black print on white stock.", offered: true },
    { id: "color", name: "Full Color", note: "Artist-supplied full-color design.", offered: true },
  ],
};

// Fixed shape/size vocabulary lives in the screen (mirrors the mock's
// MOCK_STICKER_SHAPES); the config records which size ids are offered.
const DEFAULT_STICKER_SHAPES: StickersComponentConfig = {
  shapes: [
    { id: "rect", offeredSizeIds: ["1.5x1", "2x1", "2x3", "2x4", "2.5x1"] },
    { id: "square", offeredSizeIds: ["1x1", "1.5x1.5", "2x2", "2.5x2.5", "3x3", "3.5x3.5", "4x4"] },
    { id: "circle", offeredSizeIds: ["1x1", "1.5x1.5", "2x2", "2.5x2.5", "3x3", "3.5x3.5", "4x4"] },
    { id: "upc", offeredSizeIds: ["1.75x0.75"] },
  ],
};

const DEFAULT_JACKETS: JacketsComponentConfig = {
  options: JACKET_STYLE_IDS.map((id) => ({ id, offered: true, templateUrl: null })),
};
const BLACK_ONLY_VINYL: VinylComponentConfig = {
  categories: [
    {
      id: "black",
      name: "Black",
      kind: "black",
      sizes: ['7"', '10"', '12"'],
      swatches: [
        { id: "BK1", name: "Black", kind: "black", base: "#0C0C0C", sizes: ['7"', '10"', '12"'] },
      ],
    },
  ],
  weights: DEFAULT_WEIGHTS,
  sizeOptions: DEFAULT_SIZE_OPTIONS,
  quantities: DEFAULT_QUANTITIES,
};

/** Map a packages tier name onto the mock's category kind vocabulary. */
function kindForTierName(name: string): SwatchKind {
  const n = name.toLowerCase();
  if (n.includes("splatter")) return "splatter";
  if (n.includes("translucent") || n.includes("clear")) return "translucent";
  if (n === "black" || n.includes("black")) return "black";
  return "opaque";
}

function sizeForFormat(format: string): VinylSizeId | null {
  if (format === "7_inch") return '7"';
  if (format === "12_lp" || format === "12_double") return '12"';
  if (format.startsWith("10")) return '10"';
  return null; // cassette / cd — not vinyl
}

const slug = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "x";

/**
 * Seed the Vinyl component from the press's GoodTunes Packages: every vinyl
 * type and color they already defined arrives on day one — nobody re-enters
 * anything. Categories dedupe by tier NAME across formats (a tier appearing
 * under 7_inch and 12_lp becomes ONE category offered in both sizes);
 * colors dedupe by colorGroupId (fallback: name) the same way.
 */
export async function seedVinylFromPackages(pressId: string): Promise<VinylComponentConfig> {
  const catalog = await getPressCatalog(pressId).catch(() => null);
  const formats = (catalog as any)?.formats as
    | { format: string; tiers: any[] }[]
    | undefined;
  if (!formats?.length) return BLACK_ONLY_VINYL;

  const byName = new Map<string, VinylCategory & { _swatchKeys: Map<string, VinylSwatch> }>();
  for (const f of formats) {
    const size = sizeForFormat(f.format);
    if (!size) continue;
    for (const tier of f.tiers ?? []) {
      const name = String(tier.name ?? "").trim();
      if (!name) continue;
      const kind = kindForTierName(name);
      let cat = byName.get(name.toLowerCase());
      if (!cat) {
        cat = {
          id: slug(name),
          name,
          kind,
          sizes: [],
          swatches: [],
          _swatchKeys: new Map(),
        };
        byName.set(name.toLowerCase(), cat);
      }
      if (!cat.sizes.includes(size)) cat.sizes.push(size);
      for (const c of tier.colors ?? []) {
        const key = String(c.colorGroupId ?? `n:${String(c.name).toLowerCase()}`);
        let sw = cat._swatchKeys.get(key);
        if (!sw) {
          sw = {
            id: slug(`${cat.id}-${c.name}`).slice(0, 64),
            name: String(c.name),
            kind,
            base: typeof c.swatchHex === "string" && /^#/.test(c.swatchHex) ? c.swatchHex : "#0C0C0C",
            sizes: [],
            ...(c.swatchThumbUrl || c.swatchImageUrl
              ? { customImg: String(c.swatchThumbUrl || c.swatchImageUrl) }
              : {}),
          };
          // Guard against slug collisions within a category.
          let n = 2;
          while (cat.swatches.some((x) => x.id === sw!.id)) sw.id = `${sw.id}-${n++}`.slice(0, 64);
          cat._swatchKeys.set(key, sw);
          cat.swatches.push(sw);
        }
        if (!sw.sizes.includes(size)) sw.sizes.push(size);
      }
    }
  }

  const categories = Array.from(byName.values()).map(({ _swatchKeys, ...cat }) => cat);
  if (!categories.length) return BLACK_ONLY_VINYL;
  // Black first, then packages order (Map preserves insertion order).
  categories.sort((a, b) => (a.kind === "black" ? -1 : 0) - (b.kind === "black" ? -1 : 0));
  const sizeSort = { '7"': 0, '10"': 1, '12"': 2 } as const;
  for (const cat of categories) {
    cat.sizes.sort((a, b) => sizeSort[a] - sizeSort[b]);
    for (const sw of cat.swatches) sw.sizes.sort((a, b) => sizeSort[a] - sizeSort[b]);
  }
  return {
    categories,
    weights: DEFAULT_WEIGHTS,
    sizeOptions: DEFAULT_SIZE_OPTIONS,
    quantities: DEFAULT_QUANTITIES,
  };
}

/** Pricing rows seeded from the seeded vinyl types/colors — price cells EMPTY. */
export function seedPricingFromVinyl(vinyl: VinylComponentConfig): PricingComponentConfig {
  const rows: PricingRow[] = [];
  for (const cat of vinyl.categories) {
    rows.push({
      key: `type:${cat.id}`,
      label: cat.name,
      detail: "",
      kind: "type",
      sizes: [...cat.sizes],
      priceCents: null,
      pricesBySize: {},
    });
    for (const sw of cat.swatches) {
      rows.push({
        key: `color:${cat.id}:${sw.id}`,
        label: sw.name,
        detail: cat.name,
        kind: "color",
        sizes: sw.sizes.length ? [...sw.sizes] : [...cat.sizes],
        priceCents: null,
        pricesBySize: {},
      });
    }
  }
  return { rows };
}

export function rowHasAnyPrice(r: PricingRow): boolean {
  if (r.priceCents != null) return true;
  return Object.values(r.pricesBySize ?? {}).some((v) => v != null);
}

/**
 * Merge newly seeded pricing rows into an existing config: keep every price
 * the press already typed (matched by key), append rows for types/colors
 * that appeared since, drop rows whose source vanished ONLY if unpriced.
 *
 * Legacy migration: a pre-size-chips row carried ONE priceCents that was
 * ambiguous across sizes. Simplest honest carry-over: copy that price into
 * EVERY size the row is pressed in (the press sees it under each size and
 * can correct per size), then drop the legacy field.
 */
export function mergePricingRows(existing: PricingRow[], seeded: PricingRow[]): PricingRow[] {
  const byKey = new Map(existing.map((r) => [r.key, r] as const));
  const migrate = (prev: PricingRow, sizes: PricingRow["sizes"]): Record<string, number | null> => {
    const bySize: Record<string, number | null> = { ...(prev.pricesBySize ?? {}) };
    if (prev.priceCents != null && !Object.values(bySize).some((v) => v != null)) {
      const targets = sizes.length ? sizes : (['7"', '10"', '12"'] as const);
      for (const s of targets) bySize[s] = prev.priceCents;
    }
    return bySize;
  };
  const out: PricingRow[] = seeded.map((s) => {
    const prev = byKey.get(s.key);
    if (!prev) return s;
    return { ...s, priceCents: null, pricesBySize: migrate(prev, s.sizes) };
  });
  const seededKeys = new Set(seeded.map((s) => s.key));
  for (const r of existing) {
    if (!seededKeys.has(r.key) && rowHasAnyPrice(r)) {
      out.push({ ...r, priceCents: null, pricesBySize: migrate(r, r.sizes ?? []) });
    }
  }
  return out;
}

async function readComponentRow(pressId: string, key: PressComponentKey) {
  const [row] = await db
    .select()
    .from(pressComponents)
    .where(and(eq(pressComponents.pressId, pressId), eq(pressComponents.componentKey, key)))
    .limit(1);
  return row ?? null;
}

async function upsertComponentRow(
  pressId: string,
  key: PressComponentKey,
  config: Record<string, unknown>,
  opts: { seeded?: boolean; userId?: string | null } = {},
) {
  // Conflict-safe: two concurrent first reads both seeding the same
  // (press_id, component_key) must not 500 on the unique constraint.
  // Seeding never overwrites an existing config (whoever inserted first
  // wins); explicit saves (opts.seeded falsy) atomically replace it.
  if (opts.seeded) {
    await db
      .insert(pressComponents)
      .values({
        pressId,
        componentKey: key,
        config,
        seededAt: new Date(),
        updatedByUserId: opts.userId ?? null,
      })
      .onConflictDoNothing({
        target: [pressComponents.pressId, pressComponents.componentKey],
      });
  } else {
    await db
      .insert(pressComponents)
      .values({
        pressId,
        componentKey: key,
        config,
        seededAt: null,
        updatedByUserId: opts.userId ?? null,
      })
      .onConflictDoUpdate({
        target: [pressComponents.pressId, pressComponents.componentKey],
        set: {
          config,
          updatedAt: new Date(),
          ...(opts.userId !== undefined ? { updatedByUserId: opts.userId } : {}),
        },
      });
  }
}

/**
 * Load all four component configs for a press, seeding any missing one.
 * Vinyl seeds from GoodTunes Packages (or Black-only for a brand-new
 * press); pricing seeds from the vinyl seed with empty price cells.
 */
export async function loadPressComponents(pressId: string): Promise<{
  vinyl: VinylComponentConfig;
  jackets: JacketsComponentConfig;
  sleeves: SleevesComponentConfig;
  labels: LabelsComponentConfig;
  inserts: InsertsComponentConfig;
  stickers: StickersComponentConfig;
  pricing: PricingComponentConfig;
}> {
  const rows = await db
    .select()
    .from(pressComponents)
    .where(eq(pressComponents.pressId, pressId));
  const byKey = new Map(rows.map((r) => [r.componentKey, r] as const));

  let vinyl = byKey.get("vinyl")?.config as VinylComponentConfig | undefined;
  if (!vinyl) {
    vinyl = await seedVinylFromPackages(pressId);
    await upsertComponentRow(pressId, "vinyl", vinyl as any, { seeded: true });
  }

  let labels = byKey.get("labels")?.config as LabelsComponentConfig | undefined;
  if (!labels) {
    labels = DEFAULT_LABEL_STYLES;
    await upsertComponentRow(pressId, "labels", labels as any, { seeded: true });
  }

  let jackets = byKey.get("jackets")?.config as JacketsComponentConfig | undefined;
  if (!jackets) {
    jackets = DEFAULT_JACKETS;
    await upsertComponentRow(pressId, "jackets", jackets as any, { seeded: true });
  }

  let sleeves = byKey.get("sleeves")?.config as SleevesComponentConfig | undefined;
  if (!sleeves) {
    sleeves = DEFAULT_SLEEVES;
    await upsertComponentRow(pressId, "sleeves", sleeves as any, { seeded: true });
  }

  let inserts = byKey.get("inserts")?.config as InsertsComponentConfig | undefined;
  if (!inserts) {
    inserts = DEFAULT_INSERTS;
    await upsertComponentRow(pressId, "inserts", inserts as any, { seeded: true });
  }

  let stickers = byKey.get("stickers")?.config as StickersComponentConfig | undefined;
  if (!stickers) {
    stickers = DEFAULT_STICKER_SHAPES;
    await upsertComponentRow(pressId, "stickers", stickers as any, { seeded: true });
  }

  let pricing = byKey.get("pricing")?.config as PricingComponentConfig | undefined;
  const seededPricing = seedPricingFromVinyl(vinyl);
  if (!pricing) {
    pricing = seededPricing;
    await upsertComponentRow(pressId, "pricing", pricing as any, { seeded: true });
  } else {
    // Keep pricing rows in step with the vinyl component (new types/colors
    // appear as empty rows; typed prices are never dropped).
    const merged = mergePricingRows(pricing.rows ?? [], seededPricing.rows);
    if (JSON.stringify(merged) !== JSON.stringify(pricing.rows)) {
      // Task #3227 — the stored pricing config can carry namespaced extra
      // keys (componentLadders, seeded by scripts/seed-mrp-services-tier3.ts
      // and read by the component→price linkage editor). Spread the existing
      // config so a rows re-sync never wipes them.
      const existingConfig = (byKey.get("pricing")?.config ?? {}) as Record<string, unknown>;
      pricing = { ...existingConfig, rows: merged } as any;
      await upsertComponentRow(pressId, "pricing", pricing as any, {});
    }
  }

  return { vinyl, jackets, sleeves, labels, inserts, stickers, pricing };
}

export function registerPressComponentRoutes(
  app: Express,
  requireAdmin: any,
  requirePressScope: any,
  requirePressEditor: (req: Request, res: Response, next: any) => Promise<any>,
) {
  // GET /api/press/:id/components — one payload for all four surfaces,
  // press identity riding as data (README rule 3).
  app.get("/api/press/:id/components", requireAdmin, requirePressScope, async (req, res) => {
    try {
      const pressId = String(req.params.id);
      const press = await storage.getManufacturerById(pressId);
      if (!press) return res.status(404).json({ message: "Press not found" });
      const configs = await loadPressComponents(pressId);
      const { pressUserCanEdit } = await import("./auth/partnerPermissions");
      // Task #3049 — the admin SPA authenticates with a Bearer token (no
      // session cookie); commerce.ts's requireAdmin stamps req.adminUserId.
      // Reading ONLY req.session.userId left every bearer-authed press with
      // canEdit=false, rendering the whole page view-only.
      const callerId =
        ((req as any).adminUserId as string | undefined) ?? req.session?.userId;
      const canEdit = callerId ? await pressUserCanEdit(callerId, pressId) : false;
      res.json({
        canEdit,
        press: {
          id: press.id,
          name: press.name,
          logoUrl: (press as any).logoUrl ?? null,
          lightLogoUrl: (press as any).lightLogoUrl ?? null,
          squareLogoUrl: (press as any).squareLogoUrl ?? null,
          identityIconUrl: (press as any).identityIconUrl ?? null,
          // Center-label mark: each press's own logo on the rendered disc
          // (Hellbender sees the rune mark, never Memphis's skyline).
          labelLogoUrl: (press as any).labelLogoUrl ?? null,
          // Center-label background: the press's stored brand label color
          // (e.g. Viryl green) — null falls back to the black default client-side.
          labelBgColor: (press as any).labelBgColor ?? null,
        },
        ...configs,
      });
    } catch (e: any) {
      console.error("[press-components] GET failed:", e?.message ?? e);
      res.status(500).json({ message: "Could not load components" });
    }
  });

  // PUT /api/press/:id/components/:key — replace ONE component's whole
  // config atomically (same pattern as the CD/cassette catalog jsonb PUT).
  app.put(
    "/api/press/:id/components/:key",
    requireAdmin,
    requirePressScope,
    requirePressEditor,
    async (req, res) => {
      try {
        const pressId = String(req.params.id);
        const key = String(req.params.key) as PressComponentKey;
        if (!PRESS_COMPONENT_KEYS.includes(key)) {
          return res.status(400).json({ message: "Unknown component" });
        }
        const press = await storage.getManufacturerById(pressId);
        if (!press) return res.status(404).json({ message: "Press not found" });
        const parsed = componentConfigSchemaByKey[key].safeParse(req.body?.config);
        if (!parsed.success) {
          return res.status(400).json({
            message: "Invalid component config",
            issues: parsed.error.issues.slice(0, 5),
          });
        }
        // Task #3227 — 'pricing' configs carry namespaced extra keys
        // (componentLadders) that the zod schema strips; merge the parsed
        // save OVER the stored config so a UI save never wipes them.
        let configToSave: Record<string, unknown> = parsed.data;
        if (key === "pricing") {
          const [existing] = await db
            .select()
            .from(pressComponents)
            .where(and(eq(pressComponents.pressId, pressId), eq(pressComponents.componentKey, "pricing")));
          configToSave = { ...((existing?.config as Record<string, unknown>) ?? {}), ...parsed.data };
        }
        await upsertComponentRow(pressId, key, configToSave, {
          userId:
            ((req as any).adminUserId as string | undefined) ??
            req.session?.userId ??
            null,
        });
        res.json({ ok: true, config: configToSave });
      } catch (e: any) {
        console.error("[press-components] PUT failed:", e?.message ?? e);
        res.status(500).json({ message: "Could not save component" });
      }
    },
  );
}

const DEFAULT_SLEEVES: SleevesComponentConfig = {
  options: SLEEVE_STYLE_IDS.map((id) => ({ id, offered: true, templateUrl: null })),
};

const DEFAULT_INSERTS: InsertsComponentConfig = {
  options: INSERT_STYLE_IDS.map((id) => ({ id, offered: true, templateUrl: null })),
};
