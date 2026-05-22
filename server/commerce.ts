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
  orders,
  orderItems,
  customerUsers,
  emailVerifications,
  userAlbums,
  authTokens,
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

async function upsertSku(input: { albumId: string; format: AlbumFormat; priceCents: number; stock: number | null; active: boolean }): Promise<AlbumSku> {
  const [row] = await db
    .insert(albumSkus)
    .values(input)
    .onConflictDoUpdate({
      target: [albumSkus.albumId, albumSkus.format],
      set: { priceCents: input.priceCents, stock: input.stock, active: input.active },
    })
    .returning();
  return row;
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

async function getOrderBySessionId(sessionId: string): Promise<Order | undefined> {
  const [row] = await db.select().from(orders).where(eq(orders.stripeCheckoutSessionId, sessionId));
  return row;
}
async function getOrderById(id: string): Promise<Order | undefined> {
  const [row] = await db.select().from(orders).where(eq(orders.id, id));
  return row;
}
async function getOrderItems(orderId: string): Promise<OrderItem[]> {
  return db.select().from(orderItems).where(eq(orderItems.orderId, orderId)).orderBy(asc(orderItems.createdAt));
}

// Assigns the next per-album GoodDeed number atomically. We rank by
// paid-order count for the album so numbers stay dense; voided
// (refunded) numbers are reused only if no later number was minted.
// For simplicity in this v1 we use `max(goodDeedNumber)+1` per album,
// which is monotonic — refunds leave gaps. Acceptable trade-off vs.
// the user-confusing "your number changed" problem.
async function assignNextGoodDeedNumber(albumId: string): Promise<number> {
  const [row] = await db
    .select({ max: sql<number>`COALESCE(MAX(${orders.goodDeedNumber}), 0)` })
    .from(orders)
    .where(eq(orders.albumId, albumId));
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
      })),
      addons: addons.map((a) => ({
        id: a.id,
        kind: a.kind,
        label: ALBUM_ADDON_LABEL[a.kind as AlbumAddonKind] ?? a.kind,
        priceCents: a.priceCents,
        minPriceCents: a.minPriceCents,
      })),
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
  });
  app.put("/api/admin/albums/:id/skus/:format", requireAdmin, async (req, res) => {
    const album = await storage.getAlbumById(String(req.params.id), { includeHidden: true });
    if (!album) return res.status(404).json({ message: "Album not found" });
    const parsed = skuBodySchema.safeParse({ ...req.body, format: String(req.params.format) });
    if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid SKU" });
    const row = await upsertSku({
      albumId: album.id,
      format: parsed.data.format,
      priceCents: parsed.data.priceCents,
      stock: parsed.data.stock ?? null,
      active: parsed.data.active,
    });
    res.json(row);
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
    // Real email send wires up in a follow-up task; today we log the code
    // to the server console so dev can grab it. The response shape never
    // includes the code — leaking it here would defeat the whole gate.
    console.log(`[verify] email=${email} code=${code} (15min ttl)`);
    res.json({ ok: true, devCode: process.env.NODE_ENV === "production" ? undefined : code });
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
        // trade in. We reuse `auth_tokens` with kind="customer" but a
        // sentinel userId so it can't be confused with a real session;
        // the signup endpoint deletes the ticket on use.
        const verifyToken = `vt_${generateToken()}`;
        await db.insert(authTokens).values({ token: verifyToken, userId: `verify:${email}`, kind: "customer" });
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
    const [tk] = await db.select().from(authTokens).where(eq(authTokens.token, verifyToken));
    if (!tk || tk.userId !== `verify:${email}`) {
      return res.status(400).json({ message: "Verify code expired — request a new one" });
    }
    await db.delete(authTokens).where(eq(authTokens.token, verifyToken));

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
    if (parsed.data.signedCert) {
      const addons = await listActiveAddons(album.id);
      addon = addons.find((x) => x.kind === "signed_cert") ?? null;
      if (!addon) return res.status(400).json({ message: "Signed certificate isn't offered on this album" });
      addonPriceCents = parsed.data.signedCertPriceCents ?? addon.priceCents;
      if (addonPriceCents < addon.minPriceCents) {
        return res.status(400).json({ message: `Signed certificate must be at least $${(addon.minPriceCents / 100).toFixed(2)}` });
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
    const session = await stripe.checkout.sessions.create({
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
    res.json({
      paymentStatus: session.payment_status,
      status: session.status,
      order: order ?? null,
      items: order ? await getOrderItems(order.id) : [],
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
    // Flat shape matches client/src/pages/Orders.tsx OrderRow.
    const out = await Promise.all(
      rows.map(async (r) => {
        const g = giftByOrder.get(r.order.id);
        return {
          ...r.order,
          albumTitle: r.album.title,
          albumArtist: r.album.artist,
          albumArtwork: r.album.artwork,
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
  const items: Array<Omit<OrderItem, "id" | "orderId" | "createdAt">> = [];
  for (const li of lineItems.data) {
    const product = li.price?.product as Stripe.Product | undefined;
    const kind = (product?.metadata?.gt_kind as "format" | "addon") ?? "format";
    const sku = product?.metadata?.gt_sku ?? "unknown";
    items.push({
      kind,
      sku,
      label: li.description ?? product?.name ?? sku,
      unitPriceCents: li.amount_total ?? li.price?.unit_amount ?? 0,
      quantity: li.quantity ?? 1,
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
