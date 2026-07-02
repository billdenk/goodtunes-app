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
import { quoteShipping, normalizeCountry } from "./shipping";
import {
  albums,
  albumSkus,
  albumAddons,
  customAddons,
  customAddonArtists,
  customAddonGiftBoxes,
  organizations,
  payoutFormatCosts,
  pressFormatCosts,
  orders,
  orderItems,
  orderCopies,
  signedCertReservations,
  customerUsers,
  emailVerifications,
  userAlbums,
  authTokens,
  signupVerifyTokens,
  TERMS_VERSION,
  gifts,
  ALBUM_FORMATS,
  ALBUM_FORMAT_LABEL,
  ALBUM_ADDON_KINDS,
  ALBUM_ADDON_LABEL,
  BOOKLET_ELIGIBLE_FORMATS,
  type AlbumFormat,
  type AlbumAddonKind,
  type StripeAddressSnapshot,
  type AlbumSku,
  type AlbumAddon,
  type Order,
  type OrderItem,
  type OrderCopy,
} from "@shared/schema";
import {
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
  resolveCatalogIdentity,
  seedHellbenderCatalog,
  seedMrpCatalog,
  seedPmpCatalog,
  HELLBENDER_DOMAIN,
  MRP_DOMAIN,
  PMP_DOMAIN,
} from "./pressCatalog";
import { registerPressPortalRoutes } from "./pressPortal";
import { registerPrinterPortalRoutes } from "./printerPortal";
import { grantLltBonusIfEligible } from "./lltBonus";
import { hasReachedSunset } from "@shared/albumStage";
import { and, asc, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
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

// Task #844 — Operator-created custom ("Gift of Hope") add-ons that apply
// to an album by way of its primary artist. An add-on is attached to one
// or more People; it surfaces on every album whose `primaryArtistId` is
// one of those People. Returns only `active` rows, joined to the owning
// non-profit for display. Empty when the album has no primary artist or
// no add-on targets that artist.
type CustomAddonForAlbum = {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  priceCents: number;
  // Task #1867 — flat per-box shipping the fan pays (× quantity).
  shippingCents: number;
  fulfiller: string | null;
  orgName: string;
  orgLogoUrl: string | null;
  // Task #1842 — variable amount fields
  fanChoosesAmount: boolean;
  minAmountCents: number | null;
  presetAmountsCents: number[] | null;
};
async function listCustomAddonsForAlbum(
  primaryArtistId: string | null,
): Promise<CustomAddonForAlbum[]> {
  // Task #987 — an add-on surfaces on this album when it's active AND
  // either (a) it's scoped to all artists, or (b) the album's primary
  // artist is explicitly attached. All-artists add-ons therefore show
  // even on albums with no primary artist linked.
  const attachedToArtist = primaryArtistId
    ? inArray(
        customAddons.id,
        db
          .select({ id: customAddonArtists.customAddonId })
          .from(customAddonArtists)
          .where(eq(customAddonArtists.personId, primaryArtistId)),
      )
    : undefined;
  const scope = attachedToArtist
    ? or(eq(customAddons.appliesToAllArtists, true), attachedToArtist)
    : eq(customAddons.appliesToAllArtists, true);
  const rows = await db
    .select({
      id: customAddons.id,
      name: customAddons.name,
      description: customAddons.description,
      imageUrl: customAddons.imageUrl,
      priceCents: customAddons.priceCents,
      shippingCents: customAddons.shippingCents,
      fulfiller: customAddons.fulfiller,
      orgName: organizations.name,
      orgLogoUrl: organizations.logoUrl,
      fanChoosesAmount: customAddons.fanChoosesAmount,
      minAmountCents: customAddons.minAmountCents,
      presetAmountsCents: customAddons.presetAmountsCents,
    })
    .from(customAddons)
    .innerJoin(organizations, eq(organizations.id, customAddons.organizationId))
    .where(and(eq(customAddons.active, true), scope))
    .orderBy(asc(customAddons.position), asc(customAddons.createdAt));
  return rows.map((r) => ({
    ...r,
    presetAmountsCents: Array.isArray(r.presetAmountsCents) ? (r.presetAmountsCents as number[]) : null,
  }));
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
  // Task #624 — broker / wholesale discount applied to the press at
  // save time (snapshot of `manufacturers.brokerDiscountPct`). Null
  // when no invited press was resolved.
  costSnapshotBrokerDiscountPct: number | null;
  // Task #624 — discounted manufacturing snapshot (floor of retail ×
  // (100 - brokerDiscountPct)/100). Persisted alongside the retail
  // snapshot + pct so payout/margin reporting reads what GoodTunes
  // actually pays the press without recomputing from a live pct.
  costSnapshotManufacturingDiscountedCents: number | null;
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
  // Task #1025 — exact catalog identity of the saved vinyl pick. Pins
  // the snapshot to the press + tier + color ROWS so it resolves the
  // same swatch for every admin (names alone drift on catalog re-import
  // / cross-press views). Null on the placeholder / legacy vinyl path.
  pressId: string | null;
  pressTierId: string | null;
  pressColorId: string | null;
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
    costSnapshotBrokerDiscountPct: input.costSnapshotBrokerDiscountPct,
    costSnapshotManufacturingDiscountedCents: input.costSnapshotManufacturingDiscountedCents,
    costSnapshotPublishingCents: input.costSnapshotPublishingCents,
    costSnapshotPaymentProcessingCents: input.costSnapshotPaymentProcessingCents,
    costSnapshotGoodtunesCents: input.costSnapshotGoodtunesCents,
    costSnapshotTrackCount: input.costSnapshotTrackCount,
    vinylColor: input.vinylColor,
    vinylColorTier: input.vinylColorTier,
    jacketUpgrade: input.jacketUpgrade,
    quantityTier: input.quantityTier,
    costSource: input.costSource,
    pressId: input.pressId,
    pressTierId: input.pressTierId,
    pressColorId: input.pressColorId,
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
// Task #793 — resolve the flat "7\" + booklet" set price for the
// with-booklet variant. New saves stamp `bundlePriceCents`; legacy
// booklet add-ons (no bundle price) fall back to the old summed total
// (7" alone price + standalone booklet add-on price) so an existing
// add-on maps cleanly into the "with booklet" option — no double-charge,
// nothing disappears. Callers pass the resolved 7" SKU alone price.
function resolveBookletBundleCents(skuAlonePriceCents: number, addon: AlbumAddon): number {
  return addon.bundlePriceCents ?? skuAlonePriceCents + addon.priceCents;
}

async function upsertAddon(input: {
  albumId: string;
  kind: AlbumAddonKind;
  priceCents: number;
  minPriceCents: number;
  active: boolean;
  costCentsSnapshot: number | null;
  plannedQuantity: number | null;
  // Task #579 — booklet add-on carries its own print-ready cover.
  // `undefined` = leave the existing value alone; explicit `null`
  // clears the previously-uploaded art.
  artworkUrl?: string | null;
  // Task #793 — flat "7\" + booklet" set price. `undefined` leaves the
  // existing value; explicit null clears it (falls back to summed total).
  bundlePriceCents?: number | null;
}): Promise<AlbumAddon> {
  const setOnConflict: Record<string, unknown> = {
    priceCents: input.priceCents,
    minPriceCents: input.minPriceCents,
    active: input.active,
    costCentsSnapshot: input.costCentsSnapshot,
    plannedQuantity: input.plannedQuantity,
  };
  if (input.artworkUrl !== undefined) setOnConflict.artworkUrl = input.artworkUrl;
  if (input.bundlePriceCents !== undefined) setOnConflict.bundlePriceCents = input.bundlePriceCents;
  const [row] = await db
    .insert(albumAddons)
    .values(input)
    .onConflictDoUpdate({
      target: [albumAddons.albumId, albumAddons.kind],
      set: setOnConflict,
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

// Task #2061 — serialize one Gift-of-Hope box for the admin order queue.
// `canSeePII` decides whether recipient name / phone / address / message
// (and giver name) come through. When false the row is status-only so a
// fulfiller can see "personalized, foundation chooses" without the PII.
function adminGiftBoxView(
  b: typeof customAddonGiftBoxes.$inferSelect,
  canSeePII: boolean,
) {
  const base = {
    id: b.id,
    position: b.position,
    mode: b.mode,
    personalized: !!b.mode,
    piiVisible: canSeePII,
  };
  if (!canSeePII) return base;
  return {
    ...base,
    recipientName: b.recipientName,
    recipientPhone: b.recipientPhone,
    address1: b.address1,
    address2: b.address2,
    city: b.city,
    zip: b.zip,
    state: b.state,
    giverName: b.giverName,
    message: b.message,
  };
}

// Assigns the next per-album GoodDeed number atomically. We rank by
// paid-order count for the album so numbers stay dense; voided
// (refunded) numbers are reused only if no later number was minted.
// For simplicity in this v1 we use `max(goodDeedNumber)+1` per album,
// which is monotonic — refunds leave gaps. Acceptable trade-off vs.
// the user-confusing "your number changed" problem.
// Task #551 — Retry wrapper for any insert/update that mints a
// GoodDeed number. The partial unique index
// `orders_album_good_deed_number_uniq` (album_id, good_deed_number)
// turns a concurrent webhook race into a Postgres 23505 instead of a
// silent duplicate. We catch that one error and retry with a fresh
// MAX+1 lookup. Anything else bubbles up unchanged.
export async function withRetryOnGoodDeedCollision<T>(
  albumId: string,
  fn: () => Promise<T>,
  maxRetries = 5,
): Promise<T> {
  let lastErr: any = null;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (e: any) {
      const code = e?.code ?? e?.cause?.code;
      const constraint: string = e?.constraint ?? e?.cause?.constraint ?? "";
      const detail: string = e?.detail ?? e?.cause?.detail ?? "";
      const isCollision =
        code === "23505" &&
        (/good_deed/i.test(constraint) || /good_deed_number/i.test(detail));
      if (!isCollision) throw e;
      lastErr = e;
      console.warn(
        `[good-deed-collision] album=${albumId} attempt=${attempt + 1}/${maxRetries} retrying after 23505`,
      );
    }
  }
  throw lastErr ?? new Error("withRetryOnGoodDeedCollision: exhausted retries");
}

export async function assignNextGoodDeedNumber(albumId: string): Promise<number> {
  // Floor = max(goodDeedNumber across paid orders, per-copy
  // goodDeedNumber across order_copies, certificateNumber across owned
  // user_albums). The user_albums leg matters because the gogoods.com
  // importer (Task #398) stamps the legacy collectible index into
  // `user_albums.certificateNumber` for owned-but-no-paid-order rows;
  // without considering it here we could mint a duplicate GoodDeed
  // number on the next real sale. The order_copies leg matters from
  // Task #549 onward — multi-quantity orders mint one per signed copy.
  // `db.execute` (node-postgres) resolves to a QueryResult — the rows live on
  // `.rows`, it is NOT array-iterable, so read the first row off `.rows` like
  // every other db.execute caller in this file (Array.isArray guard keeps it
  // correct should a future driver return the rows array directly).
  const res: any = await db.execute(sql<{ max: number }>`
    SELECT GREATEST(
      COALESCE((SELECT MAX(${orders.goodDeedNumber}) FROM ${orders} WHERE ${orders.albumId} = ${albumId}), 0),
      COALESCE((SELECT MAX(${orderCopies.goodDeedNumber}) FROM ${orderCopies} WHERE ${orderCopies.albumId} = ${albumId}), 0),
      COALESCE((SELECT MAX(${userAlbums.certificateNumber}) FROM ${userAlbums} WHERE ${userAlbums.albumId} = ${albumId}), 0)
    ) AS max
  `);
  const row = Array.isArray(res) ? res[0] : res?.rows?.[0];
  return Number(row?.max ?? 0) + 1;
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
// Task #625 — resolve an album's routed press domain (artist
// invitedByPressId → label invitedByPressId, same fallback chain as
// the catalog cost lookup) so the booklet add-on can pick MRP's vs.
// PMP's ladder per-album. Returns null when no press is invited.
async function resolveAlbumPressDomain(album: {
  primaryArtistId: string | null;
  labelId: string | null;
}): Promise<string | null> {
  let pressId: string | null = null;
  if (album.primaryArtistId) {
    const p = await storage.getPersonById(album.primaryArtistId);
    if (p && (p as any).invitedByPressId) pressId = String((p as any).invitedByPressId);
  }
  if (!pressId && album.labelId) {
    const l = await storage.getLabelById(album.labelId);
    if (l && (l as any).invitedByPressId) pressId = String((l as any).invitedByPressId);
  }
  if (!pressId) return null;
  const press = await storage.getManufacturerById(pressId);
  return (press as any)?.domain ?? null;
}

// Task #736 — resolve an album's press mode (god-view). Independent of
// the invitedByPressId stamp so an unaffiliated artist can still be put
// in "all" mode. Artist's explicit mode wins over the label's, mirroring
// press resolution: a non-null artist value short-circuits; otherwise we
// fall to the label; otherwise the platform default of "dedicated".
export async function resolveAlbumPressMode(album: {
  primaryArtistId: string | null;
  labelId: string | null;
}): Promise<"dedicated" | "all"> {
  if (album.primaryArtistId) {
    const p = await storage.getPersonById(album.primaryArtistId);
    const m = (p as any)?.pressMode;
    if (m === "dedicated" || m === "all") return m;
  }
  if (album.labelId) {
    const l = await storage.getLabelById(album.labelId);
    const m = (l as any)?.pressMode;
    if (m === "dedicated" || m === "all") return m;
  }
  return "dedicated";
}

// Task #752 — Demo Mode override. Reads the session-scoped demo state set
// by PUT /api/admin/demo-mode and returns it ONLY after re-confirming the
// caller is a super_admin. The double-check matters: the demo state can
// only ever be written by a super_admin session, but a defensive re-read
// here means that even if a session were somehow shared / downgraded, a
// non-super viewer never gets the forced view. Returns null = no override
// (normal Live resolution). View-only by contract — callers must apply it
// to the read response, never to a save path.
async function getDemoOverride(
  req: Request,
): Promise<{ kind: "press"; pressId: string } | { kind: "competitive" } | null> {
  const demo = (req.session as any)?.demoMode as
    | { kind: "press"; pressId: string }
    | { kind: "competitive" }
    | undefined;
  if (!demo) return null;
  const userId = req.session?.userId;
  if (!userId) return null;
  try {
    const { getUserRole } = await import("./auth/roles");
    const info = await getUserRole(userId);
    if (info?.role !== "super_admin") return null;
  } catch {
    return null;
  }
  return demo;
}

// Task #736 — re-resolve a single album's saved catalog SKU snapshots
// against the album's *currently* resolved press. Used when a governing
// stamp is corrected (PATCH invited-press) so a previously-saved SKU
// stops serving the old press's pricing without a manual re-save. Only
// touches catalog-sourced, unlocked, live rows — at-press (locked) runs
// keep their committed numbers. Rows whose saved tier/color no longer
// resolves on the new press are zeroed so the SellPanel re-prompts for a
// quote rather than silently showing stale math.
export async function reresolveAlbumSkuSnapshots(albumId: string): Promise<{
  scanned: number;
  healed: number;
}> {
  const album = await storage.getAlbumById(albumId, { includeHidden: true });
  if (!album) return { scanned: 0, healed: 0 };
  // Resolve the album's press the same way the SKU save + invited-press
  // endpoint do (artist → label).
  let pressId: string | null = null;
  if (album.primaryArtistId) {
    const p = await storage.getPersonById(album.primaryArtistId);
    if (p && (p as any).invitedByPressId) pressId = String((p as any).invitedByPressId);
  }
  if (!pressId && album.labelId) {
    const l = await storage.getLabelById(album.labelId);
    if (l && (l as any).invitedByPressId) pressId = String((l as any).invitedByPressId);
  }
  const pct = pressId
    ? (await storage.getManufacturerById(pressId).then((m) => (m as any)?.brokerDiscountPct))
    : null;
  const brokerDiscountPct =
    typeof pct === "number" && pct >= 0 && pct <= 100 ? pct : null;

  const rowsRes: any = await db.execute(sql`
    SELECT id, format, planned_quantity, vinyl_color, vinyl_color_tier, quantity_tier
      FROM album_skus
     WHERE album_id = ${albumId}
       AND cost_source = 'catalog'
       AND deleted_at IS NULL
       AND locked_at IS NULL
  `);
  const rows = (rowsRes.rows ?? rowsRes) as Array<{
    id: string;
    format: AlbumFormat;
    planned_quantity: number | null;
    vinyl_color: string | null;
    vinyl_color_tier: string | null;
    quantity_tier: number | null;
  }>;
  let healed = 0;
  for (const row of rows) {
    let unitCents = 0;
    if (pressId && row.vinyl_color_tier) {
      const tierRes: any = await db.execute(sql`
        SELECT id FROM press_color_tiers
         WHERE press_id = ${pressId} AND format = ${row.format} AND name = ${row.vinyl_color_tier}
         LIMIT 1
      `);
      const tier = (tierRes.rows ?? tierRes)[0] as { id: string } | undefined;
      if (tier) {
        let colorId: string | null = null;
        if (row.vinyl_color) {
          const colorRes: any = await db.execute(sql`
            SELECT id FROM press_colors WHERE tier_id = ${tier.id} AND name = ${row.vinyl_color} LIMIT 1
          `);
          colorId = ((colorRes.rows ?? colorRes)[0] as { id: string } | undefined)?.id ?? null;
        }
        const looked = await lookupCatalogUnitCents({
          pressId,
          format: row.format,
          tierId: tier.id,
          colorId,
          quantity: row.quantity_tier ?? row.planned_quantity ?? null,
        });
        if (looked && looked.unitCents > 0) unitCents = looked.unitCents;
      }
    }
    const discounted =
      brokerDiscountPct != null && brokerDiscountPct > 0 && unitCents > 0
        ? Math.floor((unitCents * (100 - brokerDiscountPct)) / 100)
        : null;
    await db.execute(sql`
      UPDATE album_skus
         SET cost_snapshot_manufacturing_cents = ${unitCents},
             cost_snapshot_manufacturing_discounted_cents = ${discounted},
             cost_snapshot_broker_discount_pct = ${brokerDiscountPct}
       WHERE id = ${row.id}
    `);
    healed++;
  }
  return { scanned: rows.length, healed };
}

// Admin-aware visibility for fan-facing reads. Mirrors routes.ts:isAdminUser
// so an admin / god-view caller can preview the Buy sheet on a staged
// (future-dated or hidden) release while a real fan still hits the sunrise
// 404. Kept self-contained here — routes.ts dynamically imports commerce.ts,
// so a static import back the other way would risk a module cycle.
async function viewerIsAdmin(req: Request): Promise<boolean> {
  let found: { userId: string; kind: "admin" | "customer" } | undefined;
  if (req.session?.userId) {
    found = {
      userId: req.session.userId,
      kind: (req.session.kind ?? "admin") as "admin" | "customer",
    };
  } else {
    const auth = req.headers.authorization;
    if (auth?.startsWith("Bearer ")) found = await storage.getAuthBy(auth.slice(7));
  }
  if (!found || found.kind !== "admin") return false;
  // Same host/kind boundary getAuthFromRequest enforces: in prod an admin
  // token on a customer host is rejected; dev (host unknown) trusts the kind.
  if (req.hostKnown && found.kind !== req.authKind) return false;
  const u = await storage.getUser(found.userId);
  return !!u?.isAdmin;
}

export function registerCommerceRoutes(app: Express) {
  // ─── Public catalog reads ────────────────────────────────────────
  // GET /api/albums/:id/buy-options — what the fan-side Buy sheet renders.
  // Returns active SKUs and active add-ons. Hidden / inactive rows never
  // leak; the admin endpoint below returns the full list for editing.
  app.get("/api/albums/:id/buy-options", async (req, res) => {
    // Admin-aware: an admin previewing a staged release sees the Buy sheet
    // (mirrors the /api/albums/:id detail route); real fans stay sunrise-gated.
    // Task #1766 — a valid preview pass for THIS album also unlocks the Buy
    // sheet (so family reviewers see real pricing) without granting a charge.
    let includeHidden = await viewerIsAdmin(req);
    if (!includeHidden) {
      const { readPreviewPass } = await import("./previewPass");
      const pass = readPreviewPass(req);
      if (pass && pass.albumId === req.params.id) includeHidden = true;
    }
    const album = await storage.getAlbumById(req.params.id, { includeHidden });
    if (!album) return res.status(404).json({ message: "Album not found" });
    // Task #2428 — GoodTunes Shopify+ albums are sold on the customer's own
    // Shopify store, never on the GoodTunes fan surface. Return an empty,
    // non-buyable payload so the fan Buy sheet / album-page CTA never offers
    // a purchase. The checkout endpoint hard-rejects too (defense in depth).
    if ((album as any).sellMode === "shopify_plus") {
      return res.json({
        albumId: album.id,
        title: album.title,
        artist: album.artist,
        artwork: album.artwork,
        currency: "usd",
        sunsetReached: false,
        buyable: false,
        skus: [],
        addons: [],
        signedCertSoldOut: false,
        bookletEligible: false,
        bookletBundlePriceCents: null,
        customAddons: [],
      });
    }
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
    // Task #579 — Hide the `booklet` add-on entirely on releases that
    // don't have a 7" vinyl OR cassette SKU. The trim only fits those
    // packaging formats; surfacing it on a 12"-only release would be
    // misleading. Eligibility uses the *active* SKU list above so a
    // dormant 7" draft can't unlock the booklet for fans.
    const skuFormats = new Set(skus.map((s) => s.format));
    const bookletEligible = (BOOKLET_ELIGIBLE_FORMATS as readonly string[]).some(
      (f) => skuFormats.has(f),
    );
    const visibleAddons = addons.filter(
      (a) => !(a.kind === "booklet" && !bookletEligible),
    );
    // Task #793 — the 7" single sells the booklet as an either/or variant
    // ("7\" alone" vs "7\" + booklet"), not a stacked add-on. Surface the
    // resolved flat set price for the with-booklet option so the BuySheet
    // can render two mutually-exclusive 7" prices. Null unless a 7" SKU
    // AND an active booklet add-on both exist. Cassette keeps the legacy
    // stacked toggle, so this only resolves against the 7" SKU.
    const sevenSku = skus.find((s) => s.format === "7_inch") ?? null;
    const bookletAddonRow = addons.find((a) => a.kind === "booklet") ?? null;
    const bookletBundlePriceCents =
      sevenSku && bookletAddonRow
        ? resolveBookletBundleCents(sevenSku.priceCents, bookletAddonRow)
        : null;
    // Task #844 — operator-created custom ("Gift of Hope") add-ons that
    // target this album's primary artist. Rendered as a single optional
    // checkbox (one per order) in the Buy sheet.
    const customAddonRows = await listCustomAddonsForAlbum(album.primaryArtistId);
    // Task #1049 — once the album's sunset date arrives it leaves the
    // GoodTunes exclusive window for streaming, so the buy window closes:
    // every format reads sold out regardless of remaining stock. Computed
    // from the shared rule so the BuySheet, album-page CTA, and checkout
    // guard below all agree.
    const sunsetReached = hasReachedSunset(album.streamingReleaseDate);
    // Task #1932 — always include a CD option in buy-options so fans see it
    // as a format choice. When no real active CD SKU exists we inject a
    // synthetic placeholder that looks selectable but is blocked from
    // checkout both client- and server-side.
    const hasCdSku = skus.some((s) => s.format === "cd");
    const mappedSkus = skus.map((s) => ({
      id: s.id,
      format: s.format,
      label: ALBUM_FORMAT_LABEL[s.format as AlbumFormat] ?? s.format,
      priceCents: s.priceCents,
      stock: s.stock,
      soldOut: sunsetReached || (s.stock !== null && s.stock <= 0),
      // Task #201 — fan-side BuySheet renders <VinylPreview> against
      // these picks. Non-vinyl SKUs leave both fields null and the UI
      // falls back to the format label only.
      vinylColor: s.vinylColor ?? null,
      jacketUpgrade: (s.jacketUpgrade as JacketUpgrade | null) ?? null,
    }));
    if (!hasCdSku) {
      mappedSkus.push({
        id: "placeholder:cd",
        format: "cd",
        label: ALBUM_FORMAT_LABEL["cd"] ?? "CD",
        priceCents: 0,
        stock: null,
        soldOut: false,
        vinylColor: null,
        jacketUpgrade: null,
        isPlaceholder: true,
      } as typeof mappedSkus[number] & { isPlaceholder: boolean });
    }
    res.json({
      albumId: album.id,
      title: album.title,
      artist: album.artist,
      artwork: album.artwork,
      currency: "usd",
      sunsetReached,
      // Task #2428 — direct/shopify albums are buyable on the GoodTunes
      // fan surface; Shopify+ short-circuits above with buyable:false.
      buyable: true,
      skus: mappedSkus,
      addons: visibleAddons.map((a) => ({
        id: a.id,
        kind: a.kind,
        label: ALBUM_ADDON_LABEL[a.kind as AlbumAddonKind] ?? a.kind,
        priceCents: a.priceCents,
        minPriceCents: a.minPriceCents,
        // Task #579 — booklet renders its own thumbnail in the Buy
        // sheet (the printed cover, NOT the album jacket). Null on
        // signed_cert and on booklet rows the artist hasn't dropped
        // art on yet.
        artworkUrl: a.artworkUrl ?? null,
      })),
      signedCertSoldOut,
      bookletEligible,
      // Task #793 — flat "7\" + booklet" set price for the either/or
      // variant on the 7" single. Null when not applicable.
      bookletBundlePriceCents,
      // Task #844 — custom ("Gift of Hope") add-ons for this album's
      // primary artist. Each is a single optional checkbox (one per
      // order); empty array when none apply.
      customAddons: customAddonRows.map((c) => ({
        id: c.id,
        name: c.name,
        description: c.description,
        imageUrl: c.imageUrl,
        priceCents: c.priceCents,
        // Task #1867 — per-box shipping so the Buy sheet can fold it into
        // the displayed shipping line + total before checkout.
        shippingCents: c.shippingCents,
        orgName: c.orgName,
        orgLogoUrl: c.orgLogoUrl,
        // Task #1842 — variable amount fields so the Buy sheet can render
        // the gift-amount picker when the operator has enabled it.
        fanChoosesAmount: c.fanChoosesAmount,
        minAmountCents: c.minAmountCents,
        presetAmountsCents: c.presetAmountsCents,
      })),
    });
  });

  // GET /api/checkout/publishable-key — the browser fetches this to boot
  // Stripe.js. Lives behind the connector so the key isn't hardcoded.
  // Also returns `isTestMode: true` when the key starts with `pk_test_`
  // so the BuySheet can show a "no real charge" indicator.
  app.get("/api/checkout/publishable-key", async (_req, res) => {
    try {
      const key = await getStripePublishableKey();
      res.json({ publishableKey: key, isTestMode: key.startsWith("pk_test_") });
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
    // Task #624 — server-side canonical "effective manufacturing"
    // (discounted when the snapshot pair is set, retail otherwise) +
    // derived internal margin per SKU. Admin reporting / margin
    // surfaces must read these instead of recomputing from the live
    // press broker pct (which can change after the row was saved).
    const skusWithInternal = skus.map((s) => {
      const retail = s.costSnapshotManufacturingCents ?? 0;
      const discounted = (s as any).costSnapshotManufacturingDiscountedCents as number | null | undefined;
      const effectiveManufacturingCents =
        discounted != null && discounted >= 0 ? discounted : retail;
      const brokerDeltaCents = retail - effectiveManufacturingCents;
      return {
        ...s,
        effectiveManufacturingCents,
        brokerDeltaCents,
      };
    });
    res.json({ skus: skusWithInternal, addons });
  });

  // Task #707 — Quote PDF export. The client (SellPanel) computes every
  // figure (it owns the breakdown / blockEconomics math) and POSTs the
  // already-resolved numbers here; this route is pure layout so the PDF
  // can never drift from the on-screen quote. Album title/artist come
  // from the DB (source of truth + access already gated by requireAdmin)
  // rather than trusting the client for the brand line.
  const quoteOptionSchema = z.object({
    label: z.string().max(60),
    priceCents: z.number().int().nullable(),
    qty: z.number().int().min(0),
    manufacturingCents: z.number().int(),
    publishingCents: z.number().int(),
    publishingTrackCount: z.number().int().nullable(),
    paymentProcessingCents: z.number().int(),
    goodtunesCents: z.number().int(),
    costPerUnitCents: z.number().int().nullable(),
    profitCents: z.number().int().nullable(),
    totalCents: z.number().int().nullable(),
    needsQuote: z.boolean(),
  });
  const quotePdfSchema = z.object({
    format: z.object({ label: z.string().max(80) }),
    pkg: z.object({
      colorName: z.string().max(120).nullable().optional(),
      trackCount: z.number().int().nullable().optional(),
      jacketLabel: z.string().max(120).nullable().optional(),
      pressName: z.string().max(120).nullable().optional(),
    }),
    options: z.array(quoteOptionSchema).min(1).max(8),
  });
  app.post("/api/admin/albums/:id/quote-pdf", requireAdmin, async (req, res) => {
    const album = await storage.getAlbumById(String(req.params.id), {
      includeHidden: true,
    });
    if (!album) return res.status(404).json({ message: "Album not found" });
    const parsed = quotePdfSchema.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ message: parsed.error.issues[0]?.message ?? "Invalid quote" });
    }
    const { renderQuotePdf } = await import("./quotePdf");
    const pdf = await renderQuotePdf({
      album: { title: album.title ?? "", artist: album.artist ?? "" },
      format: parsed.data.format,
      pkg: parsed.data.pkg,
      options: parsed.data.options,
    });
    const slug = (album.title ?? "quote")
      .replace(/[^A-Za-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "quote";
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="GoodTunes-Quote-${slug}.pdf"`,
    );
    res.send(pdf);
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
    // Task #1025 — exact catalog identity snapshot. Captured only when
    // the catalog lookup below actually resolves a tier, so a legacy /
    // placeholder save never leaves stale ids behind.
    let pressIdSnap: string | null = null;
    let pressTierIdSnap: string | null = null;
    let pressColorIdSnap: string | null = null;
    // Task #624 — broker discount snapshot. Resolved alongside the
    // press lookup below so downstream payout math can recompute the
    // discounted "what we actually pay the press" amount from the
    // (retail) `costSnapshotManufacturingCents`. Null when no invited
    // press resolves (the placeholder / non-catalog path).
    let brokerDiscountPct: number | null = null;

    if (parsed.data.pressTierId) {
      // Task #1035 — resolve the press from the CHOSEN TIER itself (each
      // tier row carries its `pressId`), NOT from the album's invited
      // press. The old artist→label `invitedByPressId` resolution broke
      // two ways: (a) an album with no invited press got no `pressId`, so
      // the catalog lookup was skipped and the deliberate pick fell
      // through to the placeholder default color; (b) when the operator
      // picked a color from a press selected via the Printer chip
      // (god-view / "All Presses") that differs from the invited press,
      // the `(pressId, tierId, format)` lookup missed and returned null.
      // Pricing against the tier's own press makes the pick stick
      // regardless of invited-press state.
      const identity = await resolveCatalogIdentity({
        tierId: parsed.data.pressTierId,
        colorId: parsed.data.pressColorId ?? null,
        format: parsed.data.format,
      });
      if (identity) {
        const pressId = identity.pressId;
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
        } else {
          // Task #1035 — the pick is a deliberate catalog choice but has
          // no priced ladder rung for this press/tier/format/qty. Do NOT
          // fall through to the placeholder branch and overwrite the
          // operator's color with a default — keep the chosen tier/color
          // identity (so reload restores it) and leave manufacturing on
          // the platform placeholder cost. costSource stays "placeholder"
          // (the cost genuinely is the placeholder), but the pinned
          // identity below means the row reloads as the operator's pick.
          vinylColorTier = identity.tierName;
          vinylColorId = identity.colorName;
          if (vinyl) {
            quantityTier = snapToQuantityTier(
              parsed.data.plannedQuantity ?? DEFAULT_VINYL_QUANTITY,
            ).tier;
          }
        }
        // Task #1025/#1035 — pin the exact catalog rows (resolved press +
        // chosen tier + chosen color) alongside the names so the saved
        // color resolves identically for every admin regardless of
        // catalog re-imports or cross-press views — and so an unpriceable
        // pick still round-trips to the operator's intent on reload.
        pressIdSnap = pressId;
        pressTierIdSnap = parsed.data.pressTierId;
        pressColorIdSnap = parsed.data.pressColorId ?? null;
        // Task #624 — capture the press's broker discount rate at save
        // time so finalised SKUs aren't retroactively repriced if Bill
        // tunes the rate later. Tied to the SAME resolved press as the
        // catalog lookup, snapshotted even on a lookup miss so reporting
        // can still attribute the press correctly.
        const press = await storage.getManufacturerById(pressId);
        const pct = (press as any)?.brokerDiscountPct;
        if (typeof pct === "number" && pct >= 0 && pct <= 100) {
          brokerDiscountPct = pct;
        }
      }
    }

    // Task #1035 — only the legacy / non-catalog vinyl path (no resolved
    // catalog pick) defaults the color. A deliberate catalog pick that
    // couldn't be priced sets `pressTierIdSnap` above, so it skips this
    // branch and keeps the operator's chosen color instead of reverting
    // to the EcoMix/ECO1 default.
    if (costSource === "placeholder" && vinyl && !pressTierIdSnap) {
      // Task #624 — retire the legacy Hellbender matrix as a runtime
      // pricing source. Pre-T218 vinyl picks (no pressTierId) still
      // record the color/jacket/quantity for reporting, but
      // manufacturing stays on the platform-default placeholder until
      // the row is re-saved through the catalog picker. This removes
      // the second Hellbender pricing source so saved costs can't
      // diverge from the per-rung catalog ladders.
      const colorOption =
        (parsed.data.vinylColor && VINYL_COLOR_BY_ID[parsed.data.vinylColor]) ||
        VINYL_COLOR_BY_ID[DEFAULT_VINYL_COLOR_ID];
      vinylColorId = colorOption.id;
      vinylColorTier = colorOption.tier;
      jacketUpgrade = parsed.data.jacketUpgrade ?? DEFAULT_JACKET_UPGRADE;
      const snap = snapToQuantityTier(parsed.data.plannedQuantity ?? DEFAULT_VINYL_QUANTITY);
      quantityTier = snap.tier;
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
      costSnapshotBrokerDiscountPct: brokerDiscountPct,
      // Discounted "what we actually pay the press" amount. Mirrors
      // SellPanel's admin Internal-margin readout so payout/margin
      // reporting reads the same number the admin saw at save time.
      costSnapshotManufacturingDiscountedCents:
        brokerDiscountPct !== null && brokerDiscountPct > 0
          ? Math.floor((manufacturingCents * (100 - brokerDiscountPct)) / 100)
          : null,
      costSnapshotPublishingCents: platformCost.publishingCents,
      costSnapshotPaymentProcessingCents: platformCost.paymentProcessingCents,
      costSnapshotGoodtunesCents: platformCost.goodtunesCents,
      costSnapshotTrackCount: parsed.data.trackCount ?? null,
      vinylColor: vinylColorId,
      vinylColorTier,
      jacketUpgrade,
      quantityTier,
      costSource,
      pressId: pressIdSnap,
      pressTierId: pressTierIdSnap,
      pressColorId: pressColorIdSnap,
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
    const { getUserRole, findMembershipForScope } = await import("./auth/roles");
    const info = await getUserRole(userId);
    const pressId = String(req.params.id);
    if (!info) return res.status(403).json({ message: "Forbidden" });
    if (info.role === "super_admin" || info.role === "admin") return next();
    // Task #1036 — match against the membership SET, not the primary hat.
    if (await findMembershipForScope(userId, "manufacturer", pressId)) return next();
    return res.status(403).json({ message: "Forbidden" });
  };

  // Task #2335 — stricter EDIT gate for catalog/price mutations. A
  // read-only press "Staff" teammate holds a manufacturer membership (so
  // requirePressScope passes) but must NOT change the catalog, prices, or
  // specs — same read-only intent already enforced on the press profile,
  // People, and pipeline. pressUserCanEdit returns true for super_admin /
  // admin and press Owner/Admin, false for Staff (edit_metadata=false
  // override). Chain this AFTER requirePressScope on every mutation so a
  // non-member still gets the scope "Forbidden" and only an in-scope Staff
  // hits this clearer message.
  const requirePressEditor = async (req: Request, res: Response, next: () => void) => {
    const userId = (req as any).adminUserId as string | undefined;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    const { pressUserCanEdit } = await import("./auth/partnerPermissions");
    if (await pressUserCanEdit(userId, String(req.params.id))) return next();
    return res.status(403).json({
      message:
        "Staff accounts can view the press and invite artists, but only an Owner/Admin can change the catalog or prices.",
    });
  };

  // Task #218 — mount the press catalog routes (formats/tiers/colors)
  // under the same requirePressScope as the legacy format-cost routes.
  // Task #2335 — also pass the editor gate so the catalog mutation routes
  // can additionally require Owner/Admin (reads stay scope-only).
  registerPressCatalogRoutes(app, requireAdmin, requirePressScope, requirePressEditor);

  // Task #522 — Press portal endpoints (customers/pipeline/invite/etc.)
  // share the same press-scope gate.
  registerPressPortalRoutes(app, requireAdmin, requirePressScope);

  // Task #2047 — GoodDeed Quickprinter portal. Its own scope gate (vendor
  // membership + isQuickprinter assertion) lives inside the module.
  registerPrinterPortalRoutes(app, requireAdmin);

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
  app.put("/api/admin/manufacturers/:id/format-costs/:format", requireAdmin, requirePressScope, requirePressEditor, async (req, res) => {
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

  app.delete("/api/admin/manufacturers/:id/format-costs/:format", requireAdmin, requirePressScope, requirePressEditor, async (req, res) => {
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

    // Task #736 — resolved press mode drives whether the SellPanel locks
    // to the single plant (dedicated) or unlocks the picker + cross-press
    // comparison (all). Independent of the invitedByPressId stamp below.
    let pressMode = await resolveAlbumPressMode(album);

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

    // Task #752 — Demo Mode override (super_admin-only, view-only). This
    // ONLY rewrites the read response the SellPanel renders from; nothing
    // here persists, and `getDemoOverride` re-confirms super_admin so a
    // fan / partner can never receive a forced view. Two shapes:
    //   • press       → force the whole view onto one chosen plant. Drop
    //                    the real scope (so the post-sale has-shipped lock
    //                    doesn't apply to a borrowed press) and pin
    //                    "dedicated" so it reads as that single plant.
    //   • competitive → force "all" so the picker + side-by-side bid
    //                    comparison open everywhere, even on an album with
    //                    no invited press (the press:null / mrpDefaults
    //                    branch below still returns, just in "all" mode).
    const demo = await getDemoOverride(req);
    if (demo?.kind === "press") {
      pressId = demo.pressId;
      scopeKind = null;
      scopeId = null;
      pressMode = "dedicated";
    } else if (demo?.kind === "competitive") {
      pressMode = "all";
    }
    const demoKind = demo?.kind ?? null;

    // Task #1830 — Gather catalogs for any presses referenced by saved SKUs
    // that differ from the resolved invited press. The /catalog endpoint is
    // gated by requirePressScope (blocks artists and non-press partners), so
    // we embed the needed catalog data here where artists already have access.
    // Albums are single-press in practice, so at most one extra entry lands.
    const skuPressCatalogs: Record<string, Awaited<ReturnType<typeof getPressCatalog>>> = {};
    try {
      const albumId = String(req.params.id);
      const skuRows = await db
        .select({ pressId: albumSkus.pressId })
        .from(albumSkus)
        .where(eq(albumSkus.albumId, albumId));
      const extraPressIds = [
        ...new Set(
          skuRows
            .map((s) => (s.pressId ? String(s.pressId) : null))
            .filter((id): id is string => !!id && id !== (pressId ?? "")),
        ),
      ];
      await Promise.all(
        extraPressIds.map(async (id) => {
          try {
            skuPressCatalogs[id] = await getPressCatalog(id);
          } catch {}
        }),
      );
    } catch {}

    if (!pressId) {
      // Task #656 — no press has been invited yet. Default the
      // manufacturing-cost lookup to MRP's seeded catalog so the
      // SellPanel's Profit-per-unit breakdown stops reading $0 for
      // vinyl rows. We keep `press: null` (so the partner-permissions
      // hard lock, the printer-chip row, and the format picker all
      // stay on their no-press code paths) and expose MRP's catalog
      // as `mrpDefaults` instead — the client only consumes it from
      // the cost-breakdown branch, never to scope the picker UI.
      let mrpDefaults: Awaited<ReturnType<typeof getPressCatalog>> | null = null;
      try {
        const mrp = await storage.getManufacturerByDomain(MRP_DOMAIN);
        if (mrp) {
          await seedMrpCatalog(); // memoized — instant if already seeded
          mrpDefaults = await getPressCatalog(mrp.id);
        }
      } catch {
        mrpDefaults = null;
      }
      // Task #1837 — derive the effective plant from saved SKUs so partner
      // roles see the chosen manufacturer instead of "No plant set". Keep
      // `press: null` so the MRP cost-math fallback, the picker lock, and
      // the format picker all stay on their no-press code paths.
      // Task #2369 — extend resolution to artist/label default_press_id first
      // (mirrors batchEnrichWithPressPlaceholders in routes.ts), so albums
      // homed to a press but with no saved SKU still show the press placeholder
      // in the Package designer jacket thumb and VinylPreview.
      let effectivePress: { id: string; name: string; domain: string | null; logoUrl: string | null; vinylPlaceholderUrl: string | null } | null = null;
      // Track where the effective press came from so the album Press panel
      // can surface an accurate origin label rather than the misleading
      // "Set on the artist's page" note.
      let effectivePressSource: "artist_default" | "label_default" | "sku_derived" | null = null;
      let effectiveScopeKind: "artist" | "label" | null = null;
      let effectiveScopeId: string | null = null;
      try {
        const albumId = String(req.params.id);
        let resolvedPressId: string | null = null;

        // Step 1: artist default_press_id
        if (!resolvedPressId && album.primaryArtistId) {
          const person = await storage.getPersonById(album.primaryArtistId);
          const dp = (person as any)?.defaultPressId ?? null;
          if (dp) {
            resolvedPressId = String(dp);
            effectivePressSource = "artist_default";
            effectiveScopeKind = "artist";
            effectiveScopeId = album.primaryArtistId;
          }
        }

        // Step 2: label default_press_id
        if (!resolvedPressId && album.labelId) {
          const label = await storage.getLabelById(album.labelId);
          const dp = (label as any)?.defaultPressId ?? null;
          if (dp) {
            resolvedPressId = String(dp);
            effectivePressSource = "label_default";
            effectiveScopeKind = "label";
            effectiveScopeId = album.labelId;
          }
        }

        // Step 3: derive from saved SKUs, but ONLY when they unambiguously
        // agree on a single press (Task #2371). If the album's SKUs span two
        // or more different presses there's no single plant to credit, so we
        // leave effectivePress null and let the operator/partner Package
        // designer fall back to the GoodTunes brand mark instead of arbitrarily
        // crediting whichever SKU happened to sort first. Steps 1 & 2
        // (artist/label default press) stay as-is — those are explicit single
        // choices, so they're unambiguous by construction.
        if (!resolvedPressId) {
          const skuPressRows = await db
            .select({ pressId: albumSkus.pressId })
            .from(albumSkus)
            .where(eq(albumSkus.albumId, albumId));
          const distinctSkuPresses = [
            ...new Set(
              skuPressRows
                .map((s) => (s.pressId ? String(s.pressId) : null))
                .filter((id): id is string => !!id),
            ),
          ];
          if (distinctSkuPresses.length === 1) {
            resolvedPressId = distinctSkuPresses[0];
            effectivePressSource = "sku_derived";
            // Link target for "Assign plant" CTA: prefer artist, fall back to label.
            if (album.primaryArtistId) {
              effectiveScopeKind = "artist";
              effectiveScopeId = album.primaryArtistId;
            } else if (album.labelId) {
              effectiveScopeKind = "label";
              effectiveScopeId = album.labelId;
            }
          }
        }

        if (resolvedPressId) {
          const p = await storage.getManufacturerById(resolvedPressId);
          if (p) {
            effectivePress = { id: p.id, name: p.name, domain: (p as any).domain ?? null, logoUrl: (p as any).logoUrl ?? null, vinylPlaceholderUrl: (p as any).vinylPlaceholderUrl ?? null };
          }
        }
      } catch {}
      // Even when no plant resolved, supply a scopeKind/scopeId so the
      // Press tab can deep-link to the entity's plant assignment control.
      if (!effectiveScopeKind) {
        if (album.primaryArtistId) {
          effectiveScopeKind = "artist";
          effectiveScopeId = album.primaryArtistId;
        } else if (album.labelId) {
          effectiveScopeKind = "label";
          effectiveScopeId = album.labelId;
        }
      }
      return res.json({
        press: null,
        hasShippedFirst: false,
        formatCosts: await listFormatCosts(),
        catalog: { formats: [] },
        mrpDefaults,
        pressMode,
        demo: demoKind,
        skuPressCatalogs,
        effectivePress,
        effectivePressSource,
        scopeKind: effectiveScopeKind,
        scopeId: effectiveScopeId,
      });
    }

    const press = await storage.getManufacturerById(pressId);
    // press might have been deleted out from under the column (SET NULL
    // isn't on the column — we left it untyped to keep the migration
    // simple). Treat a dangling reference as "no lock".
    if (!press) {
      return res.json({ press: null, hasShippedFirst: false, formatCosts: await listFormatCosts(), catalog: { formats: [] }, pressMode, demo: demoKind });
    }
    // Ensure the founding-press catalog is seeded. The seed functions are
    // memoized promises — on a warm instance this returns the already-resolved
    // promise instantly (O(1)). On a cold instance whose background boot seed
    // is still in flight, this awaits it so the read below sees populated rows.
    if ((press as any).domain === HELLBENDER_DOMAIN) await seedHellbenderCatalog();
    else if ((press as any).domain === MRP_DOMAIN) await seedMrpCatalog();
    else if ((press as any).domain === PMP_DOMAIN) await seedPmpCatalog();

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
        // Task #2371 — the press's domain lets admin cover surfaces resolve the
        // bundled grayscale placeholder SVG (pressPlaceholderArt.ts) so the
        // package designer / GoodDeed cert match the grayed logo the Albums
        // list shows. Operator-only payload; never reaches a fan cover.
        domain: (press as any).domain ?? null,
        logoUrl: (press as any).logoUrl ?? null,
        // Task #2261 — the press's uploaded default jacket image, so the
        // admin package designer can show the same branded jacket art the
        // press catalog editor shows on an art-less album (logo is the
        // corporate icon fallback). Operator-only payload; never reaches a
        // fan-facing cover.
        vinylPlaceholderUrl: (press as any).vinylPlaceholderUrl ?? null,
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
        // Task #624 — broker discount drives the admin-only "Internal
        // margin" line in SellPanel + cost tooltip. Always send (0
        // when unset) so the client renders consistently.
        brokerDiscountPct: Number((press as any).brokerDiscountPct ?? 0),
      },
      effectivePressSource: "invited" as const,
      hasShippedFirst,
      scopeKind,
      scopeId,
      formatCosts,
      // Task #218 — full press catalog for the SellPanel's Add Physical
      // picker. Empty `formats` array means the press hasn't built
      // their catalog yet; SellPanel falls back to a no-physical menu.
      catalog: await (async () => {
        // Task #2168 — filter hidden formats from the artist-facing picker.
        // The operator's catalog editor still receives them via the
        // /catalog admin route; this is the artist/label SellPanel path.
        // Task #2246 — must `await` the catalog before placing it in the
        // res.json() object literal. res.json() does NOT await nested
        // promises, so an un-awaited Promise here serializes to `{}` →
        // the SellPanel receives `catalog: {}` and can't price anything.
        const c = await getPressCatalog(pressId);
        return {
          ...c,
          formats: c.formats.filter((f) => !f.hidden),
        };
      })(),
      pressMode,
      demo: demoKind,
      skuPressCatalogs,
      // Task #2115 — the press's uploaded print templates (Jacket / Center
      // Labels / Inner Sleeve per product). Embedded here because this
      // endpoint is already artist-readable (unlike the requirePressScope
      // /catalog routes), so the album's Physical / Package area can offer
      // artists the template downloads. Only file-bearing rows are useful
      // to a downloader; spec-only rows (dims for the check) are dropped.
      templates: (await storage.listPressTemplateSpecs(pressId))
        .filter((t) => !!t.templateFileUrl)
        .map((t) => ({
          id: t.id,
          format: t.format,
          componentKey: t.componentKey,
          variantKey: t.variantKey,
          discCount: t.discCount,
          templateFileUrl: t.templateFileUrl,
        })),
    });
  });
  // Sku-press summary for InvitedByPressPanel: when no explicit plant is
  // assigned to an artist/label, these routes tell the panel whether any of
  // the entity's album SKUs unambiguously resolve to one press (so the "No
  // plant set" note can clarify the situation rather than flatly contradict
  // what the album Press panel shows).
  app.get("/api/admin/people/:id/sku-press-summary", requireAdmin, async (req, res) => {
    try {
      const personId = String(req.params.id);
      const rows = await db.execute(sql`
        SELECT DISTINCT s.press_id
        FROM album_skus s
        JOIN albums a ON a.id = s.album_id
        WHERE a.primary_artist_id = ${personId}
          AND a.deleted_at IS NULL
          AND s.press_id IS NOT NULL
      `);
      const pressIds = [...new Set(((rows as any).rows ?? []).map((r: any) => String(r.press_id)))];
      if (pressIds.length !== 1) return res.json({ skuDerivedPressName: null });
      const press = await storage.getManufacturerById(pressIds[0]);
      return res.json({ skuDerivedPressName: press?.name ?? null });
    } catch {
      return res.json({ skuDerivedPressName: null });
    }
  });

  app.get("/api/admin/labels/:id/sku-press-summary", requireAdmin, async (req, res) => {
    try {
      const labelId = String(req.params.id);
      const rows = await db.execute(sql`
        SELECT DISTINCT s.press_id
        FROM album_skus s
        JOIN albums a ON a.id = s.album_id
        WHERE a.label_id = ${labelId}
          AND a.deleted_at IS NULL
          AND s.press_id IS NOT NULL
      `);
      const pressIds = [...new Set(((rows as any).rows ?? []).map((r: any) => String(r.press_id)))];
      if (pressIds.length !== 1) return res.json({ skuDerivedPressName: null });
      const press = await storage.getManufacturerById(pressIds[0]);
      return res.json({ skuDerivedPressName: press?.name ?? null });
    } catch {
      return res.json({ skuDerivedPressName: null });
    }
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
    // Task #579 — booklet add-on carries its own print-ready cover.
    // Optional/null for signed_cert (which inherits the album jacket).
    artworkUrl: z.string().url().nullable().optional(),
    // Task #793 — flat "7\" + booklet" set price (booklet add-on only).
    // Omitted = leave the existing value; null clears it (falls back to
    // the summed total). Ignored on signed_cert saves.
    bundlePriceCents: z.number().int().min(0).nullable().optional(),
  });
  app.put("/api/admin/albums/:id/addons/:kind", requireAdmin, async (req, res) => {
    const album = await storage.getAlbumById(String(req.params.id), { includeHidden: true });
    if (!album) return res.status(404).json({ message: "Album not found" });
    const parsed = addonBodySchema.safeParse({ ...req.body, kind: String(req.params.kind) });
    if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid add-on" });
    const { getPayoutSettings } = await import("./payouts");
    const settings = await getPayoutSettings();
    // Task #579 — Booklet eligibility + cost snapshot. The add-on
    // only makes sense on releases with a 7" vinyl OR cassette SKU
    // (trim doesn't suit 12" jackets, CDs don't carry it). The
    // wholesale cost snapshots from the PMP ladder, snapped UP to
    // the next planned-quantity rung — so the artist's Profit
    // readout stays honest if they later edit the planned run.
    let costSnapshot: number | null = null;
    if (parsed.data.kind === "signed_cert") {
      costSnapshot = album.payoutCertCentsOverride ?? settings.certCostCents;
    } else if (parsed.data.kind === "booklet") {
      // Only enforce eligibility when the operator is turning the
      // booklet ON. Saving an inactive booklet must always succeed —
      // both so we can disable a previously-active upsell after its
      // eligible SKU is deactivated, and so passive no-op saves
      // never surface a scary 409 toast on the Design tab.
      if (parsed.data.active) {
        const skus = await listAllSkus(album.id);
        const eligible = skus.some(
          (s) => s.active && (BOOKLET_ELIGIBLE_FORMATS as readonly string[]).includes(s.format),
        );
        if (!eligible) {
          return res.status(409).json({
            message: "Add a 7\" vinyl or cassette SKU before offering a booklet.",
          });
        }
      }
      const { lookupBookletUnitCents } = await import("./pressCatalog");
      // Task #625 — booklet ladder is vendor-aware. Resolve the
      // album's routed press (artist → label fallback, same path
      // /invited-press uses) so MRP-routed albums snapshot MRP's
      // cheaper booklet quote and everyone else gets PMP's ladder.
      const pressDomain = await resolveAlbumPressDomain(album);
      costSnapshot = lookupBookletUnitCents(parsed.data.plannedQuantity ?? null, pressDomain);
    }
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
      artworkUrl: parsed.data.artworkUrl,
      // Task #793 — only the booklet add-on carries a bundle price.
      bundlePriceCents:
        parsed.data.kind === "booklet" ? parsed.data.bundlePriceCents : undefined,
    });
    res.json(row);
  });

  // Task #579 — Booklet wholesale preview, qty-driven. Mirrors the
  // signed-cert /gooddeed-pricing-preview shape so the admin
  // BookletPill can scrub the planned run and watch the per-unit
  // cost / run total update live. Snaps UP to the next PMP rung.
  app.get(
    "/api/admin/albums/:id/booklet-pricing-preview",
    requireAdmin,
    async (req, res) => {
      const runQty = Math.max(1, parseInt(String(req.query.runQty ?? "1"), 10) || 1);
      const album = await storage.getAlbumById(String(req.params.id), { includeHidden: true });
      const { lookupBookletUnitCents, snapBookletQty, resolveBookletLadder } =
        await import("./pressCatalog");
      // Task #625 — resolve the album's routed press so MRP-routed
      // releases preview MRP's ladder and everyone else gets PMP's
      // (resolveBookletLadder falls back to PMP).
      const pressDomain = album ? await resolveAlbumPressDomain(album) : null;
      const ladder = resolveBookletLadder(pressDomain);
      const snappedQty = snapBookletQty(runQty, pressDomain);
      const perUnitCents = lookupBookletUnitCents(runQty, pressDomain);
      const runTotalCents =
        ladder.runTotalsCents[snappedQty] ?? perUnitCents * snappedQty;
      res.json({
        runQty,
        snappedQty,
        perUnitCents,
        runTotalCents,
        // Mirror the field names the GoodDeed preview uses so the
        // BookletPill can read `totalPerUnitCents` interchangeably.
        totalPerUnitCents: perUnitCents,
        vendorDomain: ladder.domain,
        vendorLabel: ladder.label,
        bookletSpec: ladder.spec,
      });
    },
  );
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
    // Task #2059 — pre-check existence BEFORE minting/sending a code. A
    // fan whose email already has an account (commonly a passwordless
    // legacy gogoods import) used to burn a fresh 6-digit code on every
    // signup attempt: confirm consumed the code, signup-with-code then
    // 409'd, and once the codes ran out the *verify* step showed the
    // misleading "that code didn't match" error — so the fan thought the
    // code was broken when the real problem was an account they couldn't
    // get into. Detect the collision up front and tell the client to
    // surface the "account already exists → email me a sign-in link"
    // recovery branch instead of sending a code at all. (`/api/auth/lookup`
    // already exposes account existence to the login form, so this adds no
    // new enumeration surface.) signup-with-code keeps its own 409 as
    // defense-in-depth.
    const existingCustomer = await storage.getCustomerByEmail(email);
    if (existingCustomer) {
      return res.json({ ok: true, accountExists: true });
    }
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
    // Task #860 — record Terms acceptance at account creation. The fan
    // consented via the inline microcopy under the signup CTA; stamp the
    // moment + the version of Terms in force.
    await storage.updateCustomer(c.id, {
      emailVerifiedAt: new Date(),
      termsAcceptedAt: new Date(),
      termsVersion: TERMS_VERSION,
    });
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
  // Body shape (Task #549 — per-copy):
  //   { albumId, skuFormat, copies: [{ signedCert: bool }, …],
  //     signedCertPriceCents?: number }
  // Backwards-compat shape (single copy):
  //   { albumId, skuFormat, signedCert: bool, signedCertPriceCents?: number }
  //
  // Requires a signed-in customer. Returns { clientSecret } for embedded
  // checkout. All prices read server-side from albumSkus / albumAddons —
  // the client can't influence the amount Stripe charges (the optional
  // signedCertPriceCents is an *override above* the floor, never below).
  // Cap on copies-per-checkout is a soft UX guard; physical fulfillment
  // doesn't choke until much higher numbers.
  const MAX_COPIES_PER_CHECKOUT = 10;
  // Task #1630 — custom non-profit add-ons (e.g. Nightbirde's "Gift of
  // Hope") can now be bought in quantity. Defensive ceiling so a spoofed
  // client can't mint an absurd Stripe line; the donation box is a real
  // physical item so this stays modest.
  const MAX_CUSTOM_ADDON_QTY = 25;
  const checkoutSchema = z.object({
    albumId: z.string().min(1),
    skuFormat: z.enum(ALBUM_FORMATS),
    signedCert: z.boolean().optional(),
    signedCertPriceCents: z.number().int().min(0).optional(),
    // Task #579 — Booklet add-on toggle + optional override price.
    booklet: z.boolean().default(false),
    bookletPriceCents: z.number().int().min(0).optional(),
    // Task #549 — Per-copy multi-quantity payload. When present, each
    // entry materializes as its own order_copies row with its own
    // signed-cert selection and minted GoodDeed number. Legacy single-
    // copy clients omit this and we synthesize a 1-element array.
    copies: z
      .array(z.object({ signedCert: z.boolean().default(false) }))
      .min(1)
      .max(MAX_COPIES_PER_CHECKOUT)
      .optional(),
    // Task #844 — ids of operator-created custom ("Gift of Hope") add-ons
    // the fan ticked. Each is added once (one per order); the server
    // re-validates that every id is active AND targets this album's
    // primary artist before charging, and always uses the server-side
    // price (client can't influence the amount). Legacy shape — kept for
    // older clients that can't send a quantity / recipient choice.
    customAddonIds: z.array(z.string().min(1)).optional(),
    // Task #1630 — richer custom-addon selection: per-addon quantity plus
    // an anonymous/specific recipient choice. Takes precedence over the
    // legacy `customAddonIds` when present. The server still re-validates
    // eligibility and always uses the stored price; quantity is clamped
    // to MAX_CUSTOM_ADDON_QTY. `recipientMode` is a lightweight intent
    // flag (the actual recipient is assigned post-purchase via the gift
    // flow) and is snapshotted onto the order line.
    customAddons: z
      .array(
        z.object({
          id: z.string().min(1),
          quantity: z.number().int().min(1).max(MAX_CUSTOM_ADDON_QTY),
          recipientMode: z.enum(["anonymous", "specific"]).optional(),
          // Task #1842 — fan-chosen amount (cents) for variable-amount
          // add-ons. Only used when the add-on has fanChoosesAmount=true;
          // ignored for fixed-price add-ons (server always uses stored price).
          // Server enforces the stored minimum floor regardless of this value.
          chosenAmountCents: z.number().int().positive().optional(),
        }),
      )
      .optional(),
    // Destination country (ISO-3166-1 alpha-2) the fan picked in the Buy
    // sheet. Embedded Checkout collects the full shipping address inside
    // the iframe AFTER we mint the session, so we can't see the country
    // in time to price shipping — the fan tells us up front and we lock
    // the session's allowed_countries to it. Defaults to US.
    shippingCountry: z.string().min(2).max(2).optional(),
    // Task #1484 — optional name the buyer wants printed on the digital
    // GoodDeed certificate, captured in the Buy sheet before paying. Only
    // honored for a digital-only GoodDeed purchase (no physical signed-
    // cert copy); physical copies keep the operator confirm flow. Stamped
    // onto orders.certConfirmedName at materialization so the cert PDF
    // (Path 2) prints it with no second step.
    certName: z.string().max(80).optional(),
    // Task #2257 — funnel stitching. The buyer lands + browses on one host
    // (e.g. get.goodtunes.music) under one analytics session, but the purchase
    // completes on my.goodtunes.music with a brand-new analytics device/session
    // that can't be linked. We carry the ORIGINAL session/device + first-touch
    // source through Stripe metadata so materialization can emit a server-side
    // `checkout_completed` event stitched back to the landing session — without
    // it, completions read ~0 and get mislabeled "direct/unknown". All optional
    // and analytics-only (never influences price or fulfillment).
    funnelSessionId: z.string().max(200).optional(),
    funnelDeviceId: z.string().max(200).optional(),
    funnelAttribution: z
      .object({
        utmSource: z.string().max(256).optional(),
        utmCampaign: z.string().max(256).optional(),
        referrerHost: z.string().max(256).optional(),
      })
      .optional(),
  });
  app.post("/api/checkout/session", async (req, res) => {
    // Task #1766 / #1784 — a review "preview pass" is normally preview-only and
    // can NEVER complete a charge. EXCEPTION (Task #1784): the /staging dry-run
    // must reach the Stripe card screen for a family reviewer, so a pass that
    // matches THIS album (resolved below) is allowed through to mint the
    // session — the reviewer stops at the card input; no charge completes here.
    // A pass for a DIFFERENT album is still rejected outright.
    const { readPreviewPass } = await import("./previewPass");
    const previewPass = readPreviewPass(req);
    // Task #1784 — a pass minted for a DIFFERENT album can never drive this
    // checkout: reject it up front (before any auth / SKU work) exactly as
    // Task #1766 did for ALL passes. A pass that MATCHES the album being
    // purchased is allowed to fall through so the /staging family reviewer can
    // reach the Stripe card screen on the prepping release.
    if (previewPass && previewPass.albumId !== (req.body?.albumId ?? null)) {
      return res.status(403).json({ message: "Preview mode — checkout is disabled." });
    }
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
    // Task #1784 — the /staging dry-run carries a preview pass for THIS album.
    // A wrong-album pass was already rejected up front (above); here a matching
    // pass authorizes the reviewer to proceed past the prepping gate so they
    // reach the Stripe card screen. No pass means a normal (live) fan checkout.
    const stagingAuthorized =
      !!previewPass && previewPass.albumId === album.id;
    // Task #1778 — a PREPPING (pre-launch) release shows the rich page in
    // notify-only "Get Early Access" mode; there is no fan checkout for it.
    // Hard-reject any charge before we touch SKUs/stock so no surface can
    // complete a purchase on a not-yet-launched release. Full-access operator
    // accounts (Bill's fan account, used by the /testing dry-run) are exempt so
    // the buyer flow can be rehearsed against real Stripe before go-live; the
    // /staging reviewer (a pass matching this album) is exempt too (Task #1784).
    if ((album as any).isPrepping) {
      const { isFullAccessEmail } = await import("@shared/fullAccess");
      if (!isFullAccessEmail(customer.email) && !stagingAuthorized) {
        return res.status(403).json({ message: "This release isn't on sale yet." });
      }
    }
    // Task #2428 — GoodTunes Shopify+ releases never sell on the GoodTunes
    // fan surface (the customer sells the physical run on their own Shopify).
    // Hard-reject any charge before we touch SKUs/stock, same as the prepping
    // gate above, so no fan surface can complete a purchase.
    if ((album as any).sellMode === "shopify_plus") {
      return res.status(403).json({ message: "This release isn't sold here." });
    }
    // Task #1049 — the buy window closes the moment the sunset date arrives
    // (album moves to streaming). Reject before we touch SKUs/stock so no
    // surface that skipped the sold-out buy-options can still check out.
    if (hasReachedSunset(album.streamingReleaseDate)) {
      return res.status(409).json({ message: "Sold out" });
    }
    const skus = await listActiveSkus(album.id);
    const sku = skus.find((s) => s.format === parsed.data.skuFormat);
    if (!sku) return res.status(400).json({ message: "That format isn't available for this album" });
    // Task #549 — Normalise the request into a `copies` array. Legacy
    // clients send `signedCert: bool` (single copy); the new BuySheet
    // sends an explicit `copies` array so each copy carries its own
    // add-on selection.
    const copies = parsed.data.copies
      ?? [{ signedCert: !!parsed.data.signedCert }];
    const quantity = copies.length;
    const signedCertCount = copies.filter((c) => c.signedCert).length;

    if (sku.stock !== null && sku.stock < quantity) {
      return res.status(409).json({ message: sku.stock <= 0 ? "Sold out" : `Only ${sku.stock} left in stock` });
    }

    let addon: AlbumAddon | null = null;
    let addonPriceCents = 0;
    // Task #579 — Booklet add-on resolves to its own line item, separately
    // from the signed-cert add-on. Both can be on the same checkout.
    let bookletAddon: AlbumAddon | null = null;
    let bookletPriceCents = 0;
    // Task #122 — Reservation ids minted inside the cap-check transaction
    // below. Stamped with the Stripe session id right after the session
    // is created so the webhook can resolve and delete them on payment,
    // and released eagerly if Stripe itself fails. Task #549 — one row
    // per cert copy so the cap math (paid quantity + pending row count)
    // lines up with per-copy fulfillment.
    let reservationIds: string[] = [];
    if (signedCertCount > 0) {
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
      //   3) insert N 30-min reservation rows if there's still room.
      // Concurrent contenders queue on the lock; the second one sees
      // the first reservation in the count and gets the 409.
      if (addon.plannedQuantity != null) {
        const planned = addon.plannedQuantity;
        const want = signedCertCount;
        const outcome = await db.transaction(async (tx) => {
          await tx.execute(
            sql`SELECT pg_advisory_xact_lock(hashtextextended(${`signed_cert:${album.id}`}, 0))`,
          );
          const claimed = await countSignedCertsClaimed(album.id, tx);
          if (claimed + want > planned) return { ok: false as const, remaining: Math.max(0, planned - claimed) };
          const rows = await tx
            .insert(signedCertReservations)
            .values(
              Array.from({ length: want }, () => ({
                albumId: album.id,
                expiresAt: new Date(Date.now() + 30 * 60_000),
              })),
            )
            .returning({ id: signedCertReservations.id });
          return { ok: true as const, ids: rows.map((r) => r.id) };
        });
        if (!outcome.ok) {
          return res.status(409).json({
            message: outcome.remaining === 0
              ? "All signed copies claimed"
              : `Only ${outcome.remaining} signed copies left`,
          });
        }
        reservationIds = outcome.ids;
      }
    }

    // Task #793 — Resolve the booklet selection BEFORE building line items
    // so the 7" either/or variant can fold into the format line at the
    // flat set price (rather than stacking a separate booklet line). The
    // 7" single uses the bundle; cassette keeps the legacy stacked add-on
    // line (its booklet behaviour is intentionally left unchanged).
    let isBookletBundle = false; // 7" "+ booklet" variant
    let bookletBundleCents = 0;
    if (parsed.data.booklet) {
      if (!(BOOKLET_ELIGIBLE_FORMATS as readonly string[]).includes(sku.format)) {
        return res.status(400).json({
          message: "Booklet is only available with a 7\" vinyl or cassette.",
        });
      }
      const addons = await listActiveAddons(album.id);
      bookletAddon = addons.find((x) => x.kind === "booklet") ?? null;
      if (!bookletAddon) {
        return res.status(400).json({ message: "Booklet isn't offered on this album" });
      }
      if (sku.format === "7_inch") {
        isBookletBundle = true;
        bookletBundleCents = resolveBookletBundleCents(sku.priceCents, bookletAddon);
      } else {
        // Cassette — legacy stacked add-on (unchanged). Server-resolved
        // price; client-sent override must respect the per-album floor.
        bookletPriceCents = parsed.data.bookletPriceCents ?? bookletAddon.priceCents;
        if (bookletPriceCents < bookletAddon.minPriceCents) {
          return res.status(400).json({
            message: `Booklet must be at least $${(bookletAddon.minPriceCents / 100).toFixed(2)}`,
          });
        }
      }
    }

    // Task #844 — Resolve the ticked custom ("Gift of Hope") add-ons. We
    // re-derive eligibility server-side (active AND targets this album's
    // primary artist) and always use the stored price, so a stale or
    // spoofed client can't add an add-on that doesn't apply or change the
    // amount charged. De-duped (one per order) and capped defensively.
    // Task #1630 — each selection carries a quantity (line scales by it)
    // and a lightweight anonymous/specific recipient intent. The newer
    // `customAddons` payload wins; we fall back to the legacy
    // `customAddonIds` (quantity 1, no recipient choice) for old clients.
    // Task #1842 — variable-amount addons carry a fan-chosen per-box amount.
    type SelectedCustomAddon = {
      addon: CustomAddonForAlbum;
      quantity: number;
      recipientMode: "anonymous" | "specific" | null;
      unitAmountCents: number;
    };
    const requestedAddons: Array<{
      id: string;
      quantity: number;
      recipientMode: "anonymous" | "specific" | null;
      chosenAmountCents?: number;
    }> =
      parsed.data.customAddons && parsed.data.customAddons.length > 0
        ? parsed.data.customAddons.map((c) => ({
            id: c.id,
            quantity: c.quantity,
            recipientMode: c.recipientMode ?? null,
            chosenAmountCents: c.chosenAmountCents,
          }))
        : (parsed.data.customAddonIds ?? []).map((id) => ({
            id,
            quantity: 1,
            recipientMode: null,
          }));
    const selectedCustomAddons: SelectedCustomAddon[] = [];
    if (requestedAddons.length > 0) {
      const eligible = await listCustomAddonsForAlbum(album.primaryArtistId);
      const eligibleById = new Map(eligible.map((c) => [c.id, c]));
      const seen = new Set<string>();
      for (const req of requestedAddons) {
        if (seen.has(req.id)) continue;
        seen.add(req.id);
        const match = eligibleById.get(req.id);
        if (!match) {
          return res.status(400).json({ message: "That add-on isn't available for this album." });
        }
        const quantity = Math.max(1, Math.min(MAX_CUSTOM_ADDON_QTY, req.quantity));
        // Task #1842 — for variable-amount add-ons, use the client's chosen
        // amount but clamp it to the stored minimum floor. Fixed-price add-ons
        // always use the stored priceCents (client amount is ignored).
        let unitAmountCents: number;
        if (match.fanChoosesAmount) {
          const floor = match.minAmountCents ?? 0;
          const chosen = req.chosenAmountCents ?? match.priceCents;
          unitAmountCents = Math.max(floor, chosen);
        } else {
          unitAmountCents = match.priceCents;
        }
        selectedCustomAddons.push({ addon: match, quantity, recipientMode: req.recipientMode, unitAmountCents });
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

    // Task #1629 — Stripe Tax classification. With `automatic_tax` enabled
    // (below), each line must declare WHAT it is so Stripe applies the
    // right municipal/state rate. Physical goods (records, signed certs,
    // booklets) are tangible; the digital-only format is a tethered digital
    // audio work; the Gift of Hope / custom add-on is a charitable
    // donation (non-taxable). `tax_behavior: "exclusive"` adds US sales tax
    // on top of our listed price (we don't bake tax into the sticker).
    const TAX_CODE_TANGIBLE = "txcd_99999999"; // General - Tangible Goods
    const TAX_CODE_DIGITAL = "txcd_10401000"; // Digital Audio Works - streamed, non-subscription, limited rights
    const TAX_CODE_DONATION = "txcd_90000001"; // Cash Donation
    const TAX_CODE_SHIPPING = "txcd_92010001"; // Shipping
    const TAX_BEHAVIOR = "exclusive" as const;
    const { classifySkuKind } = await import("./orderDesk");
    const skuKind = classifySkuKind(sku.format);
    const formatTaxCode = skuKind === "digital" ? TAX_CODE_DIGITAL : TAX_CODE_TANGIBLE;

    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [
      {
        price_data: {
          currency: "usd",
          // Task #793 — the 7" "+ booklet" variant folds into the format
          // line at the flat set price (no separate booklet line); the
          // "alone" variant and every other format use the SKU price.
          unit_amount: isBookletBundle ? bookletBundleCents : sku.priceCents,
          tax_behavior: TAX_BEHAVIOR,
          product_data: {
            name: isBookletBundle
              ? `${album.title} — ${ALBUM_FORMAT_LABEL[sku.format as AlbumFormat] ?? sku.format} + Booklet`
              : `${album.title} — ${ALBUM_FORMAT_LABEL[sku.format as AlbumFormat] ?? sku.format}`,
            description: album.artist,
            tax_code: formatTaxCode,
            images: album.artwork ? [absoluteUrl(req, album.artwork)] : [],
            metadata: {
              gt_kind: "format",
              gt_sku: sku.format,
              gt_album_id: album.id,
              gt_booklet_bundle: isBookletBundle ? "1" : "0",
            },
          },
        },
        quantity: quantity,
      },
    ];
    if (addon && signedCertCount > 0) {
      lineItems.push({
        price_data: {
          currency: "usd",
          unit_amount: addonPriceCents,
          tax_behavior: TAX_BEHAVIOR,
          product_data: {
            name: ALBUM_ADDON_LABEL[addon.kind as AlbumAddonKind] ?? addon.kind,
            description: `Printed & signed for ${album.title}`,
            tax_code: TAX_CODE_TANGIBLE,
            metadata: { gt_kind: "addon", gt_sku: addon.kind, gt_album_id: album.id },
          },
        },
        quantity: signedCertCount,
      });
    }

    // Task #793 — Cassette keeps the legacy stacked booklet line (one
    // booklet per order, separate line item). The 7" variant is already
    // folded into the format line above, so it never reaches this block.
    // `bookletAddon` / `bookletPriceCents` were resolved earlier.
    if (parsed.data.booklet && !isBookletBundle && bookletAddon) {
      lineItems.push({
        price_data: {
          currency: "usd",
          unit_amount: bookletPriceCents,
          tax_behavior: TAX_BEHAVIOR,
          product_data: {
            name: ALBUM_ADDON_LABEL[bookletAddon.kind as AlbumAddonKind] ?? bookletAddon.kind,
            description: `16-page booklet for ${album.title}`,
            tax_code: TAX_CODE_TANGIBLE,
            images: bookletAddon.artworkUrl ? [absoluteUrl(req, bookletAddon.artworkUrl)] : [],
            metadata: { gt_kind: "addon", gt_sku: bookletAddon.kind, gt_album_id: album.id },
          },
        },
        quantity: 1,
      });
    }

    // Task #844 / #1630 — One line item per ticked custom add-on, with the
    // chosen quantity. The add-on id + fulfiller + recipient mode ride in
    // the product metadata so materialize can persist them on the
    // order_items row for the fulfiller.
    for (const { addon: ca, quantity: caQty, recipientMode, unitAmountCents: caUnitAmount } of selectedCustomAddons) {
      lineItems.push({
        price_data: {
          currency: "usd",
          unit_amount: caUnitAmount,
          tax_behavior: TAX_BEHAVIOR,
          product_data: {
            name: ca.name,
            description: `${ca.orgName} — for ${album.title}`,
            // Task #1629 — Gift of Hope and every custom add-on is a
            // charitable contribution, not a retail good — Stripe treats
            // the donation tax code as non-taxable.
            tax_code: TAX_CODE_DONATION,
            images: ca.imageUrl ? [absoluteUrl(req, ca.imageUrl)] : [],
            metadata: {
              gt_kind: "custom_addon",
              gt_sku: ca.id,
              gt_album_id: album.id,
              gt_fulfiller: ca.fulfiller ?? "",
              gt_recipient_mode: recipientMode ?? "",
            },
          },
        },
        quantity: caQty,
      });
    }

    // Task #73 — enrich Stripe metadata so the Stripe dashboard already
    // tells artists/labels what sold (skuKind, artistId, labelId,
    // bundleContents) without us having to round-trip our DB on every
    // export. `gt_order_id` is patched onto the PaymentIntent by
    // materializeOrderFromSession once the row exists — sessions are
    // created before we know our internal order id.
    const bundleParts = [sku.format];
    if (signedCertCount > 0) bundleParts.push("signed_cert");
    if (bookletAddon) bundleParts.push("booklet");
    const bundleContents = bundleParts.join("+");
    // Task #549 — `gt_copies` encodes the per-copy signed-cert pattern
    // (e.g. "1011" for 4 copies where #1/#3/#4 are signed). Materialize
    // splits this back into N order_copies rows so each copy carries
    // its own GoodDeed number and entitlement. Legacy single-copy
    // orders read as `gt_copies = "1"` or `"0"`.
    const copiesMask = copies.map((c) => (c.signedCert ? "1" : "0")).join("");

    // ─── Shipping & handling ─────────────────────────────────────────
    // Physical orders are charged shipping from the partner rate card
    // (Spinney) for the country the fan picked in the Buy sheet, plus our
    // $1 markup. Digital orders ship nothing. We attach the result as a
    // single Stripe shipping_option and lock the session to that one
    // country so the address collected inside the iframe can't diverge
    // from what we priced.
    const shipCountry = normalizeCountry(parsed.data.shippingCountry);
    const bookletCount = isBookletBundle ? quantity : (parsed.data.booklet && bookletAddon ? 1 : 0);
    let shippingQuote: Awaited<ReturnType<typeof quoteShipping>> = null;
    if (skuKind !== "digital") {
      try {
        shippingQuote = await quoteShipping({
          format: sku.format,
          quantity,
          signedCertCount,
          bookletCount,
          country: shipCountry,
        });
      } catch (e) {
        console.error("[checkout] shipping quote failed", e);
      }
      if (!shippingQuote) {
        // A physical order MUST carry a real shipping charge. We seed an INTL
        // catch-all band for the default fulfillment partner, so a null quote
        // means the partner has no rate card (or the country can't be priced).
        // Refuse the checkout rather than silently ship for $0 (undercharge).
        console.warn(`[checkout] no shipping rate for country=${shipCountry} album=${album.id} — refusing checkout`);
        return res.status(422).json({
          message: "We can't calculate shipping to that country right now. Please pick a different destination or contact support.",
        });
      }
    }
    // Task #1867 — flat per-box shipping for custom ("Gift of Hope") add-ons.
    // Each box ships to its own recipient, so its shipping rides on TOP of
    // the vinyl's shipping rather than being weight-pooled. Charged PER box
    // (× the chosen quantity) and folded into the single shipping option so
    // the fan sees one quiet "Shipping" line.
    const customAddonShippingCents = selectedCustomAddons.reduce(
      (sum, c) => sum + Math.max(0, c.addon.shippingCents ?? 0) * c.quantity,
      0,
    );
    const vinylShipChargedCents = shippingQuote?.chargedCents ?? 0;
    const shipCurrency = shippingQuote?.currency ?? "usd";
    const totalShipChargedCents = vinylShipChargedCents + customAddonShippingCents;

    const shippingOptions: Stripe.Checkout.SessionCreateParams.ShippingOption[] | undefined =
      totalShipChargedCents > 0
        ? [{
            shipping_rate_data: {
              type: "fixed_amount",
              fixed_amount: { amount: totalShipChargedCents, currency: shipCurrency },
              display_name: "Shipping & handling",
              // With `automatic_tax` enabled, Stripe rejects the session
              // unless every shipping option declares how tax applies to it.
              // Mirror the line items: exclusive (sales tax added on top) and
              // the Stripe "Shipping" tax code so the rate is taxed correctly.
              tax_behavior: TAX_BEHAVIOR,
              tax_code: TAX_CODE_SHIPPING,
            },
          }]
        : undefined;

    // Task #2281 — QA test-purchase mode is now gated to privileged testers
    // (super_admin or Bill's full-access fan account), not just any caller in a
    // non-prod environment. Resolved via the unified-identity link in roles.ts.
    const isQaCheckout =
      process.env.REPLIT_DEPLOYMENT !== "1" &&
      (await (async () => {
        const { isQaCheckoutTester } = await import("./auth/roles");
        return isQaCheckoutTester(customer);
      })());

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
      gt_signed_cert: signedCertCount > 0 ? "1" : "0",
      gt_booklet: bookletAddon ? "1" : "0",
      // Task #793 — set when the 7" "+ booklet" variant was chosen, so
      // materialize can stamp every order_copies row's `booklet` flag
      // (each with-booklet copy consumes one booklet from the run).
      gt_booklet_bundle: isBookletBundle ? "1" : "0",
      gt_quantity: String(quantity),
      gt_signed_cert_count: String(signedCertCount),
      gt_copies: copiesMask,
      // Task #1484 — buyer-chosen digital GoodDeed cert name. Only carried
      // when this is a digital-only GoodDeed purchase (no signed copy);
      // physical signed-cert orders keep the operator confirm flow, so we
      // never stamp certConfirmedName for them.
      gt_cert_name:
        signedCertCount === 0 ? (parsed.data.certName?.trim().slice(0, 80) ?? "") : "",
      // Shipping breakdown so materialize can persist base vs. our markup
      // separately (Stripe only reports the combined shipping_cost total).
      gt_ship_country: shippingQuote ? shippingQuote.country : "",
      gt_ship_base: shippingQuote ? String(shippingQuote.baseCents) : "",
      gt_ship_markup: shippingQuote ? String(shippingQuote.markupCents) : "",
      // Task #1867 — charged shipping now includes any per-box add-on
      // shipping. `gt_ship_custom_addon` breaks out the box portion so
      // materialize/refunds can reconcile it; gt_ship_base/markup stay the
      // vinyl rate-card split. Non-empty (even "0") whenever any shipping was
      // charged so materialize records the box portion on digital+box orders.
      gt_ship_charged:
        totalShipChargedCents > 0 ? String(totalShipChargedCents) : "",
      gt_ship_custom_addon: String(customAddonShippingCents),
      gt_ship_band: shippingQuote ? shippingQuote.band : "",
      // Task #2257 — original landing analytics identity + first-touch source,
      // carried so materialize can stitch a server-side `checkout_completed`
      // event back to the funnel session that started on a different host.
      // Only written when present (keeps the Stripe 50-key/500-char budget).
      ...(parsed.data.funnelSessionId ? { gt_funnel_session: parsed.data.funnelSessionId.slice(0, 200) } : {}),
      ...(parsed.data.funnelDeviceId ? { gt_funnel_device: parsed.data.funnelDeviceId.slice(0, 200) } : {}),
      ...(parsed.data.funnelAttribution?.utmSource ? { gt_funnel_utm_source: parsed.data.funnelAttribution.utmSource.slice(0, 256) } : {}),
      ...(parsed.data.funnelAttribution?.utmCampaign ? { gt_funnel_utm_campaign: parsed.data.funnelAttribution.utmCampaign.slice(0, 256) } : {}),
      ...(parsed.data.funnelAttribution?.referrerHost ? { gt_funnel_ref_host: parsed.data.funnelAttribution.referrerHost.slice(0, 256) } : {}),
      // Task #2270 — QA test-purchase flag. Set when the operator is using
      // a non-production (test-mode Stripe) environment. Downstream, the
      // materializer reads this to set origin='qa:test' and skip real
      // side-effects (fan library, stock, referrals, LLT bonus).
      // Task #2281 — gate QA mode to privileged testers only (super_admin or
      // Bill's full-access fan account). Any other admin/partner/fan in
      // non-prod now gets a REAL test-mode Stripe checkout that materializes
      // as a normal order. `isQaCheckoutTester` resolves the linked admin via
      // the unified-identity link (users.customer_user_id).
      gt_is_qa: isQaCheckout ? "1" : "0",
    };
    const returnUrl = `${absoluteOrigin(req)}/welcome?session_id={CHECKOUT_SESSION_ID}`;
    let session: Stripe.Checkout.Session;
    try {
      session = await stripe.checkout.sessions.create({
        ui_mode: "embedded",
        mode: "payment",
        customer: stripeCustomerId,
        line_items: lineItems,
        // When we priced shipping, restrict the Stripe address form to the
        // exact country the fan picked + selected so the collected address
        // can't diverge from the rate we charged. Otherwise (digital / no
        // rate) fall back to the legacy allow-list.
        shipping_address_collection: shippingQuote
          ? { allowed_countries: [shipCountry] as any }
          : { allowed_countries: ["US", "CA", "GB", "AU", "DE", "FR", "NL", "IE", "JP"] },
        ...(shippingOptions ? { shipping_options: shippingOptions } : {}),
        billing_address_collection: "required",
        phone_number_collection: { enabled: true },
        // Task #1629 — Stripe Tax computes municipal/state sales tax from
        // the address the fan enters in the embedded form. Per-line
        // tax_code + tax_behavior (set on the line items above) tell Stripe
        // what each line is. If Stripe can't determine tax for the entered
        // address it BLOCKS completion in the embedded UI — the fan can
        // never pay $0 tax on a taxable jurisdiction by accident.
        automatic_tax: { enabled: true },
        // Required by Stripe whenever a `customer` is attached AND
        // automatic_tax is on: lets the session write the address the fan
        // enters back onto the Customer so the tax location is captured.
        customer_update: { address: "auto", name: "auto", shipping: "auto" },
        return_url: returnUrl,
        payment_intent_data: {
          metadata: {
            ...enrichedMetadata,
            gt_signed_cert_price: signedCertCount > 0 ? String(addonPriceCents) : "0",
            gt_booklet_price: bookletAddon ? String(bookletPriceCents) : "0",
          },
        },
        metadata: {
          ...enrichedMetadata,
          gt_signed_cert_price: signedCertCount > 0 ? String(addonPriceCents) : "0",
        },
      });
    } catch (e) {
      // Task #122 — Stripe failed to mint the session: release every
      // reservation we just took so the slots return to the pool
      // immediately instead of waiting 30 min to expire.
      if (reservationIds.length > 0) {
        await db.delete(signedCertReservations).where(inArray(signedCertReservations.id, reservationIds));
      }
      throw e;
    }
    // Task #122 — Attach the Stripe session id to every reservation now
    // that we have one. The webhook deletes by session id when the
    // order is materialized as paid; abandoned sessions just expire.
    if (reservationIds.length > 0) {
      await db
        .update(signedCertReservations)
        .set({ stripeCheckoutSessionId: session.id })
        .where(inArray(signedCertReservations.id, reservationIds));
    }

    res.json({ clientSecret: session.client_secret, sessionId: session.id });
  });

  // GET /api/checkout/shipping-quote — live shipping estimate for the Buy
  // sheet so the displayed total matches what Stripe will charge. Pricing
  // is non-sensitive (rate card + weight band), so no auth required. The
  // POST /session route re-prices server-side and is the source of truth.
  app.get("/api/checkout/shipping-quote", async (req, res) => {
    const format = typeof req.query.format === "string" ? req.query.format : "";
    const country = typeof req.query.country === "string" ? req.query.country : "US";
    const quantity = Math.max(1, parseInt(String(req.query.quantity ?? "1"), 10) || 1);
    const signedCertCount = Math.max(0, parseInt(String(req.query.certCount ?? "0"), 10) || 0);
    const bookletCount = Math.max(0, parseInt(String(req.query.bookletCount ?? "0"), 10) || 0);
    const { classifySkuKind } = await import("./orderDesk");
    const skuKind = classifySkuKind(format);
    if (skuKind === "digital") {
      return res.json({ shippable: false, chargedCents: 0 });
    }
    try {
      const quote = await quoteShipping({ format, quantity, signedCertCount, bookletCount, country });
      if (!quote) return res.json({ shippable: true, available: false, chargedCents: 0 });
      res.json({
        shippable: true,
        available: true,
        country: quote.country,
        band: quote.band,
        baseCents: quote.baseCents,
        markupCents: quote.markupCents,
        chargedCents: quote.chargedCents,
      });
    } catch (e) {
      console.error("[shipping-quote] failed", e);
      res.status(500).json({ message: "Could not estimate shipping" });
    }
  });

  // GET /api/checkout/tax-quote — Task #1636. Estimated sales tax for the
  // Buy sheet running total, so the fan sees an approximate Tax line as
  // soon as they pick a destination (mirrors the shipping-quote UX). The
  // estimate is computed by Stripe Tax (tax.calculations.create) from the
  // server-resolved line prices + the same per-line tax_code
  // classification the session-create path uses, so a client can't fake
  // the number. It's clearly labelled "estimated" in the UI — the
  // authoritative figure is still computed inside the embedded checkout
  // from the full address the fan enters there.
  app.get("/api/checkout/tax-quote", async (req, res) => {
    const albumId = typeof req.query.albumId === "string" ? req.query.albumId : "";
    const format = typeof req.query.format === "string" ? req.query.format : "";
    const country = normalizeCountry(
      typeof req.query.country === "string" ? req.query.country : "US",
    );
    const postalCode =
      typeof req.query.postalCode === "string" ? req.query.postalCode.trim() : "";
    const region = typeof req.query.region === "string" ? req.query.region.trim() : "";
    const quantity = Math.max(1, parseInt(String(req.query.quantity ?? "1"), 10) || 1);
    let certCount = Math.max(0, parseInt(String(req.query.certCount ?? "0"), 10) || 0);
    const certPriceCents = Math.max(0, parseInt(String(req.query.certPriceCents ?? "0"), 10) || 0);
    const booklet = req.query.booklet === "1" || req.query.booklet === "true";
    // Task #1867 — per-box add-on shipping the Buy sheet folded into its
    // shipping line. Included in the taxable shipping so the estimate lines
    // up with the real embedded-checkout charge (which taxes the combined
    // shipping option). Donation line itself stays non-taxable.
    const addonShipCents = Math.max(0, parseInt(String(req.query.addonShipCents ?? "0"), 10) || 0);

    // Tax needs at minimum a destination country; for the US (and other
    // postal-driven jurisdictions) Stripe needs a postal code to resolve
    // the municipal/state rate. Without enough address info, report
    // "unavailable" and let the UI hold the line until the fan types more.
    if (!country) return res.json({ available: false });

    const album = await storage.getAlbumById(albumId);
    if (!album) return res.json({ available: false });
    const skus = await listActiveSkus(album.id);
    const sku = skus.find((s) => s.format === format);
    if (!sku) return res.json({ available: false });

    const { classifySkuKind } = await import("./orderDesk");
    const skuKind = classifySkuKind(sku.format);

    // Resolve the add-on prices server-side from the same catalog the
    // session-create path reads, so the estimate is built from prices we
    // control — not whatever the client claims. The signed-cert add-on is
    // "name your price" above a floor, so we honour the fan's chosen
    // amount clamped to the per-album minimum (exactly as session-create
    // does).
    let addonPriceCents = 0;
    let bookletPriceCents = 0;
    let isBookletBundle = false;
    let bookletBundleCents = 0;
    if (certCount > 0 || booklet) {
      const addons = await listActiveAddons(album.id);
      if (certCount > 0) {
        const addon = addons.find((x) => x.kind === "signed_cert") ?? null;
        if (addon) {
          addonPriceCents = Math.max(addon.minPriceCents, certPriceCents || addon.priceCents);
        } else {
          certCount = 0;
        }
      }
      if (booklet) {
        const bookletAddon = addons.find((x) => x.kind === "booklet") ?? null;
        if (bookletAddon) {
          if (sku.format === "7_inch") {
            isBookletBundle = true;
            bookletBundleCents = resolveBookletBundleCents(sku.priceCents, bookletAddon);
          } else {
            bookletPriceCents = bookletAddon.priceCents;
          }
        }
      }
    }

    // Same tax codes + behaviour as the session-create path.
    const TAX_CODE_TANGIBLE = "txcd_99999999";
    const TAX_CODE_DIGITAL = "txcd_10401000";
    const TAX_BEHAVIOR = "exclusive" as const;
    const formatTaxCode = skuKind === "digital" ? TAX_CODE_DIGITAL : TAX_CODE_TANGIBLE;

    const taxLineItems: Stripe.Tax.CalculationCreateParams.LineItem[] = [
      {
        amount: (isBookletBundle ? bookletBundleCents : sku.priceCents) * quantity,
        reference: "format",
        tax_code: formatTaxCode,
        tax_behavior: TAX_BEHAVIOR,
      },
    ];
    if (certCount > 0 && addonPriceCents > 0) {
      taxLineItems.push({
        amount: addonPriceCents * certCount,
        reference: "signed_cert",
        tax_code: TAX_CODE_TANGIBLE,
        tax_behavior: TAX_BEHAVIOR,
      });
    }
    if (booklet && !isBookletBundle && bookletPriceCents > 0) {
      taxLineItems.push({
        amount: bookletPriceCents,
        reference: "booklet",
        tax_code: TAX_CODE_TANGIBLE,
        tax_behavior: TAX_BEHAVIOR,
      });
    }
    // Custom ("Gift of Hope") add-ons are charitable donations — Stripe's
    // donation tax code is non-taxable, so they never move the estimate.
    // We omit them here rather than round-tripping zero-tax lines.

    // Physical orders are taxed on shipping too; mirror the real shipping
    // charge so the preview lines up with what the embedded checkout will
    // tax. Digital orders ship nothing.
    let shippingCents = 0;
    if (skuKind !== "digital") {
      const bookletCount = isBookletBundle ? quantity : booklet ? 1 : 0;
      try {
        const quote = await quoteShipping({
          format: sku.format,
          quantity,
          signedCertCount: certCount,
          bookletCount,
          country,
        });
        if (quote) shippingCents = quote.chargedCents;
      } catch (e) {
        console.error("[tax-quote] shipping quote failed", e);
      }
    }
    // Task #1867 — fold per-box add-on shipping into the taxable shipping so
    // the preview matches the combined shipping option the real checkout taxes.
    shippingCents += addonShipCents;

    try {
      const stripe = await getStripe();
      const calculation = await stripe.tax.calculations.create({
        currency: "usd",
        line_items: taxLineItems,
        ...(shippingCents > 0
          ? { shipping_cost: { amount: shippingCents, tax_behavior: TAX_BEHAVIOR } }
          : {}),
        customer_details: {
          address: {
            country,
            ...(postalCode ? { postal_code: postalCode } : {}),
            ...(region ? { state: region } : {}),
          },
          address_source: "shipping",
        },
      });
      res.json({
        available: true,
        taxCents: calculation.tax_amount_exclusive,
        country,
      });
    } catch (e) {
      // Stripe rejects the calc when the address is too thin to resolve a
      // jurisdiction (e.g. US with no postal) or the country is
      // unsupported. That's an expected "not enough info yet" state, not a
      // server error — the fan just hasn't typed enough.
      console.warn("[tax-quote] calculation unavailable", (e as Error)?.message);
      res.json({ available: false });
    }
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
    // Task #549 — per-copy entitlements so the receipt can list each
    // copy with its own GoodDeed number and signed-cert state.
    const copyRows = order
      ? await db.select().from(orderCopies).where(eq(orderCopies.orderId, order.id)).orderBy(asc(orderCopies.position))
      : [];
    // Task #2063 — attach each copy's per-copy gift (if any) so the
    // /welcome receipt can render per-copy gift state + self-serve manage.
    let copies: any[] = copyRows;
    if (order && copyRows.length > 0) {
      const { loadCopyGiftsForOrders, serializeGiftForBuyer } = await import("./gifts");
      const copyGifts = (await loadCopyGiftsForOrders([order.id])).get(order.id) ?? [];
      const giftByCopy = new Map(copyGifts.map((g) => [g.copyId as string, g]));
      copies = copyRows.map((c) => {
        const g = giftByCopy.get(c.id);
        return { ...c, gift: g ? serializeGiftForBuyer(g, a.userId) : null };
      });
    }
    // Task #2061 — gift-box counts so /welcome can auto-open the "Who's the
    // gift for?" stepper when this order carries un-personalized boxes.
    let giftBoxSummary: { total: number; personalized: number } | null = null;
    if (order) {
      const { loadGiftBoxSummaries } = await import("./gifts");
      giftBoxSummary = (await loadGiftBoxSummaries([order.id], a.userId)).get(order.id) ?? null;
    }
    res.json({
      paymentStatus: session.payment_status,
      status: session.status,
      order: order ?? null,
      items: order ? await getOrderItems(order.id) : [],
      copies,
      giftBoxSummary,
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
      // Task #2428 — GoodTunes Shopify+ prepaid-manufacturing steps ride
      // the SAME Stripe webhook but are NOT fan orders. Handle them first
      // (they mark the payment step processing/paid + mint the plant
      // earmark) and short-circuit before materializeOrderFromSession so
      // an ACH step-payment never gets mistaken for a fan checkout.
      {
        const { handleShopifyPlusWebhookEvent } = await import("./shopifyPlus");
        if (await handleShopifyPlusWebhookEvent(event)) {
          return res.json({ received: true });
        }
      }
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
    // Task #2063 — whole-order gift (copyId IS NULL) and per-copy gifts are
    // loaded separately so a per-copy gift never masquerades as the legacy
    // order-level gift pill.
    const { loadGiftForOrders, loadCopyGiftsForOrders, serializeGiftForBuyer } = await import("./gifts");
    const giftByOrder = await loadGiftForOrders(orderIds);
    const copyGiftsByOrder = await loadCopyGiftsForOrders(orderIds);
    const copyRows = orderIds.length > 0
      ? await db.select().from(orderCopies).where(inArray(orderCopies.orderId, orderIds)).orderBy(asc(orderCopies.position))
      : [];
    const copiesByOrder = new Map<string, typeof copyRows>();
    for (const c of copyRows) {
      const arr = copiesByOrder.get(c.orderId) ?? [];
      arr.push(c);
      copiesByOrder.set(c.orderId, arr);
    }
    // Task #128 — also surface the signed_cert certificate row so the
    // fan-side Orders page can render the name-confirmation card without
    // a second roundtrip.
    const { signedCertCertificates } = await import("@shared/schema");
    const certRows = orderIds.length > 0
      ? await db.select().from(signedCertCertificates).where(inArray(signedCertCertificates.orderId, orderIds))
      : [];
    const certByOrder = new Map(certRows.map((c) => [c.orderId, c]));
    // Task #2061 — per-order gift-box counts so the Orders list can show
    // "2 of 3 personalized" without pulling every box. Scoped to this buyer.
    const { loadGiftBoxSummaries } = await import("./gifts");
    const giftBoxByOrder = await loadGiftBoxSummaries(orderIds, a.userId);
    // Flat shape matches client/src/pages/Orders.tsx OrderRow.
    const out = await Promise.all(
      rows.map(async (r) => {
        const g = giftByOrder.get(r.order.id);
        const cert = certByOrder.get(r.order.id) ?? null;
        const giftBoxSummary = giftBoxByOrder.get(r.order.id) ?? null;
        // Task #2063 — per-copy gifts attached to each copy so the Orders
        // page can render per-copy state + self-serve manage controls.
        const copyGifts = copyGiftsByOrder.get(r.order.id) ?? [];
        const giftByCopy = new Map(copyGifts.map((cg) => [cg.copyId as string, cg]));
        const copies = (copiesByOrder.get(r.order.id) ?? []).map((c) => {
          const cg = giftByCopy.get(c.id);
          return { ...c, gift: cg ? serializeGiftForBuyer(cg, a.userId) : null };
        });
        return {
          ...r.order,
          albumTitle: r.album.title,
          albumArtist: r.album.artist,
          albumArtwork: r.album.artwork,
          cert,
          giftBoxSummary,
          items: await getOrderItems(r.order.id),
          copies,
          gift: g ? serializeGiftForBuyer(g, a.userId) : null,
        };
      }),
    );
    res.json(out);
  });

  // ─── Admin order list + ship ────────────────────────────────────
  // Task #2270 — QA test-purchase order cleanup.
  // GET  /api/admin/qa-orders       — list all qa:test orders (super-admin).
  // DELETE /api/admin/qa-orders/:id — hard-delete a single qa:test order.
  app.get("/api/admin/qa-orders", requireAdmin, async (req, res) => {
    try {
      const rows = await db.execute<{
        id: string; created_at: string; album_id: string; album_title: string;
        buyer_email: string; buyer_name: string | null; total_cents: number;
        status: string; stripe_checkout_session_id: string | null;
      }>(sql`
        SELECT o.id, o.created_at, o.album_id, a.title AS album_title,
               o.buyer_email, o.buyer_name, o.total_cents, o.status,
               o.stripe_checkout_session_id
          FROM orders o
          LEFT JOIN albums a ON a.id = o.album_id
         WHERE o.origin = 'qa:test'
         ORDER BY o.created_at DESC
         LIMIT 200
      `);
      res.json((rows as any).rows ?? []);
    } catch (e: any) {
      res.status(500).json({ message: e?.message ?? "Failed to load QA orders" });
    }
  });

  app.delete("/api/admin/qa-orders/:id", requireAdmin, async (req, res) => {
    const id = req.params.id;
    try {
      // Verify this is actually a qa:test order before deleting.
      const [o] = await db.select({ id: orders.id, origin: orders.origin })
        .from(orders)
        .where(eq(orders.id, id));
      if (!o) return res.status(404).json({ message: "Order not found" });
      if (o.origin !== "qa:test") {
        return res.status(403).json({ message: "Only qa:test orders can be deleted here" });
      }
      // Delete child rows first to respect FKs, then the order itself.
      await db.execute(sql`DELETE FROM order_copies WHERE order_id = ${id}`);
      await db.execute(sql`DELETE FROM order_items WHERE order_id = ${id}`);
      await db.execute(sql`DELETE FROM signed_cert_reservations WHERE order_id = ${id}`);
      await db.execute(sql`DELETE FROM signed_cert_certificates WHERE order_id = ${id}`);
      await db.execute(sql`DELETE FROM referral_credits WHERE order_id = ${id}`);
      await db.execute(sql`DELETE FROM custom_addon_gift_boxes WHERE order_id = ${id}`);
      await db.execute(sql`DELETE FROM orders WHERE id = ${id} AND origin = 'qa:test'`);
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ message: e?.message ?? "Failed to delete QA order" });
    }
  });

  // Task #2280 — bulk-delete every qa:test order in one click. No :id path.
  // Same FK-respecting child cleanup as the single delete, but scoped to all
  // rows whose order belongs to a qa:test order (subquery), so a round of
  // testing can be cleared without removing rows one at a time.
  app.delete("/api/admin/qa-orders", requireAdmin, async (req, res) => {
    try {
      const qaIds = sql`(SELECT id FROM orders WHERE origin = 'qa:test')`;
      await db.execute(sql`DELETE FROM order_copies WHERE order_id IN ${qaIds}`);
      await db.execute(sql`DELETE FROM order_items WHERE order_id IN ${qaIds}`);
      await db.execute(sql`DELETE FROM signed_cert_reservations WHERE order_id IN ${qaIds}`);
      await db.execute(sql`DELETE FROM signed_cert_certificates WHERE order_id IN ${qaIds}`);
      await db.execute(sql`DELETE FROM referral_credits WHERE order_id IN ${qaIds}`);
      await db.execute(sql`DELETE FROM custom_addon_gift_boxes WHERE order_id IN ${qaIds}`);
      const result = await db.execute(sql`DELETE FROM orders WHERE origin = 'qa:test'`);
      const deleted = (result as any).rowCount ?? 0;
      res.json({ ok: true, deleted });
    } catch (e: any) {
      res.status(500).json({ message: e?.message ?? "Failed to delete QA orders" });
    }
  });

  app.get("/api/admin/orders", requireAdmin, async (req, res) => {
    const status = (req.query.status as string | undefined)?.trim();

    // Artist scoping: artists only see orders for their own albums.
    const userId = (req as any).session?.userId as string | undefined;
    let artistAlbumIds: string[] | null = null;
    // Task #2061 — who may see Gift-of-Hope recipient PII. super_admin /
    // admin see every box; a non_profit partner sees it only for boxes their
    // own org owns; everyone else (fulfillment, artist, vendor) sees status only.
    let viewerRole: string | null = null;
    let viewerScopeId: string | null = null;
    if (userId) {
      const { getUserRole } = await import("./auth/roles");
      const roleInfo = await getUserRole(userId);
      viewerRole = roleInfo?.role ?? null;
      viewerScopeId = roleInfo?.roleScopeId ?? null;
      if (roleInfo?.role === "artist" && roleInfo.roleScopeId) {
        const albumRows = await db.execute<{ id: string }>(sql`
          SELECT id FROM albums
          WHERE primary_artist_id = ${roleInfo.roleScopeId}
             OR (payout_owner_kind = 'person' AND payout_owner_id = ${roleInfo.roleScopeId})
        `);
        artistAlbumIds = ((albumRows as any).rows ?? []).map((r: any) => r.id as string);
        if (artistAlbumIds.length === 0) return res.json([]);
      }
    }

    const conditions: any[] = [];
    if (status) conditions.push(eq(orders.status, status));
    if (artistAlbumIds) conditions.push(inArray(orders.albumId, artistAlbumIds));

    let q = db
      .select({ order: orders, album: albums, customer: customerUsers })
      .from(orders)
      .innerJoin(albums, eq(orders.albumId, albums.id))
      .innerJoin(customerUsers, eq(orders.customerId, customerUsers.id))
      .$dynamic();
    if (conditions.length > 0) q = q.where(and(...conditions));
    const rows = await q.orderBy(desc(orders.createdAt)).limit(500);
    const orderIds = rows.map((r) => r.order.id);
    const giftRows = orderIds.length > 0
      ? await db.select().from(gifts).where(inArray(gifts.orderId, orderIds))
      : [];
    const giftByOrder = new Map(giftRows.map((g) => [g.orderId, g]));
    // Task #863 — custom ("Gift of Hope") add-on rows snapshot the
    // fulfiller at checkout but not the owning non-profit. Look that up
    // once for the whole queue (custom_addons is a small operator table)
    // keyed by id so each custom_addon line can show who owns it. The
    // org may be missing if the add-on was hard-deleted; null is fine.
    const caRows = await db
      .select({ id: customAddons.id, orgName: organizations.name })
      .from(customAddons)
      .innerJoin(organizations, eq(organizations.id, customAddons.organizationId));
    const orgByAddonId = new Map(caRows.map((c) => [c.id, c.orgName]));
    // Task #2061 — per-box gift assignments for the custom_addon lines. Load
    // every box for this page in one shot, group by the order_item it belongs
    // to, then serialize with PII gated by the viewer's role (see above).
    const canSeeAllPii = viewerRole === "super_admin" || viewerRole === "admin";
    const npoScopeId = viewerRole === "non_profit" ? viewerScopeId : null;
    const giftBoxRows = orderIds.length > 0
      ? await db.select().from(customAddonGiftBoxes).where(inArray(customAddonGiftBoxes.orderId, orderIds))
      : [];
    const giftBoxesByItem = new Map<string, typeof giftBoxRows>();
    for (const b of giftBoxRows) {
      const arr = giftBoxesByItem.get(b.orderItemId) ?? [];
      arr.push(b);
      giftBoxesByItem.set(b.orderItemId, arr);
    }
    // Flat shape matches client/src/pages/AdminOrders.tsx AdminOrderRow.
    const out = await Promise.all(
      rows.map(async (r) => {
        const ship: any = r.order.shippingAddress ?? null;
        const g = giftByOrder.get(r.order.id);
        const items = (await getOrderItems(r.order.id)).map((it) =>
          it.kind === "custom_addon"
            ? {
                ...it,
                orgName: orgByAddonId.get(it.sku) ?? null,
                giftBoxes: (giftBoxesByItem.get(it.id) ?? [])
                  .slice()
                  .sort((a, b) => a.position - b.position)
                  .map((b) =>
                    adminGiftBoxView(
                      b,
                      canSeeAllPii || (!!npoScopeId && b.organizationId === npoScopeId),
                    ),
                  ),
              }
            : it,
        );
        return {
          ...r.order,
          albumTitle: r.album.title,
          albumArtist: r.album.artist,
          albumArtwork: r.album.artwork ?? null,
          customerEmail: r.customer.email,
          customerName: r.customer.realName ?? r.customer.displayName ?? null,
          shippingName: ship?.name ?? null,
          items,
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
        // Task #1899 — void every per-copy number on Shopify refunds too,
        // consistent with the handleRefund path below.
        await db
          .update(orderCopies)
          .set({ goodDeedNumber: null })
          .where(eq(orderCopies.orderId, o.id));
        // Task #533 — back the refunded sale's earmark out of the pool.
        if (o.albumId) {
          const { reversePressPoolForOrder } = await import("./earlyCut");
          await reversePressPoolForOrder(o.albumId, o.id).catch((e) =>
            console.error(`[refund] press-pool reversal failed for ${o.id}`, e?.message),
          );
        }
        const remaining = await db
          .select({ id: orders.id })
          .from(orders)
          .where(and(eq(orders.customerId, o.customerId), eq(orders.albumId, o.albumId), inArray(orders.status, ["paid", "external_paid"])));
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
    // Fire-and-forget order-shipped push to the fan's registered devices.
    // Inert without APNs/FCM credentials (logs a dry-run line). Never
    // blocks the ship action — the album lookup + send are best-effort.
    try {
      const album = await storage.getAlbumById(updated.albumId, { includeHidden: true });
      const { notifyOrderShipped } = await import("./push");
      notifyOrderShipped({
        customerId: updated.customerId,
        orderId: updated.id,
        albumId: updated.albumId,
        albumTitle: album?.title ?? "Your GoodTunes album",
        albumArtwork: album?.artwork ?? null,
      });
    } catch (e: any) {
      console.error(`[ship] push notify threw for order ${updated.id}`, e?.message);
    }
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

// Task #937 — fan-facing origin for the receipt's "Play on the web"
// deep link. materializeOrderFromSession has no `req` (the webhook path
// has no inbound request), so we resolve the canonical customer host
// from config the same way the Shopify redemption page does:
// APP_URL wins, else https://${GOODTUNES_HOST}, else my.goodtunes.music.
function fanOrigin(): string {
  const explicit = (process.env.APP_URL || "").trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  const host = (process.env.GOODTUNES_HOST || "my.goodtunes.music").trim();
  return `https://${host}`;
}

// Task #937 — config-driven app-store links. Each button only renders
// when its env var is set, so there are no dead "download the app"
// buttons in the receipt before the native apps actually ship.
function appStoreUrls(): { appleUrl: string | null; googleUrl: string | null } {
  const apple = (process.env.IOS_APP_STORE_URL || "").trim();
  const google = (process.env.ANDROID_PLAY_STORE_URL || "").trim();
  return { appleUrl: apple.length > 0 ? apple : null, googleUrl: google.length > 0 ? google : null };
}

// Task #937 — gather the receipt payload and dispatch the single
// branded order-receipt email. Best-effort: it resolves a recipient,
// builds the order summary + GoodDeed numbers, and hands off to the
// shared Resend transport (synthetic-recipient guard + failure ring
// buffer + never-throws). The one-time guarantee lives at the call
// site (atomic claim on orders.receipt_email_sent_at), not here.
async function dispatchOrderReceipt(order: Order): Promise<void> {
  // Recipient: prefer the Stripe-collected buyer email, fall back to
  // the customer row's account email.
  let toEmail = (order.buyerEmail || "").trim();
  if (!toEmail) {
    const [cust] = await db
      .select({ email: customerUsers.email })
      .from(customerUsers)
      .where(eq(customerUsers.id, order.customerId));
    toEmail = (cust?.email || "").trim();
  }
  if (!toEmail) {
    console.warn(`[commerce] order ${order.id} has no email for receipt`);
    return;
  }

  const album = await storage.getAlbumById(order.albumId, { includeHidden: true });
  const items = await getOrderItems(order.id);
  const copies = await db
    .select({ goodDeedNumber: orderCopies.goodDeedNumber })
    .from(orderCopies)
    .where(eq(orderCopies.orderId, order.id))
    .orderBy(asc(orderCopies.position));
  const goodDeedNumbers = copies
    .map((c) => c.goodDeedNumber)
    .filter((n): n is number => n != null);

  const lines = items.map((it) => ({
    label: it.label,
    quantity: it.quantity ?? 1,
    amountCents: (it.unitPriceCents ?? 0) * (it.quantity ?? 1),
  }));
  const { appleUrl, googleUrl } = appStoreUrls();

  const { sendOrderReceiptEmail } = await import("./mail");
  await sendOrderReceiptEmail(toEmail, {
    albumTitle: album?.title ?? "Your GoodTunes album",
    albumArtist: album?.artist ?? "",
    artworkUrl: album?.artwork ?? null,
    lines,
    shippingCents: order.shippingChargedCents ?? null,
    taxCents: order.taxCents ?? null,
    totalCents: order.totalCents,
    currency: order.currency,
    goodDeedNumbers,
    webPlayUrl: `${fanOrigin()}/album/${order.albumId}`,
    appleUrl,
    googleUrl,
  });
}

// Creates / updates an Order row from a Stripe Checkout Session. This is
// the single idempotent write path used by both the webhook and the
// `/welcome` page's just-in-case fetch. Safe to call twice — the unique
// index on `stripe_checkout_session_id` prevents duplicates and we no-op
// if the order is already paid.
// Task #2061 — fan-out each paid custom-addon line into one gift-box row per
// purchased unit so the buyer can personalize each box AFTER checkout (the
// "Gift of Hope" gifting flow). Idempotent: positions are uniquely indexed
// by (order_item_id, position) and we onConflictDoNothing, so re-running this
// on a webhook replay or a second materialize never duplicates or clobbers a
// row the buyer has already personalized. org/orgName/fulfiller are snapshotted
// from the add-on at sale time so a later operator edit (or add-on deletion)
// never rewrites who an already-paid box benefits. Generic — nothing here is
// Nightbirde-specific.
async function ensureGiftBoxesForOrder(order: Order): Promise<void> {
  const caItems = await db
    .select()
    .from(orderItems)
    .where(and(eq(orderItems.orderId, order.id), eq(orderItems.kind, "custom_addon")));
  if (caItems.length === 0) return;
  const addonIds = Array.from(new Set(caItems.map((i) => i.sku).filter(Boolean)));
  // Resolve the owning non-profit for each add-on. The add-on may have been
  // deleted since the sale; missing rows simply leave organizationId/orgName
  // null on the snapshot (fulfiller still rides off the order_item).
  const orgRows = addonIds.length
    ? await db
        .select({ id: customAddons.id, organizationId: customAddons.organizationId, orgName: organizations.name })
        .from(customAddons)
        .innerJoin(organizations, eq(organizations.id, customAddons.organizationId))
        .where(inArray(customAddons.id, addonIds))
    : [];
  const orgByAddon = new Map(orgRows.map((r) => [r.id, { organizationId: r.organizationId, orgName: r.orgName }]));
  const rows: (typeof customAddonGiftBoxes.$inferInsert)[] = [];
  for (const item of caItems) {
    const qty = Math.max(1, item.quantity ?? 1);
    const org = orgByAddon.get(item.sku);
    for (let pos = 1; pos <= qty; pos++) {
      rows.push({
        orderId: order.id,
        orderItemId: item.id,
        addonId: item.sku,
        buyerUserId: order.customerId,
        organizationId: org?.organizationId ?? null,
        orgName: org?.orgName ?? null,
        fulfiller: item.fulfiller ?? null,
        position: pos,
      });
    }
  }
  if (rows.length === 0) return;
  await db
    .insert(customAddonGiftBoxes)
    .values(rows)
    .onConflictDoNothing({ target: [customAddonGiftBoxes.orderItemId, customAddonGiftBoxes.position] });
}

// `deps.stripe` is a test-only seam: production always passes nothing and we
// build a fresh client via getStripe(). The order-snapshot test
// (server/commerce.orderSnapshots.db.test.ts) injects a stub so it can drive
// this exact path with a representative session without calling Stripe.
export async function materializeOrderFromSession(
  session: Stripe.Checkout.Session,
  deps: { stripe?: Stripe } = {},
): Promise<Order> {
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
  // Task #549 — per-copy split. Legacy single-copy sessions either omit
  // these or carry "1"/"0"; treat both as one copy with `signedCert`
  // mirroring the legacy flag.
  const quantity = Math.max(1, parseInt(session.metadata?.gt_quantity ?? "1", 10) || 1);
  const copiesMask = session.metadata?.gt_copies ?? (signedCert ? "1" : "0").padEnd(quantity, "0");
  const copyCertPattern: boolean[] = Array.from({ length: quantity }, (_, i) =>
    copiesMask[i] === "1",
  );
  // Task #1484 — the buyer's chosen digital GoodDeed cert name, captured
  // in the Buy sheet. The session metadata only carries it for a digital-
  // only GoodDeed purchase (no signed copy); double-gate on !signedCert
  // here so a physical signed-cert order never gets certConfirmedName
  // stamped (those keep the operator confirm flow). Blank → keep the
  // synthesized-name fallback at PDF time.
  const checkoutCertName =
    !signedCert ? (session.metadata?.gt_cert_name?.trim() || null) : null;
  const signedCertPriceCents = parseInt(session.metadata?.gt_signed_cert_price ?? "0", 10) || 0;
  // Task #793 — the 7" "+ booklet" variant stamps every copy as a
  // with-booklet bundle so fulfillment + booklet-run consumption is
  // tracked per copy. Uniform across the order (the variant is the
  // format choice); the per-copy formatPriceCents already carries the
  // set bundle price the fan paid.
  const bookletBundle = session.metadata?.gt_booklet_bundle === "1";

  // Task #73 — snapshot artist/label/skuKind so reporting joins survive
  // album reassignment, and so the Stripe→OD handoff has the routing
  // metadata it needs even if the Stripe metadata was thin.
  const { classifySkuKind } = await import("./orderDesk");
  const [albumRow] = await db.select().from(albums).where(eq(albums.id, albumId));
  const skuKind = session.metadata?.gt_sku_kind || classifySkuKind(skuFormat);
  const artistSnapshotId = session.metadata?.gt_artist_id || albumRow?.primaryArtistId || null;
  const labelSnapshotId = session.metadata?.gt_label_id || albumRow?.labelId || null;
  // Task #2270 — QA test-purchase flag. When set, the order is recorded
  // with origin='qa:test' and side-effects (fan library, stock decrement,
  // referral credits, LLT bonus) are skipped so test runs don't pollute
  // real data. Gift boxes are kept so the Gift of Hope flow is testable.
  const isQa = session.metadata?.gt_is_qa === "1";

  // Shipping breakdown. The base/markup split and resolved band come from
  // the metadata we stamped at session create. The fan-charged total is
  // computed below once `full` (the expanded session) is fetched. Null
  // across the board for digital / no-shipping orders.
  const shipBaseCents = session.metadata?.gt_ship_base ? parseInt(session.metadata.gt_ship_base, 10) || 0 : null;
  const shipMarkupCents = session.metadata?.gt_ship_markup ? parseInt(session.metadata.gt_ship_markup, 10) || 0 : null;
  const shipBand = session.metadata?.gt_ship_band || null;
  // Task #1867 — per-box custom add-on shipping (e.g. Gift of Hope). Stamped
  // separately from the vinyl rate-card split because a DIGITAL purchase + box
  // has no vinyl quote (shipBaseCents null) yet still charges shipping. We use
  // it to know shipping applies even when there's no vinyl leg.
  const shipCustomAddonCents = session.metadata?.gt_ship_custom_addon
    ? parseInt(session.metadata.gt_ship_custom_addon, 10) || 0
    : 0;

  const stripe = deps.stripe ?? (await getStripe());
  // Re-fetch with expansion so addresses/phone are populated even if the
  // original event payload was thin.
  const full = await stripe.checkout.sessions.retrieve(session.id, {
    expand: [
      "customer",
      "payment_intent",
      "customer_details",
      // Expand the instrument + charge so we can snapshot card brand/last4,
      // the digital-wallet type, and the Stripe-hosted receipt URL.
      "payment_intent.payment_method",
      "payment_intent.latest_charge",
    ],
  });

  // Fan-charged shipping is authoritative from Stripe's collected total;
  // fall back to the metadata estimate if Stripe didn't attach a cost.
  // Task #1629 — the fan-facing shipping line must be PRE-TAX. With Stripe Tax
  // on, the shipping rate is taxed too, so `shipping_cost.amount_total` is
  // tax-inclusive and `total_details.amount_tax` already covers that shipping
  // tax. Use the pre-tax shipping (`total_details.amount_shipping`, which equals
  // the rate we quoted) so items-subtotal + shipping + tax reconciles to the
  // order total without double-counting shipping tax.
  // Task #1867 — shipping applies when there's a vinyl quote OR a per-box
  // add-on charge. Gating only on shipBaseCents dropped the box shipping on
  // digital-only + Gift-of-Hope orders (Stripe charged it but the order
  // persisted NULL). Prefer Stripe's authoritative collected total either way.
  const shippingApplies = shipBaseCents !== null || shipCustomAddonCents > 0;
  const shipChargedCents = !shippingApplies
    ? null
    : (full as any).total_details?.amount_shipping ??
      (full as any).shipping_cost?.amount_subtotal ??
      (session.metadata?.gt_ship_charged ? parseInt(session.metadata.gt_ship_charged, 10) || 0 : null);

  const piId = typeof full.payment_intent === "string" ? full.payment_intent : full.payment_intent?.id ?? null;
  const stripeCustomerId = typeof full.customer === "string" ? full.customer : full.customer?.id ?? null;
  const buyerEmail = full.customer_details?.email ?? null;
  const buyerName = full.customer_details?.name ?? null;
  const buyerPhone = full.customer_details?.phone ?? null;
  // Payment-instrument snapshot — only present once the PI has a charged
  // payment method (paid sessions). Falls back to null on unpaid/pending.
  const pi = full.payment_intent && typeof full.payment_intent === "object" ? full.payment_intent : null;
  const pm = pi && typeof pi.payment_method === "object" ? pi.payment_method : null;
  const piCard = (pm as any)?.card ?? null;
  const paymentCardBrand = piCard?.brand ?? null;
  const paymentCardLast4 = piCard?.last4 ?? null;
  const paymentWalletType = piCard?.wallet?.type ?? null;
  const piCharge = pi && typeof pi.latest_charge === "object" ? pi.latest_charge : null;
  const receiptUrl = (piCharge as any)?.receipt_url ?? null;
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
    // Task #844 — "custom_addon" joins the existing "format" | "addon"
    // kinds. Its sku holds the custom_addons.id and it carries a
    // fulfiller snapshot the format/addon rows don't have.
    const kind = (product?.metadata?.gt_kind as "format" | "addon" | "custom_addon") ?? "format";
    const sku = product?.metadata?.gt_sku ?? "unknown";
    const pressingSnap = kind === "format" ? skuByFormatAtPurchase.get(sku as any) : undefined;
    const fulfiller =
      kind === "custom_addon" ? (product?.metadata?.gt_fulfiller || null) : null;
    // Task #1630 — anonymous/specific recipient intent the fan picked for a
    // custom non-profit add-on, snapshotted from the line metadata. Null on
    // every other kind.
    const recipientMode =
      kind === "custom_addon"
        ? ((product?.metadata?.gt_recipient_mode as "anonymous" | "specific" | "") || null)
        : null;
    items.push({
      kind,
      sku,
      label: li.description ?? product?.name ?? sku,
      // Task #1629 — store the PRE-TAX line amount. With Stripe Tax on and
      // tax_behavior "exclusive", `amount_total` is tax-INCLUSIVE, so using it
      // here would double-count tax once we also break out a Tax line on the
      // receipt/summary. `amount_subtotal` is the pre-tax, post-discount line
      // amount Stripe always returns; fall back to amount_total/unit_amount only
      // for legacy/test stubs that don't carry it (no-tax orders where
      // amount_subtotal === amount_total).
      unitPriceCents: li.amount_subtotal ?? li.amount_total ?? li.price?.unit_amount ?? 0,
      quantity: li.quantity ?? 1,
      vinylColor: pressingSnap?.vinylColor ?? null,
      jacketUpgrade: (pressingSnap?.jacketUpgrade as JacketUpgrade | null) ?? null,
      fulfiller,
      recipientMode,
    });
  }
  const totalCents = full.amount_total ?? items.reduce((a, b) => a + b.unitPriceCents * b.quantity, 0);
  // Task #1629 — Stripe Tax: the sales tax Stripe computed for this order.
  // `total_details.amount_tax` is part of `amount_total` (it's tax-on-top,
  // tax_behavior: "exclusive"), so we only break it out for display — we
  // never add it again. Null when Stripe didn't report it (legacy session).
  const taxCents = (full as any).total_details?.amount_tax ?? null;

  // Task #549 — Pressing snapshot for the chosen format, used on every
  // order_copies row we write below.
  const formatPressingSnap = skuByFormatAtPurchase.get(skuFormat as any);
  const formatItem = items.find((i) => i.kind === "format");
  const formatUnitCents = formatItem
    ? Math.floor((formatItem.unitPriceCents ?? 0) / Math.max(1, formatItem.quantity ?? 1))
    : 0;

  // Task #549 — Mint per-copy GoodDeed numbers + order_copies inside a
  // single transaction so:
  //   1) all-or-nothing semantics across order + items + copies,
  //   2) the partial unique index on order_copies(albumId, goodDeed
  //      Number) catches cross-order races (handled by the retry
  //      wrapper just like orders.good_deed_number_uniq), and
  //   3) the floor in assignNextGoodDeedNumber sees our own freshly-
  //      inserted copies on retry.
  // Order-level `goodDeedNumber` mirrors the FIRST signed copy's number
  // for legacy reads (admin lists, fulfillment, OrderDesk metadata) so
  // nothing downstream has to learn about copies.
  // Upsert by session id. If a row exists (pending), flip to paid; if not, insert.
  let order = existing;
  if (!order) {
    // Task #551 — Wrap the GoodDeed-number-bearing insert in the
    // retry helper. A concurrent webhook race that picks the same
    // MAX+1 trips the partial unique index (23505) and we re-mint.
    const inserted = await withRetryOnGoodDeedCollision(albumId, async () => {
      return await db.transaction(async (tx) => {
        // Assign sequential numbers to each signed copy starting from
        // MAX+1. If anyone else also takes MAX+1 first we'll trip the
        // unique index on insert and the retry loop re-runs us from
        // the top with a fresh MAX read.
        let nextNum = isPaid ? await assignNextGoodDeedNumber(albumId) : 0;
        // Task #1899 — every paid copy gets its own GoodDeed number for life,
        // regardless of whether it includes the signed-cert add-on. The signed-
        // cert badge is still shown only on copies that bought the cert; the
        // number is a separate digital provenance entitlement on every copy.
        const copyNumbers: (number | null)[] = copyCertPattern.map((_hasCert) => {
          if (!isPaid) return null;
          const n = nextNum;
          nextNum += 1;
          return n;
        });
        const firstCertNumber = copyNumbers.find((n) => n != null) ?? null;
        const [row] = await tx
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
            paymentCardBrand,
            paymentCardLast4,
            paymentWalletType,
            receiptUrl,
            goodDeedNumber: firstCertNumber,
            // Task #1484 — stamp the buyer's chosen digital cert name (and
            // when it was set) so the cert PDF (Path 2) prints it with no
            // post-checkout step. Null for physical signed-cert orders.
            certConfirmedName: checkoutCertName,
            certConfirmedAt: checkoutCertName ? new Date() : null,
            skuKind,
            artistSnapshotId,
            labelSnapshotId,
            fulfillmentStatus: isPaid && skuKind !== "digital" ? "pending" : null,
            shippingBaseCents: shipBaseCents,
            shippingMarkupCents: shipMarkupCents,
            shippingChargedCents: shipChargedCents,
            shippingBand: shipBand,
            taxCents,
            // Task #2270 — QA test-purchase orders are stamped so they can
            // be excluded from reports, buyer rosters, and fulfillment queues.
            origin: isQa ? "qa:test" : "direct",
          })
          .onConflictDoNothing({ target: orders.stripeCheckoutSessionId })
          .returning();
        if (!row) return undefined; // session already materialised
        await tx.insert(orderItems).values(items.map((i) => ({ ...i, orderId: row.id })));
        await tx.insert(orderCopies).values(
          copyCertPattern.map((hasCert, i) => ({
            orderId: row.id,
            albumId,
            position: i + 1,
            format: skuFormat,
            signedCert: hasCert,
            booklet: bookletBundle,
            formatPriceCents: formatUnitCents,
            addonPriceCents: hasCert ? signedCertPriceCents : 0,
            goodDeedNumber: copyNumbers[i],
            vinylColor: formatPressingSnap?.vinylColor ?? null,
            jacketUpgrade: (formatPressingSnap?.jacketUpgrade as JacketUpgrade | null) ?? null,
          })),
        );
        return row;
      });
    });
    order = inserted ?? (await getOrderBySessionId(full.id))!;
  } else if (isPaid && order.status === "pending") {
    const u = await withRetryOnGoodDeedCollision(albumId, async () => {
      return await db.transaction(async (tx) => {
        // Existing pending row → look up its copies and fill in any
        // missing GoodDeed numbers now that we're flipping to paid.
        const existingCopies = await tx.select().from(orderCopies).where(eq(orderCopies.orderId, order!.id)).orderBy(asc(orderCopies.position));
        const needsCopies = existingCopies.length === 0;
        let nextNum = await assignNextGoodDeedNumber(albumId);
        // Task #1899 — every paid copy gets a number. For existing copies we
        // reuse any number already assigned; only null slots are freshly minted.
        const copyCount = needsCopies ? copyCertPattern.length : existingCopies.length;
        const copyNumbers: (number | null)[] = Array.from({ length: copyCount }, (_, i) => {
          // Reuse a copy's existing number if it already had one
          // (idempotent re-runs of this branch).
          const prev = existingCopies[i]?.goodDeedNumber ?? null;
          if (prev != null) return prev;
          const n = nextNum;
          nextNum += 1;
          return n;
        });
        const firstCertNumber = copyNumbers.find((n) => n != null) ?? order!.goodDeedNumber ?? null;
        const [row] = await tx
          .update(orders)
          .set({
            status: "paid",
            stripePaymentIntentId: piId,
            shippingAddress: shipping,
            billingAddress: billing,
            buyerEmail,
            buyerName,
            buyerPhone,
            paymentCardBrand,
            paymentCardLast4,
            paymentWalletType,
            receiptUrl,
            goodDeedNumber: firstCertNumber,
            // Task #1484 — preserve any name the fan already confirmed
            // (e.g. via the /welcome card on an earlier visit); only fill
            // from the checkout value when the order has none yet.
            certConfirmedName: order!.certConfirmedName ?? checkoutCertName,
            certConfirmedAt: order!.certConfirmedName
              ? order!.certConfirmedAt
              : checkoutCertName
                ? new Date()
                : order!.certConfirmedAt,
            skuKind: order!.skuKind ?? skuKind,
            artistSnapshotId: order!.artistSnapshotId ?? artistSnapshotId,
            labelSnapshotId: order!.labelSnapshotId ?? labelSnapshotId,
            fulfillmentStatus: order!.fulfillmentStatus ?? (skuKind !== "digital" ? "pending" : null),
            shippingBaseCents: order!.shippingBaseCents ?? shipBaseCents,
            shippingMarkupCents: order!.shippingMarkupCents ?? shipMarkupCents,
            shippingChargedCents: order!.shippingChargedCents ?? shipChargedCents,
            shippingBand: order!.shippingBand ?? shipBand,
            taxCents: order!.taxCents ?? taxCents,
            // Task #2270 — preserve origin='qa:test' if the pending row was
            // already flagged; stamp it now if the pending row wasn't (fallback).
            origin: order!.origin === "qa:test" || isQa ? "qa:test" : (order!.origin ?? "direct"),
          })
          .where(eq(orders.id, order!.id))
          .returning();
        if (needsCopies) {
          await tx.insert(orderCopies).values(
            copyCertPattern.map((hasCert, i) => ({
              orderId: row.id,
              albumId,
              position: i + 1,
              format: skuFormat,
              signedCert: hasCert,
              booklet: bookletBundle,
              formatPriceCents: formatUnitCents,
              addonPriceCents: hasCert ? signedCertPriceCents : 0,
              goodDeedNumber: copyNumbers[i],
              vinylColor: formatPressingSnap?.vinylColor ?? null,
              jacketUpgrade: (formatPressingSnap?.jacketUpgrade as JacketUpgrade | null) ?? null,
            })),
          );
        } else {
          // Task #1899 — update every copy that still lacks a number, not
          // just signed ones. The signedCert gate was the old pre-#1899 guard.
          for (let i = 0; i < existingCopies.length; i++) {
            const c = existingCopies[i];
            if (c.goodDeedNumber == null && copyNumbers[i] != null) {
              await tx
                .update(orderCopies)
                .set({ goodDeedNumber: copyNumbers[i] })
                .where(eq(orderCopies.id, c.id));
            }
          }
        }
        return row;
      });
    });
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
    // Task #2270 — QA test-purchase orders skip fan library, LLT bonus,
    // stock decrement, and referral credits so test runs don't pollute real
    // data. Gift boxes are kept so the Gift of Hope flow is fully testable.
    if (!isQa) {
      await db
        .insert(userAlbums)
        .values({ userId: customerId, albumId })
        .onConflictDoNothing();
      // Task #1460 — owning a qualifying Nick Carter LLT release also
      // unlocks the shared "Love Life Tragedy (Bonus)" album. No-op for any
      // other album; idempotent (skips if already owned).
      await grantLltBonusIfEligible(db, customerId, albumId);
    }
    // Task #2061 — fan-out paid custom-addon lines into per-box rows the
    // buyer personalizes after checkout. Idempotent; no-op when the order
    // carries no custom-addon line.
    await ensureGiftBoxesForOrder(order);
    // Decrement stock — guarded by `wasAlreadyPaid` AND `isQa` so QA orders
    // never reduce real inventory and concurrent materializations of the same
    // session don't double-decrement.
    // Task #549 — multi-quantity orders subtract N, not 1.
    if (!wasAlreadyPaid && !isQa) {
      await db
        .update(albumSkus)
        .set({ stock: sql`GREATEST(${albumSkus.stock} - ${quantity}, 0)` })
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
    if (!wasAlreadyPaid && !isQa && order.artistSnapshotId) {
      try {
        const r = await db.execute<{
          referred_by_person_id: string | null;
          referred_by_org_id: string | null;
          invited_by_press_id: string | null;
          referrer_per_unit_cents: number | null;
        }>(sql`SELECT referred_by_person_id, referred_by_org_id, invited_by_press_id, referrer_per_unit_cents
               FROM people WHERE id = ${order.artistSnapshotId} LIMIT 1`);
        const row = (r as any).rows?.[0];
        // Task #922 — per-album NPO beneficiaries are a property of the
        // ALBUM, not of the artist's referral columns, so the NPO branch
        // below must run even when the people row carries no referrer.
        // The artist + press branches still gate on their referrer cols.
        const benRows = await db.execute<{ organization_id: string; per_unit_cents: number }>(sql`
          SELECT organization_id, per_unit_cents
          FROM album_npo_beneficiaries
          WHERE album_id = ${albumId}
          ORDER BY created_at ASC
        `);
        const beneficiaries = ((benRows as any).rows ?? []) as {
          organization_id: string;
          per_unit_cents: number;
        }[];
        if (row && (row.referred_by_person_id || row.referred_by_org_id || row.invited_by_press_id || beneficiaries.length > 0)) {
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
            // Task #2126 — operator on/off switch on the REFERRER's people
            // row. When `earns_referral_payout` is false, the referring
            // artist still keeps the invite relationship (and the frozen
            // artist_referrals row above) but no credit is minted. NULL /
            // legacy rows default to TRUE so existing referrers keep
            // earning with no regression.
            const payoutRow = await db.execute<{ earns: boolean | null }>(sql`
              SELECT earns_referral_payout AS earns
              FROM people WHERE id = ${row.referred_by_person_id} LIMIT 1
            `);
            const referrerEarns = ((payoutRow as any).rows?.[0]?.earns ?? true) !== false;
            if (!swapKeepsInvitee && referrerEarns) {
              const amountCents = basePerUnit * safeUnits;
              await db.execute(sql`
                INSERT INTO referral_credits (order_id, referred_artist_id, referrer_kind, referrer_person_id, amount_cents, currency, status, units)
                VALUES (${order.id}, ${order.artistSnapshotId}, 'artist', ${row.referred_by_person_id}, ${amountCents}, ${currency}, 'pending_payout', ${safeUnits})
                ON CONFLICT (order_id) WHERE referrer_kind = 'artist' DO NOTHING
              `);
            }
          }

          // ── NPO branch — per-album beneficiary split (Task #922) ──
          // Source of truth is album_npo_beneficiaries: mint ONE credit
          // per beneficiary, each at its own per-unit rate (total already
          // capped ≤ $1/unit when the split was saved). When the album
          // has NO explicit split yet (un-backfilled legacy album) we
          // fall back to the artist's single referred_by_org_id credit,
          // preserving the optional $1.50 funded-up charity bonus. Once
          // an album has explicit beneficiaries, the operator's
          // allocation is the source of truth and the global bonus is
          // consciously folded into that ≤$1 cap (see docs/roadmap +
          // commit notes).
          if (beneficiaries.length > 0) {
            for (const b of beneficiaries) {
              const amountCents = b.per_unit_cents * safeUnits;
              await db.execute(sql`
                INSERT INTO referral_credits (order_id, referred_artist_id, referrer_kind, referrer_org_id, amount_cents, currency, status, units)
                VALUES (${order.id}, ${order.artistSnapshotId}, 'non_profit', ${b.organization_id}, ${amountCents}, ${currency}, 'pending_payout', ${safeUnits})
                ON CONFLICT (order_id, referrer_org_id) WHERE referrer_kind = 'non_profit' DO NOTHING
              `);
            }
          } else if (row.referred_by_org_id) {
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
              ON CONFLICT (order_id, referrer_org_id) WHERE referrer_kind = 'non_profit' DO NOTHING
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
      const { pushOrderToOrderDesk, isPhysicalSkuKind, orderDeskAutoPushEnabled } = await import("./orderDesk");
      // Auto-push is OFF by default — see orderDeskAutoPushEnabled(). The real
      // flow aggregates fan orders → artist confirms the press-run quantity →
      // one order placed with the chosen press, and only then does fulfillment
      // routing matter. Pushing each fan order now would make the fulfillment
      // partner think they must fulfill it before anything is printed. The
      // operator pushes deliberately from the admin order row instead.
      if (isPhysicalSkuKind(skuKind) && orderDeskAutoPushEnabled()) {
        // pushOrderToOrderDesk is internally try/caught and records any error
        // on the order row so the admin retry button surfaces the reason.
        // We still .catch here to guarantee the surrounding checkout path
        // is never interrupted by an unexpected throw.
        await pushOrderToOrderDesk(order.id).catch((e) =>
          console.error(`[commerce] OD handoff unexpected throw for ${order.id}`, e?.message),
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

  // Task #533 — accrue this paid sale's per-unit press earmark into the
  // album's early-cut funding pool. Idempotent per order; no-ops when the
  // album has no resolvable press tier.
  if (isPaid && order) {
    const { accruePressPool } = await import("./earlyCut");
    await accruePressPool(albumId, order.id, quantity).catch((e) =>
      console.error(`[commerce] press-pool accrual failed for ${order!.id}`, e?.message),
    );
  }

  // Task #937 — branded order receipt, sent exactly once per order.
  // The claim is an atomic conditional UPDATE: only the first caller to
  // flip receipt_email_sent_at from NULL gets a row back, so a webhook
  // and the /welcome fetch racing on the same session can never send
  // two receipts. The send itself is best-effort — it never throws and
  // never blocks order materialization (mirrors the OD-handoff and
  // press-pool patterns above).
  if (order && order.status === "paid") {
    try {
      const claimed = await db
        .update(orders)
        .set({ receiptEmailSentAt: new Date() })
        .where(and(eq(orders.id, order.id), isNull(orders.receiptEmailSentAt)))
        .returning({ id: orders.id });
      if (claimed.length > 0) {
        await dispatchOrderReceipt(order).catch((e) =>
          console.error(`[commerce] receipt email failed for ${order!.id}`, e?.message),
        );
        // Task #2257 — stitch the completion back to the landing funnel
        // session. The purchase finishes on a different host with a fresh
        // analytics device/session, so the client `checkout_completed` event
        // (fired on /welcome) lands on a NEW session the funnel can't link to
        // the original landing — completions read ~0 and get mislabeled
        // "direct/unknown". Here we emit a SERVER-SIDE `checkout_completed`
        // carrying the ORIGINAL session id + first-touch source we stashed in
        // the Stripe metadata, so the strict session funnel counts it on the
        // same session that landed/viewed/started. Piggybacks on the atomic
        // receipt claim above so it fires exactly once per order (a webhook +
        // /welcome poll racing the same session can't double-emit). Best-
        // effort: analytics must never break order materialization.
        const funnelSession = full.metadata?.gt_funnel_session || session.metadata?.gt_funnel_session || null;
        if (funnelSession) {
          try {
            const stitchPayload: Record<string, any> = {
              albumId,
              orderId: order.id,
              priceCents: order.totalCents,
              _stitched: true,
            };
            const fDevice = full.metadata?.gt_funnel_device || session.metadata?.gt_funnel_device;
            const fUtmSource = full.metadata?.gt_funnel_utm_source || session.metadata?.gt_funnel_utm_source;
            const fUtmCampaign = full.metadata?.gt_funnel_utm_campaign || session.metadata?.gt_funnel_utm_campaign;
            const fRefHost = full.metadata?.gt_funnel_ref_host || session.metadata?.gt_funnel_ref_host;
            if (fDevice) stitchPayload._device_id = fDevice;
            if (fUtmSource) stitchPayload._utm_source = fUtmSource;
            if (fUtmCampaign) stitchPayload._utm_campaign = fUtmCampaign;
            if (fRefHost) stitchPayload._referrer_host = fRefHost;
            await storage.insertAnalyticsEvents([
              {
                name: "checkout_completed",
                payload: stitchPayload,
                ts: new Date(),
                sessionId: funnelSession,
                userId: customerId,
              },
            ]);
          } catch (e: any) {
            console.error(`[commerce] funnel stitch failed for ${order.id}`, e?.message);
          }
        }
      }
    } catch (e: any) {
      console.error(`[commerce] receipt claim failed for ${order.id}`, e?.message);
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
  // Task #533 — back the refunded sale's earmark out of the early-cut pool
  // so a refund can never leave the funding pool overstated.
  if (order.albumId) {
    const { reversePressPoolForOrder } = await import("./earlyCut");
    await reversePressPoolForOrder(order.albumId, order.id).catch((e) =>
      console.error(`[commerce] press-pool reversal failed for ${order.id}`, e?.message),
    );
  }
  // Task #550 — revert any unclaimed gifts on this order so the share
  // link stops working and the entitlement stays with the sender (the
  // user_albums sweep below removes the album entirely when no other
  // paid order remains, which is the correct end-state for a refunded
  // gift). Already-claimed gifts keep their state — the standard
  // refund unwind treats them like any other transferred order.
  try {
    const { revertGiftsForRefundedOrder } = await import("./gifts");
    await revertGiftsForRefundedOrder(order.id);
  } catch (e: any) {
    console.warn(`[commerce] gift revert failed for refunded order ${order.id}: ${e?.message}`);
  }
  // Task #549 — also void every per-copy GoodDeed number so neither the
  // cert renderer nor the next assignNextGoodDeedNumber floor sees this
  // refunded order's numbers.
  await db
    .update(orderCopies)
    .set({ goodDeedNumber: null })
    .where(eq(orderCopies.orderId, order.id));
  // Restore stock if the SKU was metered. Best-effort — pulled from the
  // first format-kind order item snapshot we wrote at purchase time.
  // Quantity is the aggregate from order_items (one row per kind+sku),
  // so a 3-copy order restores 3.
  const items = await getOrderItems(order.id);
  const formatItem = items.find((i) => i.kind === "format");
  if (formatItem) {
    const qty = Math.max(1, formatItem.quantity ?? 1);
    await db
      .update(albumSkus)
      .set({ stock: sql`${albumSkus.stock} + ${qty}` })
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
  // this is the *only* live order for the pair. "Live" includes a Task
  // #2428 shopify_plus "external_paid" unlock, not just a direct "paid"
  // order — same rule the Shopify refund path uses.)
  const remaining = await db
    .select({ id: orders.id })
    .from(orders)
    .where(
      and(
        eq(orders.customerId, order.customerId),
        eq(orders.albumId, order.albumId),
        inArray(orders.status, ["paid", "external_paid"]),
      ),
    );
  if (remaining.length === 0) {
    await db.delete(userAlbums).where(and(eq(userAlbums.userId, order.customerId), eq(userAlbums.albumId, order.albumId)));
  }
}
