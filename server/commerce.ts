// Task #44 — Bundle Checkout backend.
//
// One module owning: per-album SKU + add-on CRUD, the email-verification
// 6-digit-code signup gate, Stripe embedded Checkout session creation, the
// webhook handler that unlocks the album + writes the Order, refund
// handling that reverses the unlock + voids the GoodDeed number, and
// fan/admin order reads.
//
// The webhook handler is mounted on a raw-body route in server/index.ts
// (the JSON body parser runs everywhere else but is skipped for
// /api/webhooks/stripe so Stripe's signature can verify against the
// exact bytes Stripe sent). Every write keyed off Stripe is idempotent
// — replays don't double-unlock or double-charge.
import type { Express, Request, Response } from "express";
import { randomBytes, scrypt as _scrypt, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { db } from "./db";
import {
  albums,
  albumSkus,
  albumAddons,
  payoutFormatCosts,
  pressFormatCosts,
  orders,
  orderItems,
  signedCertReservations,
  customerUsers,
  emailVerifications,
  userAlbums,
  authTokens,
  signupVerifyTokens,
  gifts,
  ALBUM_FORMATS,
  ALBUM_FORMAT_LABEL,
  ALBUM_ADDON_KINDS,
  ALBUM_ADDON_LABEL,
  type AlbumFormat,
  type AlbumAddonKind,
  type StripeAddressSnapshot,
  type AlbumSku,
  type AlbumAddon,
  type Order,
  type OrderItem,
} from "@shared/schema";
import {
  lookupHellbenderUnitCents,
  snapToQuantityTier,
  isVinylFormat,
  VINYL_COLOR_BY_ID,
  DEFAULT_VINYL_COLOR_ID,
  DEFAULT_VINYL_QUANTITY,
  DEFAULT_JACKET_UPGRADE,
  type VinylColorTier,
  type JacketUpgrade,
} from "@shared/pressing";
import {
  registerPressCatalogRoutes,
  getPressCatalog,
  lookupCatalogUnitCents,
  seedHellbenderCatalog,
} from "./pressCatalog";
import { registerPressPortalRoutes } from "./pressPortal";
import { and, asc, desc, eq, inArray, or, sql } from "drizzle-orm";
import { z } from "zod";
import { storage } from "./storage";
import { getStripe, getStripePublishableKey, getStripeWebhookSecret } from "./stripe";
import type Stripe from "stripe";

const scrypt = promisify(_scrypt);

// ─── Helpers ──────────────────────────────────────────────────────────

// Exported so the admin email-OTP routes (Task #57) can reuse the same
// scrypt envelope — keeps "what an OTP hash looks like in our DB" in one
// place. Anywhere we store a short numeric code, this is how we hash it.
export async function hashCode(code: string): Promise<string> {
  const salt = randomBytes(16);
  const buf = (await scrypt(code, salt, 32)) as Buffer;
  return `${salt.toString("hex")}:${buf.toString("hex")}`;
}
export async function verifyCode(code: string, stored: string): Promise<boolean> {
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");
  const actual = (await scrypt(code, salt, 32)) as Buffer;
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function generateSixDigitCode(): string {
  // 100000–999999. We avoid leading-zero codes so the fan never has to
  // count zeros — Apple/Google/Stripe all do the same.
  return String(100000 + Math.floor(Math.random() * 900000));
}
function generateToken(): string {
  return randomBytes(32).toString("hex");
}
function normalizeEmail(e: string): string {
  return String(e).trim().toLowerCase();
}
function isValidEmail(e: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);
}

// Username suggestion from email local-part. Filters to a–z/0–9/_ and
// trims to 20 chars. The /welcome screen lets the fan accept or change.
function suggestUsernameFromEmail(email: string): string {
  const local = email.split("@")[0] ?? "";
  return local.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 20) || `fan${Math.floor(Math.random() * 10000)}`;
}

// Pick a unique username — if the suggestion collides we suffix a 4-digit
// random until we find a free one. Cheap because customer_users has a
// unique index on username so collisions are rare.
async function pickUniqueUsername(seed: string): Promise<string> {
  let candidate = seed;
  for (let i = 0; i < 6; i++) {
    const existing = await storage.getCustomerByUsername(candidate);
    if (!existing) return candidate;
    candidate = `${seed.slice(0, 16)}${Math.floor(Math.random() * 10000)}`.slice(0, 20);
  }
  return `${seed.slice(0, 12)}${Date.now().toString(36).slice(-6)}`;
}

function addressFromStripe(a: Stripe.Address | null | undefined, name: string | null | undefined): StripeAddressSnapshot | null {
  if (!a && !name) return null;
  return {
    name: name ?? null,
    line1: a?.line1 ?? null,
    line2: a?.line2 ?? null,
    city: a?.city ?? null,
    state: a?.state ?? null,
    postalCode: a?.postal_code ?? null,
    country: a?.country ?? null,
  };
}

// ─── Storage layer (kept inline — these tables are isolated from IStorage) ─

async function listActiveSkus(albumId: string): Promise<AlbumSku[]> {
  return db
    .select()
    .from(albumSkus)
    .where(and(eq(albumSkus.albumId, albumId), eq(albumSkus.active, true)))
    .orderBy(asc(albumSkus.position), asc(albumSkus.format));
}
async function listAllSkus(albumId: string): Promise<AlbumSku[]> {
  return db.select().from(albumSkus).where(eq(albumSkus.albumId, albumId)).orderBy(asc(albumSkus.position), asc(albumSkus.format));
}
async function listActiveAddons(albumId: string): Promise<AlbumAddon[]> {
  return db
    .select()
    .from(albumAddons)
    .where(and(eq(albumAddons.albumId, albumId), eq(albumAddons.active, true)))
    .orderBy(asc(albumAddons.position));
}
async function listAllAddons(albumId: string): Promise<AlbumAddon[]> {
  return db.select().from(albumAddons).where(eq(albumAddons.albumId, albumId)).orderBy(asc(albumAddons.position));
}

async function upsertSku(input: {
  albumId: string;
  format: AlbumFormat;
  priceCents: number;
  stock: number | null;
  active: boolean;
  plannedQuantity: number | null;
  displayName: string | null;
  costSnapshotManufacturingCents: number;
  costSnapshotPublishingCents: number;
  costSnapshotPaymentProcessingCents: number;
  costSnapshotGoodtunesCents: number;
  // Task #423 — snapshot of album.songs.length at save time so the
  // Publishing line (trackCount × mechanicals) stays stable until the
  // artist re-saves the row.
  costSnapshotTrackCount: number | null;
  // Task #200
  vinylColor: string | null;
  vinylColorTier: VinylColorTier | null;
  jacketUpgrade: JacketUpgrade | null;
  quantityTier: number | null;
  costSource: string;
  // Task #433 — per-row Lock. `undefined` = leave existing value alone
  // (no-op on conflict update); `Date` = lock; `null` = unlock.
  lockedAt?: Date | null;
}): Promise<AlbumSku> {
  const setOnConflict: Record<string, unknown> = {
    priceCents: input.priceCents,
    stock: input.stock,
    active: input.active,
    plannedQuantity: input.plannedQuantity,
    displayName: input.displayName,
    costSnapshotManufacturingCents: input.costSnapshotManufacturingCents,
    costSnapshotPublishingCents: input.costSnapshotPublishingCents,
    costSnapshotPaymentProcessingCents: input.costSnapshotPaymentProcessingCents,
    costSnapshotGoodtunesCents: input.costSnapshotGoodtunesCents,
    costSnapshotTrackCount: input.costSnapshotTrackCount,
    vinylColor: input.vinylColor,
    vinylColorTier: input.vinylColorTier,
    jacketUpgrade: input.jacketUpgrade,
    quantityTier: input.quantityTier,
    costSource: input.costSource,
  };
  const insertValues: Record<string, unknown> = { ...input };
  if (input.lockedAt === undefined) {
    delete insertValues.lockedAt;
  } else {
    setOnConflict.lockedAt = input.lockedAt;
  }
  const [row] = await db
    .insert(albumSkus)
    .values(insertValues as typeof albumSkus.$inferInsert)
    .onConflictDoUpdate({
      target: [albumSkus.albumId, albumSkus.format],
      set: setOnConflict,
    })
    .returning();
  return row;
}

// Task #194 — Platform per-format cost defaults. Seed lazily on first
// read so fresh DBs don't need a separate migration step. Mirrors
// `getPayoutSettings()` in server/payouts.ts.
const FORMAT_COST_DEFAULTS: Record<string, {
  manufacturingCents: number;
  publishingCents: number;
  paymentProcessingCents: number;
  goodtunesCents: number;
}> = {
  "7_inch": { manufacturingCents: 1000, publishingCents: 34, paymentProcessingCents: 130, goodtunesCents: 450 },
  "12_lp": { manufacturingCents: 0, publishingCents: 0, paymentProcessingCents: 0, goodtunesCents: 0 },
  "12_double": { manufacturingCents: 0, publishingCents: 0, paymentProcessingCents: 0, goodtunesCents: 0 },
  "cassette": { manufacturingCents: 0, publishingCents: 0, paymentProcessingCents: 0, goodtunesCents: 0 },
  "cd": { manufacturingCents: 0, publishingCents: 0, paymentProcessingCents: 0, goodtunesCents: 0 },
};
async function getFormatCost(format: AlbumFormat) {
  const [row] = await db.select().from(payoutFormatCosts).where(eq(payoutFormatCosts.format, format));
  if (row) return row;
  const defaults = FORMAT_COST_DEFAULTS[format] ?? {
    manufacturingCents: 0, publishingCents: 0, paymentProcessingCents: 0, goodtunesCents: 0,
  };
  const [inserted] = await db
    .insert(payoutFormatCosts)
    .values({ format, ...defaults })
    .onConflictDoNothing()
    .returning();
  if (inserted) return inserted;
  const [again] = await db.select().from(payoutFormatCosts).where(eq(payoutFormatCosts.format, format));
  return again!;
}
async function listFormatCosts() {
  // Ensure every known format is present so the admin SellPanel can
  // render a row per format without per-format network errors.
  await Promise.all(ALBUM_FORMATS.map((f) => getFormatCost(f)));
  return db.select().from(payoutFormatCosts);
}
async function upsertAddon(input: {
  albumId: string;
  kind: AlbumAddonKind;
  priceCents: number;
  minPriceCents: number;
  active: boolean;
  costCentsSnapshot: number | null;
  plannedQuantity: number | null;
}): Promise<AlbumAddon> {
  const [row] = await db
    .insert(albumAddons)
    .values(input)
    .onConflictDoUpdate({
      target: [albumAddons.albumId, albumAddons.kind],
      set: {
        priceCents: input.priceCents,
        minPriceCents: input.minPriceCents,
        active: input.active,
        costCentsSnapshot: input.costCentsSnapshot,
        plannedQuantity: input.plannedQuantity,
      },
    })
    .returning();
  return row;
}

// Task #122 — Count signed certificates already claimed for an album.
// "Claimed" = paid (or shipped) order_items + active pending reservations
// (Stripe Checkout sessions we minted in the last 30 minutes that haven't
// resolved yet). Refunded orders flip status to "refunded" so they
// naturally drop out — the slot frees back up for the next buyer.
// Powers the soft cap on the Buy sheet and the race-tight check at
// session creation; counting *active* reservations is what closes the
// boundary race between two simultaneous buyers.
//
// Pass an optional Drizzle transaction so the session-creation path can
// run the count inside the same advisory-locked transaction it'll use
// to insert its own reservation.
async function countSignedCertsClaimed(
  albumId: string,
  tx: typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0] = db,
): Promise<number> {
  const [paidRow] = await tx
    .select({ n: sql<number>`COALESCE(SUM(${orderItems.quantity}), 0)` })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(
      and(
        eq(orders.albumId, albumId),
        inArray(orders.status, ["paid", "shipped"]),
        eq(orderItems.kind, "addon"),
        eq(orderItems.sku, "signed_cert"),
      ),
    );
  const [pendingRow] = await tx
    .select({ n: sql<number>`COUNT(*)` })
    .from(signedCertReservations)
    .where(
      and(
        eq(signedCertReservations.albumId, albumId),
        sql`${signedCertReservations.expiresAt} > NOW()`,
      ),
    );
  return Number(paidRow?.n ?? 0) + Number(pendingRow?.n ?? 0);
}

async function getOrderBySessionId(sessionId: string): Promise<Order | undefined> {
  const [row] = await db.select().from(orders).where(eq(orders.stripeCheckoutSessionId, sessionId));
  return row;
}
async function getOrderById(id: string): Promise<Order | undefined> {
  const [row] = await db.select().from(orders).where(eq(orders.id, id));
  return row;
}
// Task #201 — extend the wire shape with the vinyl pressing snapshot so
// fan-side surfaces (Welcome, Orders, Library) can render <VinylPreview>
// in the exact color the artist picked. Snapshot fields live directly
// on order_items (written at materialize-time) so a later artist edit
// to album_skus can never rewrite an existing receipt. For historical
// rows written before the snapshot column existed, we fall back to
// looking up the current SKU; if even that is gone the fan-side render
// falls back to DEFAULT_VINYL_COLOR_ID ("black").
type OrderItemWithVinyl = OrderItem & {
  vinylColor: string | null;
  jacketUpgrade: JacketUpgrade | null;
};
async function getOrderItems(orderId: string): Promise<OrderItemWithVinyl[]> {
  const rows = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId)).orderBy(asc(orderItems.createdAt));
  if (rows.length === 0) return [];
  // Fast path: every vinyl-format row already has its snapshot. Skip
  // the album_skus join entirely.
  const needsFallback = rows.some(
    (r) => r.kind === "format" && r.vinylColor == null,
  );
  if (!needsFallback) {
    return rows.map((r) => ({
      ...r,
      vinylColor: r.vinylColor ?? null,
      jacketUpgrade: (r.jacketUpgrade as JacketUpgrade | null) ?? null,
    }));
  }
  // Legacy fallback: pull current SKU pressing picks for the parent
  // album so old paid orders still render *something* sensible.
  const [order] = await db.select({ albumId: orders.albumId }).from(orders).where(eq(orders.id, orderId));
  const skuRows = order
    ? await db
        .select({ format: albumSkus.format, vinylColor: albumSkus.vinylColor, jacketUpgrade: albumSkus.jacketUpgrade })
        .from(albumSkus)
        .where(eq(albumSkus.albumId, order.albumId))
    : [];
  const skuByFormat = new Map(skuRows.map((s) => [s.format, s]));
  return rows.map((r) => {
    if (r.kind !== "format") return { ...r, vinylColor: null, jacketUpgrade: null };
    if (r.vinylColor != null) {
      return {
        ...r,
        vinylColor: r.vinylColor,
        jacketUpgrade: (r.jacketUpgrade as JacketUpgrade | null) ?? null,
      };
    }
    const sku = skuByFormat.get(r.sku as any);
    return {
      ...r,
      vinylColor: sku?.vinylColor ?? null,
      jacketUpgrade: (sku?.jacketUpgrade as JacketUpgrade | null) ?? null,
    };
  });
}

// Assigns the next per-album GoodDeed number atomically. We rank by
// paid-order count for the album so numbers stay dense; voided
// (refunded) numbers are reused only if no later number was minted.
// For simplicity in this v1 we use `max(goodDeedNumber)+1` per album,
// which is monotonic — refunds leave gaps. Acceptable trade-off vs.
// the user-confusing "your number changed" problem.
async function assignNextGoodDeedNumber(albumId: string): Promise<number> {
  // Floor = max(goodDeedNumber across paid orders, certificateNumber
  // across owned user_albums). The user_albums leg matters because the
  // gogoods.com importer (Task #398) stamps the legacy collectible
  // index into `user_albums.certificateNumber` for owned-but-no-paid-
  // order rows; without considering it here we could mint a duplicate
  // GoodDeed number on the next real sale.
  const [row] = await db.execute(sql<{ max: number }>`
    SELECT GREATEST(
      COALESCE((SELECT MAX(${orders.goodDeedNumber}) FROM ${orders} WHERE ${orders.albumId} = ${albumId}), 0),
      COALESCE((SELECT MAX(${userAlbums.certificateNumber}) FROM ${userAlbums} WHERE ${userAlbums.albumId} = ${albumId}), 0)
    ) AS max
  `);
  return Number((row as any)?.max ?? 0) + 1;
}

// ─── Stripe Customer / address backfill ───────────────────────────────
async function backfillCustomerFromStripe(opts: {
  customerId: string;
  stripeCustomerId: string;
  buyerName: string | null;
  buyerPhone: string | null;
  billing: StripeAddressSnapshot | null;
  shipping: StripeAddressSnapshot | null;
}) {
  const existing = await storage.getCustomer(opts.customerId);
  if (!existing) return;
  const updates: Partial<typeof existing> = {
    stripeCustomerId: opts.stripeCustomerId,
    billingAddress: opts.billing ?? existing.billingAddress,
    shippingAddress: opts.shipping ?? existing.shippingAddress,
    phone: opts.buyerPhone ?? existing.phone,
  };
  // realName backfill: prefer Stripe's legal name. We never overwrite a
  // realName the fan typed themselves (so an existing customer profile
  // stays intact); only fill it in when it's blank.
  if (opts.buyerName && !existing.realName) updates.realName = opts.buyerName;
  await storage.updateCustomer(opts.customerId, updates);
}

// ─── Route registrar ──────────────────────────────────────────────────
export function registerCommerceRoutes(app: Express) {
  // ─── Public catalog reads ────────────────────────────────────────
  // GET /api/albums/:id/buy-options — what the fan-side Buy sheet renders.
  // Returns active SKUs and active add-ons. Hidden / inactive rows never
  // leak; the admin endpoint below returns the full list for editing.
  app.get("/api/albums/:id/buy-options", async (req, res) => {
    const album = await storage.getAlbumById(req.params.id);
    if (!album) return res.status(404).json({ message: "Album not found" });
    const [skus, addons] = await Promise.all([
      listActiveSkus(album.id),
      listActiveAddons(album.id),
    ]);
    // Task #122 — soft cap: if the signed_cert add-on has a fixed planned
    // quantity and that many paid certs already exist, flip the
    // signedCertSoldOut flag so the Buy sheet disables the toggle.
    const signedCert = addons.find((a) => a.kind === "signed_cert") ?? null;
    let signedCertSoldOut = false;
    if (signedCert && signedCert.plannedQuantity != null) {
      const claimed = await countSignedCertsClaimed(album.id);
      signedCertSoldOut = claimed >= signedCert.plannedQuantity;
    }
    res.json({
      albumId: album.id,
      title: album.title,
      artist: album.artist,
      artwork: album.artwork,
      currency: "usd",
      skus: skus.map((s) => ({
        id: s.id,
        format: s.format,
        label: ALBUM_FORMAT_LABEL[s.format as AlbumFormat] ?? s.format,
        priceCents: s.priceCents,
        stock: s.stock,
        soldOut: s.stock !== null && s.stock <= 0,
        // Task #201 — fan-side BuySheet renders <VinylPreview> against
        // these picks. Non-vinyl SKUs leave both fields null and the UI
        // falls back to the format label only.
        vinylColor: s.vinylColor ?? null,
        jacketUpgrade: (s.jacketUpgrade as JacketUpgrade | null) ?? null,
      })),
      addons: addons.map((a) => ({
        id: a.id,
        kind: a.kind,
        label: ALBUM_ADDON_LABEL[a.kind as AlbumAddonKind] ?? a.kind,
        priceCents: a.priceCents,
        minPriceCents: a.minPriceCents,
      })),
      signedCertSoldOut,
    });
  });

  // GET /api/checkout/publishable-key — the browser fetches this to boot
  // Stripe.js. Lives behind the connector so the key isn't hardcoded.
  app.get("/api/checkout/publishable-key", async (_req, res) => {
    try {
      const key = await getStripePublishableKey();
      res.json({ publishableKey: key });
    } catch (e: any) {
      res.status(503).json({ message: e?.message ?? "Stripe not configured" });
    }
  });

  // ─── Admin: SKU + add-on CRUD ────────────────────────────────────
  // Mirrors the rest of the admin schema — admin bearer required.
  const requireAdmin = async (req: Request, res: Response, next: () => void) => {
    const auth = req.headers.authorization;
    if (!auth?.startsWith("Bearer ")) return res.status(401).json({ message: "Unauthorized" });
    const a = await storage.getAuthBy(auth.slice(7));
    if (!a || a.kind !== "admin") return res.status(401).json({ message: "Unauthorized" });
    const u = await storage.getUser(a.userId);
    if (!u?.isAdmin) return res.status(403).json({ message: "Forbidden" });
    (req as any).adminUserId = a.userId;
    next();
  };

  app.get("/api/admin/albums/:id/skus", requireAdmin, async (req, res) => {
    const albumId = String(req.params.id);
    const skus = await listAllSkus(albumId);
    const addons = await listAllAddons(albumId);
    res.json({ skus, addons });
  });

  const skuBodySchema = z.object({
    format: z.enum(ALBUM_FORMATS),
    priceCents: z.number().int().min(0),
    stock: z.number().int().min(0).nullable().optional(),
    active: z.boolean().default(true),
    // Task #194 — null/omitted = "as many as will sell"; positive int =
    // planned run size.
    plannedQuantity: z.number().int().min(1).nullable().optional(),
    // Task #200 — legacy vinyl picks. Kept for back-compat with rows
    // saved before T218; new rows use the catalog ids below.
    vinylColor: z.string().optional().nullable(),
    jacketUpgrade: z.enum(["none", "insert", "gatefold", "gatefold_insert"]).optional().nullable(),
    // Task #218 — catalog picks. When present + the album's invited
    // press has a catalog, the SKU's Manufacturing cost is taken from
    // the picked tier's price ladder (snapped by plannedQuantity).
    // `pressTierId` is the catalog tier row (carries the ladder);
    // `pressColorId` is the picked color inside that tier (display
    // only — snapshotted onto album_skus.vinylColor as the name).
    pressTierId: z.string().optional().nullable(),
    pressColorId: z.string().optional().nullable(),
    // Task #397 — artist-edited row label. Empty string normalises to
    // NULL so the read path falls back to the canonical format label.
    displayName: z.string().max(120).optional().nullable(),
    // Task #423 — current album track count as seen by the client at
    // save time. Persisted on the SKU so the Publishing line stops
    // shifting when the artist later adds or removes songs. Optional /
    // nullable for back-compat with clients that haven't been updated.
    trackCount: z.number().int().min(0).nullable().optional(),
    // Task #433 — per-row Lock. Omitted = preserve existing lock state
    // (don't accidentally unlock on every Save). true/false = explicit
    // toggle from the row's Lock/Unlock icon. Unlock once a pressing
    // order has been approved is rejected with 409 below.
    locked: z.boolean().optional(),
  });
  app.put("/api/admin/albums/:id/skus/:format", requireAdmin, async (req, res) => {
    const album = await storage.getAlbumById(String(req.params.id), { includeHidden: true });
    if (!album) return res.status(404).json({ message: "Album not found" });
    const parsed = skuBodySchema.safeParse({ ...req.body, format: String(req.params.format) });
    if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid SKU" });
    // Task #218 — Manufacturing cost is taken from the album's invited
    // press's catalog (per-tier price ladder, snapped by quantity).
    // Publishing / payment-processing / GoodTunes-margin still come
    // from the platform `payout_format_costs` row (now edited on the
    // super-admin Platform Pricing page). Falls back to the platform
    // manufacturing placeholder when no catalog row exists (e.g.
    // non-invited artist, or a press without a catalog yet).
    const platformCost = await getFormatCost(parsed.data.format);
    const vinyl = isVinylFormat(parsed.data.format);
    let manufacturingCents = platformCost.manufacturingCents;
    let costSource = "placeholder";
    let vinylColorId: string | null = null;
    let vinylColorTier: string | null = null;
    let jacketUpgrade: JacketUpgrade | null = null;
    let quantityTier: number | null = null;

    if (parsed.data.pressTierId) {
      // Resolve the press for this album (artist invitedByPressId →
      // label invitedByPressId), then look up the catalog row.
      let pressId: string | null = null;
      if (album.primaryArtistId) {
        const p = await storage.getPersonById(album.primaryArtistId);
        if (p && (p as any).invitedByPressId) pressId = String((p as any).invitedByPressId);
      }
      if (!pressId && album.labelId) {
        const l = await storage.getLabelById(album.labelId);
        if (l && (l as any).invitedByPressId) pressId = String((l as any).invitedByPressId);
      }
      if (pressId) {
        const looked = await lookupCatalogUnitCents({
          pressId,
          format: parsed.data.format,
          tierId: parsed.data.pressTierId,
          colorId: parsed.data.pressColorId ?? null,
          quantity: parsed.data.plannedQuantity ?? null,
        });
        if (looked) {
          manufacturingCents = looked.unitCents;
          costSource = "catalog";
          vinylColorTier = looked.tierName;
          vinylColorId = looked.colorName; // snapshot as display name
          quantityTier = looked.snappedQty;
        }
      }
    }

    if (costSource === "placeholder" && vinyl) {
      // Back-compat: rows still posting the pre-T218 vinyl picks fall
      // through to the legacy Hellbender matrix so an existing SKU can
      // re-save without errors while the SellPanel rolls over.
      const colorOption =
        (parsed.data.vinylColor && VINYL_COLOR_BY_ID[parsed.data.vinylColor]) ||
        VINYL_COLOR_BY_ID[DEFAULT_VINYL_COLOR_ID];
      vinylColorId = colorOption.id;
      vinylColorTier = colorOption.tier;
      jacketUpgrade = parsed.data.jacketUpgrade ?? DEFAULT_JACKET_UPGRADE;
      const snap = snapToQuantityTier(parsed.data.plannedQuantity ?? DEFAULT_VINYL_QUANTITY);
      quantityTier = snap.tier;
      const looked = lookupHellbenderUnitCents({
        format: parsed.data.format,
        colorTier: colorOption.tier,
        qtyTier: snap.tier,
        jacketUpgrade,
      });
      if (looked !== null) {
        manufacturingCents = looked;
        costSource = "hellbender";
      }
    }
    // Task #433 — per-row Lock semantics. Reject unlock once the run
    // has actually gone to press (pressing_order_requests with status
    // 'approved'). Lock is always allowed; same direction as the
    // album-level Quote lock CTA, just at row granularity.
    let lockedAt: Date | null | undefined = undefined;
    if (parsed.data.locked !== undefined) {
      if (parsed.data.locked === false) {
        const latest = await storage.getLatestPressingOrderRequestForAlbum(album.id);
        if (latest?.status === "approved") {
          return res.status(409).json({
            message: "This run is already at the press — rows can't be unlocked.",
          });
        }
      }
      lockedAt = parsed.data.locked ? new Date() : null;
    }
    const row = await upsertSku({
      albumId: album.id,
      format: parsed.data.format,
      priceCents: parsed.data.priceCents,
      stock: parsed.data.stock ?? null,
      active: parsed.data.active,
      plannedQuantity: parsed.data.plannedQuantity ?? null,
      displayName: (parsed.data.displayName ?? "").trim() || null,
      costSnapshotManufacturingCents: manufacturingCents,
      costSnapshotPublishingCents: platformCost.publishingCents,
      costSnapshotPaymentProcessingCents: platformCost.paymentProcessingCents,
      costSnapshotGoodtunesCents: platformCost.goodtunesCents,
      costSnapshotTrackCount: parsed.data.trackCount ?? null,
      vinylColor: vinylColorId,
      vinylColorTier,
      jacketUpgrade,
      quantityTier,
      costSource,
      lockedAt,
    });
    res.json(row);
  });

  // Task #194 — Platform default per-format cost breakdown, served to
  // the admin Sell panel so unsaved (draft) rows can show a live
  // profit readout against today's platform cost before the artist
  // snapshots it onto the SKU. Edit endpoint is deferred — defaults
  // are seeded once in `getFormatCost` and tuned via direct SQL until
  // the super-admin Platform Pricing surface grows a row per format.
  app.get("/api/admin/payout-format-costs", requireAdmin, async (_req, res) => {
    res.json(await listFormatCosts());
  });

  // Task #218 — super-admin per-format edit of the publishing /
  // payment-processing / GoodTunes-margin lines (the "platform pricing"
  // surface). Manufacturing stays on the row as a placeholder fallback
  // for non-vinyl formats / non-invited artists, but the press catalog
  // is now authoritative for invited-press vinyl.
  const payoutFormatBodySchema = z.object({
    manufacturingCents: z.number().int().min(0).optional(),
    publishingCents: z.number().int().min(0).optional(),
    paymentProcessingCents: z.number().int().min(0).optional(),
    goodtunesCents: z.number().int().min(0).optional(),
  });
  app.put("/api/admin/payout-format-costs/:format", requireAdmin, async (req, res) => {
    const userId = (req as any).adminUserId as string | undefined;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    const { getUserRole } = await import("./auth/roles");
    const info = await getUserRole(userId);
    if (info?.role !== "super_admin") return res.status(403).json({ message: "Super admin only" });
    const format = String(req.params.format);
    if (!ALBUM_FORMATS.includes(format as AlbumFormat)) return res.status(400).json({ message: "Unknown format" });
    const parsed = payoutFormatBodySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid pricing" });
    // Make sure a row exists then patch it.
    await getFormatCost(format as AlbumFormat);
    const set: Record<string, any> = { updatedAt: new Date() };
    if (parsed.data.manufacturingCents !== undefined) set.manufacturingCents = parsed.data.manufacturingCents;
    if (parsed.data.publishingCents !== undefined) set.publishingCents = parsed.data.publishingCents;
    if (parsed.data.paymentProcessingCents !== undefined) set.paymentProcessingCents = parsed.data.paymentProcessingCents;
    if (parsed.data.goodtunesCents !== undefined) set.goodtunesCents = parsed.data.goodtunesCents;
    const [row] = await db
      .update(payoutFormatCosts)
      .set(set)
      .where(eq(payoutFormatCosts.format, format))
      .returning();
    res.json(row);
  });

  // Task #204 — Per-press cost breakdown. Returns one row per format
  // (every entry in ALBUM_FORMATS) merging the press's saved
  // `press_format_costs` overrides on top of the platform defaults so
  // the admin panel can render a complete table even when the press
  // hasn't saved its own pricing yet. `isOverride` flags which rows
  // come from this press vs. the platform fallback so the UI can show
  // a "platform default" hint and a "Reset to platform" affordance.
  //
  // Auth: gated by requireAdmin (admin bearer) AND scoped to either a
  // super_admin/admin (platform staff — full access) OR a manufacturer-
  // role admin whose role_scope_id matches this press. Any other admin
  // bearer (artist, label, fulfillment, non_profit, or a manufacturer
  // admin scoped to a different press) is rejected 403, so a press's
  // pricing isn't reachable by other partners just because they have
  // an admin bearer.
  const requirePressScope = async (req: Request, res: Response, next: () => void) => {
    const userId = (req as any).adminUserId as string | undefined;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    const { getUserRole } = await import("./auth/roles");
    const info = await getUserRole(userId);
    const pressId = String(req.params.id);
    if (!info) return res.status(403).json({ message: "Forbidden" });
    if (info.role === "super_admin" || info.role === "admin") return next();
    if (info.role === "manufacturer" && info.roleScopeId === pressId) return next();
    return res.status(403).json({ message: "Forbidden" });
  };

  // Task #218 — mount the press catalog routes (formats/tiers/colors)
  // under the same requirePressScope as the legacy format-cost routes.
  registerPressCatalogRoutes(app, requireAdmin, requirePressScope);

  // Task #522 — Press portal endpoints (customers/pipeline/invite/etc.)
  // share the same press-scope gate.
  registerPressPortalRoutes(app, requireAdmin, requirePressScope);

  app.get("/api/admin/manufacturers/:id/format-costs", requireAdmin, requirePressScope, async (req, res) => {
    const pressId = String(req.params.id);
    const press = await storage.getManufacturerById(pressId);
    if (!press) return res.status(404).json({ message: "Manufacturer not found" });
    const platform = await listFormatCosts();
    const overrides = await db
      .select()
      .from(pressFormatCosts)
      .where(eq(pressFormatCosts.pressId, pressId));
    const overrideMap = new Map(overrides.map((o) => [o.format, o]));
    const rows = platform.map((p) => {
      const o = overrideMap.get(p.format);
      if (!o) {
        return {
          format: p.format,
          manufacturingCents: p.manufacturingCents,
          publishingCents: p.publishingCents,
          paymentProcessingCents: p.paymentProcessingCents,
          goodtunesCents: p.goodtunesCents,
          isOverride: false,
        };
      }
      return {
        format: p.format,
        manufacturingCents: o.manufacturingCents,
        publishingCents: o.publishingCents,
        paymentProcessingCents: o.paymentProcessingCents,
        goodtunesCents: o.goodtunesCents,
        isOverride: true,
      };
    });
    res.json(rows);
  });

  const pressFormatCostBodySchema = z.object({
    manufacturingCents: z.number().int().min(0),
    publishingCents: z.number().int().min(0),
    paymentProcessingCents: z.number().int().min(0),
    goodtunesCents: z.number().int().min(0),
  });
  app.put("/api/admin/manufacturers/:id/format-costs/:format", requireAdmin, requirePressScope, async (req, res) => {
    const pressId = String(req.params.id);
    const format = String(req.params.format);
    if (!ALBUM_FORMATS.includes(format as AlbumFormat)) {
      return res.status(400).json({ message: "Unknown format" });
    }
    const press = await storage.getManufacturerById(pressId);
    if (!press) return res.status(404).json({ message: "Manufacturer not found" });
    const parsed = pressFormatCostBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid cost row" });
    }
    const [row] = await db
      .insert(pressFormatCosts)
      .values({ pressId, format, ...parsed.data, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: [pressFormatCosts.pressId, pressFormatCosts.format],
        set: { ...parsed.data, updatedAt: new Date() },
      })
      .returning();
    res.json({ ...row, isOverride: true });
  });

  app.delete("/api/admin/manufacturers/:id/format-costs/:format", requireAdmin, requirePressScope, async (req, res) => {
    const pressId = String(req.params.id);
    const format = String(req.params.format);
    await db
      .delete(pressFormatCosts)
      .where(and(eq(pressFormatCosts.pressId, pressId), eq(pressFormatCosts.format, format)));
    res.json({ ok: true });
  });

  // Task #199 — Invited-by press for an album. Resolves the press
  // through `albums.primary_artist_id → people.invited_by_press_id`
  // first, then `albums.label_id → labels.invited_by_press_id`, then
  // null. When set, also returns:
  //   • `press`           — the manufacturer row (logo/name/location/etc.)
  //   • `hasShippedFirst` — has the artist/label ever shipped a paid
  //                         physical run? Drives the soft/hard lock on
  //                         the Sell-panel Presses surface.
  //   • `formatCosts`     — per-format cost breakdown to use in the
  //                         cost calculator: merges any
  //                         `press_format_costs` rows for this press
  //                         on top of the platform defaults so a press
  //                         that hasn't filled in its own pricing yet
  //                         still produces a usable readout.
  // The "shipped" signal is `orders.fulfillment_status = 'shipped'`
  // (the carrier-accepted state); pending/in-fulfillment runs don't
  // soften the lock yet.
  app.get("/api/admin/albums/:id/invited-press", requireAdmin, async (req, res) => {
    const album = await storage.getAlbumById(String(req.params.id), { includeHidden: true });
    if (!album) return res.status(404).json({ message: "Album not found" });

    let pressId: string | null = null;
    let scopeKind: "artist" | "label" | null = null;
    let scopeId: string | null = null;
    if (album.primaryArtistId) {
      const p = await storage.getPersonById(album.primaryArtistId);
      if (p && (p as any).invitedByPressId) {
        pressId = String((p as any).invitedByPressId);
        scopeKind = "artist";
        scopeId = album.primaryArtistId;
      }
    }
    if (!pressId && album.labelId) {
      const l = await storage.getLabelById(album.labelId);
      if (l && (l as any).invitedByPressId) {
        pressId = String((l as any).invitedByPressId);
        scopeKind = "label";
        scopeId = album.labelId;
      }
    }

    if (!pressId) {
      return res.json({ press: null, hasShippedFirst: false, formatCosts: await listFormatCosts(), catalog: { formats: [] } });
    }

    const press = await storage.getManufacturerById(pressId);
    // press might have been deleted out from under the column (SET NULL
    // isn't on the column — we left it untyped to keep the migration
    // simple). Treat a dangling reference as "no lock".
    if (!press) {
      return res.json({ press: null, hasShippedFirst: false, formatCosts: await listFormatCosts(), catalog: { formats: [] } });
    }
    // Task #218 — make sure Hellbender's catalog rows exist on first
    // read so an existing dev/prod DB with the Hellbender press but
    // no catalog yet doesn't show an empty picker.
    await seedHellbenderCatalog();

    // Has-shipped check: any shipped paid order on any album whose
    // primary_artist (or label) matches our locked scope.
    let hasShippedFirst = false;
    try {
      const col = scopeKind === "artist" ? "primary_artist_id" : "label_id";
      const r: any = await db.execute(sql.raw(`
        SELECT 1 FROM orders o
        JOIN albums a ON a.id = o.album_id
        WHERE a.${col} = '${String(scopeId).replace(/'/g, "''")}'
          AND o.fulfillment_status = 'shipped'
        LIMIT 1
      `));
      hasShippedFirst = ((r as any).rows ?? []).length > 0;
    } catch {}

    // Merge per-press overrides on top of platform defaults so callers
    // get one row per format.
    const platform = await listFormatCosts();
    const overrides: any = await db.execute(sql`SELECT * FROM press_format_costs WHERE press_id = ${pressId}`);
    const overrideMap = new Map<string, any>();
    for (const r of ((overrides as any).rows ?? [])) overrideMap.set(String(r.format), r);
    const formatCosts = platform.map((p: any) => {
      const o = overrideMap.get(p.format);
      if (!o) return p;
      return {
        ...p,
        manufacturingCents: Number(o.manufacturing_cents),
        publishingCents: Number(o.publishing_cents),
        paymentProcessingCents: Number(o.payment_processing_cents),
        goodtunesCents: Number(o.goodtunes_cents),
      };
    });

    res.json({
      press: {
        id: press.id,
        name: press.name,
        logoUrl: (press as any).logoUrl ?? null,
        coverUrl: (press as any).coverUrl ?? null,
        bio: (press as any).bio ?? null,
        location: (press as any).location ?? null,
        websiteUrl: (press as any).websiteUrl ?? null,
        turnaroundDays: (press as any).turnaroundDays ?? null,
        // Task #363 — week-range pair on every press payload. Either
        // side may be null while onboarding; the SellPanel card falls
        // back to deriving from the legacy day count for display.
        turnaroundWeeksMin: (press as any).turnaroundWeeksMin ?? null,
        turnaroundWeeksMax: (press as any).turnaroundWeeksMax ?? null,
        specialties: (press as any).specialties ?? [],
      },
      hasShippedFirst,
      scopeKind,
      scopeId,
      formatCosts,
      // Task #218 — full press catalog for the SellPanel's Add Physical
      // picker. Empty `formats` array means the press hasn't built
      // their catalog yet; SellPanel falls back to a no-physical menu.
      catalog: await getPressCatalog(pressId),
    });
  });
  app.delete("/api/admin/albums/:id/skus/:format", requireAdmin, async (req, res) => {
    await db
      .delete(albumSkus)
      .where(and(eq(albumSkus.albumId, String(req.params.id)), eq(albumSkus.format, String(req.params.format) as any)));
    res.json({ ok: true });
  });

  // Task #119 — `minPriceCents` is no longer sent by the SellPanel; we
  // keep it accepted (and optional) so the Shopify-bundle webhook
  // (server/shopify.ts) and any other older caller keep working. New
  // saves snapshot the current platform `cert_cost_cents` onto
  // `costCentsSnapshot` so the artist profit readout is stable until
  // they re-save.
  const addonBodySchema = z.object({
    kind: z.enum(ALBUM_ADDON_KINDS),
    priceCents: z.number().int().min(0),
    minPriceCents: z.number().int().min(0).optional(),
    active: z.boolean().default(true),
    // Task #121 — null/omitted = "as many as will sell"; positive int =
    // fixed planned quantity. Hard-rejects 0 or negatives so the UI's
    // "Fixed" mode can't silently round down to nothing.
    plannedQuantity: z.number().int().min(1).nullable().optional(),
  });
  app.put("/api/admin/albums/:id/addons/:kind", requireAdmin, async (req, res) => {
    const album = await storage.getAlbumById(String(req.params.id), { includeHidden: true });
    if (!album) return res.status(404).json({ message: "Album not found" });
    const parsed = addonBodySchema.safeParse({ ...req.body, kind: String(req.params.kind) });
    if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid add-on" });
    const { getPayoutSettings } = await import("./payouts");
    const settings = await getPayoutSettings();
    const costSnapshot =
      parsed.data.kind === "signed_cert"
        ? (album.payoutCertCentsOverride ?? settings.certCostCents)
        : null;
    // Preserve any existing minPriceCents so the Shopify path keeps
    // its per-album floor; default 0 on first save.
    const [existing] = await db
      .select({ minPriceCents: albumAddons.minPriceCents })
      .from(albumAddons)
      .where(and(eq(albumAddons.albumId, album.id), eq(albumAddons.kind, parsed.data.kind)));
    const minPriceCents = parsed.data.minPriceCents ?? existing?.minPriceCents ?? 0;
    const row = await upsertAddon({
      albumId: album.id,
      kind: parsed.data.kind,
      priceCents: parsed.data.priceCents,
      minPriceCents,
      active: parsed.data.active,
      costCentsSnapshot: costSnapshot,
      plannedQuantity: parsed.data.plannedQuantity ?? null,
    });
    res.json(row);
  });
  app.delete("/api/admin/albums/:id/addons/:kind", requireAdmin, async (req, res) => {
    await db
      .delete(albumAddons)
      .where(and(eq(albumAddons.albumId, String(req.params.id)), eq(albumAddons.kind, String(req.params.kind) as any)));
    res.json({ ok: true });
  });

  // ─── Email verification (signup gate) ────────────────────────────
  // POST /api/email-verifications/start  → { email }
  // POST /api/email-verifications/confirm → { email, code } → { verifyToken }
  // The fan trades verifyToken for an account at /api/customer/signup-with-code.
  app.post("/api/email-verifications/start", async (req, res) => {
    const email = normalizeEmail(req.body?.email ?? "");
    if (!isValidEmail(email)) return res.status(400).json({ message: "Please enter a valid email" });
    const code = generateSixDigitCode();
    const codeHash = await hashCode(code);
    const expiresAt = new Date(Date.now() + 15 * 60_000);
    await db.insert(emailVerifications).values({ email, codeHash, expiresAt });
    // When RESEND_API_KEY is set, attempt a real send. On success we
    // never echo the code back or log it (would defeat the gate). On
    // failure, the caller gets a generic "try again" — never leak
    // whether the address exists or why the send failed. When no key
    // is configured (local dev), fall back to console log + devCode so
    // development keeps working without an inbox.
    if (process.env.RESEND_API_KEY) {
      const { sendCustomerSignupCodeEmail } = await import("./mail");
      const result = await sendCustomerSignupCodeEmail(email, code, 15);
      if (!result.ok) {
        // Underlying reason is in the central `[mail-failure]` log
        // (server/mail.ts). Never leak it to the caller — that would
        // let an attacker probe whether mail is misconfigured.
        return res.status(500).json({ message: "Couldn't send a code right now — please try again in a moment" });
      }
      return res.json({ ok: true });
    }
    console.log(`[verify] email=${email} code=${code} (15min ttl, dev — no RESEND_API_KEY)`);
    res.json({ ok: true, devCode: code });
  });

  app.post("/api/email-verifications/confirm", async (req, res) => {
    const email = normalizeEmail(req.body?.email ?? "");
    const code = String(req.body?.code ?? "").trim();
    if (!email || !/^\d{6}$/.test(code)) return res.status(400).json({ message: "Enter the 6-digit code from your email" });
    const rows = await db
      .select()
      .from(emailVerifications)
      .where(and(eq(emailVerifications.email, email), sql`${emailVerifications.consumedAt} IS NULL`))
      .orderBy(desc(emailVerifications.createdAt))
      .limit(5);
    for (const row of rows) {
      if (row.expiresAt && row.expiresAt < new Date()) continue;
      if (row.attempts >= 5) continue;
      const match = await verifyCode(code, row.codeHash);
      await db.update(emailVerifications).set({ attempts: row.attempts + 1 }).where(eq(emailVerifications.id, row.id));
      if (match) {
        await db.update(emailVerifications).set({ consumedAt: new Date() }).where(eq(emailVerifications.id, row.id));
        // Mint a short-lived verify ticket the signup endpoint will
        // trade in. Task #265 — lives in its own table so it never has
        // to write a sentinel userId into a column that carries a real
        // user FK; the signup endpoint deletes the ticket on use.
        const verifyToken = `vt_${generateToken()}`;
        await db.insert(signupVerifyTokens).values({ token: verifyToken, email });
        return res.json({ ok: true, verifyToken });
      }
    }
    res.status(400).json({ message: "That code didn't match — check the latest email and try again" });
  });

  // ─── Customer minimal signup (email + password, after code verify) ──
  // POST /api/customer/signup-with-code { email, password, verifyToken }
  // Skips username/displayName/realName entirely — they're filled in
  // post-checkout from Stripe + the /welcome rename step.
  app.post("/api/customer/signup-with-code", async (req, res) => {
    const email = normalizeEmail(req.body?.email ?? "");
    const password = String(req.body?.password ?? "");
    const verifyToken = String(req.body?.verifyToken ?? "");
    if (!isValidEmail(email)) return res.status(400).json({ message: "Please enter a valid email" });
    if (password.length < 8) return res.status(400).json({ message: "Password must be at least 8 characters" });
    if (!verifyToken.startsWith("vt_")) return res.status(400).json({ message: "Email is not verified yet" });
    const [tk] = await db.select().from(signupVerifyTokens).where(eq(signupVerifyTokens.token, verifyToken));
    if (!tk || tk.email !== email) {
      return res.status(400).json({ message: "Verify code expired — request a new one" });
    }
    await db.delete(signupVerifyTokens).where(eq(signupVerifyTokens.token, verifyToken));

    const existing = await storage.getCustomerByEmail(email);
    if (existing) return res.status(409).json({ message: "An account with that email already exists — sign in instead" });

    // Pick a placeholder username from the email; the fan can rename on /welcome.
    const username = await pickUniqueUsername(suggestUsernameFromEmail(email));
    // Inline scrypt hash to match server/routes.ts (no shared module yet).
    const _salt = randomBytes(16).toString("hex");
    const _scryptFn = promisify(_scrypt);
    const _buf = (await _scryptFn(password, _salt, 64)) as Buffer;
    const hashed = `${_buf.toString("hex")}.${_salt}`;
    const c = await storage.createCustomer({
      username,
      email,
      displayName: username,
      realName: null,
      password: hashed,
    });
    await storage.updateCustomer(c.id, { emailVerifiedAt: new Date() });
    const token = generateToken();
    await storage.createAuthToken(token, c.id, "customer");
    (req.session as any).userId = c.id;
    (req.session as any).kind = "customer";
    res.status(201).json({
      id: c.id,
      username: c.username,
      email: c.email,
      displayName: c.displayName,
      realName: c.realName,
      isAdmin: false,
      kind: "customer",
      token,
    });
  });

  // ─── Apple private-relay → real email capture (Task #45) ─────────
  // When an Apple Sign-In fan picks "Hide my email," their Apple
  // identity arrives with a `@privaterelay.appleid.com` forwarder.
  // We store the relay on `customer_identities.email` (the link key)
  // but want a real, deliverable address on `customer_users.email` so
  // order receipts / shipping notifications go straight to them.
  //
  // POST /api/customer/real-email/start { email }   (auth: customer)
  // POST /api/customer/real-email/confirm { email, code }  (auth: customer)
  //
  // Reuses the `emailVerifications` table — same 15min TTL, same 5-attempt
  // cap, same scrypt-hashed code. The confirm step overwrites the relay
  // address on customer_users with the verified real email.
  async function customerFromBearer(req: Request) {
    const auth = req.headers.authorization;
    if (!auth?.startsWith("Bearer ")) return null;
    const a = await storage.getAuthBy(auth.slice(7));
    if (!a || a.kind !== "customer") return null;
    return storage.getCustomer(a.userId);
  }
  app.post("/api/customer/real-email/start", async (req, res) => {
    const customer = await customerFromBearer(req);
    if (!customer) return res.status(401).json({ message: "Sign in required" });
    const email = normalizeEmail(req.body?.email ?? "");
    if (!isValidEmail(email)) return res.status(400).json({ message: "Please enter a valid email" });
    if (email.endsWith("@privaterelay.appleid.com")) {
      return res.status(400).json({ message: "That's an Apple relay address — enter your real email" });
    }
    const taken = await storage.getCustomerByEmail(email);
    if (taken && taken.id !== customer.id) {
      return res.status(409).json({ message: "Another GoodTunes account already uses that email" });
    }
    const code = generateSixDigitCode();
    const codeHash = await hashCode(code);
    const expiresAt = new Date(Date.now() + 15 * 60_000);
    await db.insert(emailVerifications).values({ email, codeHash, expiresAt });
    // Never log the plaintext code or destination email in production —
    // those land in deployment logs the operator can search. Keep a
    // minimal trace (customer id only) so we can still audit volume.
    if (process.env.NODE_ENV === "production") {
      console.log(`[verify] real-email customer=${customer.id} (code sent, 15min ttl)`);
    } else {
      console.log(`[verify] real-email customer=${customer.id} email=${email} code=${code} (15min ttl)`);
    }
    res.json({ ok: true, devCode: process.env.NODE_ENV === "production" ? undefined : code });
  });
  app.post("/api/customer/real-email/confirm", async (req, res) => {
    const customer = await customerFromBearer(req);
    if (!customer) return res.status(401).json({ message: "Sign in required" });
    const email = normalizeEmail(req.body?.email ?? "");
    const code = String(req.body?.code ?? "").trim();
    if (!email || !/^\d{6}$/.test(code)) return res.status(400).json({ message: "Enter the 6-digit code from your email" });
    const rows = await db
      .select()
      .from(emailVerifications)
      .where(and(eq(emailVerifications.email, email), sql`${emailVerifications.consumedAt} IS NULL`))
      .orderBy(desc(emailVerifications.createdAt))
      .limit(5);
    for (const row of rows) {
      if (row.expiresAt && row.expiresAt < new Date()) continue;
      if (row.attempts >= 5) continue;
      const match = await verifyCode(code, row.codeHash);
      await db.update(emailVerifications).set({ attempts: row.attempts + 1 }).where(eq(emailVerifications.id, row.id));
      if (match) {
        await db.update(emailVerifications).set({ consumedAt: new Date() }).where(eq(emailVerifications.id, row.id));
        // Final uniqueness check inside the success branch — somebody
        // could have grabbed the address between start and confirm.
        const taken = await storage.getCustomerByEmail(email);
        if (taken && taken.id !== customer.id) {
          return res.status(409).json({ message: "Another GoodTunes account already uses that email" });
        }
        await storage.updateCustomer(customer.id, { email, emailVerifiedAt: new Date() });
        return res.json({ ok: true, email });
      }
    }
    res.status(400).json({ message: "That code didn't match — check the latest email and try again" });
  });

  // ─── Checkout session create ─────────────────────────────────────
  // POST /api/checkout/session
  // Body: { albumId, skuFormat, signedCert: boolean, signedCertPriceCents?: number }
  // Requires a signed-in customer. Returns { clientSecret } for embedded checkout.
  // NB: all prices are read server-side from albumSkus / albumAddons — the
  // client cannot influence the amount Stripe charges (the optional
  // signedCertPriceCents is an *override above* the floor, never below).
  const checkoutSchema = z.object({
    albumId: z.string().min(1),
    skuFormat: z.enum(ALBUM_FORMATS),
    signedCert: z.boolean().default(false),
    // Optional override price for the signed cert add-on. Must be >= min.
    signedCertPriceCents: z.number().int().min(0).optional(),
  });
  app.post("/api/checkout/session", async (req, res) => {
    const auth = req.headers.authorization;
    if (!auth?.startsWith("Bearer ")) return res.status(401).json({ message: "Sign in required" });
    const a = await storage.getAuthBy(auth.slice(7));
    if (!a || a.kind !== "customer") return res.status(401).json({ message: "Sign in required" });
    const customer = await storage.getCustomer(a.userId);
    if (!customer) return res.status(401).json({ message: "Account not found" });

    const parsed = checkoutSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid request" });
    const album = await storage.getAlbumById(parsed.data.albumId);
    if (!album) return res.status(404).json({ message: "Album not found" });
    const skus = await listActiveSkus(album.id);
    const sku = skus.find((s) => s.format === parsed.data.skuFormat);
    if (!sku) return res.status(400).json({ message: "That format isn't available for this album" });
    if (sku.stock !== null && sku.stock <= 0) return res.status(409).json({ message: "Sold out" });

    let addon: AlbumAddon | null = null;
    let addonPriceCents = 0;
    // Task #122 — Reservation id we mint inside the cap-check transaction
    // below. Stamped with the Stripe session id right after the session
    // is created so the webhook can resolve and delete it on payment, and
    // released eagerly if Stripe itself fails.
    let reservationId: string | null = null;
    if (parsed.data.signedCert) {
      const addons = await listActiveAddons(album.id);
      addon = addons.find((x) => x.kind === "signed_cert") ?? null;
      if (!addon) return res.status(400).json({ message: "Signed certificate isn't offered on this album" });
      addonPriceCents = parsed.data.signedCertPriceCents ?? addon.priceCents;
      if (addonPriceCents < addon.minPriceCents) {
        return res.status(400).json({ message: `Signed certificate must be at least $${(addon.minPriceCents / 100).toFixed(2)}` });
      }
      // Task #122 — Close the race between two simultaneous buyers at
      // the planned-quantity boundary. Two requests reading "99 sold,
      // planned 100" would both pass a naive check and both ultimately
      // pay. Inside a single transaction we:
      //   1) take a per-album advisory lock keyed off (albumId,
      //      'signed_cert') — serializes only contending buyers, never
      //      blocks unrelated work,
      //   2) re-count paid order_items + active pending reservations,
      //   3) insert a 30-min reservation row if there's still a slot.
      // Concurrent contenders queue on the lock; the second one sees
      // the first reservation in the count and gets the 409.
      if (addon.plannedQuantity != null) {
        const planned = addon.plannedQuantity;
        const outcome = await db.transaction(async (tx) => {
          await tx.execute(
            sql`SELECT pg_advisory_xact_lock(hashtextextended(${`signed_cert:${album.id}`}, 0))`,
          );
          const claimed = await countSignedCertsClaimed(album.id, tx);
          if (claimed >= planned) return { ok: false as const };
          const [row] = await tx
            .insert(signedCertReservations)
            .values({
              albumId: album.id,
              expiresAt: new Date(Date.now() + 30 * 60_000),
            })
            .returning({ id: signedCertReservations.id });
          return { ok: true as const, id: row.id };
        });
        if (!outcome.ok) return res.status(409).json({ message: "All signed copies claimed" });
        reservationId = outcome.id;
      }
    }

    const stripe = await getStripe();
    // Make sure the customer has a Stripe Customer attached (reuse on
    // repeat purchases so address / saved cards persist).
    let stripeCustomerId = customer.stripeCustomerId ?? null;
    if (!stripeCustomerId) {
      const sc = await stripe.customers.create({
        email: customer.email,
        metadata: { goodtunes_customer_id: customer.id },
      });
      stripeCustomerId = sc.id;
      await storage.updateCustomer(customer.id, { stripeCustomerId });
    }

    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [
      {
        price_data: {
          currency: "usd",
          unit_amount: sku.priceCents,
          product_data: {
            name: `${album.title} — ${ALBUM_FORMAT_LABEL[sku.format as AlbumFormat] ?? sku.format}`,
            description: album.artist,
            images: album.artwork ? [absoluteUrl(req, album.artwork)] : [],
            metadata: { gt_kind: "format", gt_sku: sku.format, gt_album_id: album.id },
          },
        },
        quantity: 1,
      },
    ];
    if (addon) {
      lineItems.push({
        price_data: {
          currency: "usd",
          unit_amount: addonPriceCents,
          product_data: {
            name: ALBUM_ADDON_LABEL[addon.kind as AlbumAddonKind] ?? addon.kind,
            description: `Printed & signed for ${album.title}`,
            metadata: { gt_kind: "addon", gt_sku: addon.kind, gt_album_id: album.id },
          },
        },
        quantity: 1,
      });
    }

    // Task #73 — enrich Stripe metadata so the Stripe dashboard already
    // tells artists/labels what sold (skuKind, artistId, labelId,
    // bundleContents) without us having to round-trip our DB on every
    // export. `gt_order_id` is patched onto the PaymentIntent by
    // materializeOrderFromSession once the row exists — sessions are
    // created before we know our internal order id.
    const { classifySkuKind } = await import("./orderDesk");
    const skuKind = classifySkuKind(sku.format);
    const bundleContents = addon ? `${sku.format}+signed_cert` : sku.format;
    const enrichedMetadata: Record<string, string> = {
      gt_customer_id: customer.id,
      gt_album_id: album.id,
      gt_album_title: album.title,
      gt_artist: album.artist,
      gt_artist_id: album.primaryArtistId ?? "",
      gt_label_id: album.labelId ?? "",
      gt_sku_format: sku.format,
      gt_sku_kind: skuKind,
      gt_bundle_contents: bundleContents,
      gt_signed_cert: addon ? "1" : "0",
    };
    const returnUrl = `${absoluteOrigin(req)}/welcome?session_id={CHECKOUT_SESSION_ID}`;
    let session: Stripe.Checkout.Session;
    try {
      session = await stripe.checkout.sessions.create({
        ui_mode: "embedded",
        mode: "payment",
        customer: stripeCustomerId,
        line_items: lineItems,
        shipping_address_collection: { allowed_countries: ["US", "CA", "GB", "AU", "DE", "FR", "NL", "IE", "JP"] },
        billing_address_collection: "required",
        phone_number_collection: { enabled: true },
        automatic_tax: { enabled: false },
        return_url: returnUrl,
        payment_intent_data: {
          metadata: {
            ...enrichedMetadata,
            gt_signed_cert_price: addon ? String(addonPriceCents) : "0",
          },
        },
        metadata: enrichedMetadata,
      });
    } catch (e) {
      // Task #122 — Stripe failed to mint the session: release the
      // reservation we just took so its slot returns to the pool
      // immediately instead of waiting 30 min to expire.
      if (reservationId) {
        await db.delete(signedCertReservations).where(eq(signedCertReservations.id, reservationId));
      }
      throw e;
    }
    // Task #122 — Attach the Stripe session id to the reservation now
    // that we have one. The webhook deletes by session id when the
    // order is materialized as paid; abandoned sessions just expire.
    if (reservationId) {
      await db
        .update(signedCertReservations)
        .set({ stripeCheckoutSessionId: session.id })
        .where(eq(signedCertReservations.id, reservationId));
    }

    res.json({ clientSecret: session.client_secret, sessionId: session.id });
  });

  // GET /api/checkout/session/:id — read for the /welcome page so it can
  // show the order summary + GoodDeed number without waiting for the
  // webhook (we also fetch the order row in case the webhook beat us).
  app.get("/api/checkout/session/:id", async (req, res) => {
    const auth = req.headers.authorization;
    if (!auth?.startsWith("Bearer ")) return res.status(401).json({ message: "Sign in required" });
    const a = await storage.getAuthBy(auth.slice(7));
    if (!a || a.kind !== "customer") return res.status(401).json({ message: "Sign in required" });

    const stripe = await getStripe();
    const session = await stripe.checkout.sessions.retrieve(String(req.params.id), { expand: ["customer", "payment_intent"] });
    // IDOR guard: a checkout session is bound to a single customer via
    // the `gt_customer_id` metadata we set at session creation. Reject
    // reads from anyone else so order/shipping/billing snapshots never
    // leak across fans (the Stripe session id is otherwise guessable).
    if (session.metadata?.gt_customer_id && session.metadata.gt_customer_id !== a.userId) {
      return res.status(404).json({ message: "Order not found" });
    }
    // If the webhook hasn't fired yet (or in dev where we don't have a
    // webhook URL), synthesize the order from the session so the UI
    // doesn't hang. The webhook is still the source of truth — it will
    // upsert the same row keyed by sessionId.
    let order = await getOrderBySessionId(session.id);
    if (!order && session.payment_status === "paid") {
      order = await materializeOrderFromSession(session);
    }
    // Task #201 — surface the album artwork so the /welcome receipt can
    // render <VinylPreview> for vinyl line items.
    const album = order ? await storage.getAlbumById(order.albumId) : null;
    res.json({
      paymentStatus: session.payment_status,
      status: session.status,
      order: order ?? null,
      items: order ? await getOrderItems(order.id) : [],
      album: album ? { artwork: album.artwork ?? null } : null,
    });
  });

  // ─── Stripe webhook handler ─────────────────────────────────────
  // Mounted with express.raw() in server/index.ts so `req.body` is a
  // Buffer here — DO NOT call any json middleware on this path.
  // Idempotent: every Stripe event we care about either upserts by
  // sessionId / paymentIntentId or no-ops when the order is already
  // in the target state.
  app.post("/api/webhooks/stripe", async (req, res) => {
    const sig = req.headers["stripe-signature"] as string | undefined;
    const secret = await getStripeWebhookSecret();
    const stripe = await getStripe();
    let event: Stripe.Event;
    try {
      if (sig && secret) {
        event = stripe.webhooks.constructEvent(req.body as Buffer, sig, secret);
      } else if (process.env.NODE_ENV !== "production") {
        // Dev-only fallback: when the operator hasn't yet configured
        // the webhook endpoint, accept the unsigned payload so we can
        // exercise the path locally. Production hard-fails — a forged
        // event must not be able to flip an order to paid or refunded.
        event = JSON.parse((req.body as Buffer).toString("utf8")) as Stripe.Event;
        console.warn("[stripe-webhook] DEV: accepting unsigned payload (no secret configured)");
      } else {
        console.error("[stripe-webhook] missing signature or secret in production — rejecting");
        return res.status(400).json({ message: "Webhook signature required" });
      }
    } catch (e: any) {
      console.error("[stripe-webhook] signature verification failed", e?.message);
      return res.status(400).json({ message: `Webhook signature failed: ${e?.message}` });
    }

    try {
      switch (event.type) {
        case "checkout.session.completed":
        case "checkout.session.async_payment_succeeded": {
          const session = event.data.object as Stripe.Checkout.Session;
          await materializeOrderFromSession(session);
          break;
        }
        case "payment_intent.succeeded": {
          // Belt-and-suspenders — if the checkout.session event hasn't
          // arrived yet, paymentIntent.succeeded carries the same
          // metadata. We look up the session via the PI's metadata
          // and materialize from there.
          const pi = event.data.object as Stripe.PaymentIntent;
          if (pi.metadata?.gt_album_id) {
            // Best-effort: find a checkout session linked to this PI.
            const sessions = await stripe.checkout.sessions.list({ payment_intent: pi.id, limit: 1 });
            if (sessions.data[0]) await materializeOrderFromSession(sessions.data[0]);
          }
          break;
        }
        case "charge.refunded":
        case "payment_intent.refunded" as any: {
          const obj = event.data.object as any;
          const piId: string | undefined = obj.payment_intent || obj.id;
          if (piId) await handleRefund(piId);
          break;
        }
        case "account.updated": {
          // Task #48 — Connect capability flip. The local
          // payout_accounts row mirrors `payouts_enabled` etc. so the
          // admin UI doesn't have to round-trip Stripe on every read.
          const acct = event.data.object as Stripe.Account;
          const { syncAccountFromStripe } = await import("./payouts");
          await syncAccountFromStripe(acct);
          break;
        }
        default:
          // Ignore everything else.
          break;
      }
      res.json({ received: true });
    } catch (err: any) {
      console.error(`[stripe-webhook] handler failed for ${event.type}`, err?.message);
      res.status(500).json({ message: "Handler failed" });
    }
  });

  // ─── Fan order list ─────────────────────────────────────────────
  app.get("/api/orders", async (req, res) => {
    const auth = req.headers.authorization;
    if (!auth?.startsWith("Bearer ")) return res.status(401).json({ message: "Sign in required" });
    const a = await storage.getAuthBy(auth.slice(7));
    if (!a || a.kind !== "customer") return res.status(401).json({ message: "Sign in required" });
    // Buyer sees:
    //   (a) orders they own outright, AND
    //   (b) orders they bought as gifts — even after claim transfers
    //       order.customerId to the recipient. The UNION on gifts.buyerUserId
    //       keeps them visible in the buyer's history with a "gifted" badge.
    const myGiftedOrderIds = (
      await db.select({ orderId: gifts.orderId }).from(gifts).where(eq(gifts.buyerUserId, a.userId))
    ).map((x) => x.orderId);
    const whereClause = myGiftedOrderIds.length > 0
      ? or(eq(orders.customerId, a.userId), inArray(orders.id, myGiftedOrderIds))
      : eq(orders.customerId, a.userId);
    const rows = await db
      .select({ order: orders, album: albums })
      .from(orders)
      .innerJoin(albums, eq(orders.albumId, albums.id))
      .where(whereClause)
      .orderBy(desc(orders.createdAt));
    const orderIds = rows.map((r) => r.order.id);
    const giftRows = orderIds.length > 0
      ? await db.select().from(gifts).where(inArray(gifts.orderId, orderIds))
      : [];
    const giftByOrder = new Map(giftRows.map((g) => [g.orderId, g]));
    // Task #128 — also surface the signed_cert certificate row so the
    // fan-side Orders page can render the name-confirmation card without
    // a second roundtrip.
    const { signedCertCertificates } = await import("@shared/schema");
    const certRows = orderIds.length > 0
      ? await db.select().from(signedCertCertificates).where(inArray(signedCertCertificates.orderId, orderIds))
      : [];
    const certByOrder = new Map(certRows.map((c) => [c.orderId, c]));
    // Flat shape matches client/src/pages/Orders.tsx OrderRow.
    const out = await Promise.all(
      rows.map(async (r) => {
        const g = giftByOrder.get(r.order.id);
        const cert = certByOrder.get(r.order.id) ?? null;
        return {
          ...r.order,
          albumTitle: r.album.title,
          albumArtist: r.album.artist,
          albumArtwork: r.album.artwork,
          cert,
          items: await getOrderItems(r.order.id),
          gift: g
            ? {
                id: g.id,
                buyerUserId: g.buyerUserId,
                recipientFirstName: g.recipientFirstName,
                recipientLastName: g.recipientLastName,
                recipientEmail: g.recipientEmail,
                recipientPhone: g.recipientPhone,
                claimToken: g.buyerUserId === a.userId ? g.claimToken : null,
                claimed: !!g.claimedAt,
                claimedAt: g.claimedAt,
                expiresAt: g.expiresAt,
                createdAt: g.createdAt,
                resendCount: g.resendCount,
                isBuyer: g.buyerUserId === a.userId,
              }
            : null,
        };
      }),
    );
    res.json(out);
  });

  // ─── Admin order list + ship ────────────────────────────────────
  app.get("/api/admin/orders", requireAdmin, async (req, res) => {
    const status = (req.query.status as string | undefined)?.trim();
    let q = db
      .select({ order: orders, album: albums, customer: customerUsers })
      .from(orders)
      .innerJoin(albums, eq(orders.albumId, albums.id))
      .innerJoin(customerUsers, eq(orders.customerId, customerUsers.id))
      .$dynamic();
    if (status) q = q.where(eq(orders.status, status));
    const rows = await q.orderBy(desc(orders.createdAt)).limit(500);
    const orderIds = rows.map((r) => r.order.id);
    const giftRows = orderIds.length > 0
      ? await db.select().from(gifts).where(inArray(gifts.orderId, orderIds))
      : [];
    const giftByOrder = new Map(giftRows.map((g) => [g.orderId, g]));
    // Flat shape matches client/src/pages/AdminOrders.tsx AdminOrderRow.
    const out = await Promise.all(
      rows.map(async (r) => {
        const ship: any = r.order.shippingAddress ?? null;
        const g = giftByOrder.get(r.order.id);
        return {
          ...r.order,
          albumTitle: r.album.title,
          albumArtist: r.album.artist,
          albumArtwork: r.album.artwork ?? null,
          customerEmail: r.customer.email,
          customerName: r.customer.realName ?? r.customer.displayName ?? null,
          shippingName: ship?.name ?? null,
          items: await getOrderItems(r.order.id),
          gift: g
            ? {
                id: g.id,
                recipientFirstName: g.recipientFirstName,
                recipientLastName: g.recipientLastName,
                recipientEmail: g.recipientEmail,
                recipientPhone: g.recipientPhone,
                claimed: !!g.claimedAt,
                claimedAt: g.claimedAt,
                expiresAt: g.expiresAt,
                resendCount: g.resendCount,
                createdAt: g.createdAt,
              }
            : null,
        };
      }),
    );
    res.json(out);
  });
  // ─── Task #236 — operator-initiated refund ──────────────────────────
  // One endpoint covers both origins. Direct (Stripe) orders refund via
  // the Stripe API; Shopify-origin orders go through Shopify's refund
  // REST endpoint via the connected store's offline access token. For a
  // *full* refund we synchronously run the same `handleRefund` lock-
  // return / GoodDeed-void logic the webhook would have run, so the
  // detail sheet reflects the new state on the very next read. The
  // webhook (Stripe `charge.refunded` or Shopify `refunds/create`) is
  // still authoritative and idempotent — it just confirms what we did.
  // Partial refunds leave status="paid" + the album unlock intact and
  // record an event so the Refund history list picks it up.
  app.post("/api/admin/orders/:id/refund", requireAdmin, async (req, res) => {
    const o = await getOrderById(String(req.params.id));
    if (!o) return res.status(404).json({ message: "Order not found" });
    if (o.status === "refunded") return res.status(409).json({ message: "Order already refunded" });
    if (o.status !== "paid" && o.status !== "shipped") {
      return res.status(400).json({ message: `Cannot refund order in status ${o.status}` });
    }
    const body = z
      .object({
        amountCents: z.number().int().positive().optional(),
        reason: z.string().trim().max(500).optional(),
      })
      .safeParse(req.body ?? {});
    if (!body.success) return res.status(400).json({ message: "Invalid refund request" });
    const amountCents = body.data.amountCents ?? o.totalCents;
    const reason = body.data.reason?.trim() || null;
    if (amountCents > o.totalCents) {
      return res.status(400).json({ message: "Refund amount exceeds order total" });
    }
    const isFull = amountCents >= o.totalCents;
    const isShopify = (o.origin ?? "").startsWith("shopify:") && !!o.shopifyOrderId && !!o.shopifyStoreId;

    try {
      if (isShopify) {
        const { refundShopifyOrder } = await import("./shopify");
        await refundShopifyOrder({
          shopifyStoreId: o.shopifyStoreId!,
          shopifyOrderId: o.shopifyOrderId!,
          amountCents,
          reason,
        });
      } else {
        if (!o.stripePaymentIntentId) {
          return res.status(400).json({ message: "Order has no Stripe payment intent" });
        }
        const stripe = await getStripe();
        // Stripe's reason enum is narrow — we pass the operator's text
        // as metadata so it survives in the dashboard, and only set the
        // canonical `reason` when the operator's text maps to one.
        const reasonEnum: "duplicate" | "fraudulent" | "requested_by_customer" | undefined =
          reason && /duplicate/i.test(reason)
            ? "duplicate"
            : reason && /fraud/i.test(reason)
              ? "fraudulent"
              : "requested_by_customer";
        await stripe.refunds.create({
          payment_intent: o.stripePaymentIntentId,
          amount: amountCents,
          reason: reasonEnum,
          metadata: {
            gt_order_id: o.id,
            gt_admin_user_id: (req as any).adminUserId ?? "",
            gt_reason: reason ?? "",
          },
        });
      }
    } catch (e: any) {
      console.error(`[refund] failed for order ${o.id}`, e?.message);
      return res.status(502).json({ message: e?.message ?? "Refund failed" });
    }

    // Apply local state changes before the webhook lands so the UI sees
    // the new refund immediately. The webhook is idempotent — for full
    // refunds, handleRefund() early-returns when status is already
    // "refunded"; for partials, the webhook handler we have only flips
    // status on a *full* shopify refund / charge.refunded, so the partial
    // event remains a no-op.
    if (isFull) {
      if (isShopify) {
        // Shopify path: reuse the same logic the webhook handler runs.
        // It's defined privately in server/shopify.ts but the SQL it
        // does is small, so we inline it here to avoid an export churn.
        await db
          .update(orders)
          .set({ status: "refunded", refundedAt: new Date(), goodDeedNumber: null })
          .where(eq(orders.id, o.id));
        const remaining = await db
          .select({ id: orders.id })
          .from(orders)
          .where(and(eq(orders.customerId, o.customerId), eq(orders.albumId, o.albumId), eq(orders.status, "paid")));
        if (remaining.length === 0) {
          await db.delete(userAlbums).where(and(eq(userAlbums.userId, o.customerId), eq(userAlbums.albumId, o.albumId)));
        }
      } else if (o.stripePaymentIntentId) {
        await handleRefund(o.stripePaymentIntentId);
      }
    }

    // Record the refund as an order_desk_webhook_events row so the
    // Refund history list in the fan-order detail sheet picks it up
    // immediately (it already filters that table for "refund" entries).
    try {
      const { orderDeskWebhookEvents } = await import("@shared/schema");
      await db
        .insert(orderDeskWebhookEvents)
        .values({
          eventId: `refund:${o.id}:${Date.now()}:${randomBytes(4).toString("hex")}`,
          orderId: o.id,
          eventType: isFull
            ? `refund.full · ${isShopify ? "shopify" : "stripe"}${reason ? ` · ${reason}` : ""}`
            : `refund.partial $${(amountCents / 100).toFixed(2)} · ${isShopify ? "shopify" : "stripe"}${reason ? ` · ${reason}` : ""}`,
        })
        .onConflictDoNothing();
    } catch (e: any) {
      console.warn(`[refund] couldn't log refund event for ${o.id}: ${e?.message}`);
    }

    const refreshed = await getOrderById(o.id);
    return res.json({ order: refreshed, amountCents, full: isFull });
  });

  app.post("/api/admin/orders/:id/ship", requireAdmin, async (req, res) => {
    const o = await getOrderById(String(req.params.id));
    if (!o) return res.status(404).json({ message: "Order not found" });
    if (o.status !== "paid") return res.status(400).json({ message: "Only paid orders can be marked shipped" });
    const [updated] = await db
      .update(orders)
      .set({ status: "shipped", shippedAt: new Date() })
      .where(eq(orders.id, o.id))
      .returning();
    // ─── Task #48 — auto-transfer to the connected account on ship.
    // Best-effort: a Stripe failure leaves the order shipped with
    // payoutStatus = "failed" / "skipped" so the operator can retry
    // from the stuck-cases dashboard. We never block the ship action
    // on the payout — physical fulfillment is the source of truth.
    try {
      const { attemptTransferForOrder } = await import("./payouts");
      const result = await attemptTransferForOrder(updated);
      const [refreshed] = await db.select().from(orders).where(eq(orders.id, updated.id));
      return res.json({ ...refreshed, payoutResult: result });
    } catch (e: any) {
      console.error(`[ship] payout attempt threw for order ${updated.id}`, e?.message);
      return res.json(updated);
    }
  });
}

// ─── Internal helpers (shared between webhook + welcome read) ─────────

function absoluteOrigin(req: Request): string {
  const proto = (req.headers["x-forwarded-proto"] as string | undefined)?.split(",")[0] ?? req.protocol ?? "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host || "";
  return `${proto}://${host}`;
}
function absoluteUrl(req: Request, path: string): string {
  if (/^https?:\/\//.test(path)) return path;
  return `${absoluteOrigin(req)}${path.startsWith("/") ? "" : "/"}${path}`;
}

// Creates / updates an Order row from a Stripe Checkout Session. This is
// the single idempotent write path used by both the webhook and the
// `/welcome` page's just-in-case fetch. Safe to call twice — the unique
// index on `stripe_checkout_session_id` prevents duplicates and we no-op
// if the order is already paid.
async function materializeOrderFromSession(session: Stripe.Checkout.Session): Promise<Order> {
  const existing = await getOrderBySessionId(session.id);
  // Track whether stock has already been decremented for this session.
  // If the order is already paid, all the side effects (stock, unlock,
  // GoodDeed) have already fired — return early.
  const wasAlreadyPaid = existing?.status === "paid";
  if (existing && existing.status === "paid") return existing;

  const customerId = session.metadata?.gt_customer_id;
  const albumId = session.metadata?.gt_album_id;
  const skuFormat = session.metadata?.gt_sku_format as AlbumFormat | undefined;
  const signedCert = session.metadata?.gt_signed_cert === "1";
  if (!customerId || !albumId || !skuFormat) {
    throw new Error(`Stripe session ${session.id} missing GoodTunes metadata`);
  }

  // Task #73 — snapshot artist/label/skuKind so reporting joins survive
  // album reassignment, and so the Stripe→OD handoff has the routing
  // metadata it needs even if the Stripe metadata was thin.
  const { classifySkuKind } = await import("./orderDesk");
  const [albumRow] = await db.select().from(albums).where(eq(albums.id, albumId));
  const skuKind = session.metadata?.gt_sku_kind || classifySkuKind(skuFormat);
  const artistSnapshotId = session.metadata?.gt_artist_id || albumRow?.primaryArtistId || null;
  const labelSnapshotId = session.metadata?.gt_label_id || albumRow?.labelId || null;

  const stripe = await getStripe();
  // Re-fetch with expansion so addresses/phone are populated even if the
  // original event payload was thin.
  const full = await stripe.checkout.sessions.retrieve(session.id, {
    expand: ["customer", "payment_intent", "customer_details"],
  });

  const piId = typeof full.payment_intent === "string" ? full.payment_intent : full.payment_intent?.id ?? null;
  const stripeCustomerId = typeof full.customer === "string" ? full.customer : full.customer?.id ?? null;
  const buyerEmail = full.customer_details?.email ?? null;
  const buyerName = full.customer_details?.name ?? null;
  const buyerPhone = full.customer_details?.phone ?? null;
  const billing = addressFromStripe(full.customer_details?.address ?? null, buyerName);
  const shipping = addressFromStripe(
    (full as any).shipping_details?.address ?? full.shipping_cost ? (full as any).shipping_details?.address : null,
    (full as any).shipping_details?.name ?? buyerName,
  );

  const isPaid = full.payment_status === "paid";

  // Backfill the customer row from Stripe (name, phone, addresses, stripeCustomerId).
  if (stripeCustomerId) {
    await backfillCustomerFromStripe({
      customerId,
      stripeCustomerId,
      buyerName,
      buyerPhone,
      billing,
      shipping,
    });
  }

  // Build line item snapshots from the session, with our metadata.
  const lineItems = await stripe.checkout.sessions.listLineItems(session.id, { limit: 10, expand: ["data.price.product"] });
  // Task #201 — snapshot the album's current SKU pressing picks
  // (vinyl_color + jacket_upgrade) onto each vinyl line item at order
  // creation time, so a later artist edit to the SKU can never rewrite
  // an existing receipt. Done in one query keyed off the album.
  const skuRowsAtPurchase = await db
    .select({ format: albumSkus.format, vinylColor: albumSkus.vinylColor, jacketUpgrade: albumSkus.jacketUpgrade })
    .from(albumSkus)
    .where(eq(albumSkus.albumId, albumId));
  const skuByFormatAtPurchase = new Map(skuRowsAtPurchase.map((s) => [s.format, s]));
  const items: Array<Omit<OrderItem, "id" | "orderId" | "createdAt">> = [];
  for (const li of lineItems.data) {
    const product = li.price?.product as Stripe.Product | undefined;
    const kind = (product?.metadata?.gt_kind as "format" | "addon") ?? "format";
    const sku = product?.metadata?.gt_sku ?? "unknown";
    const pressingSnap = kind === "format" ? skuByFormatAtPurchase.get(sku as any) : undefined;
    items.push({
      kind,
      sku,
      label: li.description ?? product?.name ?? sku,
      unitPriceCents: li.amount_total ?? li.price?.unit_amount ?? 0,
      quantity: li.quantity ?? 1,
      vinylColor: pressingSnap?.vinylColor ?? null,
      jacketUpgrade: (pressingSnap?.jacketUpgrade as JacketUpgrade | null) ?? null,
    });
  }
  const totalCents = full.amount_total ?? items.reduce((a, b) => a + b.unitPriceCents * b.quantity, 0);

  // Upsert by session id. If a row exists (pending), flip to paid; if not, insert.
  let order = existing;
  if (!order) {
    const goodDeedNumber = isPaid ? await assignNextGoodDeedNumber(albumId) : null;
    const [inserted] = await db
      .insert(orders)
      .values({
        customerId,
        albumId,
        totalCents,
        currency: full.currency ?? "usd",
        stripeCheckoutSessionId: full.id,
        stripePaymentIntentId: piId,
        status: isPaid ? "paid" : "pending",
        shippingAddress: shipping,
        billingAddress: billing,
        buyerEmail,
        buyerName,
        buyerPhone,
        goodDeedNumber,
        skuKind,
        artistSnapshotId,
        labelSnapshotId,
        fulfillmentStatus: isPaid && skuKind !== "digital" ? "pending" : null,
      })
      .onConflictDoNothing({ target: orders.stripeCheckoutSessionId })
      .returning();
    order = inserted ?? (await getOrderBySessionId(full.id))!;
    if (order && order.id && (await getOrderItems(order.id)).length === 0) {
      await db.insert(orderItems).values(items.map((i) => ({ ...i, orderId: order!.id })));
    }
  } else if (isPaid && order.status === "pending") {
    const goodDeedNumber = order.goodDeedNumber ?? (await assignNextGoodDeedNumber(albumId));
    const [u] = await db
      .update(orders)
      .set({
        status: "paid",
        stripePaymentIntentId: piId,
        shippingAddress: shipping,
        billingAddress: billing,
        buyerEmail,
        buyerName,
        buyerPhone,
        goodDeedNumber,
        skuKind: order.skuKind ?? skuKind,
        artistSnapshotId: order.artistSnapshotId ?? artistSnapshotId,
        labelSnapshotId: order.labelSnapshotId ?? labelSnapshotId,
        fulfillmentStatus: order.fulfillmentStatus ?? (skuKind !== "digital" ? "pending" : null),
      })
      .where(eq(orders.id, order.id))
      .returning();
    order = u;
  }

  if (order && order.status === "paid") {
    // Task #79 — Stamp post-sale lock on first paid order. Idempotent
    // (only writes when first_sold_at IS NULL).
    const { stampFirstSoldAtIfNeeded } = await import("./auth/partnerPermissions");
    await stampFirstSoldAtIfNeeded(albumId);
    // Task #122 — Reservation served its purpose: the order_items now
    // carry the signed_cert line, so the cap counter switches from
    // "pending reservation" to "paid order item" without a moment of
    // under-counting. Idempotent — delete-if-exists.
    await db
      .delete(signedCertReservations)
      .where(eq(signedCertReservations.stripeCheckoutSessionId, full.id));
    // Unlock the album for the fan. Idempotent via unique (userId,albumId).
    // The user_albums.user_id FK to users(id) was dropped at Task #44 so
    // this column holds either an admin user id or a customer_user id.
    await db
      .insert(userAlbums)
      .values({ userId: customerId, albumId })
      .onConflictDoNothing();
    // Decrement stock — guarded by `wasAlreadyPaid` so concurrent
    // materializations of the same session don't double-decrement.
    if (!wasAlreadyPaid) {
      await db
        .update(albumSkus)
        .set({ stock: sql`GREATEST(${albumSkus.stock} - 1, 0)` })
        .where(and(eq(albumSkus.albumId, albumId), eq(albumSkus.format, skuFormat), sql`${albumSkus.stock} IS NOT NULL`));
    }

    // Task #78 + #350 — Referral credit accrual. Writes a pending_payout
    // credit row per referrer kind, idempotent via the unique
    // (order_id, referrer_kind) index. Branches:
    //
    //   • artist-to-artist (Task #350): looks for an `artist_referrals`
    //     row pinned to (referrer, invitee, album OR null). If the row
    //     has swap_state = 'invitee_keeps_full' → SKIP the credit (the
    //     invitee keeps the full slice). Otherwise mint the $1/unit
    //     credit as normal AND stamp frozen_at + bind album_id so the
    //     swap can no longer flip for this project.
    //
    //   • NPO referrer (Task #78): per-unit defaults to people.referrer
    //     _per_unit_cents (100¢). If referral_funding_config.invitee_
    //     charity_bonus_enabled is true, bump by +50¢ to honour the
    //     $1.50 funded-up rate (default OFF, super-admin flag).
    //
    //   • Press (#199/#350): if the artist was invited by a press AND
    //     the press is involved in this album, write a project-scoped
    //     press_invited_albums row at $0 (no payout — presses earn
    //     through manufacturing margin, this row only powers the
    //     press portal's invited-artists report).
    if (!wasAlreadyPaid && order.artistSnapshotId) {
      try {
        const r = await db.execute<{
          referred_by_person_id: string | null;
          referred_by_org_id: string | null;
          invited_by_press_id: string | null;
          referrer_per_unit_cents: number | null;
        }>(sql`SELECT referred_by_person_id, referred_by_org_id, invited_by_press_id, referrer_per_unit_cents
               FROM people WHERE id = ${order.artistSnapshotId} LIMIT 1`);
        const row = (r as any).rows?.[0];
        if (row && (row.referred_by_person_id || row.referred_by_org_id || row.invited_by_press_id)) {
          const basePerUnit = row.referrer_per_unit_cents ?? 100;
          const currency = (order.currency || "usd").toLowerCase();
          const u = await db.execute<{ units: number }>(sql`
            SELECT COALESCE(SUM(quantity), 0)::int AS units
            FROM order_items WHERE order_id = ${order.id} AND kind = 'format'
          `);
          const units = ((u as any).rows?.[0]?.units ?? 0) as number;
          const safeUnits = units > 0 ? units : 1;

          // ── Artist → artist branch with per-album swap rule ──
          if (row.referred_by_person_id) {
            const ar = await db.execute<{ id: string; swap_state: string; album_id: string | null }>(sql`
              SELECT id, swap_state, album_id
              FROM artist_referrals
              WHERE referrer_person_id = ${row.referred_by_person_id}
                AND invitee_person_id = ${order.artistSnapshotId}
                AND (album_id = ${albumId} OR album_id IS NULL)
              ORDER BY album_id IS NULL ASC
              LIMIT 1
            `);
            const arRow = ((ar as any).rows ?? [])[0];
            const swapKeepsInvitee = arRow?.swap_state === "invitee_keeps_full";
            if (arRow) {
              // Pin to this album + freeze the swap on first paid sale.
              await db.execute(sql`
                UPDATE artist_referrals
                   SET album_id = COALESCE(album_id, ${albumId}),
                       frozen_at = COALESCE(frozen_at, now())
                 WHERE id = ${arRow.id}
              `);
            }
            if (!swapKeepsInvitee) {
              const amountCents = basePerUnit * safeUnits;
              await db.execute(sql`
                INSERT INTO referral_credits (order_id, referred_artist_id, referrer_kind, referrer_person_id, amount_cents, currency, status, units)
                VALUES (${order.id}, ${order.artistSnapshotId}, 'artist', ${row.referred_by_person_id}, ${amountCents}, ${currency}, 'pending_payout', ${safeUnits})
                ON CONFLICT (order_id, referrer_kind) DO NOTHING
              `);
            }
          }

          // ── NPO branch with optional $1.50 funded-up bonus ──
          if (row.referred_by_org_id) {
            let npoPerUnit = basePerUnit;
            try {
              const cfg = await db.execute<{ enabled: boolean }>(sql`
                SELECT invitee_charity_bonus_enabled AS enabled
                FROM referral_funding_config WHERE id = 'singleton' LIMIT 1
              `);
              if (((cfg as any).rows ?? [])[0]?.enabled) npoPerUnit += 50;
            } catch { /* missing config row defaults OFF */ }
            const amountCents = npoPerUnit * safeUnits;
            await db.execute(sql`
              INSERT INTO referral_credits (order_id, referred_artist_id, referrer_kind, referrer_org_id, amount_cents, currency, status, units)
              VALUES (${order.id}, ${order.artistSnapshotId}, 'non_profit', ${row.referred_by_org_id}, ${amountCents}, ${currency}, 'pending_payout', ${safeUnits})
              ON CONFLICT (order_id, referrer_kind) DO NOTHING
            `);
          }

          // ── Press project-scoped $0 attribution ──
          // Only write the press_invited_albums row when THIS album is
          // actually being pressed by the inviting press — verified via
          // an approved pressing_order_requests row whose package
          // snapshot pins to that press. If the artist's next album
          // routes to a different press, no row is minted and the
          // original press's invited-artists report won't surface it.
          if (row.invited_by_press_id) {
            const pressing = await db.execute<{ ok: number }>(sql`
              SELECT 1 AS ok
              FROM pressing_order_requests por
              WHERE por.album_id = ${albumId}
                AND por.package_snapshot ->> 'pressId' = ${row.invited_by_press_id}
                AND por.status IN ('approved', 'pending')
              LIMIT 1
            `);
            if (((pressing as any).rows ?? [])[0]) {
              await db.execute(sql`
                INSERT INTO press_invited_albums (press_id, invitee_person_id, album_id)
                VALUES (${row.invited_by_press_id}, ${order.artistSnapshotId}, ${albumId})
                ON CONFLICT (press_id, album_id) DO NOTHING
              `);
            }
          }
        }
      } catch (e: any) {
        console.error(`[commerce] referral accrual failed for ${order.id}`, e?.message);
      }
    }

    // Task #128 — if this order carries a signed_cert add-on, mint
    // (idempotent) the certificate row that drives the fan's name-
    // confirmation card and the admin print queue. Paper size is
    // inferred from the shipping country at this point.
    try {
      const { ensureCertificateForOrder } = await import("./certificates");
      await ensureCertificateForOrder(order.id);
    } catch (e: any) {
      console.error(`[commerce] cert row mint failed for ${order.id}`, e?.message);
    }

    // Task #73 — physical order → hand off to Order Desk and patch the
    // PaymentIntent metadata with our internal order id so the Stripe
    // dashboard cross-references back to our DB. Both are best-effort:
    // OD failure leaves `fulfillment_status = "pending"` so the admin
    // retry button surfaces; PI metadata failure is logged silently.
    if (!wasAlreadyPaid) {
      const { pushOrderToOrderDesk, isPhysicalSkuKind } = await import("./orderDesk");
      if (isPhysicalSkuKind(skuKind)) {
        await pushOrderToOrderDesk(order.id).catch((e) =>
          console.error(`[commerce] OD handoff failed for ${order.id}`, e?.message),
        );
      }
      if (piId) {
        try {
          await stripe.paymentIntents.update(piId, {
            metadata: {
              gt_order_id: order.id,
              gt_album_id: albumId,
              gt_artist_id: artistSnapshotId ?? "",
              gt_label_id: labelSnapshotId ?? "",
              gt_sku_kind: skuKind,
              gt_good_deed_number: order.goodDeedNumber != null ? String(order.goodDeedNumber) : "",
            },
          });
        } catch (e: any) {
          console.warn(`[commerce] could not patch PI metadata for ${piId}: ${e?.message}`);
        }
      }
    }
  }

  return order!;
}

async function handleRefund(paymentIntentId: string): Promise<void> {
  const [order] = await db.select().from(orders).where(eq(orders.stripePaymentIntentId, paymentIntentId));
  if (!order) return;
  if (order.status === "refunded") return; // idempotent
  // Reverse the Connect transfer BEFORE flipping status so a failed
  // reversal leaves an audit trail on the still-transferred order.
  // The reversal helper is itself idempotent (keyed on order id).
  if (order.payoutStatus === "transferred" && order.payoutTransferId) {
    const { reverseTransferForOrder } = await import("./payouts");
    await reverseTransferForOrder(order);
  } else if (order.payoutStatus === "earmarked") {
    // Task #543 — Refund before Bill released the payout: just cancel
    // the held earmark so the queue doesn't display a phantom row for
    // an order the customer already got their money back on.
    const { cancelHeldEarmarksForSource } = await import("./payoutEarmarks");
    await cancelHeldEarmarksForSource("order_royalty", order.id, "Order refunded before release");
    await db
      .update(orders)
      .set({ payoutStatus: "skipped", payoutError: "Refunded before release" })
      .where(eq(orders.id, order.id));
  }
  await db
    .update(orders)
    .set({ status: "refunded", refundedAt: new Date(), goodDeedNumber: null })
    .where(eq(orders.id, order.id));
  // Restore stock if the SKU was metered. Best-effort — pulled from the
  // first format-kind order item snapshot we wrote at purchase time.
  const items = await getOrderItems(order.id);
  const formatItem = items.find((i) => i.kind === "format");
  if (formatItem) {
    await db
      .update(albumSkus)
      .set({ stock: sql`${albumSkus.stock} + 1` })
      .where(and(
        eq(albumSkus.albumId, order.albumId),
        eq(albumSkus.format, formatItem.sku as any),
        sql`${albumSkus.stock} IS NOT NULL`,
      ));
  }
  // goodDeedNumber is voided (nulled) on refund so the certificate is
  // no longer renderable for this order. We never reuse the freed slot
  // — MAX()+1 stays monotonic even with gaps (Task #52 will add a
  // partial unique index + retry loop for concurrent assignment).
  // Return the album lock to its pre-purchase state. (Other orders for
  // this customer + album may still grant access; we only revoke when
  // this is the *only* paid order for the pair.)
  const remaining = await db
    .select({ id: orders.id })
    .from(orders)
    .where(
      and(
        eq(orders.customerId, order.customerId),
        eq(orders.albumId, order.albumId),
        eq(orders.status, "paid"),
      ),
    );
  if (remaining.length === 0) {
    await db.delete(userAlbums).where(and(eq(userAlbums.userId, order.customerId), eq(userAlbums.albumId, order.albumId)));
  }
}
