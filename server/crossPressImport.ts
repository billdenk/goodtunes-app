// Task #3394 — Cross-press project import (wired, held OFF).
//
// Customer-initiated flow that lets a customer bring their own project
// SPECS from one press to another, plus the GoodTunes-side cross-press
// "My projects" view. Everything here ships behind flags, OFF by default:
//   • per-press:  manufacturers.cross_press_import_enabled (operator-set)
//   • GoodTunes:  CROSS_PRESS_MY_PROJECTS_ENABLED (compile-time false)
//
// WALLS (Bill's ruling principles — do not weaken):
//   • Customer-initiated ONLY. No press-scoped endpoint, report, or
//     notification learns that a customer has projects elsewhere. An import
//     writes zero rows visible to the SOURCE press and emits no events.
//   • Specs travel, never commerce. Every payload leaving these routes is
//     run through findForbiddenPriceKeys (shared/crossPressImport.ts) —
//     a price key here is a bug, fail loudly.
//   • Never name the other press. Customer-facing project lists inside a
//     press portal carry NO source press id or name. (The GoodTunes-side
//     "My projects" view is the one non-press-branded surface that may
//     name presses — it is the customer's own account view.)
//   • Honest translation — closest matches need customer confirmation;
//     "no equivalent" is stated, never silently swapped; prices come only
//     from the destination press's own ladders after confirmation.
import type { Express, Request, Response } from "express";
import { sql, eq, and, inArray } from "drizzle-orm";
import { db } from "./db";
import { storage } from "./storage";
import {
  pressEstimates,
  pressColorTiers,
  pressColors,
  pressJackets,
  pressFormats,
  mastersReleaseRequests,
  crossPressImportDismissals,
} from "@shared/schema";
import {
  CROSS_PRESS_MY_PROJECTS_ENABLED,
  MASTERS_RELEASE_STATUSES,
  type CanonicalProjectSpec,
  type DestinationCatalog,
  type CanonicalEffectFamily,
  type CanonicalColorFamily,
  type CanonicalJacketConstruction,
  slugTierKind,
  deriveEffectFamily,
  deriveColorFamily,
  deriveJacketConstruction,
  specFromBuilderState,
  specFromSkuSnapshot,
  specIsEligible,
  translateSpec,
  findForbiddenPriceKeys,
  CANONICAL_EFFECT_FAMILIES,
  CANONICAL_COLOR_FAMILIES,
  CANONICAL_JACKET_CONSTRUCTIONS,
} from "@shared/crossPressImport";

// ── Auth + host helpers (mirror the /api/press-client conventions) ──────

/** Resolve the signed-in CUSTOMER (session first, bearer fallback — the
 * white-label hosts have host-scoped cookies so the bearer often is the
 * only credential that travels). */
async function resolveCustomer(req: Request): Promise<{ id: string; email: string | null; displayName: string | null } | null> {
  const userId = (req as any).session?.userId;
  const kind = (req as any).session?.kind;
  let customer = kind === "customer" && userId ? await storage.getCustomer(userId) : null;
  if (!customer) {
    const authHeader = String(req.headers.authorization ?? "");
    const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (bearer) {
      const t = await storage.getAuthBy(bearer);
      if (t && t.kind === "customer") customer = await storage.getCustomer(t.userId);
    }
  }
  if (!customer) return null;
  return { id: customer.id, email: (customer as any).email ?? null, displayName: (customer as any).displayName ?? null };
}

/** Resolve the white-label host's press (#3295 rule: client-portal reads
 * are scoped to the ONE press the request's host belongs to). Dev-only
 * ?wl=<slug> override, never honored in production. */
async function resolvePortalPress(req: Request): Promise<{ id: string; importEnabled: boolean } | null> {
  const { parseWhitelabelHost } = await import("@shared/whitelabelHost");
  const rawHost = String(req.headers["x-forwarded-host"] ?? req.headers.host ?? "");
  let slug = parseWhitelabelHost(rawHost)?.slug ?? null;
  if (!slug && process.env.NODE_ENV !== "production") {
    const q = String(req.query.wl ?? "").trim().toLowerCase();
    if (q) slug = q;
  }
  if (!slug) return null;
  const r = await db.execute<any>(sql`
    SELECT id, cross_press_import_enabled AS enabled FROM manufacturers
    WHERE lower(white_label_slug) = ${slug} OR lower(previous_white_label_slug) = ${slug}
    ORDER BY (lower(white_label_slug) = ${slug}) DESC
    LIMIT 1
  `);
  const row = ((r as any).rows ?? [])[0];
  return row ? { id: String(row.id), importEnabled: row.enabled === true } : null;
}

/** Whether the request arrived on a white-label host (GoodTunes "My
 * projects" must NEVER render there — server-side twin of the client gate). */
async function onWhitelabelRequest(req: Request): Promise<boolean> {
  const { parseWhitelabelHost } = await import("@shared/whitelabelHost");
  const rawHost = String(req.headers["x-forwarded-host"] ?? req.headers.host ?? "");
  return parseWhitelabelHost(rawHost) != null;
}

// ── Price firewall on the wire ───────────────────────────────────────────
/** Every import payload goes out through this. A forbidden key is a bug in
 * OUR code (specs are allowlist-built), so fail loudly — never ship it. */
function sendPriceFree(res: Response, body: unknown): void {
  const hits = findForbiddenPriceKeys(body);
  if (hits.length) {
    console.error(`[cross-press-import] BLOCKED price leak: ${hits.join(", ")}`);
    res.status(500).json({ message: "Internal error." });
    return;
  }
  res.json(body);
}

// ── Project enumeration (customer-scoped, price-free) ───────────────────

type RawProject = {
  key: string; // opaque "est:<id>" | "sku:<id>"
  pressId: string;
  pressName: string;
  spec: CanonicalProjectSpec;
};

/** Stored canonical attrs for a source tier/color, resolved by name within
 * one press (SKU snapshots and builder states store display names). */
async function sourceAttrsByName(pressId: string, tierName: string | null, colorName: string | null) {
  let tierAttrs: { effectFamily?: CanonicalEffectFamily; confirmed?: boolean } | null = null;
  let colorAttrs: { colorFamily?: CanonicalColorFamily; confirmed?: boolean } | null = null;
  if (tierName) {
    const r = await db.execute<any>(sql`
      SELECT t.canonical_attrs AS tier_attrs,
             (SELECT c.canonical_attrs FROM press_colors c
              WHERE c.tier_id = t.id AND lower(c.name) = lower(${colorName ?? ""}) LIMIT 1) AS color_attrs
      FROM press_color_tiers t
      WHERE t.press_id = ${pressId} AND lower(t.name) = lower(${tierName})
      LIMIT 1
    `);
    const row = ((r as any).rows ?? [])[0];
    tierAttrs = row?.tier_attrs ?? null;
    colorAttrs = row?.color_attrs ?? null;
  }
  return { tierAttrs, colorAttrs };
}

/** All of a customer's projects across presses, as price-free canonical
 * specs. Sources: press estimates matched to the account (accepted-by or
 * sentTo email — same rule as /api/press-client/portal) and owned albums'
 * pressing snapshots (album_skus with an exact press identity). */
async function enumerateCustomerProjects(customer: { id: string; email: string | null }): Promise<RawProject[]> {
  const email = String(customer.email ?? "").toLowerCase();
  const out: RawProject[] = [];

  const estRows = await db.execute<any>(sql`
    SELECT e.id, e.press_id, e.title, e.updated_at, e.payload->'builderState' AS builder_state,
           m.name AS press_name
    FROM press_estimates e
    JOIN manufacturers m ON m.id = e.press_id
    WHERE e.kind = 'estimate'
      AND (e.payload->>'acceptedByCustomerId' = ${customer.id}
           OR EXISTS (
             SELECT 1 FROM jsonb_array_elements(COALESCE(e.payload->'sentTo','[]'::jsonb)) r
             WHERE lower(r->>'email') = ${email}
           ))
    ORDER BY e.updated_at DESC
    LIMIT 100
  `);
  for (const r of ((estRows as any).rows ?? []) as any[]) {
    const bs = (r.builder_state ?? null) as Record<string, unknown> | null;
    if (!bs || typeof bs !== "object") continue;
    const { tierAttrs, colorAttrs } = await sourceAttrsByName(
      String(r.press_id),
      typeof bs.colorTierName === "string" ? bs.colorTierName : null,
      typeof bs.colorName === "string" ? bs.colorName : null,
    );
    const spec = specFromBuilderState({
      sourceRef: { kind: "estimate", id: String(r.id) },
      title: r.title ?? null,
      savedAt: r.updated_at ? new Date(r.updated_at).toISOString() : null,
      builderState: bs,
      tierAttrs,
      colorAttrs,
    });
    if (specIsEligible(spec)) out.push({ key: `est:${r.id}`, pressId: String(r.press_id), pressName: String(r.press_name ?? ""), spec });
  }

  const skuRows = await db.execute<any>(sql`
    SELECT s.id, s.press_id, s.format, s.vinyl_color, s.vinyl_color_tier, s.jacket_upgrade,
           s.quantity_tier, a.id AS album_id, a.title AS album_title, m.name AS press_name,
           (SELECT jsonb_agg(x) FROM (
              SELECT jsonb_build_object('side', sg.vinyl_side, 'tracks', count(*)::int) AS x
              FROM songs sg WHERE sg.album_id = a.id AND sg.vinyl_side IS NOT NULL
              GROUP BY sg.vinyl_side ORDER BY sg.vinyl_side
           ) q) AS side_breaks
    FROM user_albums ua
    JOIN albums a ON a.id = ua.album_id
    JOIN album_skus s ON s.album_id = a.id
    JOIN manufacturers m ON m.id = s.press_id
    WHERE ua.user_id = ${customer.id} AND s.press_id IS NOT NULL
    ORDER BY a.title
    LIMIT 100
  `);
  for (const r of ((skuRows as any).rows ?? []) as any[]) {
    const { tierAttrs, colorAttrs } = await sourceAttrsByName(
      String(r.press_id),
      r.vinyl_color_tier ?? null,
      r.vinyl_color ?? null,
    );
    const sideBreaks = Array.isArray(r.side_breaks)
      ? r.side_breaks.map((x: any) => ({ side: String(x.side), tracks: Number(x.tracks) }))
      : null;
    const spec = specFromSkuSnapshot({
      sourceRef: { kind: "album_sku", id: String(r.id) },
      title: r.album_title ?? null,
      format: r.format ?? null,
      vinylColor: r.vinyl_color ?? null,
      vinylColorTier: r.vinyl_color_tier ?? null,
      jacketUpgrade: r.jacket_upgrade ?? null,
      quantityTier: r.quantity_tier ?? null,
      sideBreaks,
      tierAttrs,
      colorAttrs,
    });
    if (specIsEligible(spec)) out.push({ key: `sku:${r.id}`, pressId: String(r.press_id), pressName: String(r.press_name ?? ""), spec });
  }
  return out;
}

/** Customer-facing summary INSIDE a press portal: strips the source press
 * entirely (never name the other press) and every price field (specs are
 * already price-free by construction). */
function portalProjectSummary(p: RawProject) {
  return {
    id: p.key,
    title: p.spec.title,
    savedAt: p.spec.savedAt,
    format: p.spec.format,
    sizeId: p.spec.sizeId,
    colorName: p.spec.color.name,
    colorTierName: p.spec.color.tierName,
    jacketName: p.spec.jacket.name,
    lastQuantity: p.spec.lastQuantity,
  };
}

// ── Destination catalog (price-free projection) ─────────────────────────
async function destinationCatalogForPress(pressId: string): Promise<DestinationCatalog> {
  const [fRows, tRows, jRows] = await Promise.all([
    db.select().from(pressFormats).where(eq(pressFormats.pressId, pressId)),
    db.select().from(pressColorTiers).where(eq(pressColorTiers.pressId, pressId)),
    db.select().from(pressJackets).where(eq(pressJackets.pressId, pressId)),
  ]);
  const liveTiers = tRows.filter((t) => !(t as any).archivedAt);
  const cRows = liveTiers.length
    ? await db.select().from(pressColors).where(inArray(pressColors.tierId, liveTiers.map((t) => t.id)))
    : [];

  const sizes = new Set<string>();
  for (const f of fRows) {
    if ((f as any).hiddenAt) continue;
    if (f.format === "7_inch") sizes.add("7");
    else if (String(f.format).startsWith("10")) sizes.add("10");
    else if (f.format === "12_lp" || f.format === "12_double") sizes.add("12");
  }

  // Tiers dedupe by name across formats (a tier under 7_inch AND 12_lp is
  // ONE destination option offered in both), mirroring seedVinylFromPackages.
  const byName = new Map<string, { id: string; name: string; formats: string[]; effectFamily: CanonicalEffectFamily; rowIds: string[] }>();
  for (const t of liveTiers) {
    const key = t.name.toLowerCase();
    const attrs = (t as any).canonicalAttrs as { effectFamily?: string } | null;
    const fam = (attrs?.effectFamily && (CANONICAL_EFFECT_FAMILIES as readonly string[]).includes(attrs.effectFamily)
      ? attrs.effectFamily
      : deriveEffectFamily(t.name)) as CanonicalEffectFamily;
    let entry = byName.get(key);
    if (!entry) {
      entry = { id: t.id, name: t.name, formats: [], effectFamily: fam, rowIds: [] };
      byName.set(key, entry);
    }
    entry.rowIds.push(t.id);
    if (!entry.formats.includes(t.format)) entry.formats.push(t.format);
  }
  const tierIdRemap = new Map<string, string>();
  for (const e of Array.from(byName.values())) for (const rid of e.rowIds) tierIdRemap.set(rid, e.id);

  // Colors keep their OWN tier row's format (tiers merge by name across
  // formats, but a color that only exists on the 7" copy of a tier is NOT
  // on offer for a 12" record — the builder filters real color rows by
  // size, so an off-format color id would land as an unavailable pick).
  const tierRowFormat = new Map(liveTiers.map((t) => [t.id, t.format] as const));
  const colors: DestinationCatalog["colors"] = [];
  const seenColor = new Set<string>();
  for (const c of cRows) {
    if ((c as any).archivedAt) continue;
    const tierId = tierIdRemap.get(c.tierId);
    if (!tierId) continue;
    const dedupeKey = `${c.tierId}:${c.name.toLowerCase()}`;
    if (seenColor.has(dedupeKey)) continue;
    seenColor.add(dedupeKey);
    const attrs = (c as any).canonicalAttrs as { colorFamily?: string } | null;
    const fam = (attrs?.colorFamily && (CANONICAL_COLOR_FAMILIES as readonly string[]).includes(attrs.colorFamily)
      ? attrs.colorFamily
      : deriveColorFamily(c.name, c.swatchHex)) as CanonicalColorFamily | null;
    const fmt = tierRowFormat.get(c.tierId);
    colors.push({ id: c.id, tierId, name: c.name, colorFamily: fam, formats: fmt ? [fmt] : [] });
  }

  const jackets: DestinationCatalog["jackets"] = jRows.map((j) => {
    const attrs = (j as any).canonicalAttrs as { construction?: string } | null;
    const construction = (attrs?.construction && (CANONICAL_JACKET_CONSTRUCTIONS as readonly string[]).includes(attrs.construction)
      ? attrs.construction
      : deriveJacketConstruction(j.name)) as CanonicalJacketConstruction;
    const formats = Array.isArray((j as any).applicableFormats)
      ? ((j as any).applicableFormats as string[]).filter((f) => typeof f === "string")
      : [];
    return { id: j.id, name: j.name, construction, formats };
  });

  return {
    sizes: Array.from(sizes),
    weights: ["140", "180"],
    tiers: Array.from(byName.values()).map(({ rowIds: _r, ...t }) => t),
    colors,
    jackets,
  };
}

// ── Routes ───────────────────────────────────────────────────────────────
export function registerCrossPressImportRoutes(
  app: Express,
  requireAdmin: any,
  requirePressScope: any,
) {
  const FLAG_OFF_404 = { message: "Not found" };

  /** Shared gate for the customer-side portal import routes: signed-in
   * customer + white-label host press + per-press flag ON. Flag OFF (or no
   * press host) is indistinguishable from "route doesn't exist" — zero new
   * surfaces when held off. */
  async function importGate(req: Request, res: Response): Promise<{ customer: NonNullable<Awaited<ReturnType<typeof resolveCustomer>>>; press: { id: string } } | null> {
    const customer = await resolveCustomer(req);
    if (!customer) {
      res.status(401).json({ message: "Unauthorized" });
      return null;
    }
    const press = await resolvePortalPress(req);
    if (!press || !press.importEnabled) {
      res.status(404).json(FLAG_OFF_404);
      return null;
    }
    return { customer, press: { id: press.id } };
  }

  // Entry-point eligibility. Held OFF means the endpoint does not exist:
  // while this press's flag is off it 404s exactly like every other import
  // route (the portal treats a failed lookup as "no card"), so an off-state
  // probe learns nothing — not even that the feature exists.
  app.get("/api/press-client/import/eligibility", async (req, res) => {
    const customer = await resolveCustomer(req);
    if (!customer) return res.status(401).json({ message: "Unauthorized" });
    const press = await resolvePortalPress(req);
    if (!press || !press.importEnabled) return res.status(404).json(FLAG_OFF_404);
    const [projects, dismissedRows] = await Promise.all([
      enumerateCustomerProjects(customer),
      db
        .select()
        .from(crossPressImportDismissals)
        .where(and(eq(crossPressImportDismissals.customerUserId, customer.id), eq(crossPressImportDismissals.pressId, press.id)))
        .limit(1),
    ]);
    const eligible = projects.filter((p) => p.pressId !== press.id);
    sendPriceFree(res, {
      enabled: true,
      eligibleCount: eligible.length,
      dismissed: dismissedRows.length > 0,
    });
  });

  // One-time dismissal of the entry-point card (per customer, per press).
  app.post("/api/press-client/import/dismiss", async (req, res) => {
    const gate = await importGate(req, res);
    if (!gate) return;
    await db.execute(sql`
      INSERT INTO cross_press_import_dismissals (customer_user_id, press_id)
      VALUES (${gate.customer.id}, ${gate.press.id})
      ON CONFLICT (customer_user_id, press_id) DO NOTHING
    `);
    res.json({ ok: true });
  });

  // The customer's importable projects — press-neutral summaries with the
  // source press stripped ("saved project specs on your account").
  app.get("/api/press-client/import/projects", async (req, res) => {
    const gate = await importGate(req, res);
    if (!gate) return;
    const projects = await enumerateCustomerProjects(gate.customer);
    const eligible = projects.filter((p) => p.pressId !== gate.press.id);
    sendPriceFree(res, { projects: eligible.map(portalProjectSummary) });
  });

  // Translate one project into THIS press's vocabulary: exact matches,
  // ranked closest-match candidates (customer must confirm), or an honest
  // "no equivalent". Never a price — destination pricing comes only from
  // the destination's own ladders once the customer confirms in the builder.
  app.post("/api/press-client/import/translate", async (req, res) => {
    const gate = await importGate(req, res);
    if (!gate) return;
    const projectId = String(req.body?.projectId ?? "");
    const projects = await enumerateCustomerProjects(gate.customer);
    const project = projects.find((p) => p.key === projectId && p.pressId !== gate.press.id);
    if (!project) return res.status(404).json({ message: "Project not found." });
    const dest = await destinationCatalogForPress(gate.press.id);
    // When the customer has already picked a closest-match tier, regenerate
    // color candidates against THAT tier so every displayed choice is
    // startable (never an incoherent tier/color pair). The pick is only
    // honored when it is one of the initial proposal's OWN closest-match
    // candidates — an arbitrary destination tier id is rejected outright,
    // same wall as /start (never preview candidates under a non-equivalent
    // finish).
    const initial = translateSpec(project.spec, dest);
    let confirmedTierId: string | null = null;
    if (typeof req.body?.confirmedTierId === "string") {
      const tierField = initial.fields.find((f) => f.field === "colorTier");
      if (tierField?.status !== "closest" || !tierField.candidates.some((c) => c.id === req.body.confirmedTierId)) {
        return res.status(400).json({ message: "That finish isn't one of the suggested matches." });
      }
      confirmedTierId = req.body.confirmedTierId as string;
    }
    const proposal = confirmedTierId ? translateSpec(project.spec, dest, { confirmedTierId }) : initial;
    sendPriceFree(res, {
      project: portalProjectSummary(project),
      proposal,
    });
  });

  // Start a draft at THIS press from a translated project. The draft is a
  // normal press_estimates row at the DESTINATION press — its payload
  // carries NO source press id/name and no imported price. The source press
  // sees nothing: no row, no event, no notification.
  app.post("/api/press-client/import/start", async (req, res) => {
    const gate = await importGate(req, res);
    if (!gate) return;
    const projectId = String(req.body?.projectId ?? "");
    const confirmations = (req.body?.confirmations ?? {}) as Record<string, unknown>;
    const projects = await enumerateCustomerProjects(gate.customer);
    const project = projects.find((p) => p.key === projectId && p.pressId !== gate.press.id);
    if (!project) return res.status(404).json({ message: "Project not found." });
    const dest = await destinationCatalogForPress(gate.press.id);

    // Enforce honest translation server-side. The proposal is recomputed
    // here (never trusted from the client): the tier confirmation is
    // resolved first against the initial proposal's OWN candidates, then the
    // whole proposal regenerates against that tier so the color candidates
    // being enforced are the same coherent set the wizard displayed. Every
    // closest-match field MUST be confirmed from its candidate list; stray
    // confirmations for exact/no-equivalent fields are rejected (they'd be a
    // silent swap).
    const CONFIRM_KEYS: Record<string, string> = { colorTier: "colorTierId", color: "colorId", jacket: "jacketId" };
    const initial = translateSpec(project.spec, dest);
    const tierField = initial.fields.find((f) => f.field === "colorTier");
    let confirmedTierId: string | null = null;
    if (tierField?.status === "closest") {
      const pick = typeof confirmations.colorTierId === "string" ? (confirmations.colorTierId as string) : null;
      if (!pick || !tierField.candidates.some((c) => c.id === pick)) {
        return res.status(400).json({ message: "Please confirm every suggested match before starting." });
      }
      confirmedTierId = pick;
    }
    const proposal = translateSpec(project.spec, dest, { confirmedTierId });
    const builderState: Record<string, unknown> = { ...proposal.proposedBuilderState };
    const confirmableKeys = new Set(
      proposal.fields.filter((f) => f.status === "closest" && CONFIRM_KEYS[f.field]).map((f) => CONFIRM_KEYS[f.field]),
    );
    for (const key of Object.keys(confirmations)) {
      if (!confirmableKeys.has(key)) {
        return res.status(400).json({ message: "That option doesn't need confirming here." });
      }
    }
    const confirmedTier = confirmedTierId ? dest.tiers.find((t) => t.id === confirmedTierId) ?? null : null;
    if (confirmedTier) {
      // The builder hydrates colorKind (tier-name slug); the tier NAME rides
      // along for the server /send pricing gate.
      builderState.colorKind = slugTierKind(confirmedTier.name);
      builderState.colorTierName = confirmedTier.name;
    }
    for (const f of proposal.fields) {
      if (f.status !== "closest") continue;
      const key = CONFIRM_KEYS[f.field];
      // A closest match on a non-confirmable field can't be resolved — the
      // customer keeps that piece out of the draft rather than us guessing.
      if (!key) continue;
      const pick = typeof confirmations[key] === "string" ? (confirmations[key] as string) : null;
      if (!pick || !f.candidates.some((c) => c.id === pick)) {
        return res.status(400).json({ message: "Please confirm every suggested match before starting." });
      }
      if (f.field === "color") {
        // Candidates were regenerated against the confirmed tier, so this
        // pick is coherent by construction — but verify against the catalog
        // row anyway (fail closed, never a silent swap).
        const c = dest.colors.find((x) => x.id === pick);
        const tierOfColor = c ? dest.tiers.find((t) => t.id === c.tierId) ?? null : null;
        if (!c || !tierOfColor || (confirmedTier && tierOfColor.id !== confirmedTier.id)) {
          return res.status(400).json({ message: "That color isn't available under the selected finish." });
        }
        builderState.colorId = c.id; // press_colors row id — what the builder hydrates
        builderState.colorName = c.name;
        if (!confirmedTier) {
          builderState.colorKind = slugTierKind(tierOfColor.name);
          builderState.colorTierName = tierOfColor.name;
        }
      } else if (f.field === "jacket") {
        // Jacket candidates are the builder's own symbolic style ids.
        builderState.jacketId = pick;
      }
    }
    // Pre-fill means pre-filled: mark the steps the import resolved as done
    // so the builder opens showing the confirmed configuration (the /send
    // gate re-validates everything against live pricing regardless).
    const done: string[] = [];
    if (typeof builderState.sizeId === "string") done.push("size");
    if (typeof builderState.discs === "number") done.push("discs");
    if (typeof builderState.weightId === "string") done.push("weight");
    if (typeof builderState.colorId === "string" && typeof builderState.colorKind === "string") done.push("ctype", "color");
    if (typeof builderState.jacketId === "string") done.push("jacket");
    if (typeof builderState.qty === "number") done.push("qty");
    builderState.done = done;
    const priceHits = findForbiddenPriceKeys(builderState);
    if (priceHits.length) return res.status(400).json({ message: "Invalid selections." });

    const title = project.spec.title ?? gate.customer.displayName ?? "Imported project";
    // Copy canon: the draft never says where the specs came from.
    const payload = {
      builderState,
      source: "customer_import",
      acceptedByCustomerId: gate.customer.id,
      sentTo: gate.customer.email ? [{ email: gate.customer.email }] : [],
      clientName: gate.customer.displayName ?? null,
      customerImport: true,
    };
    const inserted = await db
      .insert(pressEstimates)
      .values({
        pressId: gate.press.id,
        kind: "estimate",
        title,
        status: "Draft",
        payload,
      })
      .returning({ id: pressEstimates.id });
    res.json({ ok: true, estimateId: inserted[0].id });
  });

  // ── Masters-release request (customer → SOURCE press) ─────────────────
  // Routed to the source press as a normal inbound request from its own
  // customer; the row carries no destination information at all. One open
  // request per project. No notification fan-out (customer-initiated wall).
  app.post("/api/press-client/masters-release-request", async (req, res) => {
    const gate = await importGate(req, res);
    if (!gate) return;
    const projectId = String(req.body?.projectId ?? "");
    const note = typeof req.body?.note === "string" ? req.body.note.slice(0, 2000) : null;
    const projects = await enumerateCustomerProjects(gate.customer);
    const project = projects.find((p) => p.key === projectId && p.pressId !== gate.press.id);
    if (!project) return res.status(404).json({ message: "Project not found." });
    const sourceRef = project.spec.sourceRef;
    const existing = await db.execute<any>(sql`
      SELECT id, status FROM masters_release_requests
      WHERE customer_user_id = ${gate.customer.id}
        AND source_ref->>'kind' = ${sourceRef.kind} AND source_ref->>'id' = ${sourceRef.id}
        AND status IN ('requested','acknowledged')
      LIMIT 1
    `);
    const dup = ((existing as any).rows ?? [])[0];
    if (dup) return res.json({ ok: true, id: dup.id, status: dup.status, alreadyRequested: true });
    const inserted = await db
      .insert(mastersReleaseRequests)
      .values({
        pressId: project.pressId, // the SOURCE press — its own customer asking
        customerUserId: gate.customer.id,
        projectTitle: project.spec.title,
        sourceRef: { kind: sourceRef.kind, id: sourceRef.id },
        note,
        status: "requested",
      })
      .returning({ id: mastersReleaseRequests.id });
    res.json({ ok: true, id: inserted[0].id, status: "requested" });
  });

  // The customer's own masters-release requests (status only; copy never
  // names presses — "your previous press").
  app.get("/api/press-client/masters-release-requests", async (req, res) => {
    // Same wall as every other import surface: customer auth + a white-label
    // destination press whose import flag is ON. Held OFF = this endpoint
    // does not exist (404), even for the customer's own rows.
    const gate = await importGate(req, res);
    if (!gate) return;
    const rows = await db.execute<any>(sql`
      SELECT id, project_title, status, created_at, decided_at
      FROM masters_release_requests
      WHERE customer_user_id = ${gate.customer.id}
      ORDER BY created_at DESC
      LIMIT 50
    `);
    sendPriceFree(res, {
      requests: (((rows as any).rows ?? []) as any[]).map((r) => ({
        id: r.id,
        projectTitle: r.project_title ?? null,
        status: r.status,
        requestedAt: r.created_at ? new Date(r.created_at).toISOString() : null,
        decidedAt: r.decided_at ? new Date(r.decided_at).toISOString() : null,
      })),
    });
  });

  // ── Press-side: inbound masters-release requests ───────────────────────
  // The press sees ONLY requests from its own customers, with no hint of a
  // destination (the table has no destination column by design).
  //
  // Held OFF applies here too: both press-side endpoints 404 unless THIS
  // press's own cross_press_import_enabled flag is on, so while the feature
  // is held (and after a disable) the whole flow — including its inbox — is
  // withdrawn, not just the customer legs.
  const pressImportFlagOn = async (pressId: string): Promise<boolean> => {
    const r = await db.execute<any>(sql`
      SELECT cross_press_import_enabled FROM manufacturers WHERE id = ${pressId} LIMIT 1
    `);
    return ((r as any).rows ?? [])[0]?.cross_press_import_enabled === true;
  };

  app.get("/api/press/:id/masters-release-requests", requireAdmin, requirePressScope, async (req: Request, res: Response) => {
    const pressId = String(req.params.id);
    if (!(await pressImportFlagOn(pressId))) return res.status(404).json(FLAG_OFF_404);
    const rows = await db.execute<any>(sql`
      SELECT r.id, r.project_title, r.note, r.status, r.created_at, r.decided_at,
             cu.display_name AS customer_name, cu.email AS customer_email
      FROM masters_release_requests r
      LEFT JOIN customer_users cu ON cu.id = r.customer_user_id
      WHERE r.press_id = ${pressId}
      ORDER BY r.created_at DESC
      LIMIT 200
    `);
    res.json({
      requests: (((rows as any).rows ?? []) as any[]).map((r) => ({
        id: r.id,
        projectTitle: r.project_title ?? null,
        note: r.note ?? null,
        status: r.status,
        customerName: r.customer_name ?? null,
        customerEmail: r.customer_email ?? null,
        requestedAt: r.created_at ? new Date(r.created_at).toISOString() : null,
        decidedAt: r.decided_at ? new Date(r.decided_at).toISOString() : null,
      })),
    });
  });

  // Status update (acknowledged / released / declined). Editor-gated like
  // every other press-portal mutation.
  //
  // FEE STUB (deliberate, Bill's open question): whether a press can CHARGE
  // for a masters release is unresolved. masters_release_requests.release_fee_cents
  // exists as the attach point, but this route accepts NO fee input and
  // nothing bills it. Do not build the payment leg without a ruling.
  app.put("/api/press/:id/masters-release-requests/:reqId", requireAdmin, requirePressScope, async (req: Request, res: Response) => {
    const pressId = String(req.params.id);
    if (!(await pressImportFlagOn(pressId))) return res.status(404).json(FLAG_OFF_404);
    const { pressUserCanEdit } = await import("./auth/partnerPermissions");
    const callerId = ((req as any).adminUserId as string | undefined) ?? (req as any).session?.userId;
    const canEdit = callerId ? await pressUserCanEdit(callerId, pressId) : false;
    if (!canEdit) return res.status(403).json({ message: "Only an Owner/Admin can update masters requests." });
    const status = String(req.body?.status ?? "");
    if (!(MASTERS_RELEASE_STATUSES as readonly string[]).includes(status) || status === "requested") {
      return res.status(400).json({ message: "Invalid status." });
    }
    const rows = await db
      .select()
      .from(mastersReleaseRequests)
      .where(and(eq(mastersReleaseRequests.id, String(req.params.reqId)), eq(mastersReleaseRequests.pressId, pressId)))
      .limit(1);
    if (!rows[0]) return res.status(404).json({ message: "Request not found." });
    const decided = status === "released" || status === "declined";
    await db
      .update(mastersReleaseRequests)
      .set({ status, updatedAt: new Date(), ...(decided ? { decidedAt: new Date() } : {}) })
      .where(eq(mastersReleaseRequests.id, rows[0].id));
    res.json({ ok: true, status });
  });

  // ── Operator god-view: canonical mapping review ────────────────────────
  // requireAdmin admits ALL partner accounts (house landmine), so these
  // routes fail CLOSED to platform staff via the raw users.role check.
  const requirePlatformStaff = async (req: Request, res: Response, next: any) => {
    const callerId = ((req as any).adminUserId as string | undefined) ?? (req as any).session?.userId;
    if (!callerId) return res.status(401).json({ message: "Unauthorized" });
    const r = await db.execute<any>(sql`SELECT role FROM users WHERE id = ${callerId} LIMIT 1`);
    const role = ((r as any).rows ?? [])[0]?.role;
    if (role !== "super_admin" && role !== "admin") {
      return res.status(403).json({ message: "Operators only." });
    }
    next();
  };

  app.get("/api/admin/presses/:id/canonical-mappings", requireAdmin, requirePlatformStaff, async (req: Request, res: Response) => {
    const pressId = String(req.params.id);
    const [tRows, jRows] = await Promise.all([
      db.select().from(pressColorTiers).where(eq(pressColorTiers.pressId, pressId)),
      db.select().from(pressJackets).where(eq(pressJackets.pressId, pressId)),
    ]);
    const liveTiers = tRows.filter((t) => !(t as any).archivedAt);
    const cRows = liveTiers.length
      ? await db.select().from(pressColors).where(inArray(pressColors.tierId, liveTiers.map((t) => t.id)))
      : [];
    res.json({
      vocab: {
        effectFamilies: CANONICAL_EFFECT_FAMILIES,
        colorFamilies: CANONICAL_COLOR_FAMILIES,
        jacketConstructions: CANONICAL_JACKET_CONSTRUCTIONS,
      },
      tiers: liveTiers.map((t) => ({
        id: t.id,
        name: t.name,
        format: t.format,
        derived: deriveEffectFamily(t.name),
        stored: ((t as any).canonicalAttrs ?? null) as { effectFamily?: string; confirmed?: boolean } | null,
      })),
      colors: cRows
        .filter((c) => !(c as any).archivedAt)
        .map((c) => ({
          id: c.id,
          tierId: c.tierId,
          name: c.name,
          derived: deriveColorFamily(c.name, c.swatchHex),
          stored: ((c as any).canonicalAttrs ?? null) as { colorFamily?: string; confirmed?: boolean } | null,
        })),
      jackets: jRows.map((j) => ({
        id: j.id,
        name: j.name,
        derived: deriveJacketConstruction(j.name),
        stored: ((j as any).canonicalAttrs ?? null) as { construction?: string; confirmed?: boolean } | null,
      })),
    });
  });

  app.put("/api/admin/presses/:id/canonical-mappings", requireAdmin, requirePlatformStaff, async (req: Request, res: Response) => {
    const pressId = String(req.params.id);
    const body = req.body ?? {};
    const tiers = Array.isArray(body.tiers) ? body.tiers : [];
    const colors = Array.isArray(body.colors) ? body.colors : [];
    const jackets = Array.isArray(body.jackets) ? body.jackets : [];
    for (const t of tiers) {
      const id = String(t?.id ?? "");
      if (!id) continue;
      const fam = t?.effectFamily == null ? null : String(t.effectFamily);
      if (fam != null && !(CANONICAL_EFFECT_FAMILIES as readonly string[]).includes(fam)) {
        return res.status(400).json({ message: `Unknown effect family "${fam}".` });
      }
      await db.execute(sql`
        UPDATE press_color_tiers
        SET canonical_attrs = ${fam == null ? null : JSON.stringify({ effectFamily: fam, confirmed: true })}::jsonb
        WHERE id = ${id} AND press_id = ${pressId}
      `);
    }
    for (const c of colors) {
      const id = String(c?.id ?? "");
      if (!id) continue;
      const fam = c?.colorFamily == null ? null : String(c.colorFamily);
      if (fam != null && !(CANONICAL_COLOR_FAMILIES as readonly string[]).includes(fam)) {
        return res.status(400).json({ message: `Unknown color family "${fam}".` });
      }
      await db.execute(sql`
        UPDATE press_colors c
        SET canonical_attrs = ${fam == null ? null : JSON.stringify({ colorFamily: fam, confirmed: true })}::jsonb
        FROM press_color_tiers t
        WHERE c.id = ${id} AND c.tier_id = t.id AND t.press_id = ${pressId}
      `);
    }
    for (const j of jackets) {
      const id = String(j?.id ?? "");
      if (!id) continue;
      const cons = j?.construction == null ? null : String(j.construction);
      if (cons != null && !(CANONICAL_JACKET_CONSTRUCTIONS as readonly string[]).includes(cons)) {
        return res.status(400).json({ message: `Unknown construction "${cons}".` });
      }
      await db.execute(sql`
        UPDATE press_jackets
        SET canonical_attrs = ${cons == null ? null : JSON.stringify({ construction: cons, confirmed: true })}::jsonb
        WHERE id = ${id} AND press_id = ${pressId}
      `);
    }
    res.json({ ok: true });
  });

  // ── GoodTunes-side "My projects" cross-press view ──────────────────────
  // Flag-gated OFF at compile time; must NEVER serve on a white-label host
  // (this is the one non-press-branded surface, so it MAY name presses —
  // it is the customer's own account view). While the flag is false this
  // route is indistinguishable from "not found".
  app.get("/api/customer/cross-press-projects", async (req, res) => {
    if (!CROSS_PRESS_MY_PROJECTS_ENABLED) return res.status(404).json(FLAG_OFF_404);
    if (await onWhitelabelRequest(req)) return res.status(404).json(FLAG_OFF_404);
    const customer = await resolveCustomer(req);
    if (!customer) return res.status(401).json({ message: "Unauthorized" });
    const projects = await enumerateCustomerProjects(customer);
    sendPriceFree(res, {
      projects: projects.map((p) => ({
        ...portalProjectSummary(p),
        // Non-press-branded surface: naming the press the CUSTOMER worked
        // with is their own account data, not a cross-press leak.
        pressName: p.pressName,
      })),
    });
  });
}
