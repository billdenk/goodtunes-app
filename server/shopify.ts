// Task #49 — Shopify redemption flow.
//
// Owns: OAuth install/callback against a label's Shopify store, paid +
// refunded webhook handlers, redemption-code minting + resolve, admin
// CRUD for product↔album mappings, order-status-page ScriptTag install.
//
// Mounted by registerShopifyRoutes() from server/routes.ts. The webhook
// endpoint reads the raw body (server/index.ts wires express.raw() for
// /api/webhooks/shopify) so the HMAC verification sees the exact bytes
// Shopify signed. Everything else is normal JSON.
//
// Reuses Task #44 plumbing: assignNextGoodDeedNumber on paid, the same
// user_albums unlock row, the same refund-reverses-unlock logic — the
// only thing that changes is the source of the "paid" event.
import type { Express, Request, Response } from "express";
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, scrypt as _scrypt, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "./db";
import {
  albums,
  albumAddons,
  orders,
  orderItems,
  customerUsers,
  userAlbums,
  shopifyStores,
  shopifyProductMappings,
  shopifyRedemptionCodes,
  insertShopifyProductMappingSchema,
  type ShopifyStore,
  type ShopifyProductMapping,
} from "@shared/schema";
import { z } from "zod";
import { storage } from "./storage";

// ─── Env / app credentials ────────────────────────────────────────────
// The operator registers GoodTunes once as a Shopify Partner app and
// pastes the resulting API key + secret into Replit Secrets. Per-store
// install/uninstall + per-order webhook signing all derive from the
// SAME secret — Shopify signs every webhook with the app's shared secret.
// Replit's integration connector catalog does not include Shopify (as of
// 2026-05; searchIntegrations("shopify") returns empty), so OAuth app
// credentials come from env vars rather than the connector proxy used
// for Stripe/OpenAI. SHOPIFY_TOKEN_KEY is a separate secret used only
// to envelope-encrypt the per-store offline access tokens we get back
// from Shopify OAuth — see encryptToken/decryptToken below. If it's
// unset we fall back to SESSION_SECRET so dev still works without an
// extra secret to provision.
const SHOPIFY_API_KEY = process.env.SHOPIFY_API_KEY ?? "";
const SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET ?? "";
// write_orders is required so we can stamp the redemption URL onto the
// Shopify order as a note_attribute — that's what merchants reference
// from their email-template Liquid snippet (see install guide).
const SHOPIFY_SCOPES = process.env.SHOPIFY_SCOPES ?? "read_orders,write_orders,read_products,write_script_tags";
const SHOPIFY_TOKEN_KEY = createHash("sha256")
  .update(process.env.SHOPIFY_TOKEN_KEY ?? process.env.SESSION_SECRET ?? "goodtunes-shopify-fallback-dev-key")
  .digest();
// The Shopify Admin API version pinned here is bumped quarterly. Pinned
// rather than "unstable" so a Shopify rev doesn't silently break us.
const SHOPIFY_API_VERSION = "2024-10";

export function shopifyConfigured(): boolean {
  return Boolean(SHOPIFY_API_KEY) && Boolean(SHOPIFY_API_SECRET);
}

function appOrigin(req: Request): string {
  const proto = (req.headers["x-forwarded-proto"] as string | undefined)?.split(",")[0] ?? req.protocol ?? "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host || "";
  return `${proto}://${host}`;
}

// myshop123.myshopify.com — Shopify's canonical id for an installed store.
// Validate strictly so a hostile `?shop=evil.com` can't redirect us to a
// non-Shopify host on OAuth install.
function isValidShopDomain(shop: string): boolean {
  return /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i.test(shop);
}

// ─── HMAC helpers ─────────────────────────────────────────────────────
// Shopify's OAuth uses HMAC-SHA256 over the query string (alphabetical,
// minus the `hmac` and `signature` params themselves) keyed by the app
// secret. Webhooks use HMAC-SHA256 over the raw request body, base64
// encoded in `X-Shopify-Hmac-Sha256`.
function verifyOAuthHmac(query: Record<string, any>): boolean {
  const { hmac, signature: _sig, ...rest } = query;
  if (!hmac || typeof hmac !== "string") return false;
  const message = Object.keys(rest)
    .sort()
    .map((k) => `${k}=${Array.isArray(rest[k]) ? rest[k].join(",") : rest[k]}`)
    .join("&");
  const digest = createHmac("sha256", SHOPIFY_API_SECRET).update(message).digest("hex");
  const a = Buffer.from(digest);
  const b = Buffer.from(hmac);
  return a.length === b.length && timingSafeEqual(a, b);
}
function verifyWebhookHmac(rawBody: Buffer, headerHmac: string | undefined): boolean {
  if (!headerHmac) return false;
  const digest = createHmac("sha256", SHOPIFY_API_SECRET).update(rawBody).digest("base64");
  const a = Buffer.from(digest);
  const b = Buffer.from(headerHmac);
  return a.length === b.length && timingSafeEqual(a, b);
}

// ─── Storage helpers (inlined, mirroring server/commerce.ts pattern) ──
async function getStoreByDomain(shopDomain: string): Promise<ShopifyStore | null> {
  const [row] = await db.select().from(shopifyStores).where(eq(shopifyStores.shopDomain, shopDomain));
  return row ?? null;
}
async function getStoreById(id: string): Promise<ShopifyStore | null> {
  const [row] = await db.select().from(shopifyStores).where(eq(shopifyStores.id, id));
  return row ?? null;
}
async function upsertStore(input: {
  shopDomain: string;
  storeName: string | null;
  accessToken: string;
  scopes: string;
}): Promise<ShopifyStore> {
  const existing = await getStoreByDomain(input.shopDomain);
  const encrypted = encryptToken(input.accessToken);
  if (existing) {
    const [updated] = await db
      .update(shopifyStores)
      .set({
        accessToken: encrypted,
        scopes: input.scopes,
        storeName: input.storeName ?? existing.storeName,
        installedAt: new Date(),
        uninstalledAt: null,
      })
      .where(eq(shopifyStores.id, existing.id))
      .returning();
    return updated;
  }
  const [created] = await db
    .insert(shopifyStores)
    .values({ ...input, accessToken: encrypted })
    .returning();
  return created;
}

// ─── Shopify Admin REST helper ─────────────────────────────────────────
// Note: don't annotate the return as `Promise<Response>` — `Response` in
// this file resolves to express's response type because of the imports
// above, which would mask `.ok` / `.json()`. Let TS infer the global
// fetch `Response` from the body.
async function shopifyFetch(store: ShopifyStore, path: string, init: RequestInit = {}) {
  const url = `https://${store.shopDomain}/admin/api/${SHOPIFY_API_VERSION}/${path.replace(/^\//, "")}`;
  return fetch(url, {
    ...init,
    headers: {
      "X-Shopify-Access-Token": decryptToken(store.accessToken),
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(init.headers ?? {}),
    },
  });
}

// ─── Post-install setup: register webhooks + script tag ───────────────
// All three pieces are idempotent on Shopify's side via `address` / `src`
// uniqueness — calling them twice on a re-install is fine.
async function registerWebhooks(store: ShopifyStore, appUrl: string): Promise<void> {
  const topics = ["orders/paid", "orders/refunded", "refunds/create", "app/uninstalled"];
  for (const topic of topics) {
    try {
      await shopifyFetch(store, "webhooks.json", {
        method: "POST",
        body: JSON.stringify({
          webhook: {
            topic,
            address: `${appUrl}/api/webhooks/shopify/orders`,
            format: "json",
          },
        }),
      });
    } catch (e: any) {
      console.error(`[shopify] failed to register webhook ${topic} for ${store.shopDomain}`, e?.message);
    }
  }
}
async function installScriptTag(store: ShopifyStore, appUrl: string): Promise<void> {
  try {
    await shopifyFetch(store, "script_tags.json", {
      method: "POST",
      body: JSON.stringify({
        script_tag: {
          event: "onload",
          src: `${appUrl}/shopify/redeem-button.js`,
          display_scope: "order_status",
        },
      }),
    });
  } catch (e: any) {
    console.error(`[shopify] failed to install script tag for ${store.shopDomain}`, e?.message);
  }
}

// Constant-time string compare. timingSafeEqual requires equal length;
// we pad with a hash so unequal-length pairs still take the same time.
function safeCompare(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) {
    // Still spend the cycles so a length mismatch can't be probed.
    timingSafeEqual(ab, ab);
    return false;
  }
  return timingSafeEqual(ab, bb);
}

// Envelope-encrypt Shopify offline access tokens at rest. Stored as
// `enc:v1:<iv hex>:<tag hex>:<ciphertext hex>` so a leaked DB dump
// can't be replayed against a label's Shopify Admin API. Reads
// transparently accept legacy plaintext rows ("shpat_…") so existing
// installs keep working until they reinstall and get re-encrypted.
function encryptToken(plain: string): string {
  if (!plain) return plain;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", SHOPIFY_TOKEN_KEY, iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `enc:v1:${iv.toString("hex")}:${tag.toString("hex")}:${ct.toString("hex")}`;
}
function decryptToken(stored: string): string {
  if (!stored) return stored;
  if (!stored.startsWith("enc:v1:")) return stored; // legacy plaintext
  const [, , ivHex, tagHex, ctHex] = stored.split(":");
  const decipher = createDecipheriv("aes-256-gcm", SHOPIFY_TOKEN_KEY, Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  return Buffer.concat([decipher.update(Buffer.from(ctHex, "hex")), decipher.final()]).toString("utf8");
}

// Match the scrypt envelope used by /api/register in server/routes.ts
// (`<hex64>.<salt>`). Keeping the format identical means /api/login
// works against accounts promoted by /set-password without any
// branching on the login side.
const scryptAsync = promisify(_scrypt);
async function hashPasswordForCustomer(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

// ─── Redemption code helpers ──────────────────────────────────────────
function generateRedemptionCode(): string {
  // 16 hex chars = 64 bits of entropy. Enough that brute-forcing the
  // /redeem/<code> endpoint is uneconomical without us having to rate-
  // limit. Mixed case isn't used — fans paste these out of emails into
  // mobile keyboards and lowercase is friendlier.
  return randomBytes(8).toString("hex");
}

// ─── Order materialization from Shopify webhook ───────────────────────
type ShopifyAddress = {
  name?: string | null;
  address1?: string | null;
  address2?: string | null;
  city?: string | null;
  province?: string | null;
  province_code?: string | null;
  zip?: string | null;
  country_code?: string | null;
  phone?: string | null;
};
type ShopifyLineItem = {
  product_id: number | null;
  variant_id: number | null;
  title: string;
  quantity: number;
  price: string; // dollar string ("12.99")
};
type ShopifyOrder = {
  id: number;
  order_number: number;
  // Per-order unguessable token. Shopify exposes this on the buyer's
  // order status page; we use it to gate the public code lookup.
  token?: string | null;
  email: string | null;
  total_price: string;
  currency: string;
  customer?: { first_name?: string | null; last_name?: string | null; phone?: string | null } | null;
  billing_address?: ShopifyAddress | null;
  shipping_address?: ShopifyAddress | null;
  line_items: ShopifyLineItem[];
};

function dollarsToCents(s: string | null | undefined): number {
  if (!s) return 0;
  const n = Number.parseFloat(s);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}
function snapshotAddress(a: ShopifyAddress | null | undefined) {
  if (!a) return null;
  return {
    name: a.name ?? null,
    line1: a.address1 ?? null,
    line2: a.address2 ?? null,
    city: a.city ?? null,
    state: a.province_code ?? a.province ?? null,
    postalCode: a.zip ?? null,
    country: a.country_code ?? null,
  };
}

// Pull MAX+1 GoodDeed number for an album. Cribbed from commerce.ts so
// Shopify-sourced orders share the monotonic sequence with direct ones —
// fan with GoodDeed #42 doesn't care whether they bought on Shopify or
// goodtunes.music, the number is the number.
async function assignNextGoodDeedNumberForAlbum(albumId: string): Promise<number> {
  const [{ max }] = await db
    .select({ max: sql<number>`COALESCE(MAX(${orders.goodDeedNumber}), 0)` })
    .from(orders)
    .where(eq(orders.albumId, albumId));
  return Number(max ?? 0) + 1;
}

// Find-or-create a stub customer_users row keyed on email. Shopify hands
// us name + email at webhook time; we want the unlock to be reservable
// even before the fan clicks /redeem and sets a password. A stub row
// has password=null (same shape as OAuth-created accounts) and gets
// promoted on /redeem when the fan picks a password or OAuth.
async function findOrCreateStubCustomer(email: string, name: string | null): Promise<string> {
  const normalized = email.trim().toLowerCase();
  const existing = await storage.getCustomerByEmail(normalized);
  if (existing) return existing.id;
  // Pick a unique username from the email local part — same algorithm
  // commerce.ts uses for the direct flow.
  const seed = (normalized.split("@")[0] ?? "fan").replace(/[^a-z0-9_]/g, "").slice(0, 20) || `fan${Math.floor(Math.random() * 10000)}`;
  let username = seed;
  for (let i = 0; i < 6; i++) {
    if (!(await storage.getCustomerByUsername(username))) break;
    username = `${seed.slice(0, 16)}${Math.floor(Math.random() * 10000)}`.slice(0, 20);
  }
  const displayName = name?.trim() || normalized.split("@")[0] || "Fan";
  const [row] = await db
    .insert(customerUsers)
    .values({ email: normalized, username, displayName, realName: name?.trim() ?? null, password: null })
    .returning();
  return row.id;
}

// The heart of the Shopify flow: convert one paid Shopify order into one
// GoodTunes order + line items + (maybe) album unlock + GoodDeed number
// + redemption code. Idempotent by shopifyOrderId — a webhook replay
// re-fetches the same row and no-ops.
async function materializeOrderFromShopify(store: ShopifyStore, payload: ShopifyOrder): Promise<{ orderId: string; code: string } | null> {
  const shopifyOrderId = String(payload.id);
  const buyerEmail = payload.email?.trim().toLowerCase() ?? null;
  if (!buyerEmail) {
    console.warn(`[shopify-webhook] order ${shopifyOrderId} on ${store.shopDomain} has no email — skipping`);
    return null;
  }

  // Idempotency: if we already materialized this order, return its code.
  const [existing] = await db.select().from(orders).where(eq(orders.shopifyOrderId, shopifyOrderId));
  if (existing) {
    const [code] = await db.select().from(shopifyRedemptionCodes).where(eq(shopifyRedemptionCodes.orderId, existing.id));
    return code ? { orderId: existing.id, code: code.code } : null;
  }

  // Resolve every line item against our mappings on this store. We pick
  // the FIRST mapped line item as the album for the order — Shopify
  // allows multi-product carts but GoodTunes orders are 1:1 with an
  // album (the user_albums unlock is per-album). A cart with two
  // different bundled albums would generate two GoodTunes orders, but
  // v1 only handles the first mapped line and leaves the rest as
  // unbundled physical items.
  const productIds = payload.line_items.map((li) => String(li.product_id ?? "")).filter(Boolean);
  if (productIds.length === 0) return null;

  const mappings = await db
    .select()
    .from(shopifyProductMappings)
    .where(and(eq(shopifyProductMappings.storeId, store.id), inArray(shopifyProductMappings.shopifyProductId, productIds)));
  if (mappings.length === 0) {
    console.log(`[shopify-webhook] order ${shopifyOrderId} on ${store.shopDomain} had no mapped products — ignoring`);
    return null;
  }

  let albumId: string | null = null;
  let matchedMapping: ShopifyProductMapping | null = null;
  let matchedLine: ShopifyLineItem | null = null;
  for (const li of payload.line_items) {
    const pid = String(li.product_id ?? "");
    const vid = li.variant_id != null ? String(li.variant_id) : null;
    // Prefer an exact (product, variant) mapping; fall back to a
    // product-wide mapping (variantId=null) if no exact match.
    const exact = mappings.find((m) => m.shopifyProductId === pid && m.shopifyVariantId === vid);
    const productWide = mappings.find((m) => m.shopifyProductId === pid && m.shopifyVariantId === null);
    const hit = exact ?? productWide;
    if (hit) {
      albumId = hit.albumId;
      matchedMapping = hit;
      matchedLine = li;
      break;
    }
  }
  if (!albumId || !matchedMapping || !matchedLine) return null;

  // Find-or-create the customer + reserve the GoodDeed number now so a
  // fan who never clicks the redeem button still has their slot.
  const customerId = await findOrCreateStubCustomer(
    buyerEmail,
    [payload.customer?.first_name, payload.customer?.last_name].filter(Boolean).join(" ") || null,
  );
  const goodDeedNumber = await assignNextGoodDeedNumberForAlbum(albumId);

  // Build the order_items snapshot. Two kinds:
  //   "format" → the physical SKU label (we use the line item title)
  //   "addon"  → printed & signed cert, if this mapping offered it AND
  //              the price is at or above the album's min floor.
  const totalCents = dollarsToCents(payload.total_price);
  let signedCertCents = 0;
  if (matchedMapping.offerSignedCert && matchedMapping.signedCertPriceCents != null) {
    const [floor] = await db
      .select()
      .from(albumAddons)
      .where(and(eq(albumAddons.albumId, albumId), eq(albumAddons.kind, "signed_cert")));
    if (!floor || matchedMapping.signedCertPriceCents >= floor.minPriceCents) {
      signedCertCents = matchedMapping.signedCertPriceCents;
    }
  }

  const buyerName = [payload.customer?.first_name, payload.customer?.last_name].filter(Boolean).join(" ") || null;
  const billing = snapshotAddress(payload.billing_address);
  const shipping = snapshotAddress(payload.shipping_address);

  const [order] = await db
    .insert(orders)
    .values({
      customerId,
      albumId,
      totalCents,
      currency: (payload.currency ?? "usd").toLowerCase(),
      status: "paid",
      shippingAddress: shipping as any,
      billingAddress: billing as any,
      buyerEmail,
      buyerName,
      buyerPhone: payload.customer?.phone ?? null,
      goodDeedNumber,
      origin: `shopify:${store.id}`,
      shopifyStoreId: store.id,
      shopifyOrderId,
      shopifyOrderToken: payload.token ?? null,
    })
    .onConflictDoNothing({ target: orders.shopifyOrderId })
    .returning();

  // If we lost the race (concurrent webhook replay), look up the order
  // that won and return its code.
  if (!order) {
    const [winner] = await db.select().from(orders).where(eq(orders.shopifyOrderId, shopifyOrderId));
    if (winner) {
      const [code] = await db.select().from(shopifyRedemptionCodes).where(eq(shopifyRedemptionCodes.orderId, winner.id));
      return code ? { orderId: winner.id, code: code.code } : null;
    }
    return null;
  }

  // Snapshot line items. We always write one "format" row for the
  // matched physical line, and one "signed_cert" row if applicable.
  const itemRows: Array<{ orderId: string; kind: string; sku: string; label: string; unitPriceCents: number; quantity: number }> = [
    {
      orderId: order.id,
      kind: "format",
      sku: matchedLine.variant_id ? `shopify:${matchedLine.variant_id}` : `shopify:${matchedLine.product_id}`,
      label: matchedLine.title,
      unitPriceCents: dollarsToCents(matchedLine.price),
      quantity: matchedLine.quantity,
    },
  ];
  if (signedCertCents > 0) {
    itemRows.push({
      orderId: order.id,
      kind: "addon",
      sku: "signed_cert",
      label: "Printed & Signed GoodDeed Certificate",
      unitPriceCents: signedCertCents,
      quantity: 1,
    });
  }
  await db.insert(orderItems).values(itemRows);

  // Unlock the album for the (possibly-stub) customer immediately. The
  // /redeem page just signs them into the account that already owns the
  // unlock; if they were a stub, /redeem promotes them by collecting a
  // password or OAuth.
  await db.insert(userAlbums).values({ userId: customerId, albumId }).onConflictDoNothing();

  // Mint the redemption code last so an incomplete materialize doesn't
  // leak a code that can't be resolved.
  const code = generateRedemptionCode();
  await db.insert(shopifyRedemptionCodes).values({ code, orderId: order.id });

  // Wire the confirmation-email CTA. Shopify's stock order-confirmation
  // template doesn't know about us, but it does render note_attributes
  // via Liquid. We stamp the redeem URL on the order so the merchant's
  // single-line template snippet (see AdminShopify install guide) can
  // surface a "Get your music now" button. Best-effort — a 4xx here
  // (e.g. write_orders scope not granted on an older install) shouldn't
  // unwind the materialized order; the order-status page CTA still
  // works either way.
  try {
    const appUrl = process.env.APP_URL ?? `https://${process.env.GOODTUNES_HOST ?? "my.goodtunes.music"}`;
    const redeemUrl = `${appUrl.replace(/\/$/, "")}/redeem/${code}`;
    const [albumRow] = await db.select({ title: albums.title }).from(albums).where(eq(albums.id, albumId));
    await shopifyFetch(store, `orders/${shopifyOrderId}.json`, {
      method: "PUT",
      body: JSON.stringify({
        order: {
          id: Number(shopifyOrderId),
          note_attributes: [
            { name: "GoodTunes redemption URL", value: redeemUrl },
            { name: "GoodTunes album", value: albumRow?.title ?? "" },
          ],
        },
      }),
    });
  } catch (e: any) {
    console.warn(`[shopify] couldn't stamp note_attributes on order ${shopifyOrderId}: ${e?.message ?? e}`);
  }

  return { orderId: order.id, code };
}

async function handleShopifyRefund(payload: { order_id?: number; id?: number }): Promise<void> {
  // `orders/refunded` carries `order_id` on the refund object; `refunds/create`
  // does too. `orders/refunded` also fires on the order itself with `id =
  // order id`. Accept either shape.
  const shopifyOrderId = payload.order_id ? String(payload.order_id) : payload.id ? String(payload.id) : null;
  if (!shopifyOrderId) return;
  const [order] = await db.select().from(orders).where(eq(orders.shopifyOrderId, shopifyOrderId));
  if (!order) return;
  if (order.status === "refunded") return;
  await db
    .update(orders)
    .set({ status: "refunded", refundedAt: new Date(), goodDeedNumber: null })
    .where(eq(orders.id, order.id));
  // Same lock-return logic as the Stripe refund path: only revoke the
  // album unlock if this is the *only* paid order for the customer +
  // album. Other paid orders (direct or another Shopify cart) still
  // keep the unlock alive.
  const remaining = await db
    .select({ id: orders.id })
    .from(orders)
    .where(and(eq(orders.customerId, order.customerId), eq(orders.albumId, order.albumId), eq(orders.status, "paid")));
  if (remaining.length === 0) {
    await db.delete(userAlbums).where(and(eq(userAlbums.userId, order.customerId), eq(userAlbums.albumId, order.albumId)));
  }
}

// ─── requireAdmin (duplicated from commerce.ts pattern) ───────────────
// Shopify install/admin endpoints need the same gate Task #44 uses for
// its admin-side mutations. We can't import from server/routes.ts (it
// re-imports us), so we re-derive the check inline from `storage`.
async function requireAdmin(req: Request, res: Response, next: Function) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) return res.status(401).json({ message: "Sign in required" });
  const a = await storage.getAuthBy(auth.slice(7));
  if (!a || a.kind !== "admin") return res.status(401).json({ message: "Admin only" });
  const u = await storage.getUser(a.userId);
  if (!u?.isAdmin) return res.status(403).json({ message: "Admin only" });
  (req as any).adminUser = u;
  next();
}

// ─── Routes ───────────────────────────────────────────────────────────
export function registerShopifyRoutes(app: Express) {
  // ─── Operator-facing config probe ─────────────────────────────────
  // The admin install guide reads this to tell the operator whether to
  // paste in SHOPIFY_API_KEY / SHOPIFY_API_SECRET before clicking the
  // "Install on a store" button.
  app.get("/api/admin/shopify/config", requireAdmin, async (_req, res) => {
    res.json({ configured: shopifyConfigured(), apiKey: SHOPIFY_API_KEY || null, scopes: SHOPIFY_SCOPES });
  });

  // ─── OAuth install (Step 1) ───────────────────────────────────────
  // Operator (or label) hits /api/shopify/install?shop=foo.myshopify.com
  // We redirect to Shopify's authorize URL with our scopes + a state
  // nonce; Shopify bounces back to /api/shopify/callback with the
  // authorization grant. We sign the `state` with the app secret so a
  // forged callback can't fool us into trusting an unrelated shop.
  app.get("/api/shopify/install", async (req, res) => {
    if (!shopifyConfigured()) return res.status(500).send("Shopify not configured — set SHOPIFY_API_KEY and SHOPIFY_API_SECRET");
    const shop = String(req.query.shop ?? "").trim().toLowerCase();
    if (!isValidShopDomain(shop)) return res.status(400).send("shop must be a *.myshopify.com domain");
    const nonce = randomBytes(16).toString("hex");
    const stateSig = createHmac("sha256", SHOPIFY_API_SECRET).update(nonce).digest("hex").slice(0, 16);
    const state = `${nonce}.${stateSig}`;
    const redirectUri = `${appOrigin(req)}/api/shopify/callback`;
    const authorize = new URL(`https://${shop}/admin/oauth/authorize`);
    authorize.searchParams.set("client_id", SHOPIFY_API_KEY);
    authorize.searchParams.set("scope", SHOPIFY_SCOPES);
    authorize.searchParams.set("redirect_uri", redirectUri);
    authorize.searchParams.set("state", state);
    // No `grant_options[]=per-user` — we want an offline access token so
    // post-install ScriptTag installs and refund queries work without
    // the operator round-tripping the OAuth flow each time.
    res.redirect(authorize.toString());
  });

  app.get("/api/shopify/callback", async (req, res) => {
    if (!shopifyConfigured()) return res.status(500).send("Shopify not configured");
    const shop = String(req.query.shop ?? "").trim().toLowerCase();
    const code = String(req.query.code ?? "");
    const state = String(req.query.state ?? "");
    if (!isValidShopDomain(shop)) return res.status(400).send("Invalid shop");
    if (!code) return res.status(400).send("Missing code");
    // Validate `state` shape + signature so a forged callback URL can't
    // complete the handshake with an attacker's code/shop combination.
    const [nonce, sig] = state.split(".");
    const expectedSig = createHmac("sha256", SHOPIFY_API_SECRET).update(nonce ?? "").digest("hex").slice(0, 16);
    if (!nonce || !sig || sig !== expectedSig) return res.status(400).send("State mismatch");
    if (!verifyOAuthHmac(req.query as Record<string, any>)) return res.status(400).send("HMAC failed");

    // Exchange the authorization code for an access token.
    const tokenRes = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ client_id: SHOPIFY_API_KEY, client_secret: SHOPIFY_API_SECRET, code }),
    });
    if (!tokenRes.ok) {
      console.error(`[shopify-oauth] token exchange failed for ${shop}: ${tokenRes.status}`);
      return res.status(500).send("Token exchange failed");
    }
    const tokenJson = (await tokenRes.json()) as { access_token: string; scope: string };

    // Fetch the store's display name so admin lists look like the
    // label's brand, not the myshopify subdomain.
    let storeName: string | null = null;
    try {
      const shopRes = await fetch(`https://${shop}/admin/api/${SHOPIFY_API_VERSION}/shop.json`, {
        headers: { "X-Shopify-Access-Token": tokenJson.access_token, Accept: "application/json" },
      });
      if (shopRes.ok) {
        const j: any = await shopRes.json();
        storeName = j?.shop?.name ?? null;
      }
    } catch {
      // Non-fatal — admin can rename the store later.
    }

    const store = await upsertStore({
      shopDomain: shop,
      storeName,
      accessToken: tokenJson.access_token,
      scopes: tokenJson.scope ?? SHOPIFY_SCOPES,
    });

    // Best-effort post-install setup. If either fails, the admin can hit
    // the /api/admin/shopify/stores/:id/reinstall-hooks endpoint to retry.
    const appUrl = appOrigin(req);
    await registerWebhooks(store, appUrl);
    await installScriptTag(store, appUrl);

    // Drop the operator back into the admin install guide with a success
    // toast keyed off ?installed=<storeId>.
    res.redirect(`/admin/shopify?installed=${store.id}`);
  });

  // ─── Webhooks (Step 4 + 7) ────────────────────────────────────────
  // Mounted with express.raw() in server/index.ts so the HMAC reads the
  // bytes Shopify signed.
  app.post("/api/webhooks/shopify/orders", async (req, res) => {
    const headerHmac = req.headers["x-shopify-hmac-sha256"] as string | undefined;
    const topic = (req.headers["x-shopify-topic"] as string | undefined) ?? "";
    const shopDomain = (req.headers["x-shopify-shop-domain"] as string | undefined)?.toLowerCase() ?? "";
    const raw = req.body as Buffer;
    // Belt-and-suspenders: production must verify; dev mode (no secret
    // configured) allows unsigned replays so the operator can curl-test
    // against a development store before wiring real env vars. Same
    // posture as the Stripe webhook handler.
    let verified = false;
    if (SHOPIFY_API_SECRET) {
      verified = verifyWebhookHmac(raw, headerHmac);
      if (!verified) {
        console.error(`[shopify-webhook] HMAC failed for topic=${topic} shop=${shopDomain}`);
        return res.status(401).json({ message: "Invalid signature" });
      }
    } else if (process.env.NODE_ENV !== "production") {
      console.warn(`[shopify-webhook] DEV: accepting unsigned payload (no SHOPIFY_API_SECRET)`);
    } else {
      return res.status(500).json({ message: "Shopify webhook secret not configured" });
    }

    let payload: any;
    try {
      payload = JSON.parse(raw.toString("utf8"));
    } catch {
      return res.status(400).json({ message: "Bad JSON" });
    }

    const store = await getStoreByDomain(shopDomain);
    if (!store) {
      console.warn(`[shopify-webhook] no store record for ${shopDomain} — accepting & dropping`);
      return res.json({ received: true });
    }

    try {
      if (topic === "orders/paid") {
        const r = await materializeOrderFromShopify(store, payload as ShopifyOrder);
        if (r) console.log(`[shopify-webhook] order ${payload.id} → GoodTunes order ${r.orderId} code=${r.code}`);
      } else if (topic === "orders/refunded" || topic === "refunds/create") {
        await handleShopifyRefund(payload);
      } else if (topic === "app/uninstalled") {
        await db
          .update(shopifyStores)
          .set({ uninstalledAt: new Date(), accessToken: "" })
          .where(eq(shopifyStores.id, store.id));
      }
      res.json({ received: true });
    } catch (e: any) {
      console.error(`[shopify-webhook] handler failed topic=${topic}`, e?.message);
      res.status(500).json({ message: "Handler failed" });
    }
  });

  // ─── Order-status-page script (Step 5) ────────────────────────────
  // Shopify ScriptTag loads this URL on the order status page. The
  // script fetches the redemption code for the current order and injects
  // a CTA button. Served unauthenticated; the redemption code itself is
  // the secret. Public read of the code by Shopify order id is fine
  // because the order id is already in the URL of the page calling us.
  app.get("/shopify/redeem-button.js", (_req, res) => {
    res.setHeader("Content-Type", "application/javascript; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=60");
    // Note: ScriptTag pages on Shopify expose `Shopify.checkout.order_id`
    // and `Shopify.shop` to the script. We use them to look up the
    // redemption code, then inject a button into the page.
    res.send(`(function(){
  try {
    var orderId = (window.Shopify && window.Shopify.checkout && window.Shopify.checkout.order_id) || null;
    var shop = (window.Shopify && window.Shopify.shop) || location.hostname;
    if (!orderId) return;
    var origin = ${JSON.stringify(`${(process.env.APP_URL ?? "")}`)} || (location.protocol + "//" + (${JSON.stringify(process.env.GOODTUNES_HOST ?? "")} || "my.goodtunes.music"));
    var token = (window.Shopify && window.Shopify.checkout && window.Shopify.checkout.token) || "";
    if (!token) return;
    fetch(origin + "/api/shopify/redemption-by-order?shop=" + encodeURIComponent(shop) + "&orderId=" + encodeURIComponent(orderId) + "&token=" + encodeURIComponent(token))
      .then(function(r){ return r.ok ? r.json() : null; })
      .then(function(j){
        if (!j || !j.code) return;
        var url = origin + "/redeem/" + j.code;
        var host = document.querySelector(".main__content, .os-content, main, body");
        if (!host) return;
        var box = document.createElement("div");
        box.setAttribute("data-goodtunes-redeem", "1");
        box.style.cssText = "margin:24px 0;padding:20px;border-radius:14px;background:#00062B;color:#fff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;";
        box.innerHTML =
          '<div style="font-size:13px;color:#4AFFCA;text-transform:uppercase;letter-spacing:.06em;font-weight:700;margin-bottom:6px;">GoodTunes</div>' +
          '<div style="font-size:17px;font-weight:600;margin-bottom:10px;">Your digital album is ready</div>' +
          '<a href="' + url + '" target="_blank" rel="noopener" style="display:inline-block;padding:12px 18px;border-radius:12px;background:linear-gradient(135deg,#1D5E8F,#319ED8);color:#fff;font-weight:600;font-size:15px;text-decoration:none;">Get your music now</a>' +
          '<div style="font-size:12px;color:rgba(255,255,255,.55);margin-top:10px;">Or enter this code on goodtunes.music: <code style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;background:rgba(255,255,255,.08);padding:2px 6px;border-radius:6px;">' + j.code + '</code></div>';
        host.insertBefore(box, host.firstChild);
      })
      .catch(function(){});
  } catch(e) { console.warn("goodtunes redeem", e); }
})();`);
  });

  // Public lookup keyed on (shop, shopifyOrderId) — used by the
  // order-status-page script above. We don't expose customer details,
  // just the code (it's already going to be displayed on the fan's own
  // order page so this is not a new leak).
  app.get("/api/shopify/redemption-by-order", async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    const shop = String(req.query.shop ?? "").toLowerCase();
    const shopifyOrderId = String(req.query.orderId ?? "");
    const orderToken = String(req.query.token ?? "");
    if (!shop || !shopifyOrderId || !orderToken) {
      return res.status(400).json({ message: "shop + orderId + token required" });
    }
    const store = await getStoreByDomain(shop);
    if (!store) return res.status(404).json({ message: "Unknown store" });
    const [order] = await db
      .select()
      .from(orders)
      .where(and(eq(orders.shopifyStoreId, store.id), eq(orders.shopifyOrderId, shopifyOrderId)));
    if (!order) return res.status(404).json({ message: "Order not yet ready" });
    // Gate on Shopify's per-order token. Possession of just the
    // numeric order id is not enough — the requester must be on the
    // buyer's own order status page (where Shopify hands them the
    // token). Constant-time compare so a 401 leaks no length info.
    const expected = order.shopifyOrderToken ?? "";
    if (!expected || !safeCompare(expected, orderToken)) {
      return res.status(401).json({ message: "Invalid order token" });
    }
    const [code] = await db.select().from(shopifyRedemptionCodes).where(eq(shopifyRedemptionCodes.orderId, order.id));
    if (!code) return res.status(404).json({ message: "No code minted" });
    res.json({ code: code.code });
  });

  // ─── Redemption resolve (Step 6) ──────────────────────────────────
  // The /redeem/:code page reads this to populate pre-filled fields and
  // know whether the matched customer is a stub (needs password / OAuth
  // to claim) or a real existing account (just needs to sign in).
  app.get("/api/shopify/redemption/:code", async (req, res) => {
    const code = String(req.params.code).toLowerCase();
    const [row] = await db.select().from(shopifyRedemptionCodes).where(eq(shopifyRedemptionCodes.code, code));
    if (!row) return res.status(404).json({ message: "Invalid or expired code" });
    const [order] = await db.select().from(orders).where(eq(orders.id, row.orderId));
    if (!order) return res.status(404).json({ message: "Order not found" });
    if (order.status === "refunded") return res.status(410).json({ message: "This order was refunded" });
    const [album] = await db.select().from(albums).where(eq(albums.id, order.albumId));
    const [customer] = await db.select().from(customerUsers).where(eq(customerUsers.id, order.customerId!));
    const store = order.shopifyStoreId ? await getStoreById(order.shopifyStoreId) : null;
    res.json({
      code: row.code,
      redeemedAt: row.redeemedAt,
      order: {
        id: order.id,
        goodDeedNumber: order.goodDeedNumber,
        buyerName: order.buyerName,
        buyerEmail: order.buyerEmail,
      },
      album: album ? { id: album.id, title: album.title, artist: album.artist, artwork: album.artwork } : null,
      customer: customer
        ? {
            email: customer.email,
            displayName: customer.displayName,
            hasPassword: !!customer.password,
          }
        : null,
      store: store ? { id: store.id, name: store.storeName ?? store.shopDomain } : null,
    });
  });

  // Claim the redemption: marks redeemedAt, returns a bearer auth token
  // for the matched customer so the page can sign them in. The endpoint
  // does NOT take a password — for stub accounts the fan should already
  // have set one via the normal /register flow (or signed in via OAuth);
  // the redemption itself doesn't grant access, the customer_users row
  // does. (The album was already unlocked at webhook time, and the
  // /redeem page hides the claim button if the customer has no password
  // until they pick one or finish OAuth.)
  app.post("/api/shopify/redemption/:code/claim", async (req, res) => {
    const auth = req.headers.authorization;
    if (!auth?.startsWith("Bearer ")) return res.status(401).json({ message: "Sign in first" });
    const a = await storage.getAuthBy(auth.slice(7));
    if (!a || a.kind !== "customer") return res.status(401).json({ message: "Sign in first" });
    const code = String(req.params.code).toLowerCase();
    const [row] = await db.select().from(shopifyRedemptionCodes).where(eq(shopifyRedemptionCodes.code, code));
    if (!row) return res.status(404).json({ message: "Invalid code" });
    const [order] = await db.select().from(orders).where(eq(orders.id, row.orderId));
    if (!order) return res.status(404).json({ message: "Order not found" });
    if (order.status === "refunded") return res.status(410).json({ message: "Refunded" });

    // Identity check before any ownership transfer. A leaked redemption
    // code alone must not let a stranger capture someone else's album:
    // the signed-in account's verified email has to match the email on
    // the Shopify order. The reserved customer (stub created at webhook
    // time) is keyed off that same email, so the legitimate buyer
    // either *is* that stub (and signed in via /set-password below) or
    // owns a separate account under the same address (and signed in
    // through normal /api/login). Anything else is rejected.
    const me = await storage.getCustomer(a.userId);
    const meEmail = (me?.email ?? "").toLowerCase();
    const buyerEmail = (order.buyerEmail ?? "").toLowerCase();
    if (!meEmail || !buyerEmail || meEmail !== buyerEmail) {
      return res.status(403).json({ message: "Signed-in account doesn't match the order's email" });
    }
    if (order.customerId !== a.userId) {
      await db.update(orders).set({ customerId: a.userId }).where(eq(orders.id, order.id));
      await db.insert(userAlbums).values({ userId: a.userId, albumId: order.albumId }).onConflictDoNothing();
    }
    await db
      .update(shopifyRedemptionCodes)
      .set({ redeemedAt: row.redeemedAt ?? new Date(), redeemedByUserId: a.userId })
      .where(eq(shopifyRedemptionCodes.code, row.code));
    res.json({ ok: true, orderId: order.id, albumId: order.albumId, goodDeedNumber: order.goodDeedNumber });
  });

  // Promote a stub customer (password=null, created at webhook time)
  // into a real account by setting a password against a valid
  // redemption code. The redemption code is the proof — only the
  // person who received the Shopify order confirmation has it. This
  // path replaces routing the fan through /api/register, which would
  // fail with "email already taken" since the stub already exists.
  // Only works when the customer is still a stub; an already-claimed
  // account must use /api/login.
  app.post("/api/shopify/redemption/:code/set-password", async (req, res) => {
    const code = String(req.params.code).toLowerCase();
    const password = String(req.body?.password ?? "");
    if (password.length < 6) return res.status(400).json({ message: "Password must be at least 6 characters" });
    const [row] = await db.select().from(shopifyRedemptionCodes).where(eq(shopifyRedemptionCodes.code, code));
    if (!row) return res.status(404).json({ message: "Invalid code" });
    const [order] = await db.select().from(orders).where(eq(orders.id, row.orderId));
    if (!order) return res.status(404).json({ message: "Order not found" });
    if (order.status === "refunded") return res.status(410).json({ message: "Refunded" });
    const customer = order.customerId ? await storage.getCustomer(order.customerId) : null;
    if (!customer) return res.status(404).json({ message: "Customer not found" });
    if (customer.password) {
      return res.status(409).json({ message: "Account already exists — sign in instead" });
    }
    const hashed = await hashPasswordForCustomer(password);
    await storage.updateCustomer(customer.id, { password: hashed });
    // Issue a customer auth token so the client can call /claim
    // immediately without a separate /api/login round trip.
    const token = randomBytes(32).toString("hex");
    await storage.createAuthToken(token, customer.id, "customer");
    res.json({
      token,
      user: {
        id: customer.id,
        email: customer.email,
        username: customer.username,
        displayName: customer.displayName,
      },
    });
  });

  // ─── Dev-only: mint a fake redemption ─────────────────────────────
  // Lets the operator (or me, demoing) walk the redemption UX without
  // standing up a Shopify dev store. Production-gated — refuses outside
  // of NODE_ENV !== "production" so it can't be hit live.
  app.post("/api/admin/shopify/dev-mint", requireAdmin, async (req, res) => {
    if (process.env.NODE_ENV === "production") return res.status(403).json({ message: "Dev-only endpoint" });
    const albumId = String(req.body?.albumId ?? "").trim();
    const buyerEmail = String(req.body?.buyerEmail ?? "").trim().toLowerCase();
    const buyerName = String(req.body?.buyerName ?? "").trim() || null;
    if (!albumId || !buyerEmail || !buyerEmail.includes("@")) {
      return res.status(400).json({ message: "albumId + buyerEmail required" });
    }
    const [album] = await db.select().from(albums).where(eq(albums.id, albumId));
    if (!album) return res.status(404).json({ message: "Album not found" });

    const customerId = await findOrCreateStubCustomer(buyerEmail, buyerName);
    const goodDeedNumber = await assignNextGoodDeedNumberForAlbum(albumId);
    // Synthesize a stable fake Shopify order id so a repeat mint with
    // the same email + album collapses idempotently.
    const fakeShopifyOrderId = `dev-${albumId.slice(0, 8)}-${buyerEmail}`;
    const [existing] = await db.select().from(orders).where(eq(orders.shopifyOrderId, fakeShopifyOrderId));
    if (existing) {
      const [existingCode] = await db.select().from(shopifyRedemptionCodes).where(eq(shopifyRedemptionCodes.orderId, existing.id));
      if (existingCode) return res.json({ code: existingCode.code, orderId: existing.id, reused: true });
    }

    const [order] = await db
      .insert(orders)
      .values({
        customerId,
        albumId,
        totalCents: 1999,
        currency: "usd",
        status: "paid",
        buyerEmail,
        buyerName,
        goodDeedNumber,
        // origin uses the literal "shopify:dev" so OriginBadge still
        // renders the Shopify pill — the order surfaces look the same
        // as a real Shopify-sourced order.
        origin: "shopify:dev",
        shopifyStoreId: null,
        shopifyOrderId: fakeShopifyOrderId,
      })
      .onConflictDoNothing({ target: orders.shopifyOrderId })
      .returning();
    if (!order) {
      const [winner] = await db.select().from(orders).where(eq(orders.shopifyOrderId, fakeShopifyOrderId));
      const [code] = winner ? await db.select().from(shopifyRedemptionCodes).where(eq(shopifyRedemptionCodes.orderId, winner.id)) : [];
      return res.json({ code: code?.code, orderId: winner?.id, reused: true });
    }
    await db.insert(orderItems).values({
      orderId: order.id,
      kind: "format",
      sku: "shopify:dev",
      label: `${album.title} (dev test)`,
      unitPriceCents: 1999,
      quantity: 1,
    });
    await db.insert(userAlbums).values({ userId: customerId, albumId }).onConflictDoNothing();
    const code = generateRedemptionCode();
    await db.insert(shopifyRedemptionCodes).values({ code, orderId: order.id });
    res.json({ code, orderId: order.id, reused: false });
  });

  // ─── Admin: list connected stores ─────────────────────────────────
  app.get("/api/admin/shopify/stores", requireAdmin, async (_req, res) => {
    const rows = await db.select().from(shopifyStores).orderBy(desc(shopifyStores.installedAt));
    res.json(rows.map((s) => ({ ...s, accessToken: undefined })));
  });

  app.delete("/api/admin/shopify/stores/:id", requireAdmin, async (req, res) => {
    await db.delete(shopifyStores).where(eq(shopifyStores.id, String(req.params.id)));
    res.json({ ok: true });
  });

  // ─── Admin: per-album mappings (Step 3) ───────────────────────────
  // Returns every mapping for `albumId` across all stores so the
  // AdminAlbum Shopify panel can render them in one query.
  app.get("/api/admin/albums/:id/shopify-mappings", requireAdmin, async (req, res) => {
    const albumId = String(req.params.id);
    const rows = await db
      .select({ m: shopifyProductMappings, s: shopifyStores })
      .from(shopifyProductMappings)
      .leftJoin(shopifyStores, eq(shopifyProductMappings.storeId, shopifyStores.id))
      .where(eq(shopifyProductMappings.albumId, albumId))
      .orderBy(desc(shopifyProductMappings.createdAt));
    res.json(
      rows.map((r) => ({
        ...r.m,
        storeName: r.s?.storeName ?? r.s?.shopDomain ?? null,
        shopDomain: r.s?.shopDomain ?? null,
      })),
    );
  });

  // Paste-a-Shopify-product-URL flow. The operator pastes either:
  //   https://foo.myshopify.com/admin/products/1234567890
  //   https://foo.myshopify.com/products/some-handle
  // We resolve the first form by id directly; the second form by GETting
  // the product page and pulling the JSON-LD `productID`, then fetching
  // the admin product to resolve variants. The endpoint returns a
  // candidate {productId, variantOptions[]} for the next step.
  app.post("/api/admin/albums/:id/shopify-mappings/resolve", requireAdmin, async (req, res) => {
    const albumId = String(req.params.id);
    const url = z.string().url().parse(req.body?.url);
    const u = new URL(url);
    const shopDomain = u.hostname.toLowerCase();
    const store = await getStoreByDomain(shopDomain);
    if (!store) return res.status(404).json({ message: "That store hasn't installed GoodTunes yet" });

    let productId: string | null = null;
    const adminMatch = u.pathname.match(/\/admin\/products\/(\d+)/);
    if (adminMatch) productId = adminMatch[1];
    if (!productId) {
      // Public product page. Fetch the .json companion endpoint Shopify
      // provides for every product page (no auth needed for public
      // products). e.g. /products/foo.json
      const handleMatch = u.pathname.match(/\/products\/([^/]+)/);
      if (!handleMatch) return res.status(400).json({ message: "Couldn't find a product in that URL" });
      const productRes = await fetch(`https://${shopDomain}/products/${handleMatch[1]}.json`);
      if (!productRes.ok) return res.status(404).json({ message: "Couldn't fetch that product" });
      const j: any = await productRes.json();
      productId = j?.product?.id ? String(j.product.id) : null;
    }
    if (!productId) return res.status(404).json({ message: "Couldn't resolve product id" });

    const r = await shopifyFetch(store, `products/${productId}.json`);
    if (!r.ok) return res.status(404).json({ message: "Product not found on connected store" });
    const j: any = await r.json();
    const product = j?.product;
    if (!product) return res.status(404).json({ message: "Empty product payload" });
    res.json({
      storeId: store.id,
      shopifyProductId: String(product.id),
      shopifyProductTitle: product.title as string,
      variants: (product.variants ?? []).map((v: any) => ({
        id: String(v.id),
        title: v.title as string,
        price: v.price as string,
      })),
      albumId,
    });
  });

  app.post("/api/admin/albums/:id/shopify-mappings", requireAdmin, async (req, res) => {
    const albumId = String(req.params.id);
    const parsed = insertShopifyProductMappingSchema.safeParse({ ...req.body, albumId });
    if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0]?.message ?? "Invalid body" });

    // Floor enforcement against the album's signed_cert add-on minimum.
    if (parsed.data.offerSignedCert && parsed.data.signedCertPriceCents != null) {
      const [floor] = await db
        .select()
        .from(albumAddons)
        .where(and(eq(albumAddons.albumId, albumId), eq(albumAddons.kind, "signed_cert")));
      if (floor && parsed.data.signedCertPriceCents < floor.minPriceCents) {
        return res.status(400).json({
          message: `Signed certificate must be at least $${(floor.minPriceCents / 100).toFixed(2)} on this album`,
        });
      }
    }

    // Manual upsert. We can't use onConflictDoUpdate on a 3-col target
    // because the underlying uniqueness lives in two PARTIAL indexes
    // (one for variantId IS NULL, one for IS NOT NULL) — Postgres needs
    // the inference target to match exactly one of them. A select-
    // then-update-or-insert is simple, race-safe enough for an
    // admin-only endpoint, and avoids materializing two upsert paths.
    const d = parsed.data;
    const variantId = d.shopifyVariantId ?? null;
    const [existing] = await db
      .select()
      .from(shopifyProductMappings)
      .where(
        and(
          eq(shopifyProductMappings.storeId, d.storeId),
          eq(shopifyProductMappings.shopifyProductId, d.shopifyProductId),
          variantId === null
            ? sql`${shopifyProductMappings.shopifyVariantId} IS NULL`
            : eq(shopifyProductMappings.shopifyVariantId, variantId),
        ),
      );
    let row;
    if (existing) {
      [row] = await db
        .update(shopifyProductMappings)
        .set({
          albumId: d.albumId,
          offerSignedCert: d.offerSignedCert ?? false,
          signedCertPriceCents: d.signedCertPriceCents ?? null,
          shopifyProductTitle: d.shopifyProductTitle ?? null,
        })
        .where(eq(shopifyProductMappings.id, existing.id))
        .returning();
    } else {
      [row] = await db.insert(shopifyProductMappings).values(d as any).returning();
    }
    res.json(row);
  });

  app.delete("/api/admin/albums/:albumId/shopify-mappings/:id", requireAdmin, async (req, res) => {
    await db
      .delete(shopifyProductMappings)
      .where(
        and(
          eq(shopifyProductMappings.id, String(req.params.id)),
          eq(shopifyProductMappings.albumId, String(req.params.albumId)),
        ),
      );
    res.json({ ok: true });
  });

  // ─── Per-release engagement (Step 8) ──────────────────────────────
  // Reuses the existing analytics_events table. We summarize:
  //   - redemptions (count of paid orders on this album, with origin
  //     breakdown)
  //   - fans reached (distinct customerId on user_albums for this album)
  //   - top played songs (count of "play" events whose song belongs to
  //     this album)
  //   - plays per fan (total plays / fans)
  app.get("/api/admin/albums/:id/engagement", requireAdmin, async (req, res) => {
    const albumId = String(req.params.id);

    const orderRows = await db
      .select({ origin: orders.origin, status: orders.status, createdAt: orders.createdAt, customerId: orders.customerId, email: orders.buyerEmail })
      .from(orders)
      .where(eq(orders.albumId, albumId))
      .orderBy(desc(orders.createdAt));

    const paid = orderRows.filter((o) => o.status === "paid");
    const refunded = orderRows.filter((o) => o.status === "refunded");
    const directCount = paid.filter((o) => o.origin === "direct").length;
    const shopifyCount = paid.filter((o) => o.origin.startsWith("shopify:")).length;

    // Distinct fans = distinct user_albums.userId on this album. Cheaper
    // than dedup-ing the orders list because someone with 3 orders is
    // still one fan.
    const fanRows = await db.select({ userId: userAlbums.userId }).from(userAlbums).where(eq(userAlbums.albumId, albumId));
    const fansReached = fanRows.length;

    // Plays per song. analytics_events has a JSON `meta` blob with
    // songId on play events. We do this in a raw SQL fragment for
    // efficiency rather than scanning every row in JS.
    const songPlays = await db.execute<{ song_id: string; plays: number }>(sql`
      SELECT meta->>'songId' AS song_id, COUNT(*)::int AS plays
      FROM analytics_events
      WHERE event = 'song_play_start'
        AND meta->>'albumId' = ${albumId}
      GROUP BY meta->>'songId'
      ORDER BY plays DESC
      LIMIT 12
    `);

    const totalPlays = songPlays.rows.reduce((a, b) => a + Number(b.plays ?? 0), 0);
    res.json({
      redemptions: {
        paid: paid.length,
        refunded: refunded.length,
        direct: directCount,
        shopify: shopifyCount,
      },
      fansReached,
      playsPerFan: fansReached > 0 ? Number((totalPlays / fansReached).toFixed(1)) : 0,
      topSongs: songPlays.rows.map((r) => ({ songId: r.song_id, plays: Number(r.plays ?? 0) })),
      recentBuyers: paid.slice(0, 8).map((o) => ({ email: o.email, createdAt: o.createdAt })),
    });
  });
}

// Internal helpers we expose for tests / future wiring. None used by
// callers outside this file today.
export const __internal = { generateRedemptionCode, materializeOrderFromShopify, handleShopifyRefund };
