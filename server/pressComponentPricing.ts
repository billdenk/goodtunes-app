// Task #3227 — Associate press component choices with their prices.
//
// DB wrapper + admin routes for the per-press component→price linkages
// defined in shared/pressComponentPricing.ts. Each press resolves ONLY
// from its own rows: its own componentLadders blob (press_components
// 'pricing' config), its own press_service_items, its own link rows. No
// cross-press fallback. Operator-visible cost data — the fan-facing
// Sell-panel / checkout quote path never touches this module.

import type { Express } from "express";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "./db";
import {
  pressComponents,
  pressComponentPriceLinks,
  pressJackets,
  pressServiceItems,
  type PressComponentPriceLink,
  type PressServiceItem,
} from "@shared/schema";
import {
  PACKAGE_COMPONENT_KEYS,
  PACKAGE_COMPONENT_OPTIONS,
  PRICE_LINK_MODES,
  isValidPackageOption,
  ladderItemToRungs,
  ladderRungSchema,
  matchJacketRowForOption,
  validateTypedRungs,
  type ComponentLadderCatalog,
  resolvePackageComponentLines,
  type ComponentPriceLinkData,
  type PackageComponentKey,
  type PackageSelection,
} from "@shared/pressComponentPricing";
import { storage } from "./storage";
import { lookupCatalogUnitCents } from "./pressCatalog";
import type { AlbumFormat } from "@shared/schema";

// ── componentLadders blob (seeded by scripts/seed-mrp-services-tier3.ts) ──
export async function getComponentLadderCatalog(pressId: string): Promise<ComponentLadderCatalog | null> {
  const [row] = await db
    .select()
    .from(pressComponents)
    .where(and(eq(pressComponents.pressId, pressId), eq(pressComponents.componentKey, "pricing")));
  const blob = (row?.config as any)?.componentLadders;
  if (!blob || !Array.isArray(blob.groups) || !Array.isArray(blob.quantities)) return null;
  return blob as ComponentLadderCatalog;
}

export function toLinkData(row: PressComponentPriceLink): ComponentPriceLinkData {
  return {
    componentKey: row.componentKey as PackageComponentKey,
    optionId: row.optionId,
    priceMode: row.priceMode as ComponentPriceLinkData["priceMode"],
    serviceItemId: row.serviceItemId ?? null,
    ladderSource: (row.ladderSource as any) ?? null,
    ladderRungs: (row.ladderRungs as any) ?? null,
  };
}

export async function getComponentPriceLinks(pressId: string): Promise<PressComponentPriceLink[]> {
  return db
    .select()
    .from(pressComponentPriceLinks)
    .where(eq(pressComponentPriceLinks.pressId, pressId));
}

async function getActiveServiceItems(pressId: string): Promise<PressServiceItem[]> {
  const rows = await db
    .select()
    .from(pressServiceItems)
    .where(eq(pressServiceItems.pressId, pressId))
    .orderBy(asc(pressServiceItems.position), asc(pressServiceItems.createdAt));
  return rows.filter((r) => !r.archivedAt);
}

// One-time / setup services surfaced alongside the per-package breakdown
// (metalwork, test pressings, setup fees) — flat operator-cost context.
const ONE_TIME_CATEGORIES = new Set(["metalwork", "test_pressings", "setup_fees"]);

// ── Routes ─────────────────────────────────────────────────────────────
export function registerComponentPricingRoutes(
  app: Express,
  requireAdmin: any,
  requirePressScope: any,
  requirePressEditor: any,
) {
  // GET links + editor vocabulary for a press's catalog page.
  app.get(
    "/api/admin/manufacturers/:id/catalog/component-price-links",
    requireAdmin,
    requirePressScope,
    async (req, res) => {
      const pressId = String(req.params.id);
      const press = await storage.getManufacturerById(pressId);
      if (!press) return res.status(404).json({ message: "Manufacturer not found" });
      const [links, ladderCatalog, services] = await Promise.all([
        getComponentPriceLinks(pressId),
        getComponentLadderCatalog(pressId),
        getActiveServiceItems(pressId),
      ]);
      res.json({
        links,
        // Ladder picker choices (labels only — rungs are snapshotted server-
        // side at save time from THIS press's own blob).
        ladderGroups: ladderCatalog
          ? ladderCatalog.groups.map((g) => ({
              key: g.key,
              label: g.label,
              items: g.items.map((i) => ({ label: i.label })),
            }))
          : [],
        ladderPriceList: ladderCatalog?.priceList ?? null,
        services: services.map((s) => ({
          id: s.id,
          category: s.category,
          label: s.label,
          amountCents: s.amountCents,
          unitBasis: s.unitBasis,
        })),
      });
    },
  );

  const putBodySchema = z.object({
    componentKey: z.enum(PACKAGE_COMPONENT_KEYS),
    optionId: z.string().min(1).max(100),
    priceMode: z.enum(PRICE_LINK_MODES),
    serviceItemId: z.string().min(1).max(100).nullable().optional(),
    ladderGroupKey: z.string().min(1).max(200).nullable().optional(),
    ladderItemLabel: z.string().min(1).max(400).nullable().optional(),
    // Operator-typed custom rungs (allowed instead of a catalog ref).
    ladderRungs: z.array(ladderRungSchema).max(30).nullable().optional(),
  });

  // PUT (upsert) one option's linkage.
  app.put(
    "/api/admin/manufacturers/:id/catalog/component-price-links",
    requireAdmin,
    requirePressScope,
    requirePressEditor,
    async (req, res) => {
      const pressId = String(req.params.id);
      const press = await storage.getManufacturerById(pressId);
      if (!press) return res.status(404).json({ message: "Manufacturer not found" });
      const parsed = putBodySchema.safeParse(req.body ?? {});
      if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0]?.message ?? "Invalid link" });
      const body = parsed.data;
      if (!isValidPackageOption(body.componentKey, body.optionId)) {
        return res.status(400).json({ message: "Unknown component option" });
      }

      let serviceItemId: string | null = null;
      let ladderSource: { groupKey: string; itemLabel: string } | null = null;
      let ladderRungs: { qty: number; unitCents: number }[] | null = null;

      if (body.priceMode === "service") {
        if (!body.serviceItemId) return res.status(400).json({ message: "serviceItemId required for service mode" });
        // Same-press only — a link may never point at another press's row.
        const [item] = await db
          .select()
          .from(pressServiceItems)
          .where(and(eq(pressServiceItems.id, body.serviceItemId), eq(pressServiceItems.pressId, pressId)));
        if (!item) return res.status(400).json({ message: "Service item not found for this press" });
        if (item.archivedAt) return res.status(400).json({ message: "Service item is archived" });
        serviceItemId = item.id;
      } else if (body.priceMode === "ladder") {
        if (body.ladderGroupKey && body.ladderItemLabel) {
          const catalog = await getComponentLadderCatalog(pressId);
          if (!catalog) return res.status(400).json({ message: "This press has no component price ladders" });
          const rungs = ladderItemToRungs(catalog, body.ladderGroupKey, body.ladderItemLabel);
          if (!rungs) return res.status(400).json({ message: "Ladder item not found for this press" });
          ladderSource = { groupKey: body.ladderGroupKey, itemLabel: body.ladderItemLabel };
          ladderRungs = rungs;
        } else if (body.ladderRungs && body.ladderRungs.length > 0) {
          const rungError = validateTypedRungs(body.ladderRungs);
          if (rungError) return res.status(400).json({ message: rungError });
          ladderRungs = [...body.ladderRungs].sort((a, b) => a.qty - b.qty);
        } else {
          return res.status(400).json({ message: "Ladder mode needs a catalog ladder or typed rungs" });
        }
      }

      const userId = ((req as any).adminUserId as string | undefined) ?? req.session?.userId ?? null;
      const values = {
        pressId,
        componentKey: body.componentKey,
        optionId: body.optionId,
        priceMode: body.priceMode,
        serviceItemId,
        ladderSource,
        ladderRungs,
        updatedByUserId: userId,
        updatedAt: new Date(),
      };
      const [saved] = await db
        .insert(pressComponentPriceLinks)
        .values(values as any)
        .onConflictDoUpdate({
          target: [
            pressComponentPriceLinks.pressId,
            pressComponentPriceLinks.componentKey,
            pressComponentPriceLinks.optionId,
          ],
          set: {
            priceMode: values.priceMode,
            serviceItemId: values.serviceItemId,
            ladderSource: values.ladderSource,
            ladderRungs: values.ladderRungs,
            updatedByUserId: values.updatedByUserId,
            updatedAt: values.updatedAt,
          } as any,
        })
        .returning();
      res.json(saved);
    },
  );

  // DELETE — unlink (back to "no price on file").
  app.delete(
    "/api/admin/manufacturers/:id/catalog/component-price-links/:componentKey/:optionId",
    requireAdmin,
    requirePressScope,
    requirePressEditor,
    async (req, res) => {
      const pressId = String(req.params.id);
      const componentKey = String(req.params.componentKey);
      const optionId = String(req.params.optionId);
      const deleted = await db
        .delete(pressComponentPriceLinks)
        .where(
          and(
            eq(pressComponentPriceLinks.pressId, pressId),
            eq(pressComponentPriceLinks.componentKey, componentKey),
            eq(pressComponentPriceLinks.optionId, optionId),
          ),
        )
        .returning();
      if (deleted.length === 0) return res.status(404).json({ message: "Link not found" });
      res.json({ ok: true });
    },
  );

  // GET itemized package cost breakdown: record (tier ladder at qty) +
  // each selected component's resolved price + one-time services. Reads
  // stay on requirePressScope like the rest of the catalog cost surfaces.
  //   ?format=vinyl&tierId=…&colorId=…&quantity=500
  //   &selections=jacket:gatefold,inner_sleeve:white-poly,extras:shrink_wrap
  app.get(
    "/api/admin/manufacturers/:id/catalog/package-cost-breakdown",
    requireAdmin,
    requirePressScope,
    async (req, res) => {
      const pressId = String(req.params.id);
      const press = await storage.getManufacturerById(pressId);
      if (!press) return res.status(404).json({ message: "Manufacturer not found" });

      const quantity = Math.max(1, Math.floor(Number(req.query.quantity) || 0));
      if (!Number.isFinite(quantity) || quantity < 1) {
        return res.status(400).json({ message: "quantity required" });
      }
      const selections: PackageSelection[] = String(req.query.selections ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .map((pair) => {
          const idx = pair.indexOf(":");
          return { componentKey: pair.slice(0, idx) as PackageComponentKey, optionId: pair.slice(idx + 1) };
        })
        .filter((s) => isValidPackageOption(s.componentKey, s.optionId));

      // Record line — the existing tier×jacket all-in ladder, unchanged
      // semantics (this endpoint only READS it; fan quotes untouched).
      let record: {
        unitCents: number;
        totalCents: number;
        snappedQty: number;
        tierName: string;
        colorName: string | null;
        requiresQuote: boolean;
      } | null = null;
      const tierId = typeof req.query.tierId === "string" ? req.query.tierId : "";
      const format = (typeof req.query.format === "string" ? req.query.format : "vinyl") as AlbumFormat;
      let recordNote: string | null = null;
      let recordIncludesJacket = false;
      if (tierId) {
        // The record line is the tier×jacket all-in ladder, so the SELECTED
        // jacket style must drive which jacket ladder prices it (an explicit
        // jacketId param wins). A style with no matching jacket row for this
        // press is an honest gap — never silently priced off the default.
        let jacketId: string | null =
          typeof req.query.jacketId === "string" && req.query.jacketId ? req.query.jacketId : null;
        let jacketUnmatched = false;
        const jacketSel = selections.find((s) => s.componentKey === "jacket");
        if (!jacketId && jacketSel) {
          const jackets = await db
            .select()
            .from(pressJackets)
            .where(eq(pressJackets.pressId, pressId))
            .orderBy(asc(pressJackets.position));
          jacketId = matchJacketRowForOption(
            jacketSel.optionId,
            jackets.map((j) => ({
              id: j.id,
              name: j.name,
              isDefault: j.isDefault,
              applicableFormats: (j.applicableFormats as string[] | null) ?? null,
            })),
            format,
          );
          // ANY explicit jacket selection (single included) with no matching
          // same-press jacket row is an honest gap — matchJacketRowForOption
          // already resolves 'single' to the press's default row when one
          // exists, so reaching here without an id means there is none.
          if (!jacketId) jacketUnmatched = true;
        }
        const hit = jacketUnmatched
          ? null
          : await lookupCatalogUnitCents({
              pressId,
              format,
              tierId,
              colorId: typeof req.query.colorId === "string" && req.query.colorId ? req.query.colorId : null,
              quantity,
              jacketId,
              // Explicit jacket = honest gap on an empty tier×jacket ladder
              // (never silently the legacy/default price).
              requireJacketLadder: !!jacketId,
            });
        if (jacketUnmatched) {
          recordNote = "No record ladder for the selected jacket style at this press — custom quote.";
        } else if (!hit) {
          recordNote = "No record ladder on file for this tier + jacket combination — custom quote.";
        }
        if (hit) {
          record = {
            unitCents: hit.unitCents,
            totalCents: hit.requiresQuote ? 0 : hit.unitCents * quantity,
            snappedQty: hit.snappedQty,
            tierName: hit.tierName,
            colorName: hit.colorName,
            requiresQuote: hit.requiresQuote,
          };
          // The tier×jacket ladder is ALL-IN — when the record line priced
          // with the selected jacket's own ladder, that jacket is already in
          // the record price and must NOT price again as a component line.
          if (jacketId && jacketSel && !hit.requiresQuote) recordIncludesJacket = true;
        }
      }

      const [linkRows, services] = await Promise.all([
        getComponentPriceLinks(pressId),
        getActiveServiceItems(pressId),
      ]);
      const components = resolvePackageComponentLines({
        selections,
        links: linkRows.map(toLinkData),
        serviceItems: services,
        quantity,
      });
      if (recordIncludesJacket) {
        for (const line of components) {
          if (line.componentKey === "jacket") {
            line.status = "included";
            line.unitCents = null;
            line.totalCents = null;
            line.sourceLabel = "Included in record price";
            line.note = "Priced in the record line (all-in tier × jacket ladder)";
          }
        }
      }

      const oneTimeServices = services
        .filter((s) => ONE_TIME_CATEGORIES.has(s.category))
        .map((s) => ({
          id: s.id,
          category: s.category,
          label: s.label,
          amountCents: s.amountCents,
          unitBasis: s.unitBasis,
          note: s.note ?? null,
        }));

      // Honest totals: only lines with a computable extended total sum;
      // gaps are COUNTED so the UI can flag "N unpriced".
      const pricedComponentTotal = components.reduce((sum, l) => sum + (l.totalCents ?? 0), 0);
      const unpricedCount = components.filter(
        (l) => l.status === "custom_quote" || l.status === "no_price_on_file" || (l.status === "priced" && l.totalCents === null),
      ).length;

      res.json({
        pressId,
        pressName: press.name,
        quantity,
        record,
        recordNote,
        components,
        oneTimeServices,
        totals: {
          recordCents: record && !record.requiresQuote ? record.totalCents : null,
          componentsCents: pricedComponentTotal,
          combinedCents:
            record && !record.requiresQuote ? record.totalCents + pricedComponentTotal : null,
          unpricedCount,
        },
      });
    },
  );
}
