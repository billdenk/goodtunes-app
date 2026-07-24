// Task #49 — Shopify redemption flow.
//
// Owns: OAuth install/callback against a label's Shopify store, paid +
// refunded webhook handlers, redemption-code minting + resolve, admin
// CRUD for product↔album mappings, checkout-extension redemption endpoint.
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
import { and, desc, eq, inArray, isNotNull, isNull, not, sql } from "drizzle-orm";
import { jwtVerify } from "jose";
import { db } from "./db";
import {
  albums,
  albumAddons,
  labels,
  people,
  orders,
  orderItems,
  customerUsers,
  userAlbums,
  shopifyStores,
  shopifyProductMappings,
  platformWholesaleLedger,
  shopifyRedemptionCodes,
  shopifyPushLog,
  shopifyGdprRequests,
  insertShopifyProductMappingSchema,
  type ShopifyStore,
  type ShopifyProductMapping,
  type ShopifyPushSnapshot,
} from "@shared/schema";
import { lookupSignedCertRung } from "@shared/signedCertLadder";
import { grantLltBonusIfEligible } from "./lltBonus";
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
const SHOPIFY_SCOPES = process.env.SHOPIFY_SCOPES ?? "read_orders,write_orders,read_products";
const SHOPIFY_TOKEN_KEY = createHash("sha256")
  .update(process.env.SHOPIFY_TOKEN_KEY ?? process.env.SESSION_SECRET ?? "goodtunes-shopify-fallback-dev-key")
  .digest();
// The Shopify Admin API version pinned here is bumped quarterly. Pinned
// rather than "unstable" so a Shopify rev doesn't silently break us.
// REST stays on 2024-10 for the endpoints not yet migrated (orders,
// refunds, webhooks, inventory — Phases 4-6); GraphQL calls pin to a
// current stable version since that's where new work lands (Phase 3+).
const SHOPIFY_API_VERSION = "2024-10";
const SHOPIFY_GRAPHQL_API_VERSION = "2026-01";

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
  // Expiring offline token trio (Shopify Dec 2025 cutover). Undefined on a
  // legacy path (kept for back-compat); populated by the OAuth callback now
  // that we request `expiring=1`. refreshToken arrives as plaintext and is
  // encrypted at rest alongside accessToken.
  refreshToken?: string | null;
  accessTokenExpiresAt?: Date | null;
  refreshTokenExpiresAt?: Date | null;
  // Task #2030 — when the install was kicked off from a label's Shopify
  // tab, the validated labelId rides through here so the store is stamped
  // with its owning label. Undefined = installed without label context
  // (global Shopify page / legacy) — we leave any existing association
  // untouched rather than clobbering it to null on a re-install.
  labelId?: string;
  // Task #2435 — same contract for the artist (Person) association when the
  // install is kicked off from the artist's Overview Shopify section.
  personId?: string;
}): Promise<ShopifyStore> {
  const existing = await getStoreByDomain(input.shopDomain);
  const encrypted = encryptToken(input.accessToken);
  if (existing) {
    const [updated] = await db
      .update(shopifyStores)
      .set({
        accessToken: encrypted,
        scopes: input.scopes,
        refreshToken:
          input.refreshToken !== undefined
            ? input.refreshToken
              ? encryptToken(input.refreshToken)
              : null
            : existing.refreshToken,
        accessTokenExpiresAt:
          input.accessTokenExpiresAt !== undefined ? input.accessTokenExpiresAt : existing.accessTokenExpiresAt,
        refreshTokenExpiresAt:
          input.refreshTokenExpiresAt !== undefined ? input.refreshTokenExpiresAt : existing.refreshTokenExpiresAt,
        storeName: input.storeName ?? existing.storeName,
        labelId: input.labelId ?? existing.labelId,
        personId: input.personId ?? existing.personId,
        installedAt: new Date(),
        uninstalledAt: null,
      })
      .where(eq(shopifyStores.id, existing.id))
      .returning();
    return updated;
  }
  const [created] = await db
    .insert(shopifyStores)
    .values({
      shopDomain: input.shopDomain,
      storeName: input.storeName,
      accessToken: encrypted,
      scopes: input.scopes,
      refreshToken: input.refreshToken ? encryptToken(input.refreshToken) : null,
      accessTokenExpiresAt: input.accessTokenExpiresAt ?? null,
      refreshTokenExpiresAt: input.refreshTokenExpiresAt ?? null,
      labelId: input.labelId ?? null,
      personId: input.personId ?? null,
    })
    .returning();
  return created;
}

// ─── Shopify Admin REST helper ─────────────────────────────────────────
// Note: don't annotate the return as `Promise<Response>` — `Response` in
// this file resolves to express's response type because of the imports
// above, which would mask `.ok` / `.json()`. Let TS infer the global
// fetch `Response` from the body.
// ─── Expiring offline access tokens (Shopify Dec 2025 cutover) ──────────
// Shopify stopped accepting the classic non-expiring offline tokens our
// install used to mint. We now request `expiring=1` on the OAuth code
// exchange, which returns a 1-hour access token plus a ~90-day refresh
// token. getFreshAccessToken rotates the access token before it lapses;
// refreshStoreToken persists the rotated pair IMMEDIATELY (Shopify retires
// the OLD refresh token the instant it issues a new one — a crash between
// refresh and persist would brick the store). Legacy non-expiring installs
// (accessTokenExpiresAt == null) return their stored token as-is; once it
// 403s the operator reconnects (re-runs OAuth).
const REFRESH_SKEW_MS = 120_000;
// Single-flight per store so concurrent callers share ONE refresh and can't
// each rotate the refresh token and invalidate one another. Per-instance
// only; the DB re-read on failure is the cross-instance net.
const refreshInFlight = new Map<string, Promise<string>>();

async function refreshStoreToken(store: ShopifyStore): Promise<string> {
  const inflight = refreshInFlight.get(store.id);
  if (inflight) return inflight;

  const p = (async (): Promise<string> => {
    if (!store.refreshToken) return decryptToken(store.accessToken);
    let refreshTokenPlain: string;
    try {
      refreshTokenPlain = decryptToken(store.refreshToken);
    } catch {
      return decryptToken(store.accessToken);
    }
    const r = await fetch(`https://${store.shopDomain}/admin/oauth/access_token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams({
        client_id: SHOPIFY_API_KEY,
        client_secret: SHOPIFY_API_SECRET,
        grant_type: "refresh_token",
        refresh_token: refreshTokenPlain,
      }).toString(),
    });
    if (!r.ok) {
      // Our refresh token may already have been spent by another instance —
      // re-read the row and use its (newer) access token if one landed fresh.
      const latest = await getStoreById(store.id);
      if (
        latest?.accessTokenExpiresAt &&
        latest.accessTokenExpiresAt.getTime() > Date.now() + REFRESH_SKEW_MS &&
        latest.accessToken !== store.accessToken
      ) {
        // A concurrent refresh (another instance) already landed a fresh access
        // token — adopt it. Compare the access-token ciphertext, not the refresh
        // token, so this still holds on the rare grant that returns no new
        // refresh_token.
        return decryptToken(latest.accessToken);
      }
      console.error(`[shopify-oauth] token refresh failed for ${store.shopDomain}: ${r.status}`);
      // Best-effort: hand back the current (likely-dead) token so the caller's
      // response surfaces the reconnect state instead of throwing.
      return decryptToken(store.accessToken);
    }
    const j = (await r.json()) as {
      access_token: string;
      expires_in?: number;
      refresh_token?: string;
      refresh_token_expires_in?: number;
      scope?: string;
    };
    const now = Date.now();
    // Persist the rotated pair BEFORE returning — this ordering is critical.
    await db
      .update(shopifyStores)
      .set({
        accessToken: encryptToken(j.access_token),
        refreshToken: j.refresh_token ? encryptToken(j.refresh_token) : store.refreshToken,
        accessTokenExpiresAt: j.expires_in ? new Date(now + j.expires_in * 1000) : null,
        refreshTokenExpiresAt: j.refresh_token_expires_in
          ? new Date(now + j.refresh_token_expires_in * 1000)
          : store.refreshTokenExpiresAt,
        scopes: j.scope ?? store.scopes,
      })
      .where(eq(shopifyStores.id, store.id));
    return j.access_token;
  })().finally(() => refreshInFlight.delete(store.id));

  refreshInFlight.set(store.id, p);
  return p;
}

// Return a currently-valid Admin API access token for the store id, refreshing
// the expiring offline token when it's within the skew window of lapsing.
// Always re-reads the row so a stale in-memory `store` never serves a token
// another request already rotated. Returns "" for a missing/emptied token so
// callers get a clean 401 → "reconnect required" rather than a throw.
async function getFreshAccessToken(storeId: string): Promise<string> {
  const store = await getStoreById(storeId);
  if (!store || !store.accessToken) return "";
  if (!store.accessTokenExpiresAt) return decryptToken(store.accessToken); // legacy non-expiring
  if (store.accessTokenExpiresAt.getTime() > Date.now() + REFRESH_SKEW_MS) {
    return decryptToken(store.accessToken);
  }
  return refreshStoreToken(store);
}

// ─── Shopify Admin REST helper ─────────────────────────────────────────
async function shopifyFetch(store: ShopifyStore, path: string, init: RequestInit = {}) {
  const url = `https://${store.shopDomain}/admin/api/${SHOPIFY_API_VERSION}/${path.replace(/^\//, "")}`;
  const doFetch = (token: string) =>
    fetch(url, {
      ...init,
      headers: {
        "X-Shopify-Access-Token": token,
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(init.headers ?? {}),
      },
    });

  let r = await doFetch(await getFreshAccessToken(store.id));
  // Reactive rotation: a 401/403 (token expired out from under us, rotated by
  // another instance, or Shopify's non-expiring cutover) → force one refresh
  // and retry. Never throws for token reasons, so best-effort callers keep
  // their existing `r.ok` contract; a store with no refresh token just gets
  // the 401/403 back and the route turns it into "reconnect required".
  if (r.status === 401 || r.status === 403) {
    const latest = await getStoreById(store.id);
    if (latest?.refreshToken) {
      const token = await refreshStoreToken(latest);
      if (token) r = await doFetch(token);
    }
  }
  return r;
}

// ─── Shopify Admin GraphQL helper ─────────────────────────────────────
// Mirrors shopifyFetch but posts to the GraphQL endpoint. Uses the same
// token-refresh + reactive-rotation logic so it's safe to call from any
// webhook handler. Returns the parsed `data` field; throws on HTTP errors
// or GraphQL-level `errors` arrays.
async function shopifyGraphql<T = Record<string, unknown>>(
  store: ShopifyStore,
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const url = `https://${store.shopDomain}/admin/api/${SHOPIFY_GRAPHQL_API_VERSION}/graphql.json`;
  const body = JSON.stringify({ query, variables });
  const doFetch = (token: string) =>
    fetch(url, {
      method: "POST",
      headers: {
        "X-Shopify-Access-Token": token,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body,
    });

  let r = await doFetch(await getFreshAccessToken(store.id));
  if (r.status === 401 || r.status === 403) {
    const latest = await getStoreById(store.id);
    if (latest?.refreshToken) {
      const refreshed = await refreshStoreToken(latest);
      if (refreshed) r = await doFetch(refreshed);
    }
  }
  if (!r.ok) {
    const text = await r.text();
    const err = new Error(`Shopify GraphQL HTTP ${r.status}: ${text.slice(0, 200)}`) as Error & { status?: number };
    // Callers that need to distinguish "reconnect required" (401/403 that
    // survived the refresh retry) from transient Shopify errors read this.
    err.status = r.status;
    throw err;
  }
  const parsed = (await r.json()) as { data: T; errors?: Array<{ message: string }> };
  if (parsed.errors?.length) {
    throw new Error(`Shopify GraphQL errors: ${parsed.errors.map((e) => e.message).join("; ")}`);
  }
  return parsed.data;
}

// ─── Product/variant GraphQL plumbing (Phase 3 REST→GraphQL migration) ─
// Shopify deprecated the REST product/variant endpoints. Everything
// product-shaped now goes through Admin GraphQL, but the callers in this
// file were written against the REST payload shape (numeric string ids,
// body_html, comma-joined tags, option1, inventory_item_id). Rather than
// rewrite every caller, gqlProductToRest() maps the GraphQL node back to
// that legacy shape so diffPushSnapshot(), the resolve endpoint, and the
// catalog browser stay byte-compatible. Numeric ids ride legacyResourceId
// — Shopify keeps these stable and the DB columns / order webhook
// payloads all speak numeric ids.
const productGid = (id: string | number) => `gid://shopify/Product/${id}`;
const variantGid = (id: string | number) => `gid://shopify/ProductVariant/${id}`;

// Shared selection set for anything that reads a product. 100 variants is
// far above anything we push (2) or the picker needs to display.
const PRODUCT_FIELDS = /* GraphQL */ `
  legacyResourceId
  title
  descriptionHtml
  vendor
  tags
  productType
  featuredMedia { preview { image { url } } }
  variants(first: 100) {
    nodes {
      legacyResourceId
      title
      price
      sku
      inventoryQuantity
      selectedOptions { name value }
      inventoryItem { legacyResourceId }
    }
  }
`;

type GqlProductNode = {
  legacyResourceId: string;
  title: string;
  descriptionHtml: string | null;
  vendor: string | null;
  tags: string[];
  productType: string | null;
  featuredMedia: { preview: { image: { url: string } | null } | null } | null;
  variants: {
    nodes: Array<{
      legacyResourceId: string;
      title: string;
      price: string;
      sku: string | null;
      inventoryQuantity: number | null;
      selectedOptions: Array<{ name: string; value: string }>;
      inventoryItem: { legacyResourceId: string } | null;
    }>;
  };
};

// REST-shaped product (subset the callers in this file actually read).
function gqlProductToRest(p: GqlProductNode) {
  const imageUrl = p.featuredMedia?.preview?.image?.url ?? null;
  return {
    id: p.legacyResourceId,
    title: p.title,
    body_html: p.descriptionHtml ?? "",
    vendor: p.vendor ?? "",
    // REST serialized tags as a comma-space-joined string; GraphQL returns
    // an array. diffPushSnapshot compares against the string form.
    tags: (p.tags ?? []).join(", "),
    product_type: p.productType ?? "",
    image: imageUrl ? { src: imageUrl } : null,
    images: imageUrl ? [{ src: imageUrl }] : [],
    variants: p.variants.nodes.map((v) => ({
      id: v.legacyResourceId,
      title: v.title,
      price: v.price,
      sku: v.sku ?? "",
      inventory_quantity: v.inventoryQuantity ?? 0,
      option1: v.selectedOptions[0]?.value ?? v.title,
      inventory_item_id: v.inventoryItem ? Number(v.inventoryItem.legacyResourceId) : null,
    })),
  };
}

const PRODUCT_BY_ID_QUERY = /* GraphQL */ `
  query product($id: ID!) {
    product(id: $id) { ${PRODUCT_FIELDS} }
  }
`;

// Single product read by numeric (legacy REST) id. Returns null when the
// product doesn't exist — GraphQL returns `product: null` rather than a
// 404 like REST did. Throws on transport/auth errors (err.status set).
async function fetchProductByLegacyId(store: ShopifyStore, legacyId: string) {
  const data = await shopifyGraphql<{ product: GqlProductNode | null }>(store, PRODUCT_BY_ID_QUERY, {
    id: productGid(legacyId),
  });
  return data.product ? gqlProductToRest(data.product) : null;
}

// ─── Webhook/order/transaction GraphQL plumbing (Phase 4 migration) ────
// Shopify deprecated the REST webhook + order endpoints alongside
// products. Same bridging approach as Phase 3: callers keep speaking the
// REST vocabulary (topic strings like "orders/paid", numeric transaction
// ids, snake_case fields) and these helpers translate at the boundary.
const orderGid = (id: string | number) => `gid://shopify/Order/${id}`;
const gidTail = (gid: string) => gid.split("/").pop() ?? gid;

// REST topic strings ↔ GraphQL WebhookSubscriptionTopic enums. The DB,
// the webhook handler's X-Shopify-Topic header, and every caller in this
// file all speak the REST form, so the enum never leaks past here.
const WEBHOOK_TOPIC_TO_ENUM: Record<string, string> = {
  "orders/paid": "ORDERS_PAID",
  "orders/refunded": "ORDERS_REFUNDED",
  "refunds/create": "REFUNDS_CREATE",
  "app/uninstalled": "APP_UNINSTALLED",
};
const WEBHOOK_ENUM_TO_TOPIC: Record<string, string> = Object.fromEntries(
  Object.entries(WEBHOOK_TOPIC_TO_ENUM).map(([topic, enumName]) => [enumName, topic]),
);
// Generic fallback for topics outside our map: ORDERS_FULFILLED →
// orders/fulfilled, CUSTOMERS_DATA_REQUEST → customers/data_request
// (only the FIRST underscore becomes a slash).
const webhookEnumToTopic = (enumName: string) =>
  WEBHOOK_ENUM_TO_TOPIC[enumName] ?? enumName.toLowerCase().replace("_", "/");

const WEBHOOK_CREATE_MUTATION = /* GraphQL */ `
  mutation webhookSubscriptionCreate($topic: WebhookSubscriptionTopic!, $webhookSubscription: WebhookSubscriptionInput!) {
    webhookSubscriptionCreate(topic: $topic, webhookSubscription: $webhookSubscription) {
      webhookSubscription { id }
      userErrors { field message }
    }
  }
`;

// Registers one webhook subscription. Returns "registered" or
// "already_registered" (Shopify reports a duplicate callback address for
// a topic as an "address … has already been taken" userError — the
// GraphQL equivalent of REST's 422, and success for our idempotent
// install flow). Throws on transport/auth errors (err.status set by
// shopifyGraphql) and on any other userError.
async function createWebhookSubscription(
  store: ShopifyStore,
  topic: string,
  address: string,
): Promise<"registered" | "already_registered"> {
  const enumTopic = WEBHOOK_TOPIC_TO_ENUM[topic];
  if (!enumTopic) throw new Error(`Unknown webhook topic: ${topic}`);
  const data = await shopifyGraphql<{
    webhookSubscriptionCreate: {
      webhookSubscription: { id: string } | null;
      userErrors: Array<{ field: string[] | null; message: string }>;
    } | null;
  }>(store, WEBHOOK_CREATE_MUTATION, {
    topic: enumTopic,
    webhookSubscription: { callbackUrl: address, format: "JSON" },
  });
  const errs = data.webhookSubscriptionCreate?.userErrors ?? [];
  if (errs.length === 0) return "registered";
  if (errs.some((e) => /already been taken/i.test(e.message))) return "already_registered";
  throw new Error(`webhookSubscriptionCreate ${topic}: ${errs.map((e) => e.message).join("; ")}`);
}

const WEBHOOK_LIST_QUERY = /* GraphQL */ `
  query webhookSubscriptions {
    webhookSubscriptions(first: 50) {
      nodes {
        id
        topic
        endpoint {
          __typename
          ... on WebhookHttpEndpoint { callbackUrl }
        }
      }
    }
  }
`;

// REST-shaped webhook list ({ topic: "orders/paid", address }) so the
// inspect route's expected-vs-found comparison stays unchanged.
async function listWebhookSubscriptions(
  store: ShopifyStore,
): Promise<Array<{ id: string; topic: string; address: string | null }>> {
  const data = await shopifyGraphql<{
    webhookSubscriptions: {
      nodes: Array<{
        id: string;
        topic: string;
        endpoint: { __typename: string; callbackUrl?: string } | null;
      }>;
    } | null;
  }>(store, WEBHOOK_LIST_QUERY);
  return (data.webhookSubscriptions?.nodes ?? []).map((n) => ({
    id: n.id,
    topic: webhookEnumToTopic(n.topic),
    address: n.endpoint?.__typename === "WebhookHttpEndpoint" ? (n.endpoint.callbackUrl ?? null) : null,
  }));
}

const ORDER_UPDATE_MUTATION = /* GraphQL */ `
  mutation orderUpdate($input: OrderInput!) {
    orderUpdate(input: $input) {
      order { id }
      userErrors { field message }
    }
  }
`;

// Replaces the REST `PUT orders/:id.json` note_attributes write. GraphQL
// calls the same order-level key/value bag `customAttributes`; Shopify's
// Liquid templates still render it as `note_attributes`, so the
// merchant's confirmation-email snippet keeps working unchanged.
async function updateOrderCustomAttributes(
  store: ShopifyStore,
  shopifyOrderId: string,
  attributes: Array<{ key: string; value: string }>,
): Promise<void> {
  const data = await shopifyGraphql<{
    orderUpdate: {
      order: { id: string } | null;
      userErrors: Array<{ field: string[] | null; message: string }>;
    } | null;
  }>(store, ORDER_UPDATE_MUTATION, {
    input: { id: orderGid(shopifyOrderId), customAttributes: attributes },
  });
  const errs = data.orderUpdate?.userErrors ?? [];
  if (errs.length > 0) {
    throw new Error(`orderUpdate ${shopifyOrderId}: ${errs.map((e) => e.message).join("; ")}`);
  }
}

const ORDER_TRANSACTIONS_QUERY = /* GraphQL */ `
  query orderTransactions($id: ID!) {
    order(id: $id) {
      transactions(first: 100) {
        id
        kind
        status
        gateway
        amountSet { shopMoney { amount } }
        parentTransaction { id }
      }
    }
  }
`;

type GqlOrderTransaction = {
  id: string;
  kind: string; // enum: SALE, CAPTURE, REFUND, …
  status: string; // enum: SUCCESS, FAILURE, PENDING, ERROR
  gateway: string | null;
  amountSet: { shopMoney: { amount: string } | null } | null;
  parentTransaction: { id: string } | null;
};

// REST-shaped transaction (numeric id, lowercase kind/status, snake_case
// parent_id) — refundShopifyOrder still builds its REST refund payload
// (Phase 6) against this shape.
function gqlTransactionToRest(t: GqlOrderTransaction) {
  return {
    id: Number(gidTail(t.id)),
    kind: (t.kind ?? "").toLowerCase(),
    status: (t.status ?? "").toLowerCase(),
    gateway: t.gateway ?? "",
    amount: t.amountSet?.shopMoney?.amount ?? "0",
    parent_id: t.parentTransaction ? Number(gidTail(t.parentTransaction.id)) : null,
  };
}

// Replaces `GET orders/:id/transactions.json`. Throws when the order
// doesn't exist (GraphQL returns `order: null` where REST 404'd).
async function fetchOrderTransactions(store: ShopifyStore, shopifyOrderId: string) {
  const data = await shopifyGraphql<{
    order: { transactions: GqlOrderTransaction[] } | null;
  }>(store, ORDER_TRANSACTIONS_QUERY, { id: orderGid(shopifyOrderId) });
  if (!data.order) throw new Error(`Shopify order ${shopifyOrderId} not found`);
  return (data.order.transactions ?? []).map(gqlTransactionToRest);
}

// ─── Inventory/location GraphQL plumbing (Phase 5 migration) ───────────
// Replaces `GET locations.json` and `POST inventory_levels/set.json`.
// Same bridging approach as Phases 3-4: callers keep numeric REST ids
// (inventory_item_id off productSet's legacyResourceId) and these
// helpers translate to gids at the boundary.
const locationGid = (id: string | number) => `gid://shopify/Location/${id}`;
const inventoryItemGid = (id: string | number) => `gid://shopify/InventoryItem/${id}`;

const LOCATIONS_QUERY = /* GraphQL */ `
  query locations {
    locations(first: 10) {
      nodes { id name }
    }
  }
`;

// REST-shaped location list ({ id: numeric, name }). The push flow only
// uses the first location, mirroring the old `locations[0].id` read.
async function fetchLocations(store: ShopifyStore): Promise<Array<{ id: number; name: string }>> {
  const data = await shopifyGraphql<{
    locations: { nodes: Array<{ id: string; name: string }> } | null;
  }>(store, LOCATIONS_QUERY);
  return (data.locations?.nodes ?? []).map((n) => ({ id: Number(gidTail(n.id)), name: n.name }));
}

// `inventorySetQuantities` is the current recommended absolute-set
// mutation (the REST set.json semantic — "make available exactly N"),
// per the Shopify Admin API reference for our pinned 2026-01 version.
// `inventoryAdjustQuantities` is the delta form; wrong fit here because
// the push flow writes an operator-entered absolute count.
// ignoreCompareQuantity opts out of the compare-and-set check, matching
// REST's last-write-wins behavior. (Heads-up for a future version bump:
// 2026-04 drops ignoreCompareQuantity in favor of a per-item
// changeFromQuantity and requires an @idempotent directive.)
const INVENTORY_SET_MUTATION = /* GraphQL */ `
  mutation inventorySetQuantities($input: InventorySetQuantitiesInput!) {
    inventorySetQuantities(input: $input) {
      inventoryAdjustmentGroup { id }
      userErrors { field message }
    }
  }
`;

// Sets the absolute available quantity for one inventory item at one
// location. Throws on userErrors so callers can log-and-continue
// (inventory writes in the push flow are best-effort).
async function setInventoryAvailable(
  store: ShopifyStore,
  inventoryItemId: string | number,
  locationId: string | number,
  available: number,
): Promise<void> {
  const data = await shopifyGraphql<{
    inventorySetQuantities: {
      inventoryAdjustmentGroup: { id: string } | null;
      userErrors: Array<{ field: string[] | null; message: string }>;
    } | null;
  }>(store, INVENTORY_SET_MUTATION, {
    input: {
      name: "available",
      reason: "correction",
      ignoreCompareQuantity: true,
      quantities: [
        {
          inventoryItemId: inventoryItemGid(inventoryItemId),
          locationId: locationGid(locationId),
          quantity: available,
        },
      ],
    },
  });
  const errs = data.inventorySetQuantities?.userErrors ?? [];
  if (errs.length > 0) {
    throw new Error(
      `inventorySetQuantities item=${inventoryItemId}: ${errs.map((e) => e.message).join("; ")}`,
    );
  }
}

// ─── Write redemption metafield to Shopify order ──────────────────────
// Called fire-and-forget after the redemption code is minted so the
// checkout UI extension (purchase.thank-you + customer-account order
// status) can display the code and deep-link without the ScriptTag.
// Written under the "$app:goodtunes" app-reserved namespace (see below)
// so only our app can read it — NEVER a plain custom namespace.
// Best-effort: a failure is logged but never blocks the webhook response.
const GOODTUNES_FAN_HOST = process.env.GOODTUNES_HOST ?? "my.goodtunes.music";

const METAFIELDS_SET_MUTATION = /* GraphQL */ `
  mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      metafields { id }
      userErrors { field message }
    }
  }
`;

async function writeRedemptionMetafield(
  store: ShopifyStore,
  shopifyOrderId: string,
  code: string,
): Promise<void> {
  const url = `https://${GOODTUNES_FAN_HOST}/redeem/${code}`;
  const value = JSON.stringify({ code, url });
  const ownerId = `gid://shopify/Order/${shopifyOrderId}`;

  // "$app:goodtunes" is the app-RESERVED namespace form: Shopify resolves
  // it to app--<our-app-id>--goodtunes, which no other app can read or
  // write and which merchants can't edit from the admin. A plain
  // "goodtunes" namespace would be world-readable — never use it here.
  const result = await shopifyGraphql<{
    metafieldsSet: {
      metafields: Array<{ id: string }>;
      userErrors: Array<{ field: string; message: string }>;
    };
  }>(store, METAFIELDS_SET_MUTATION, {
    metafields: [
      { ownerId, namespace: "$app:goodtunes", key: "redemption", type: "json", value },
    ],
  });

  const errs = result.metafieldsSet?.userErrors ?? [];
  if (errs.length > 0) {
    throw new Error(errs.map((e) => `${e.field}: ${e.message}`).join("; "));
  }

  // Success — stamp the row so the reconciliation sweep skips it.
  await db
    .update(shopifyRedemptionCodes)
    .set({ metafieldWrittenAt: new Date() })
    .where(eq(shopifyRedemptionCodes.code, code));
}

// ─── Reconciliation sweep: paid orders missing the redemption metafield ─
// Safety net behind the fire-and-forget write above. Every tick it finds
// codes minted in the last 7 days whose metafield write never landed
// (metafield_written_at IS NULL) and retries them. Idempotent —
// metafieldsSet is an upsert, so re-writing an already-present metafield
// is harmless. Armed from server/index.ts on a 10-minute tick.
export async function sweepRedemptionMetafields(): Promise<{ retried: number; failed: number }> {
  const rows = await db
    .select({
      code: shopifyRedemptionCodes.code,
      shopifyOrderId: orders.shopifyOrderId,
      shopifyStoreId: orders.shopifyStoreId,
    })
    .from(shopifyRedemptionCodes)
    .innerJoin(orders, eq(orders.id, shopifyRedemptionCodes.orderId))
    .where(
      and(
        isNull(shopifyRedemptionCodes.metafieldWrittenAt),
        sql`${shopifyRedemptionCodes.createdAt} > now() - interval '7 days'`,
        isNotNull(orders.shopifyOrderId),
        isNotNull(orders.shopifyStoreId),
      ),
    )
    .limit(50);

  let retried = 0;
  let failed = 0;
  for (const row of rows) {
    try {
      const store = await getStoreById(row.shopifyStoreId!);
      if (!store) {
        failed++;
        continue;
      }
      await writeRedemptionMetafield(store, row.shopifyOrderId!, row.code);
      retried++;
    } catch (e: any) {
      failed++;
      console.error(
        `[shopify] metafield sweep retry failed order=${row.shopifyOrderId}: ${e?.message ?? e}`,
      );
    }
  }
  return { retried, failed };
}

// ─── One-time ScriptTag cleanup (Task #2842 / Phase 1b) ────────────────
// The order-status ScriptTag was replaced by the Checkout UI Extension
// (extensions/goodtunes-redemption); install-time registration is already
// gone. This removes the tags legacy installs left behind. Called from
// scripts/cleanup-script-tags.ts (post-merge, marker-guarded). Uses
// shopifyFetch so encrypted-at-rest + expiring-offline-token refresh both
// work — a raw DB access_token is ciphertext and would always 401.
export async function cleanupGoodTunesScriptTags(): Promise<{ deleted: number; failures: string[] }> {
  const isGoodTunesSrc = (src: string): boolean => {
    try {
      const host = new URL(src).hostname.toLowerCase();
      return host === "goodtunes.music" || host.endsWith(".goodtunes.music");
    } catch {
      return false;
    }
  };

  const stores = await db.select().from(shopifyStores).where(isNull(shopifyStores.uninstalledAt));
  let deleted = 0;
  const failures: string[] = [];
  for (const store of stores) {
    if (!store.accessToken) continue;
    try {
      // Page through the full list via since_id so stores with >250 tags
      // can't hide a GoodTunes tag past the first page.
      const all: Array<{ id: number; src: string }> = [];
      let sinceId = 0;
      let listFailed = false;
      for (;;) {
        const listRes = await shopifyFetch(store, `script_tags.json?limit=250&since_id=${sinceId}`);
        if (listRes.status === 404) {
          // Dead/dev-clone store or a token without the script-tag surface —
          // it cannot be carrying our tags via this token.
          console.log(`[script-tag-cleanup] SKIP ${store.shopDomain}: script_tags 404`);
          listFailed = true;
          break;
        }
        if (listRes.status === 401 || listRes.status === 403) {
          failures.push(`${store.shopDomain}: ${listRes.status} — reconnect required; remove GoodTunes ScriptTags from the store admin`);
          listFailed = true;
          break;
        }
        if (!listRes.ok) {
          failures.push(`${store.shopDomain}: list returned ${listRes.status}`);
          listFailed = true;
          break;
        }
        const body = (await listRes.json()) as { script_tags?: Array<{ id: number; src: string }> };
        const page = body.script_tags ?? [];
        all.push(...page);
        if (page.length < 250) break;
        sinceId = Math.max(...page.map((t) => t.id));
      }
      if (listFailed) continue;
      const ours = all.filter((t) => isGoodTunesSrc(t.src));
      console.log(`[script-tag-cleanup] ${store.shopDomain}: ${all.length} tag(s), ${ours.length} GoodTunes`);
      for (const tag of ours) {
        const delRes = await shopifyFetch(store, `script_tags/${tag.id}.json`, { method: "DELETE" });
        if (delRes.ok) {
          deleted++;
          console.log(`[script-tag-cleanup]   deleted #${tag.id} (${tag.src})`);
        } else {
          failures.push(`${store.shopDomain}: delete #${tag.id} returned ${delRes.status}`);
        }
      }
    } catch (e: any) {
      failures.push(`${store.shopDomain}: ${e?.message ?? e}`);
    }
  }
  return { deleted, failures };
}

// ─── Post-install setup: register webhooks + script tag ───────────────
// All three pieces are idempotent on Shopify's side via `address` / `src`
// uniqueness — calling them twice on a re-install is fine.
async function registerWebhooks(store: ShopifyStore, appUrl: string): Promise<void> {
  const topics = ["orders/paid", "orders/refunded", "refunds/create", "app/uninstalled"];
  for (const topic of topics) {
    try {
      await createWebhookSubscription(store, topic, `${appUrl}/api/webhooks/shopify/orders`);
    } catch (e: any) {
      console.error(`[shopify] failed to register webhook ${topic} for ${store.shopDomain}`, e?.message);
    }
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

// In-memory cache for Shopify variant retail lookups (Task #243). Keyed
// by `${storeId}:${variantId}`, 60s TTL. Cheap to lose on restart; the
// admin panel can always force a refresh with ?refresh=1.
const VARIANT_RETAIL_TTL_MS = 60_000;
const variantRetailCache = new Map<
  string,
  { at: number; value: { priceCents: number | null; currency: string | null; removed: boolean } }
>();

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
  id?: number | null;
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
  confirmation_number?: string | null;
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
// Task #551 — Delegate to the canonical mint helper in commerce.ts so
// Shopify-sourced orders share one MAX+1 implementation with direct
// orders. Concurrent-race protection lives in the same module via
// withRetryOnGoodDeedCollision, which the call sites below wrap around
// the actual insert.
async function assignNextGoodDeedNumberForAlbum(albumId: string): Promise<number> {
  const { assignNextGoodDeedNumber } = await import("./commerce");
  return assignNextGoodDeedNumber(albumId);
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

// Task #2428 — GoodTunes Shopify+ fulfillment-only ingest. The customer
// sells on their own Shopify and GoodTunes runs the production/fulfillment
// pipeline only. This mints NO GoodTunes sale: no GoodDeed number, unlock,
// redemption code, cert reservation, or press-pool accrual. The order carries
// a distinct status ("fulfillment_only") + origin ("shopify_plus:<store>") so
// it is auto-excluded from every sales/revenue/payout read (those all filter
// on status "paid"/"shipped") and can never trigger an artist/label payout
// (the ship button that transfers funds requires status="paid"). Fulfillment
// still runs off `fulfillmentStatus` (Order Desk push + status webhook +
// shipping email), independent of `status`.
async function materializeShopifyPlusFulfillmentOnly(args: {
  store: ShopifyStore;
  payload: ShopifyOrder;
  album: typeof albums.$inferSelect;
  matchedLine: ShopifyLineItem;
  buyerEmail: string;
  shopifyOrderId: string;
}): Promise<void> {
  const { store, payload, album, matchedLine, buyerEmail, shopifyOrderId } = args;

  // Fulfillment OFF → we dropship the finished run to the customer in one
  // shipment; there is nothing to route per consumer order.
  if (!album.shopifyPlusFulfillment) {
    console.log(
      `[shopify-webhook] shopify_plus album ${album.id} has fulfillment OFF (dropship) — ignoring order ${shopifyOrderId}`,
    );
    return;
  }

  const { classifySkuKind, isPhysicalSkuKind, pushOrderToOrderDesk } = await import("./orderDesk");
  const skuKind = classifySkuKind(
    matchedLine.variant_id ? `shopify:${matchedLine.variant_id}` : `shopify:${matchedLine.product_id}`,
  );
  // Only a physical line needs a warehouse — a digital-only Shopify+ line has
  // nothing to ship.
  if (!isPhysicalSkuKind(skuKind)) {
    console.log(
      `[shopify-webhook] shopify_plus order ${shopifyOrderId} line is non-physical (${skuKind}) — nothing to fulfill`,
    );
    return;
  }

  const buyerName =
    [payload.customer?.first_name, payload.customer?.last_name].filter(Boolean).join(" ") || null;
  const customerId = await findOrCreateStubCustomer(buyerEmail, buyerName);

  const [order] = await db
    .insert(orders)
    .values({
      customerId,
      albumId: album.id,
      totalCents: dollarsToCents(payload.total_price),
      currency: (payload.currency ?? "usd").toLowerCase(),
      status: "fulfillment_only",
      shippingAddress: snapshotAddress(payload.shipping_address) as any,
      billingAddress: snapshotAddress(payload.billing_address) as any,
      buyerEmail,
      buyerName,
      buyerPhone: payload.customer?.phone ?? null,
      goodDeedNumber: null,
      origin: `shopify_plus:${store.id}`,
      shopifyStoreId: store.id,
      shopifyOrderId,
      shopifyOrderToken: payload.token ?? null,
      shopifyConfirmationNumber: payload.confirmation_number ?? null,
      skuKind,
      artistSnapshotId: album.primaryArtistId ?? null,
      labelSnapshotId: album.labelId ?? null,
      fulfillmentPartnerId: album.fulfillmentPartnerId ?? null,
      fulfillmentStatus: "pending",
    })
    .onConflictDoNothing({ target: orders.shopifyOrderId })
    .returning();

  // Lost the race with a concurrent webhook replay — the winner already
  // routed it.
  if (!order) return;

  await db.insert(orderItems).values([
    {
      orderId: order.id,
      kind: "format",
      sku: matchedLine.variant_id
        ? `shopify:${matchedLine.variant_id}`
        : `shopify:${matchedLine.product_id}`,
      label: matchedLine.title,
      unitPriceCents: dollarsToCents(matchedLine.price),
      quantity: matchedLine.quantity,
    },
  ]);

  // Route the finished goods to the assigned fulfillment partner. Unlike the
  // GoodTunes direct/shopify flow (which aggregates a press run before handing
  // off, hence the ORDERDESK_AUTO_PUSH gate), a Shopify+ order is a real
  // consumer sale that ships now — so we route each order as it lands.
  // pushOrderToOrderDesk is internally try/caught and records any error on the
  // order row for the admin retry button.
  await pushOrderToOrderDesk(order.id).catch((e) =>
    console.error(`[shopify] shopify_plus OD handoff threw for ${order.id}`, (e as Error)?.message),
  );
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
    // Skip addon mappings (isSignedGooddeedAddon=true) — those are
    // separate "Signed GoodDeed add-on" SKUs, not the primary album.
    const exact = mappings.find((m) => m.shopifyProductId === pid && m.shopifyVariantId === vid && !m.isSignedGooddeedAddon);
    const productWide = mappings.find((m) => m.shopifyProductId === pid && m.shopifyVariantId === null && !m.isSignedGooddeedAddon);
    const hit = exact ?? productWide;
    if (hit) {
      albumId = hit.albumId;
      matchedMapping = hit;
      matchedLine = li;
      break;
    }
  }
  if (!albumId || !matchedMapping || !matchedLine) return null;

  // Scan the rest of the cart for a signed-GoodDeed add-on product mapped
  // to the same album. When found, an order that contains the primary album
  // product AND this add-on line mints a signed certificate (instead of the
  // old album-level all-or-nothing offerSignedCert flag).
  let signedAddonLine: ShopifyLineItem | null = null;
  for (const li of payload.line_items) {
    if (li === matchedLine) continue;
    const pid = String(li.product_id ?? "");
    const vid = li.variant_id != null ? String(li.variant_id) : null;
    const addonExact = mappings.find(
      (m) => m.isSignedGooddeedAddon && m.albumId === albumId && m.shopifyProductId === pid && m.shopifyVariantId === vid,
    );
    const addonWide = mappings.find(
      (m) => m.isSignedGooddeedAddon && m.albumId === albumId && m.shopifyProductId === pid && m.shopifyVariantId === null,
    );
    const addonHit = addonExact ?? addonWide;
    if (addonHit) {
      signedAddonLine = li;
      break;
    }
  }

  // Task #2428 — GoodTunes Shopify+ albums sell on the customer's OWN
  // Shopify; GoodTunes is NOT the seller. We never mint a GoodTunes sale,
  // digital unlock, redemption code, GoodDeed number, cert reservation, or
  // press-pool accrual for these. When the album's fulfillment toggle is ON
  // we ingest the order purely to route the finished goods through the
  // assigned partner; when OFF we dropship the whole run and ignore
  // per-order webhooks. Branch BEFORE the sale-mint below.
  const [spAlbum] = await db.select().from(albums).where(eq(albums.id, albumId));
  const isShopifyPlus = spAlbum?.sellMode === "shopify_plus";
  // Task #2428 line 31 — a shopify_plus album may STILL opt a mapping in to
  // mint the GoodTunes digital unlock + GoodDeed "exactly as today". Only a
  // mapping with offersDigitalUnlock=false takes the pure fulfillment-only
  // feed (Step 8 baseline — mints nothing). offersDigitalUnlock=true falls
  // through to the shared sale-mint below, with shopify_plus deltas applied
  // inline: external_paid status (kept out of GoodTunes revenue/payouts),
  // no fan-sale pool / early-cut accrual, and fulfillment/cert gated by the
  // album toggles.
  if (isShopifyPlus && !matchedMapping.offersDigitalUnlock) {
    await materializeShopifyPlusFulfillmentOnly({
      store,
      payload,
      album: spAlbum,
      matchedLine,
      buyerEmail,
      shopifyOrderId,
    });
    return null;
  }

  // Find-or-create the customer + reserve the GoodDeed number now so a
  // fan who never clicks the redeem button still has their slot.
  const customerId = await findOrCreateStubCustomer(
    buyerEmail,
    [payload.customer?.first_name, payload.customer?.last_name].filter(Boolean).join(" ") || null,
  );
  // Task #551 — Mint moved inside the insert closure below so the
  // retry helper can re-mint on a 23505 collision (concurrent webhook
  // race with another sale on the same album).

  // Build the order_items snapshot. Two kinds:
  //   "format" → the physical SKU label (we use the line item title)
  //   "addon"  → printed & signed cert, if this mapping offered it AND
  //              the price is at or above the album's min floor, OR
  //              if the cart contained an isSignedGooddeedAddon line item.
  const totalCents = dollarsToCents(payload.total_price);
  let signedCertCents = 0;
  // Method A: legacy mapping-level offerSignedCert (album-wide toggle).
  if (
    matchedMapping.offerSignedCert &&
    matchedMapping.signedCertPriceCents != null &&
    // Task #2428 — on a shopify_plus album the signed GoodDeed is additionally
    // gated by the album-level value-add toggle; plain shopify is unaffected.
    (!isShopifyPlus || spAlbum?.shopifyPlusSignedGooddeed)
  ) {
    const [floor] = await db
      .select()
      .from(albumAddons)
      .where(and(eq(albumAddons.albumId, albumId), eq(albumAddons.kind, "signed_cert")));
    if (!floor || matchedMapping.signedCertPriceCents >= floor.minPriceCents) {
      signedCertCents = matchedMapping.signedCertPriceCents;
    }
  }
  // Method B: per-order add-on line item detection. A separate Shopify
  // product/variant mapped as isSignedGooddeedAddon=true for this album
  // lets the fan add the cert to their cart independently. The retail price
  // (what the fan paid) goes into the order_items row; the manufacturing
  // ladder cost is a wholesale charge billed through our standing vendor
  // relationship with the artist.
  if (signedAddonLine && signedCertCents === 0) {
    const addonLineCents = dollarsToCents(signedAddonLine.price) * (signedAddonLine.quantity ?? 1);
    const [floor] = await db
      .select()
      .from(albumAddons)
      .where(and(eq(albumAddons.albumId, albumId), eq(albumAddons.kind, "signed_cert")));
    // Floor check: if the artist set a floor on this album's cert, enforce
    // it. (Per-unit price vs floor; multiply quantity after the check.)
    if (!floor || dollarsToCents(signedAddonLine.price) >= floor.minPriceCents) {
      signedCertCents = addonLineCents;
    }
  }

  const buyerName = [payload.customer?.first_name, payload.customer?.last_name].filter(Boolean).join(" ") || null;
  const billing = snapshotAddress(payload.billing_address);
  const shipping = snapshotAddress(payload.shipping_address);

  // Task #73 — snapshot skuKind/artist/label for OD handoff + reporting.
  // Shopify bundles are overwhelmingly vinyl; classifySkuKind covers
  // cassette/cd via the matched mapping if the label sets a clear sku
  // code on their Shopify product (we use the line-item title fallback).
  const { classifySkuKind, isPhysicalSkuKind, pushOrderToOrderDesk, orderDeskAutoPushEnabled } = await import("./orderDesk");
  const [albumRow] = await db.select().from(albums).where(eq(albums.id, albumId));
  const skuKind = classifySkuKind(`shopify:${matchedLine.variant_id ?? matchedLine.product_id}`);
  const artistSnapshotId = albumRow?.primaryArtistId ?? null;
  const labelSnapshotId = albumRow?.labelId ?? null;

  const { withRetryOnGoodDeedCollision } = await import("./commerce");
  const order = await withRetryOnGoodDeedCollision(albumId, async () => {
    const goodDeedNumber = await assignNextGoodDeedNumberForAlbum(albumId);
    const [row] = await db
      .insert(orders)
      .values({
        customerId,
        albumId,
        totalCents,
        currency: (payload.currency ?? "usd").toLowerCase(),
        // Task #2428 — a shopify_plus unlock order is NOT a GoodTunes sale
        // (the label sold it on their own Shopify). external_paid grants the
        // unlock + GoodDeed but is auto-excluded from every revenue/payout
        // read (they whitelist paid/shipped/complete/completed/refunded).
        status: isShopifyPlus ? "external_paid" : "paid",
        shippingAddress: shipping as any,
        billingAddress: billing as any,
        buyerEmail,
        buyerName,
        buyerPhone: payload.customer?.phone ?? null,
        goodDeedNumber,
        origin: isShopifyPlus ? `shopify_plus:${store.id}` : `shopify:${store.id}`,
        shopifyStoreId: store.id,
        shopifyOrderId,
        shopifyOrderToken: payload.token ?? null,
        shopifyConfirmationNumber: payload.confirmation_number ?? null,
        skuKind,
        artistSnapshotId,
        labelSnapshotId,
        // Physical orders flag "pending" fulfillment — but a shopify_plus
        // album only routes per-order goods when its fulfillment toggle is
        // on (otherwise the finished run is dropshipped, nothing per order).
        fulfillmentStatus:
          isPhysicalSkuKind(skuKind) && (!isShopifyPlus || spAlbum?.shopifyPlusFulfillment)
            ? "pending"
            : null,
      })
      .onConflictDoNothing({ target: orders.shopifyOrderId })
      .returning();
    return row;
  });
  // Task #79 — first paid order stamps the post-sale lock on the album.
  if (order) {
    const { stampFirstSoldAtIfNeeded } = await import("./auth/partnerPermissions");
    await stampFirstSoldAtIfNeeded(albumId);
  }

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

  // Task #533 — accrue this paid Shopify sale's per-unit press earmark
  // into the album's early-cut funding pool. Idempotent per order.
  // Task #2428 — shopify_plus bypasses the fan-sale pool / early-cut
  // entirely: its manufacturing is prepaid via the ACH ledger, not funded
  // out of per-sale earmarks.
  if (!isShopifyPlus) {
    const { accruePressPool } = await import("./earlyCut");
    await accruePressPool(albumId, order.id, matchedLine.quantity).catch((e) =>
      console.error(`[shopify] press-pool accrual failed for ${order.id}`, (e as Error)?.message),
    );
  }

  // Wholesale platform charge accrual. Every order that mints a digital
  // unlock accrues the store's digitalUnitFeeCents rate (default $3.50) per
  // unit into the wholesale ledger — the per-unit wholesale charge for
  // GoodTunes platform access, billed through our standing vendor
  // relationship with the artist. Idempotent
  // (the orderId UNIQUE constraint on the ledger table silences replays).
  // shopify_plus external_paid orders DO accrue — GoodTunes still provides
  // the digital unlock and GoodDeed, so the platform fee applies.
  try {
    const unitFeeCents = store.digitalUnitFeeCents ?? 350;
    const qty = matchedLine.quantity ?? 1;
    await db
      .insert(platformWholesaleLedger)
      .values({
        orderId: order.id,
        storeId: store.id,
        albumId,
        unitFeeCents,
        quantity: qty,
        totalCents: unitFeeCents * qty,
      })
      .onConflictDoNothing({ target: platformWholesaleLedger.orderId });
  } catch (e: any) {
    console.error(`[shopify] digital fee accrual failed for ${order.id}: ${e?.message ?? e}`);
  }

  // Task #246 — Mint a cert_reservations row if the order carries the
  // signed-cert add-on. Window status drives variantKind: in-window =
  // printed (eligible for batch); post-window = digital_only (fan keeps
  // the digital provenance page but no print row is produced).
  if (signedCertCents > 0) {
    try {
      const { reservationKindForWindowStatus } = await import("./saleWindow");
      const { certReservations } = await import("@shared/schema");
      const variantKind = reservationKindForWindowStatus(
        (albumRow as any)?.signedCertWindowStatus ?? null,
      );
      await db
        .insert(certReservations)
        .values({
          albumId,
          orderId: order.id,
          shopifyOrderId,
          shopifyLineItemId: matchedLine.id != null ? String(matchedLine.id) : null,
          goodDeedNumber: variantKind === "printed" ? goodDeedNumber : null,
          variantKind,
          status: variantKind === "printed" ? "reserved" : "digital_only",
        })
        .onConflictDoNothing({ target: certReservations.orderId });
    } catch (e: any) {
      console.error(`[shopify] cert reservation mint failed for ${order.id}: ${e?.message ?? e}`);
    }
  }

  // Unlock the album for the (possibly-stub) customer immediately. The
  // /redeem page just signs them into the account that already owns the
  // unlock; if they were a stub, /redeem promotes them by collecting a
  // password or OAuth.
  await db.insert(userAlbums).values({ userId: customerId, albumId }).onConflictDoNothing();
  // Task #1460 — qualifying LLT release also unlocks the bonus album.
  await grantLltBonusIfEligible(db, customerId, albumId);

  // Mint the redemption code last so an incomplete materialize doesn't
  // leak a code that can't be resolved.
  const code = generateRedemptionCode();
  await db.insert(shopifyRedemptionCodes).values({ code, orderId: order.id });

  // Write the code + deep-link to an app-owned order metafield so the
  // checkout UI extension (purchase.thank-you + customer-account order
  // status) can display it directly. Fire-and-forget: a failure is logged
  // but never blocks the webhook response. The extension handles the
  // not-yet-written state with a "being prepared" placeholder card.
  writeRedemptionMetafield(store, shopifyOrderId, code).catch((e: any) => {
    console.error(`[shopify] metafield write failed order=${shopifyOrderId}: ${e?.message ?? e}`);
  });

  // Phase 1c — email the fan their personal redemption link directly.
  // Guaranteed day-one path regardless of whether the merchant's checkout
  // renders the UI Extension yet. Runs ONLY on a fresh code mint (webhook
  // replays early-return above with the existing code, so this can't
  // double-send). Fire-and-forget: mail failure never unwinds the order.
  if (payload.email) {
    (async () => {
      const appUrl = process.env.APP_URL ?? `https://${process.env.GOODTUNES_HOST ?? "my.goodtunes.music"}`;
      const redeemUrl = `${appUrl.replace(/\/$/, "")}/redeem/${code}`;
      const [albumRow] = await db.select({ title: albums.title }).from(albums).where(eq(albums.id, albumId));
      const { sendShopifyRedemptionEmail } = await import("./mail");
      const r = await sendShopifyRedemptionEmail(payload.email!, albumRow?.title ?? null, redeemUrl);
      if (!r.ok) console.error(`[shopify] redemption email failed order=${shopifyOrderId}: ${r.reason}`);
    })().catch((e: any) => {
      console.error(`[shopify] redemption email threw order=${shopifyOrderId}: ${e?.message ?? e}`);
    });
  }

  // Task #73 — physical bundles also flow through Order Desk so the
  // label's vinyl ships from the same warehouse pool as direct orders.
  // Auto-push is OFF by default (see orderDeskAutoPushEnabled) — the operator
  // pushes deliberately from the admin order row once the press-run quantity
  // is confirmed, so the fulfillment partner isn't told to fulfill each order
  // before anything is printed. pushOrderToOrderDesk is internally try/caught
  // and records any error on the order row so the admin retry button surfaces
  // the reason.
  // Task #2428 — a shopify_plus order whose album has fulfillment ON pushes
  // to the partner immediately (the goods are prepaid and already exist),
  // bypassing the deliberate auto-push gate that plain Shopify/direct orders
  // wait on until the press-run quantity is confirmed.
  const shouldPushToOrderDesk = isShopifyPlus
    ? isPhysicalSkuKind(skuKind) && !!spAlbum?.shopifyPlusFulfillment
    : isPhysicalSkuKind(skuKind) && orderDeskAutoPushEnabled();
  if (shouldPushToOrderDesk) {
    await pushOrderToOrderDesk(order.id).catch((e) =>
      console.error(`[shopify] OD handoff unexpected throw for ${order.id}`, e?.message),
    );
  }

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
    await updateOrderCustomAttributes(store, shopifyOrderId, [
      { key: "GoodTunes redemption URL", value: redeemUrl },
      { key: "GoodTunes album", value: albumRow?.title ?? "" },
    ]);
  } catch (e: any) {
    console.warn(`[shopify] couldn't stamp note_attributes on order ${shopifyOrderId}: ${e?.message ?? e}`);
  }

  return { orderId: order.id, code };
}

// Task #236 — operator-initiated refund against a Shopify-origin order.
// Calls Shopify Admin REST `refunds/calculate.json` to build a valid
// refund payload for the requested cents (the calc endpoint figures out
// which transactions to refund against — gateway, gift card, etc.),
// then POSTs `refunds.json` to actually issue it. Shopify in turn fires
// `refunds/create` + `orders/refunded` webhooks back at us, but we don't
// wait — `handleShopifyRefund` is idempotent so the webhook is a no-op
// when it lands. Returns the Shopify refund id for logging.
export async function refundShopifyOrder(opts: {
  shopifyStoreId: string;
  shopifyOrderId: string;
  amountCents: number;
  reason: string | null;
}): Promise<{ refundId: string }> {
  const store = await getStoreById(opts.shopifyStoreId);
  if (!store) throw new Error("Shopify store not connected");
  if (store.uninstalledAt) throw new Error("Shopify store has been disconnected");
  const amount = (opts.amountCents / 100).toFixed(2);

  // Step 1: ask Shopify what transactions to refund against.
  const calcRes = await shopifyFetch(store, `orders/${opts.shopifyOrderId}/refunds/calculate.json`, {
    method: "POST",
    body: JSON.stringify({
      refund: {
        currency: undefined, // let Shopify default to the order currency
        shipping: { full_refund: false },
        refund_line_items: [],
        // `transactions: []` here would calc a zero-amount refund; instead
        // we ask Shopify to suggest transactions covering the dollar amount.
        // The documented shape uses `transactions` with `kind: "suggested_refund"`
        // returned from this same endpoint — but the simpler path is to fetch
        // the parent transactions list and refund against the most recent sale.
      },
    }),
  });
  // Fetch transactions (Admin GraphQL, Phase 4) so we can build a refund
  // payload covering `amount`. fetchOrderTransactions returns the legacy
  // REST shape (numeric ids, lowercase kind/status) the refund POST needs.
  const transactions = await fetchOrderTransactions(store, opts.shopifyOrderId);
  const sale = transactions.find((t) => (t.kind === "sale" || t.kind === "capture") && t.status === "success");
  if (!sale) throw new Error("No successful sale transaction found on Shopify order");
  // Silence unused-var lint on calcRes — we may want to surface its
  // estimate to operators later; right now we just need it to have run.
  void calcRes;

  const refundBody = {
    refund: {
      notify: true,
      note: opts.reason ?? "GoodTunes admin refund",
      transactions: [
        {
          parent_id: sale.id,
          amount,
          kind: "refund",
          gateway: sale.gateway,
        },
      ],
    },
  };
  const res = await shopifyFetch(store, `orders/${opts.shopifyOrderId}/refunds.json`, {
    method: "POST",
    body: JSON.stringify(refundBody),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Shopify refund failed: ${res.status} ${body.slice(0, 300)}`);
  }
  const json = (await res.json()) as { refund?: { id: number } };
  return { refundId: String(json.refund?.id ?? "") };
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
  // Task #533 — back the refunded sale's earmark out of the early-cut pool.
  if (order.albumId) {
    const { reversePressPoolForOrder } = await import("./earlyCut");
    await reversePressPoolForOrder(order.albumId, order.id).catch((e) =>
      console.error(`[shopify] press-pool reversal failed for ${order.id}`, e?.message),
    );
  }
  // Reverse the digital fee accrual for this order. Stamps reversedAt so the
  // operator's fee-ledger view correctly shows the net still-owed amount.
  await db
    .update(platformWholesaleLedger)
    .set({ reversedAt: new Date() })
    .where(and(eq(platformWholesaleLedger.orderId, order.id), isNull(platformWholesaleLedger.reversedAt)))
    .catch((e: any) => console.error(`[shopify] fee reversal failed for ${order.id}: ${e?.message ?? e}`));
  // Same lock-return logic as the Stripe refund path: only revoke the
  // album unlock if this is the *only* live order for the customer +
  // album. Other live orders — a direct/Shopify "paid" order or a
  // Task #2428 shopify_plus "external_paid" unlock — still keep it alive.
  const remaining = await db
    .select({ id: orders.id })
    .from(orders)
    .where(and(eq(orders.customerId, order.customerId), eq(orders.albumId, order.albumId), inArray(orders.status, ["paid", "external_paid"])));
  if (remaining.length === 0) {
    await db.delete(userAlbums).where(and(eq(userAlbums.userId, order.customerId), eq(userAlbums.albumId, order.albumId)));
  }
}

// ─── Push-snapshot diff (Task #242) ───────────────────────────────────
// Compare the fingerprint we last sent to Shopify against the live
// product. Returns a list of human-readable field names that drifted —
// each one is something the label edited on Shopify after our last
// push and that re-pushing would silently clobber unless they confirm.
function diffPushSnapshot(
  snap: ShopifyPushSnapshot,
  live: any,
  variantIds: { editionVariantId: string | null; certVariantId: string | null },
): string[] {
  const out: string[] = [];
  if (String(live?.title ?? "") !== snap.title) out.push("Title");
  if (String(live?.body_html ?? "") !== snap.bodyHtml) out.push("Description");
  if (String(live?.vendor ?? "") !== snap.vendor) out.push("Vendor");
  if (String(live?.tags ?? "") !== snap.tags) out.push("Tags");
  const variants: any[] = Array.isArray(live?.variants) ? live.variants : [];
  const edition = variants.find((v) => String(v?.id) === variantIds.editionVariantId) ?? variants[0];
  if (edition) {
    const livePriceCents = Math.round(Number.parseFloat(String(edition.price ?? "0")) * 100);
    if (livePriceCents !== snap.edition.priceCents) out.push("Edition price");
    if (snap.edition.inventory != null && Number(edition.inventory_quantity ?? 0) !== snap.edition.inventory) {
      out.push("Edition inventory");
    }
  }
  if (snap.cert) {
    const cert = variants.find((v) => String(v?.id) === variantIds.certVariantId)
      ?? variants.find((v) => String(v?.option1 ?? "").includes("Signed"));
    if (cert) {
      const livePriceCents = Math.round(Number.parseFloat(String(cert.price ?? "0")) * 100);
      if (livePriceCents !== snap.cert.priceCents) out.push("Signed-cert price");
      if (snap.cert.inventory != null && Number(cert.inventory_quantity ?? 0) !== snap.cert.inventory) {
        out.push("Signed-cert inventory");
      }
    } else {
      out.push("Signed-cert variant (removed on Shopify)");
    }
  }
  return out;
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
    // Task #2030 — optional label context. When the operator kicks off the
    // install from a label's Shopify tab we carry the labelId through the
    // OAuth round-trip inside the SIGNED `state` so the forged-callback
    // protection also covers the association. Validate it's a real label
    // before trusting it; an unknown id just falls back to a label-less
    // install (same as the global Shopify page).
    let labelId = "";
    const rawLabelId = String(req.query.labelId ?? "").trim();
    if (rawLabelId) {
      const [labelRow] = await db.select({ id: labels.id }).from(labels).where(eq(labels.id, rawLabelId));
      if (labelRow) labelId = labelRow.id;
    }
    // Task #2435 — optional artist (Person) context, same contract as the
    // labelId above. A person page only ever sends personId; when present it
    // wins over labelId so the two stay mutually exclusive for one install.
    let personId = "";
    const rawPersonId = String(req.query.personId ?? "").trim();
    if (rawPersonId) {
      const [personRow] = await db.select({ id: people.id }).from(people).where(eq(people.id, rawPersonId));
      if (personRow) personId = personRow.id;
    }
    // Task #2435 — connecting a store to a specific label or artist is a
    // `map_shopify` action, so gate the install the same way attach/detach are.
    // This path is a top-level browser navigation (window.location.href), so
    // there's no Bearer header — the Lax admin session cookie rides along and
    // carries the operator identity. super_admin/admin auto-allow; a partner
    // needs the map_shopify verb on that label/artist scope. Context-less
    // installs (global Shopify page / Shopify-initiated) stay ungated.
    if (personId || labelId) {
      const userId = req.session?.userId;
      if (!userId) return res.status(401).send("Sign in as an operator to connect a store");
      const { checkPartnerVerbForScope } = await import("./auth/partnerPermissions");
      const scope = personId
        ? ({ kind: "artist", id: personId } as const)
        : ({ kind: "label", id: labelId } as const);
      const gateErr = await checkPartnerVerbForScope(userId, "map_shopify", scope);
      if (gateErr) return res.status(gateErr.status).send(typeof gateErr.body?.message === "string" ? gateErr.body.message : "Forbidden");
    }
    const nonce = randomBytes(16).toString("hex");
    // The signed payload is `nonce` (context-less), `nonce:labelId` (2-part,
    // Task #2030), or `nonce:person:<personId>` (3-part, Task #2435). labelId
    // and personId are uuids (no `:`) and nonce is hex, so split-on-`:`
    // round-trips cleanly and old `nonce.sig` states stay valid.
    const statePayload = personId
      ? `${nonce}:person:${personId}`
      : labelId
        ? `${nonce}:${labelId}`
        : nonce;
    const stateSig = createHmac("sha256", SHOPIFY_API_SECRET).update(statePayload).digest("hex").slice(0, 16);
    const state = `${statePayload}.${stateSig}`;
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
    // The signed payload is everything before the LAST dot (the signature
    // never contains a dot), so a `nonce:labelId` payload round-trips. Old
    // `nonce.sig` states still verify (payload = nonce, labelId undefined).
    const dotIdx = state.lastIndexOf(".");
    const statePayload = dotIdx >= 0 ? state.slice(0, dotIdx) : "";
    const sig = dotIdx >= 0 ? state.slice(dotIdx + 1) : "";
    const expectedSig = createHmac("sha256", SHOPIFY_API_SECRET).update(statePayload).digest("hex").slice(0, 16);
    if (!statePayload || !sig || sig !== expectedSig) return res.status(400).send("State mismatch");
    if (!verifyOAuthHmac(req.query as Record<string, any>)) return res.status(400).send("HMAC failed");
    // Recover the (already-validated-at-install-time) association context so
    // we can stamp the store + return the operator to where they started.
    //   `nonce:person:<id>` (3-part) → artist context   (Task #2435)
    //   `nonce:<labelId>`   (2-part) → label context     (Task #2030)
    //   `nonce`             (1-part) → global / legacy
    const stateParts = statePayload.split(":");
    let stateLabelId = "";
    let statePersonId = "";
    if (stateParts.length === 3 && stateParts[1] === "person") {
      statePersonId = stateParts[2];
    } else if (stateParts.length === 2) {
      stateLabelId = stateParts[1];
    }

    // Task #2435 — defense in depth: the signed state is only ever minted by
    // the (now gated) install route, but re-verify the operator still holds
    // map_shopify on the target label/artist before we stamp the store. The
    // callback is a top-level nav back from Shopify, so the Lax admin session
    // cookie is present. Context-less (global / Shopify-initiated) states skip
    // this, exactly like install.
    if (statePersonId || stateLabelId) {
      const userId = req.session?.userId;
      if (!userId) return res.status(401).send("Sign in as an operator to finish connecting the store");
      const { checkPartnerVerbForScope } = await import("./auth/partnerPermissions");
      const scope = statePersonId
        ? ({ kind: "artist", id: statePersonId } as const)
        : ({ kind: "label", id: stateLabelId } as const);
      const gateErr = await checkPartnerVerbForScope(userId, "map_shopify", scope);
      if (gateErr) return res.status(gateErr.status).send(typeof gateErr.body?.message === "string" ? gateErr.body.message : "Forbidden");
    }

    // Exchange the authorization code for an access token. `expiring: "1"`
    // opts into Shopify's expiring offline tokens (required as of the Dec 2025
    // cutover — non-expiring offline tokens are rejected by the Admin API).
    // The response carries a 1-hour access token plus a ~90-day refresh token
    // we persist and rotate in shopifyFetch.
    const tokenRes = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ client_id: SHOPIFY_API_KEY, client_secret: SHOPIFY_API_SECRET, code, expiring: "1" }),
    });
    if (!tokenRes.ok) {
      console.error(`[shopify-oauth] token exchange failed for ${shop}: ${tokenRes.status}`);
      return res.status(500).send("Token exchange failed");
    }
    const tokenJson = (await tokenRes.json()) as {
      access_token: string;
      scope: string;
      expires_in?: number;
      refresh_token?: string;
      refresh_token_expires_in?: number;
    };
    const tokenIssuedAtMs = Date.now();

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
      refreshToken: tokenJson.refresh_token ?? null,
      accessTokenExpiresAt: tokenJson.expires_in
        ? new Date(tokenIssuedAtMs + tokenJson.expires_in * 1000)
        : null,
      refreshTokenExpiresAt: tokenJson.refresh_token_expires_in
        ? new Date(tokenIssuedAtMs + tokenJson.refresh_token_expires_in * 1000)
        : null,
      labelId: stateLabelId || undefined,
      personId: statePersonId || undefined,
    });

    // Best-effort post-install setup. If it fails, the admin can hit
    // the /api/admin/shopify/stores/:id/reinstall-hooks endpoint to retry.
    // Post-purchase display is handled by the Checkout UI Extension
    // (extensions/goodtunes-redemption) — no ScriptTag install anymore.
    const appUrl = appOrigin(req);
    await registerWebhooks(store, appUrl);

    // Drop the operator back where they started: the artist's Overview tab
    // (Task #2435), the label's Shopify tab (Task #2030), otherwise the
    // global admin install guide. All key their success toast off
    // ?installed=<id>.
    if (statePersonId) {
      res.redirect(`/admin/people/${statePersonId}?tab=overview&installed=${store.id}`);
    } else if (stateLabelId) {
      res.redirect(`/admin/labels/${stateLabelId}?tab=shopify&installed=${store.id}`);
    } else {
      res.redirect(`/admin/shopify?installed=${store.id}`);
    }
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
          .set({
            uninstalledAt: new Date(),
            accessToken: "",
            refreshToken: null,
            accessTokenExpiresAt: null,
            refreshTokenExpiresAt: null,
          })
          .where(eq(shopifyStores.id, store.id));
      }
      res.json({ received: true });
    } catch (e: any) {
      console.error(`[shopify-webhook] handler failed topic=${topic}`, e?.message);
      res.status(500).json({ message: "Handler failed" });
    }
  });

  // ─── GDPR mandatory compliance webhooks ───────────────────────────
  // Required for Shopify public app review. Shopify signs these with the
  // same X-Shopify-Hmac-Sha256 / SHOPIFY_API_SECRET as merchant webhooks.
  // URLs are configured in Partner Dashboard → App setup (not via the
  // Admin API). All three fall under the express.raw() mount already
  // applied to /api/webhooks/shopify in server/index.ts.
  //
  // Verification helper shared by all three endpoints. Returns the raw
  // Buffer on success or sends a 401/500 and returns null on failure.
  function verifyGdprWebhook(req: Request, res: Response): Buffer | null {
    const raw = req.body as Buffer;
    const headerHmac = req.headers["x-shopify-hmac-sha256"] as string | undefined;
    if (SHOPIFY_API_SECRET) {
      if (!verifyWebhookHmac(raw, headerHmac)) {
        console.error(
          `[shopify-gdpr] HMAC failed from shop=${req.headers["x-shopify-shop-domain"] ?? "unknown"}`,
        );
        res.status(401).json({ message: "Invalid signature" });
        return null;
      }
    } else if (process.env.NODE_ENV === "production") {
      res.status(500).json({ message: "Shopify webhook secret not configured" });
      return null;
    } else {
      console.warn("[shopify-gdpr] DEV: accepting unsigned GDPR payload (no SHOPIFY_API_SECRET)");
    }
    return raw;
  }

  // customers/data_request — Shopify asks us to compile all personal data
  // we hold for a customer of the requesting shop so the merchant can return
  // it to the data subject. We compile the relevant rows, log them (so the
  // operator can retrieve from server logs within Shopify's 30-day window),
  // and return 200. No data leaves via the webhook response body.
  app.post("/api/webhooks/shopify/customers/data_request", async (req, res) => {
    const raw = verifyGdprWebhook(req, res);
    if (!raw) return;

    let payload: any;
    try {
      payload = JSON.parse(raw.toString("utf8"));
    } catch {
      return res.status(400).json({ message: "Bad JSON" });
    }

    const shopDomain = String(payload.shop_domain ?? "").toLowerCase();
    const customer = payload.customer ?? {};
    const customerEmail = String(customer.email ?? "").toLowerCase();
    const shopifyOrderIds: string[] = (payload.orders_requested ?? []).map(String);

    // Shopify populates orders_requested only for the specific customer's orders.
    // An empty list means this customer has no orders in the store — nothing to compile.
    if (shopifyOrderIds.length === 0) {
      console.log(`[shopify-gdpr] data_request: no orders_requested for shop=${shopDomain} customer=${customerEmail} — no data held`);
      return res.json({ received: true });
    }

    try {
      const store = await getStoreByDomain(shopDomain);
      if (!store) {
        console.log(`[shopify-gdpr] data_request: unknown shop ${shopDomain} — no data held`);
        return res.json({ received: true });
      }

      const storeOrders = await db
        .select({
          id: orders.id,
          shopifyOrderId: orders.shopifyOrderId,
          status: orders.status,
          albumId: orders.albumId,
          totalCents: orders.totalCents,
          createdAt: orders.createdAt,
          customerId: orders.customerId,
          buyerEmail: orders.buyerEmail,
          buyerName: orders.buyerName,
          buyerPhone: orders.buyerPhone,
          shippingAddress: orders.shippingAddress,
          billingAddress: orders.billingAddress,
        })
        .from(orders)
        .where(
          and(eq(orders.shopifyStoreId, store.id), inArray(orders.shopifyOrderId, shopifyOrderIds)),
        );

      const storeOrderIds = storeOrders.map((o) => o.id);

      // Redemption codes tied to the specified orders.
      const codes = storeOrderIds.length > 0
        ? await db
            .select({ orderId: shopifyRedemptionCodes.orderId, code: shopifyRedemptionCodes.code })
            .from(shopifyRedemptionCodes)
            .where(inArray(shopifyRedemptionCodes.orderId, storeOrderIds))
        : [];

      let fan: (typeof customerUsers.$inferSelect) | null = null;
      if (customerEmail) {
        const [row] = await db.select().from(customerUsers).where(eq(customerUsers.email, customerEmail));
        fan = row ?? null;
      }

      // Album unlock grants scoped to the albums on the requesting store's orders.
      // We do NOT return all of the fan's unlocks — only those provably tied to
      // this merchant's transactions (same album IDs as the validated store orders).
      const storeAlbumIds = [...new Set(storeOrders.map((o) => o.albumId).filter(Boolean))];
      const unlocks = fan && storeAlbumIds.length > 0
        ? await db
            .select({ albumId: userAlbums.albumId, grantedAt: userAlbums.grantedAt })
            .from(userAlbums)
            .where(and(eq(userAlbums.userId, fan.id), inArray(userAlbums.albumId, storeAlbumIds)))
        : [];

      const compiled = {
        shopDomain,
        shopifyCustomerId: customer.id,
        email: customerEmail,
        goodtunesCustomerId: fan?.id ?? null,
        displayName: fan?.displayName ?? null,
        contactEmail: fan?.contactEmail ?? null,
        phone: fan?.phone ?? null,
        shippingAddress: fan?.shippingAddress ?? null,
        billingAddress: fan?.billingAddress ?? null,
        albumUnlocks: unlocks.map((u) => ({ albumId: u.albumId, grantedAt: u.grantedAt })),
        orders: storeOrders.map((o) => ({
          goodtunesOrderId: o.id,
          shopifyOrderId: o.shopifyOrderId,
          status: o.status,
          albumId: o.albumId,
          totalCents: o.totalCents,
          createdAt: o.createdAt,
          buyerEmail: o.buyerEmail,
          buyerName: o.buyerName,
          buyerPhone: o.buyerPhone,
          shippingAddress: o.shippingAddress,
          billingAddress: o.billingAddress,
          redemptionCode: codes.find((c) => c.orderId === o.id)?.code ?? null,
        })),
      };

      // Persist to the DB so the operator can retrieve it via the admin UI
      // within Shopify's required 30-day window. Still log for operational
      // tracing, but the DB row is the retrievable record.
      await db.insert(shopifyGdprRequests).values({
        shopDomain,
        customerEmail,
        shopifyCustomerId: customer.id ? String(customer.id) : null,
        compiledData: compiled,
      });
      console.log(`[shopify-gdpr] data_request stored for shop=${shopDomain} customer=${customerEmail}`);
      res.json({ received: true });
    } catch (e: any) {
      console.error(`[shopify-gdpr] data_request error shop=${shopDomain}:`, e?.message);
      res.status(500).json({ message: "Handler failed" });
    }
  });

  // ─── Admin: list GDPR data requests ────────────────────────────────────
  app.get("/api/admin/shopify/gdpr-requests", requireAdmin, async (_req, res) => {
    try {
      const rows = await db
        .select()
        .from(shopifyGdprRequests)
        .orderBy(desc(shopifyGdprRequests.requestedAt));
      res.json(rows);
    } catch (e: any) {
      console.error("[shopify-gdpr] list error:", e?.message);
      res.status(500).json({ message: "Failed to load GDPR requests" });
    }
  });

  // ─── Admin: mark a GDPR request fulfilled ──────────────────────────────
  app.post("/api/admin/shopify/gdpr-requests/:id/fulfill", requireAdmin, async (req, res) => {
    const { id } = req.params;
    try {
      const [updated] = await db
        .update(shopifyGdprRequests)
        .set({ fulfilledAt: new Date() })
        .where(and(eq(shopifyGdprRequests.id, id), isNull(shopifyGdprRequests.fulfilledAt)))
        .returning();
      if (!updated) return res.status(404).json({ message: "Request not found or already fulfilled" });
      res.json(updated);
    } catch (e: any) {
      console.error("[shopify-gdpr] fulfill error:", e?.message);
      res.status(500).json({ message: "Failed to mark request fulfilled" });
    }
  });

  // customers/redact — Shopify instructs us to delete or anonymize all
  // personal data we hold for a specific customer that originated from the
  // requesting shop. We:
  //   1. Clear shopify_order_token on the specified orders (removes the
  //      credential that gates the public redemption-by-order endpoint).
  //   2. Delete one-time redemption codes for those orders.
  //   3. If the fan's account was created solely through this shop (no
  //      other orders anywhere in GoodTunes), anonymize the customer_users
  //      row in place.
  app.post("/api/webhooks/shopify/customers/redact", async (req, res) => {
    const raw = verifyGdprWebhook(req, res);
    if (!raw) return;

    let payload: any;
    try {
      payload = JSON.parse(raw.toString("utf8"));
    } catch {
      return res.status(400).json({ message: "Bad JSON" });
    }

    const shopDomain = String(payload.shop_domain ?? "").toLowerCase();
    const customer = payload.customer ?? {};
    const customerEmail = String(customer.email ?? "").toLowerCase();
    const shopifyOrderIds: string[] = (payload.orders_to_redact ?? []).map(String);

    // Shopify populates orders_to_redact only for the specific customer's orders.
    // An empty list means this customer has no orders in the store — nothing to redact.
    if (shopifyOrderIds.length === 0) {
      console.log(`[shopify-gdpr] customers/redact: no orders_to_redact for shop=${shopDomain} customer=${customerEmail} — nothing to redact`);
      return res.json({ received: true });
    }

    try {
      const store = await getStoreByDomain(shopDomain);
      if (!store) {
        console.log(`[shopify-gdpr] customers/redact: unknown shop ${shopDomain} — nothing to redact`);
        return res.json({ received: true });
      }

      const affectedOrders = await db
        .select({ id: orders.id, customerId: orders.customerId })
        .from(orders)
        .where(
          and(eq(orders.shopifyStoreId, store.id), inArray(orders.shopifyOrderId, shopifyOrderIds)),
        );

      const orderIds = affectedOrders.map((o) => o.id);

      if (orderIds.length > 0) {
        // Clear the Shopify order token (the public redemption endpoint credential)
        // and scrub all PII fields captured on the order rows at checkout.
        await db
          .update(orders)
          .set({
            shopifyOrderToken: null,
            buyerEmail: null,
            buyerName: null,
            buyerPhone: null,
            shippingAddress: null,
            billingAddress: null,
          })
          .where(inArray(orders.id, orderIds));
        // Delete one-time redemption codes — these are PII-adjacent credentials
        // tying a Shopify transaction to a fan.
        await db.delete(shopifyRedemptionCodes).where(inArray(shopifyRedemptionCodes.orderId, orderIds));
      }

      // For each affected customer, check if they have any orders outside this
      // shop. If not, they're shop-only and we anonymize the account row.
      const customerIds = [...new Set(affectedOrders.map((o) => o.customerId).filter(Boolean))] as string[];
      let anonymized = 0;
      // orderIds is always non-empty here because we early-exited on empty
      // shopifyOrderIds above and customerIds derives from affectedOrders.
      for (const customerId of customerIds) {
        const [extraOrder] = await db
          .select({ id: orders.id })
          .from(orders)
          .where(and(eq(orders.customerId, customerId), not(inArray(orders.id, orderIds))))
          .limit(1);

        if (!extraOrder) {
          await db
            .update(customerUsers)
            .set({
              email: `redacted-${customerId}@shopify-gdpr.invalid`,
              username: `redacted-${customerId}`,
              displayName: "Redacted",
              realName: null,
              contactEmail: null,
              contactPhone: null,
              phone: null,
              phoneE164: null,
              billingAddress: null,
              shippingAddress: null,
              stripeCustomerId: null,
            })
            .where(eq(customerUsers.id, customerId));
          anonymized++;
        }
      }

      console.log(
        `[shopify-gdpr] customers/redact: shop=${shopDomain} customer=${customerEmail}` +
        ` orders=${orderIds.length} anonymized_accounts=${anonymized}`,
      );
      res.json({ received: true });
    } catch (e: any) {
      console.error(`[shopify-gdpr] customers/redact error shop=${shopDomain}:`, e?.message);
      res.status(500).json({ message: "Handler failed" });
    }
  });

  // shop/redact — Fires ~48 h after the merchant uninstalls the app.
  // Shopify instructs us to purge all data we hold for the store. We:
  //   1. Disassociate orders from the store (null shopify_store_id) and
  //      clear their order tokens.
  //   2. Delete redemption codes for all store orders.
  //   3. Anonymize any fan account whose only orders came from this store.
  //   4. Delete the shopify_stores row, cascading to shopify_product_mappings
  //      and platform_wholesale_ledger.
  app.post("/api/webhooks/shopify/shop/redact", async (req, res) => {
    const raw = verifyGdprWebhook(req, res);
    if (!raw) return;

    let payload: any;
    try {
      payload = JSON.parse(raw.toString("utf8"));
    } catch {
      return res.status(400).json({ message: "Bad JSON" });
    }

    const shopDomain = String(payload.shop_domain ?? "").toLowerCase();

    try {
      const store = await getStoreByDomain(shopDomain);
      if (!store) {
        console.log(`[shopify-gdpr] shop/redact: unknown shop ${shopDomain} — nothing to redact`);
        return res.json({ received: true });
      }

      const storeOrders = await db
        .select({ id: orders.id, customerId: orders.customerId })
        .from(orders)
        .where(eq(orders.shopifyStoreId, store.id));

      const orderIds = storeOrders.map((o) => o.id);

      // Identify shop-only customers BEFORE we disassociate orders (otherwise
      // we can't distinguish them from direct orders by storeId afterward).
      const customerIds = [...new Set(storeOrders.map((o) => o.customerId).filter(Boolean))] as string[];
      const shopOnlyCustomers = new Set<string>();
      for (const customerId of customerIds) {
        const [extraOrder] = orderIds.length > 0
          ? await db
              .select({ id: orders.id })
              .from(orders)
              .where(and(eq(orders.customerId, customerId), not(inArray(orders.id, orderIds))))
              .limit(1)
          : [];
        if (!extraOrder) shopOnlyCustomers.add(customerId);
      }

      if (orderIds.length > 0) {
        // Disassociate orders from the store, clear tokens, and scrub all
        // PII fields captured on the order rows at Shopify checkout.
        await db
          .update(orders)
          .set({
            shopifyStoreId: null,
            shopifyOrderToken: null,
            buyerEmail: null,
            buyerName: null,
            buyerPhone: null,
            shippingAddress: null,
            billingAddress: null,
          })
          .where(inArray(orders.id, orderIds));
        // Delete redemption codes (FK on orders.id, not on store).
        await db.delete(shopifyRedemptionCodes).where(inArray(shopifyRedemptionCodes.orderId, orderIds));
      }

      // Anonymize shop-only fan accounts.
      for (const customerId of shopOnlyCustomers) {
        await db
          .update(customerUsers)
          .set({
            email: `redacted-${customerId}@shopify-gdpr.invalid`,
            username: `redacted-${customerId}`,
            displayName: "Redacted",
            realName: null,
            contactEmail: null,
            contactPhone: null,
            phone: null,
            phoneE164: null,
            billingAddress: null,
            shippingAddress: null,
            stripeCustomerId: null,
          })
          .where(eq(customerUsers.id, customerId));
      }

      // Delete the store row — cascades to shopify_product_mappings and
      // platform_wholesale_ledger (both have ON DELETE CASCADE to this row).
      await db.delete(shopifyStores).where(eq(shopifyStores.id, store.id));

      console.log(
        `[shopify-gdpr] shop/redact: shop=${shopDomain} orders=${orderIds.length}` +
        ` anonymized_accounts=${shopOnlyCustomers.size} store_deleted=true`,
      );
      res.json({ received: true });
    } catch (e: any) {
      console.error(`[shopify-gdpr] shop/redact error shop=${shopDomain}:`, e?.message);
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
      // Task #1460 — qualifying LLT release also unlocks the bonus album.
      await grantLltBonusIfEligible(db, a.userId, order.albumId);
    }
    await db
      .update(shopifyRedemptionCodes)
      .set({ redeemedAt: row.redeemedAt ?? new Date(), redeemedByUserId: a.userId })
      .where(eq(shopifyRedemptionCodes.code, row.code));
    res.json({ ok: true, orderId: order.id, albumId: order.albumId, goodDeedNumber: order.goodDeedNumber });
  });

  // ─── Checkout UI extension poll: is the redemption code ready? ────────
  // GET /api/shopify/redemption-status?orderId=<numeric>&confirmation=<n>
  // Called by extensions/goodtunes-redemption from the thank-you page and
  // the customer-account order-status page (neither surface can read
  // ORDER metafields — AppMetafieldEntryTarget has no 'order' owner — so
  // this endpoint is the extension's data channel; the metafield stays as
  // the durable record). Auth = the extension's Shopify session token
  // (HS256, signed with our app secret; `dest` names the shop). The
  // endpoint answers {ready:false} freely, but the code itself is only
  // released when the caller also presents the order's confirmation
  // number (which Shopify shows only to the buyer) — a valid session
  // token proves shop+app context, not order ownership, and numeric
  // order ids are enumerable.
  const extensionCors = (res: Response) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  };
  app.options("/api/shopify/redemption-status", (_req, res) => {
    extensionCors(res);
    res.sendStatus(204);
  });
  app.get("/api/shopify/redemption-status", async (req, res) => {
    extensionCors(res);
    try {
      const auth = String(req.headers.authorization ?? "");
      const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
      if (!token) return res.status(401).json({ message: "Missing session token" });
      let shopDomain = "";
      try {
        const { payload } = await jwtVerify(token, new TextEncoder().encode(SHOPIFY_API_SECRET), {
          algorithms: ["HS256"],
          clockTolerance: 10,
        });
        const aud = Array.isArray(payload.aud) ? payload.aud[0] : payload.aud;
        if (aud !== SHOPIFY_API_KEY) return res.status(401).json({ message: "Bad audience" });
        shopDomain = new URL(String(payload.dest ?? "")).hostname;
      } catch {
        return res.status(401).json({ message: "Invalid session token" });
      }
      const store = await getStoreByDomain(shopDomain);
      if (!store) return res.status(404).json({ message: "Unknown store" });
      const orderId = String(req.query.orderId ?? "").replace(/\D/g, "");
      if (!orderId) return res.status(400).json({ message: "orderId required" });
      const [order] = await db
        .select()
        .from(orders)
        .where(and(eq(orders.shopifyOrderId, orderId), eq(orders.shopifyStoreId, store.id)));
      if (!order) return res.json({ ready: false });
      const [row] = await db
        .select()
        .from(shopifyRedemptionCodes)
        .where(eq(shopifyRedemptionCodes.orderId, order.id));
      if (!row) return res.json({ ready: false });
      // Code exists — require proof of order ownership before releasing it.
      const provided = String(req.query.confirmation ?? "").trim().toUpperCase();
      const expected = (order.shopifyConfirmationNumber ?? "").trim().toUpperCase();
      if (!expected || !provided || provided !== expected) {
        return res.status(403).json({ message: "Confirmation number mismatch" });
      }
      return res.json({
        ready: true,
        code: row.code,
        url: `https://${GOODTUNES_FAN_HOST}/redeem/${row.code}`,
      });
    } catch (e: any) {
      console.error(`[shopify] redemption-status failed: ${e?.message ?? e}`);
      return res.status(500).json({ message: "Internal error" });
    }
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
    // Synthesize a stable fake Shopify order id so a repeat mint with
    // the same email + album collapses idempotently.
    const fakeShopifyOrderId = `dev-${albumId.slice(0, 8)}-${buyerEmail}`;
    const [existing] = await db.select().from(orders).where(eq(orders.shopifyOrderId, fakeShopifyOrderId));
    if (existing) {
      const [existingCode] = await db.select().from(shopifyRedemptionCodes).where(eq(shopifyRedemptionCodes.orderId, existing.id));
      if (existingCode) return res.json({ code: existingCode.code, orderId: existing.id, reused: true });
    }

    // Task #551 — Mint + insert wrapped in the retry helper so the
    // dev path exercises the same code path as the real webhook.
    const { withRetryOnGoodDeedCollision } = await import("./commerce");
    const order = await withRetryOnGoodDeedCollision(albumId, async () => {
      const goodDeedNumber = await assignNextGoodDeedNumberForAlbum(albumId);
      const [row] = await db
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
      return row;
    });
    if (order) {
      const { stampFirstSoldAtIfNeeded } = await import("./auth/partnerPermissions");
      await stampFirstSoldAtIfNeeded(albumId);
    }
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
    // Task #1460 — qualifying LLT release also unlocks the bonus album.
    await grantLltBonusIfEligible(db, customerId, albumId);
    const code = generateRedemptionCode();
    await db.insert(shopifyRedemptionCodes).values({ code, orderId: order.id });
    res.json({ code, orderId: order.id, reused: false });
  });

  // ─── Admin: browse a connected store's products (Task #2432) ───────
  // Backs the album Shopify tab's product picker — an operator chooses a
  // store, then browses/searches its live catalog instead of hunting down
  // a product URL to paste. Two modes:
  //   - No `search`: cursor-paginated (Shopify's Link-header page_info),
  //     20 at a time, newest-first (REST default).
  //   - `search`: Shopify's REST `title` filter is exact-match, not a
  //     substring search, so we instead pull a larger page (up to 250)
  //     and filter case-insensitively in-process. Single-page best-effort
  //     — fine for the store sizes this picker targets.
  app.get("/api/admin/shopify/stores/:storeId/products", requireAdmin, async (req, res) => {
    const storeId = String(req.params.storeId);
    const store = await getStoreById(storeId);
    if (!store) return res.status(404).json({ message: "Store not found" });
    // Task #2435 — browsing a store's catalog is part of the map_shopify flow
    // (you browse in order to map a product to a release), so gate it on the
    // store's owning scope. requireAdmin already resolved the caller from the
    // Bearer token (this endpoint has no session). super_admin/admin auto-allow;
    // a partner needs map_shopify on the label/artist that owns this store; an
    // unattached store (no owner) is operator-only.
    {
      const adminUserId = (req as any).adminUser?.id as string | undefined;
      if (!adminUserId) return res.status(401).json({ message: "Sign in required" });
      if (store.personId || store.labelId) {
        const { checkPartnerVerbForScope } = await import("./auth/partnerPermissions");
        const scope = store.personId
          ? ({ kind: "artist", id: store.personId } as const)
          : ({ kind: "label", id: store.labelId as string } as const);
        const gateErr = await checkPartnerVerbForScope(adminUserId, "map_shopify", scope);
        if (gateErr) return res.status(gateErr.status).json(gateErr.body);
      } else {
        const { getUserRole } = await import("./auth/roles");
        const role = await getUserRole(adminUserId);
        if (role?.role !== "super_admin" && role?.role !== "admin") {
          return res.status(403).json({ message: "Out of scope" });
        }
      }
    }
    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
    const cursor = typeof req.query.cursor === "string" ? req.query.cursor.trim() : "";

    // GraphQL `products` query (Phase 3). Search keeps the pre-migration
    // behavior: pull a big page of active products and title-filter
    // client-side (Shopify's `title:` search token is prefix-anchored and
    // missed mid-word matches, which is why the REST version filtered in
    // JS too). Browse mode pages 20 at a time via cursor.
    let data: { products: { nodes: GqlProductNode[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } } };
    try {
      data = await shopifyGraphql(
        store,
        /* GraphQL */ `
          query products($first: Int!, $after: String, $query: String) {
            products(first: $first, after: $after, query: $query, sortKey: TITLE) {
              nodes { ${PRODUCT_FIELDS} }
              pageInfo { hasNextPage endCursor }
            }
          }
        `,
        {
          first: search ? 250 : 20,
          after: !search && cursor ? cursor : null,
          query: "status:active",
        },
      );
    } catch (e: any) {
      // A 401/403 after shopifyGraphql's proactive + reactive refresh means
      // the token can't be revived — a legacy non-expiring install, or the
      // refresh token lapsed/was revoked. Tell the operator to reconnect
      // (the existing OAuth install flow IS the reconnect). Other failures
      // (429/5xx/GraphQL errors) are transient — surface for diagnosability.
      if (e?.status === 401 || e?.status === 403) {
        return res.status(409).json({
          code: "shopify_reconnect_required",
          message: "Reconnect this Shopify store to continue.",
        });
      }
      console.error(`[shopify] products query failed store=${store.shopDomain}: ${e?.message ?? e}`);
      return res.status(502).json({ message: "Couldn't fetch products from Shopify" });
    }

    let products = data.products.nodes.map(gqlProductToRest);
    if (search) {
      const needle = search.toLowerCase();
      products = products.filter((p) => p.title.toLowerCase().includes(needle));
    }
    const nextCursor = !search && data.products.pageInfo.hasNextPage ? data.products.pageInfo.endCursor : null;

    res.json({
      products: products.map((p) => ({
        id: String(p.id),
        title: p.title,
        // Task #2435 — surfaced so the artist product browser can offer a
        // lightweight client-side product-type filter over loaded items.
        productType: p.product_type || null,
        image: p.image?.src ?? null,
        variants: p.variants.map((v) => ({
          id: String(v.id),
          title: v.title,
          price: v.price,
        })),
      })),
      nextCursor,
    });
  });

  // ─── Admin: list connected stores ─────────────────────────────────
  // Joins the owning label (Task #2030) so the global Shopify page can
  // attribute each store to its label without a second round-trip.
  app.get("/api/admin/shopify/stores", requireAdmin, async (_req, res) => {
    const rows = await db
      .select({ s: shopifyStores, labelName: labels.name })
      .from(shopifyStores)
      .leftJoin(labels, eq(shopifyStores.labelId, labels.id))
      .orderBy(desc(shopifyStores.installedAt));
    res.json(rows.map((r) => ({ ...r.s, accessToken: undefined, labelName: r.labelName ?? null })));
  });

  app.delete("/api/admin/shopify/stores/:id", requireAdmin, async (req, res) => {
    await db.delete(shopifyStores).where(eq(shopifyStores.id, String(req.params.id)));
    res.json({ ok: true });
  });

  // Re-register webhooks + script tag for an already-installed store.
  // Useful after a reinstall that failed mid-way (e.g. network blip during
  // the OAuth callback), or when the operator wants to verify the hooks are
  // live without re-running the full OAuth flow. Idempotent on Shopify's
  // side — a 422 "Address has already been taken" from a duplicate webhook
  // registration means it was already there, which is success.
  app.post("/api/admin/shopify/stores/:id/reinstall-hooks", requireAdmin, async (req, res) => {
    const storeId = String(req.params.id);
    const store = await getStoreById(storeId);
    if (!store) return res.status(404).json({ message: "Store not found" });
    if (store.uninstalledAt || !store.accessToken) {
      return res.status(409).json({ message: "Store is uninstalled — re-run OAuth to reconnect it first" });
    }
    const appUrl = appOrigin(req);
    const webhookErrors: string[] = [];
    const topics = ["orders/paid", "orders/refunded", "refunds/create", "app/uninstalled"];
    const webhookResults: Record<string, string> = {};
    for (const topic of topics) {
      try {
        // "already_registered" (duplicate-address userError, GraphQL's
        // equivalent of the old REST 422) counts as success — the hook
        // was already live.
        webhookResults[topic] = await createWebhookSubscription(
          store,
          topic,
          `${appUrl}/api/webhooks/shopify/orders`,
        );
      } catch (e: any) {
        webhookResults[topic] = e?.status ? `error_${e.status}` : "exception";
        webhookErrors.push(`${topic}: ${e?.message}`);
      }
    }
    res.json({ ok: webhookErrors.length === 0, webhooks: webhookResults, errors: webhookErrors });
  });

  // Live install-state inspection — fetches the webhook list from the
  // Shopify Admin API so the operator can verify the install is healthy
  // without opening the Shopify admin UI. Returns a summary of expected
  // vs. found resources. Useful for the §4 hygiene checklist in
  // docs/shopify-app-review.md. (ScriptTag inspection removed — the
  // Checkout UI Extension replaced the order-status ScriptTag.)
  app.get("/api/admin/shopify/stores/:id/inspect", requireAdmin, async (req, res) => {
    const storeId = String(req.params.id);
    const store = await getStoreById(storeId);
    if (!store) return res.status(404).json({ message: "Store not found" });

    const dbRow = {
      id: store.id,
      shopDomain: store.shopDomain,
      storeName: store.storeName,
      installedAt: store.installedAt,
      uninstalledAt: store.uninstalledAt,
      hasAccessToken: !!store.accessToken,
      hasRefreshToken: !!store.refreshToken,
      accessTokenExpiresAt: store.accessTokenExpiresAt,
      scopes: store.scopes,
      labelId: store.labelId,
      personId: store.personId,
    };

    if (store.uninstalledAt || !store.accessToken) {
      return res.json({ dbRow, live: null, note: "Store is uninstalled — Shopify API not queried" });
    }

    const EXPECTED_TOPICS = ["orders/paid", "orders/refunded", "refunds/create", "app/uninstalled"];
    let webhooks: Array<{ id: string; topic: string; address: string | null }> = [];
    let liveError: string | null = null;

    try {
      // Admin GraphQL webhookSubscriptions (Phase 4) — helper returns the
      // REST-style topic strings this comparison was written against.
      webhooks = await listWebhookSubscriptions(store);
    } catch (e: any) {
      liveError = e?.status ? `webhooks API ${e.status}` : (e?.message ?? "fetch failed");
    }

    const foundTopics = webhooks.map((w) => w.topic);
    const missingTopics = EXPECTED_TOPICS.filter((t) => !foundTopics.includes(t));

    res.json({
      dbRow,
      live: liveError
        ? { error: liveError }
        : {
            webhookCount: webhooks.length,
            foundTopics,
            missingTopics,
            allWebhooksPresent: missingTopics.length === 0,
            healthy: missingTopics.length === 0,
          },
    });
  });

  // Update per-store settings — currently only digitalUnitFeeCents (the
  // per-unit fee GoodTunes bills the artist for each order that mints a
  // digital unlock). Returns the updated store row minus the access token.
  app.patch("/api/admin/shopify/stores/:id", requireAdmin, async (req, res) => {
    const storeId = String(req.params.id);
    const parsed = z.object({
      digitalUnitFeeCents: z.number().int().min(0).max(100_000).nullable().optional(),
    }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0]?.message ?? "Invalid body" });
    const updates: Record<string, unknown> = {};
    if (parsed.data.digitalUnitFeeCents !== undefined) {
      updates.digitalUnitFeeCents = parsed.data.digitalUnitFeeCents;
    }
    if (Object.keys(updates).length === 0) return res.status(400).json({ message: "Nothing to update" });
    const [updated] = await db
      .update(shopifyStores)
      .set(updates)
      .where(eq(shopifyStores.id, storeId))
      .returning();
    if (!updated) return res.status(404).json({ message: "Store not found" });
    res.json({ ...updated, accessToken: undefined });
  });

  // Fee ledger — accrued digital per-unit fees per store, grouped or
  // per-row. Returns rows with totals so the operator can review what
  // has been earned and what has been reversed (refunded). Query params:
  //   storeId — filter to a specific store
  //   since / until — ISO date strings for a time window
  //   grouped — if "true", collapse to one summary row per store
  app.get("/api/admin/shopify/fee-ledger", requireAdmin, async (req, res) => {
    const storeId = req.query.storeId ? String(req.query.storeId) : null;
    const since = req.query.since ? new Date(String(req.query.since)) : null;
    const until = req.query.until ? new Date(String(req.query.until)) : null;
    const grouped = req.query.grouped === "true";

    const conditions = [
      storeId ? eq(platformWholesaleLedger.storeId, storeId) : null,
      since ? sql`${platformWholesaleLedger.createdAt} >= ${since}` : null,
      until ? sql`${platformWholesaleLedger.createdAt} <= ${until}` : null,
    ].filter(Boolean) as any[];
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    if (grouped) {
      // Aggregate: per-store total accrued and total reversed
      const rows = await db
        .select({
          storeId: platformWholesaleLedger.storeId,
          storeName: shopifyStores.storeName,
          shopDomain: shopifyStores.shopDomain,
          totalAccruedCents: sql<number>`COALESCE(SUM(${platformWholesaleLedger.totalCents}),0)`,
          totalReversedCents: sql<number>`COALESCE(SUM(CASE WHEN ${platformWholesaleLedger.reversedAt} IS NOT NULL THEN ${platformWholesaleLedger.totalCents} ELSE 0 END),0)`,
          orderCount: sql<number>`COUNT(*)`,
          reversedCount: sql<number>`COUNT(${platformWholesaleLedger.reversedAt})`,
        })
        .from(platformWholesaleLedger)
        .leftJoin(shopifyStores, eq(platformWholesaleLedger.storeId, shopifyStores.id))
        .where(where)
        .groupBy(platformWholesaleLedger.storeId, shopifyStores.storeName, shopifyStores.shopDomain)
        .orderBy(desc(sql`SUM(${platformWholesaleLedger.totalCents})`));
      const result = rows.map((r) => ({
        ...r,
        netCents: Number(r.totalAccruedCents) - Number(r.totalReversedCents),
      }));
      return res.json(result);
    }

    // Per-row ledger entries
    const rows = await db
      .select({
        id: platformWholesaleLedger.id,
        orderId: platformWholesaleLedger.orderId,
        storeId: platformWholesaleLedger.storeId,
        storeName: shopifyStores.storeName,
        shopDomain: shopifyStores.shopDomain,
        albumId: platformWholesaleLedger.albumId,
        albumTitle: albums.title,
        unitFeeCents: platformWholesaleLedger.unitFeeCents,
        quantity: platformWholesaleLedger.quantity,
        totalCents: platformWholesaleLedger.totalCents,
        reversedAt: platformWholesaleLedger.reversedAt,
        createdAt: platformWholesaleLedger.createdAt,
      })
      .from(platformWholesaleLedger)
      .leftJoin(shopifyStores, eq(platformWholesaleLedger.storeId, shopifyStores.id))
      .leftJoin(albums, eq(platformWholesaleLedger.albumId, albums.id))
      .where(where)
      .orderBy(desc(platformWholesaleLedger.createdAt))
      .limit(500);
    res.json(rows);
  });

  // ─── Admin: label ↔ Shopify store (Task #2030) ────────────────────
  // The label page's Shopify tab reads this for connection status + a
  // per-album mapped/not-mapped summary. `store` is the store stamped with
  // this label (most recent install wins if more than one was attached);
  // `unattachedStores` lets the operator associate an already-connected
  // store that came in via the global page without label context.
  app.get("/api/admin/labels/:id/shopify", requireAdmin, async (req, res) => {
    const labelId = String(req.params.id);
    const [label] = await db.select({ id: labels.id, name: labels.name }).from(labels).where(eq(labels.id, labelId));
    if (!label) return res.status(404).json({ message: "Label not found" });

    const [store] = await db
      .select()
      .from(shopifyStores)
      .where(eq(shopifyStores.labelId, labelId))
      .orderBy(desc(shopifyStores.installedAt));

    // Stores connected without a label context — offered as "attach an
    // existing store" options. Excludes stores already tied to a label.
    const unattached = await db
      .select({ id: shopifyStores.id, shopDomain: shopifyStores.shopDomain, storeName: shopifyStores.storeName })
      .from(shopifyStores)
      .where(isNull(shopifyStores.labelId))
      .orderBy(desc(shopifyStores.installedAt));

    // This label's albums + whether each is mapped to a Shopify product on
    // the connected store. No store = nothing can be mapped yet.
    const labelAlbums = await db
      .select({ id: albums.id, title: albums.title, artist: albums.artist, artwork: albums.artwork })
      .from(albums)
      .where(and(eq(albums.labelId, labelId), isNull(albums.deletedAt)))
      .orderBy(desc(albums.year));

    let mappedIds = new Set<string>();
    if (store && labelAlbums.length > 0) {
      const mapRows = await db
        .select({ albumId: shopifyProductMappings.albumId })
        .from(shopifyProductMappings)
        .where(
          and(
            eq(shopifyProductMappings.storeId, store.id),
            inArray(shopifyProductMappings.albumId, labelAlbums.map((a) => a.id)),
          ),
        );
      mappedIds = new Set(mapRows.map((m) => m.albumId));
    }

    const albumSummary = labelAlbums.map((a) => ({ ...a, mapped: mappedIds.has(a.id) }));
    res.json({
      configured: shopifyConfigured(),
      store: store
        ? {
            id: store.id,
            shopDomain: store.shopDomain,
            storeName: store.storeName,
            scopes: store.scopes,
            installedAt: store.installedAt,
            uninstalledAt: store.uninstalledAt,
            connected: store.uninstalledAt == null,
          }
        : null,
      unattachedStores: unattached,
      albums: albumSummary,
      mappedCount: albumSummary.filter((a) => a.mapped).length,
      totalCount: albumSummary.length,
    });
  });

  // Attach an already-connected store to this label. A store belongs to at
  // most one label, so we first clear any other store currently pointing
  // here, then stamp the chosen one.
  app.post("/api/admin/labels/:id/shopify/attach", requireAdmin, async (req, res) => {
    const labelId = String(req.params.id);
    const storeId = z.string().min(1).parse(req.body?.storeId);
    const [label] = await db.select({ id: labels.id }).from(labels).where(eq(labels.id, labelId));
    if (!label) return res.status(404).json({ message: "Label not found" });
    const store = await getStoreById(storeId);
    if (!store) return res.status(404).json({ message: "Store not found" });
    await db.update(shopifyStores).set({ labelId: null }).where(eq(shopifyStores.labelId, labelId));
    await db.update(shopifyStores).set({ labelId }).where(eq(shopifyStores.id, storeId));
    res.json({ ok: true });
  });

  // Disassociate this label's store(s). The store row + its order history
  // stay intact; only the label link is cleared.
  app.post("/api/admin/labels/:id/shopify/detach", requireAdmin, async (req, res) => {
    const labelId = String(req.params.id);
    await db.update(shopifyStores).set({ labelId: null }).where(eq(shopifyStores.labelId, labelId));
    res.json({ ok: true });
  });

  // ─── Admin: artist (Person) ↔ Shopify store (Task #2435) ──────────
  // The artist's Overview Shopify section reads this for connection status +
  // a per-release mapped/not-mapped summary. Mirrors the label block above
  // on the independent `personId` axis. `store` is the store stamped with
  // this person (most recent install wins); `unattachedStores` lets the
  // operator attach an already-connected store with no person context yet.
  app.get("/api/admin/people/:id/shopify", requireAdmin, async (req, res) => {
    const personId = String(req.params.id);
    const [person] = await db.select({ id: people.id, name: people.name }).from(people).where(eq(people.id, personId));
    if (!person) return res.status(404).json({ message: "Person not found" });

    const [store] = await db
      .select()
      .from(shopifyStores)
      .where(eq(shopifyStores.personId, personId))
      .orderBy(desc(shopifyStores.installedAt));

    // Stores connected without an artist context — offered as "attach an
    // existing store" options. Excludes stores already tied to a person.
    const unattached = await db
      .select({ id: shopifyStores.id, shopDomain: shopifyStores.shopDomain, storeName: shopifyStores.storeName })
      .from(shopifyStores)
      .where(isNull(shopifyStores.personId))
      .orderBy(desc(shopifyStores.installedAt));

    // This artist's releases (albums where they are the primary artist) +
    // whether each is mapped to a Shopify product on the connected store.
    const artistAlbums = await db
      .select({ id: albums.id, title: albums.title, artist: albums.artist, artwork: albums.artwork })
      .from(albums)
      .where(and(eq(albums.primaryArtistId, personId), isNull(albums.deletedAt)))
      .orderBy(desc(albums.year));

    let mappedIds = new Set<string>();
    if (store && artistAlbums.length > 0) {
      const mapRows = await db
        .select({ albumId: shopifyProductMappings.albumId })
        .from(shopifyProductMappings)
        .where(
          and(
            eq(shopifyProductMappings.storeId, store.id),
            inArray(shopifyProductMappings.albumId, artistAlbums.map((a) => a.id)),
          ),
        );
      mappedIds = new Set(mapRows.map((m) => m.albumId));
    }

    const albumSummary = artistAlbums.map((a) => ({ ...a, mapped: mappedIds.has(a.id) }));
    res.json({
      configured: shopifyConfigured(),
      store: store
        ? {
            id: store.id,
            shopDomain: store.shopDomain,
            storeName: store.storeName,
            scopes: store.scopes,
            installedAt: store.installedAt,
            uninstalledAt: store.uninstalledAt,
            connected: store.uninstalledAt == null,
          }
        : null,
      unattachedStores: unattached,
      albums: albumSummary,
      mappedCount: albumSummary.filter((a) => a.mapped).length,
      totalCount: albumSummary.length,
    });
  });

  // Attach an already-connected store to this artist. A store belongs to at
  // most one person, so we first clear any other store currently pointing
  // here, then stamp the chosen one. Gated by the same `map_shopify` verb
  // that guards album product mappings (super_admin/admin auto-allow).
  app.post("/api/admin/people/:id/shopify/attach", requireAdmin, async (req, res) => {
    const personId = String(req.params.id);
    const { partnerEditGate } = await import("./auth/partnerPermissions");
    if ((await partnerEditGate(req, res, "map_shopify", { kind: "artist", id: personId })) !== "allow") return;
    const storeId = z.string().min(1).parse(req.body?.storeId);
    const [person] = await db.select({ id: people.id }).from(people).where(eq(people.id, personId));
    if (!person) return res.status(404).json({ message: "Person not found" });
    const store = await getStoreById(storeId);
    if (!store) return res.status(404).json({ message: "Store not found" });
    await db.update(shopifyStores).set({ personId: null }).where(eq(shopifyStores.personId, personId));
    await db.update(shopifyStores).set({ personId }).where(eq(shopifyStores.id, storeId));
    res.json({ ok: true });
  });

  // Disassociate this artist's store(s). The store row + its order history
  // stay intact; only the person link is cleared.
  app.post("/api/admin/people/:id/shopify/detach", requireAdmin, async (req, res) => {
    const personId = String(req.params.id);
    const { partnerEditGate } = await import("./auth/partnerPermissions");
    if ((await partnerEditGate(req, res, "map_shopify", { kind: "artist", id: personId })) !== "allow") return;
    await db.update(shopifyStores).set({ personId: null }).where(eq(shopifyStores.personId, personId));
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

    let product: ReturnType<typeof gqlProductToRest> | null = null;
    try {
      product = await fetchProductByLegacyId(store, productId);
    } catch (e: any) {
      console.error(`[shopify] product resolve failed store=${store.shopDomain} product=${productId}: ${e?.message ?? e}`);
      return res.status(502).json({ message: "Couldn't fetch that product from Shopify" });
    }
    if (!product) return res.status(404).json({ message: "Product not found on connected store" });
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
    // Task #79 — Shopify mapping is gated by `map_shopify`.
    {
      const { gateAlbumRoute } = await import("./auth/partnerPermissions");
      if (await gateAlbumRoute(req, res, "map_shopify", albumId)) return;
    }
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
    // Task #2428 — offers_digital_unlock: for a shopify_plus album the
    // fulfillment-only feed is the baseline (Step 8), so a mapping only mints
    // the GoodTunes unlock + GoodDeed when the operator explicitly opts in.
    // Plain "shopify" albums always mint, so the flag is irrelevant there —
    // leave it at its true default. If the client sent an explicit value (the
    // mapping checkbox on a shopify_plus album), honor it.
    if (d.offersDigitalUnlock === undefined) {
      const [alb] = await db
        .select({ sellMode: albums.sellMode })
        .from(albums)
        .where(eq(albums.id, albumId));
      d.offersDigitalUnlock = alb?.sellMode === "shopify_plus" ? false : true;
    }
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
      const isAddon = d.isSignedGooddeedAddon ?? false;
      [row] = await db
        .update(shopifyProductMappings)
        .set({
          albumId: d.albumId,
          isSignedGooddeedAddon: isAddon,
          // addon mappings never bundle a cert — clear cert fields when converting
          offerSignedCert: isAddon ? false : (d.offerSignedCert ?? false),
          signedCertPriceCents: isAddon ? null : (d.signedCertPriceCents ?? null),
          offersDigitalUnlock: d.offersDigitalUnlock,
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
    {
      const { gateAlbumRoute } = await import("./auth/partnerPermissions");
      if (await gateAlbumRoute(req, res, "map_shopify", String(req.params.albumId))) return;
    }
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

  // ─── Push album → draft Shopify product (Task #242) ───────────────
  // One-click "Push to Shopify" from the album editor. Creates (or, on
  // re-push, idempotently updates) a DRAFT product with two variants:
  //
  //   1. "GoodTunes Edition"          — priced at album.priceCents,
  //                                      inventory cap = album.maxRedemptions.
  //   2. "+ Signed printed GoodDeed"  — only when the album has a
  //                                      signed_cert addon enabled. Priced
  //                                      at album.signedCertRetailCents
  //                                      (>= wholesale rung; UI shows the
  //                                      earnings preview). Inventory cap =
  //                                      cert.plannedQuantity.
  //
  // Never publishes (status:'draft' is non-negotiable — the label is the
  // sole decision-maker on going live). Persists ids + a fingerprint
  // snapshot on the album row so re-push targets the same product and we
  // can detect post-push edits the label made on the Shopify side and
  // prompt before overwriting them.
  app.post("/api/admin/albums/:id/shopify-push", requireAdmin, async (req, res) => {
    const albumId = String(req.params.id);
    {
      const { gateAlbumRoute } = await import("./auth/partnerPermissions");
      if (await gateAlbumRoute(req, res, "map_shopify", albumId)) return;
    }
    const album = await storage.getAlbumById(albumId, { includeHidden: true });
    if (!album) return res.status(404).json({ message: "Album not found" });
    if (album.priceCents == null) {
      return res.status(400).json({ message: "Set a bundle price on the album before pushing to Shopify." });
    }

    // Resolve target store: prefer the store this album was last pushed
    // to (re-push hits the same draft), else the explicit body.storeId,
    // else the single installed store if exactly one is connected.
    let storeId: string | null = album.shopifyPushStoreId ?? null;
    if (!storeId && req.body?.storeId) storeId = String(req.body.storeId);
    if (!storeId) {
      const installed = await db.select().from(shopifyStores).where(isNull(shopifyStores.uninstalledAt));
      if (installed.length === 1) storeId = installed[0].id;
      else if (installed.length === 0) return res.status(400).json({ message: "Connect a Shopify store first at /admin/shopify." });
      else return res.status(400).json({ message: "Pick which Shopify store to push to (multiple stores connected)." });
    }
    const store = await getStoreById(storeId);
    if (!store || store.uninstalledAt) return res.status(404).json({ message: "Shopify store not connected." });

    // Signed-cert configuration. If the addon is configured, the label
    // must have set signedCertRetailCents and it must clear the addon's
    // min-floor. (Wholesale-tier check is informational in the UI; we
    // don't block here on it — the label is free to absorb margin.)
    const [certAddon] = await db
      .select()
      .from(albumAddons)
      .where(and(eq(albumAddons.albumId, albumId), eq(albumAddons.kind, "signed_cert"), eq(albumAddons.active, true)));
    if (certAddon && album.signedCertRetailCents == null) {
      return res.status(400).json({ message: "Set the signed-cert retail price before pushing." });
    }
    if (certAddon && certAddon.minPriceCents != null && (album.signedCertRetailCents ?? 0) < certAddon.minPriceCents) {
      return res.status(400).json({
        message: `Signed-cert retail must be at least $${(certAddon.minPriceCents / 100).toFixed(2)}.`,
      });
    }

    const editionInventory = album.maxRedemptions ?? null;
    const certInventory = certAddon?.plannedQuantity ?? null;
    const editionPriceDollars = (album.priceCents / 100).toFixed(2);
    const certPriceDollars = certAddon ? ((album.signedCertRetailCents ?? 0) / 100).toFixed(2) : null;
    const title = album.title;
    const bodyHtml = album.description
      ? `<p>${String(album.description).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!))}</p>`
      : "";
    const vendor = album.label?.name ?? album.artist;
    const tags = "goodtunes";

    const snapshot: ShopifyPushSnapshot = {
      title,
      bodyHtml,
      vendor,
      tags,
      edition: { priceCents: album.priceCents, inventory: editionInventory },
      cert: certAddon
        ? { priceCents: album.signedCertRetailCents ?? 0, inventory: certInventory }
        : null,
    };

    // Variants payload, in canonical order (edition first, cert second).
    // `inventory_management:"shopify"` tells Shopify to track the count
    // — without it Shopify ignores `available` and treats stock as
    // unlimited. `inventory_policy:"deny"` blocks oversell once the cap
    // is hit (which is exactly what maxRedemptions/plannedQuantity mean).
    const buildVariant = (label: string, price: string, sku: string, inventory: number | null, requiresShipping: boolean) => ({
      option1: label,
      price,
      sku,
      requires_shipping: requiresShipping,
      taxable: true,
      ...(inventory != null
        ? { inventory_management: "shopify" as const, inventory_policy: "deny" as const }
        : {}),
    });
    const editionVariant = buildVariant(
      "GoodTunes Edition",
      editionPriceDollars,
      `gt-${albumId.slice(0, 8)}-edition`,
      editionInventory,
      false,
    );
    const certVariant = certAddon
      ? buildVariant(
          "+ Signed printed GoodDeed",
          certPriceDollars!,
          `gt-${albumId.slice(0, 8)}-cert`,
          certInventory,
          true,
        )
      : null;

    const existingProductId = album.shopifyPushStoreId === store.id ? album.shopifyPushProductId : null;
    const force = req.body?.force === true || req.body?.force === "true";

    // Conflict check on re-push: diff the live product against the
    // snapshot of what we last sent. Anything that drifted is a
    // label-side edit we'd clobber. We return 409 with the field list
    // so the UI can show a "Overwrite label edits?" confirm and retry
    // with {force:true}. If the product was deleted on Shopify, fall
    // through and create a new draft.
    if (existingProductId && !force) {
      let live: ReturnType<typeof gqlProductToRest> | null = null;
      try {
        live = await fetchProductByLegacyId(store, existingProductId);
      } catch (e: any) {
        // Transient read failure — same behavior as the old REST branch on a
        // non-ok status: skip the conflict check rather than block the push.
        console.error(`[shopify-push] conflict-check read failed album=${albumId}: ${e?.message ?? e}`);
      }
      {
        if (live && album.shopifyPushSnapshot) {
          const conflicts = diffPushSnapshot(album.shopifyPushSnapshot, live, {
            editionVariantId: album.shopifyPushEditionVariantId,
            certVariantId: album.shopifyPushCertVariantId,
          });
          if (conflicts.length > 0) {
            return res.status(409).json({
              message: "This product was edited on Shopify after the last push.",
              conflicts,
              productId: existingProductId,
            });
          }
        }
      }
    }

    let productId = existingProductId;
    let editionVariantId: string | null = null;
    let certVariantId: string | null = null;
    let editionInventoryItemId: string | null = null;
    let certInventoryItemId: string | null = null;

    // productSet (Phase 3) replaces the REST PUT/POST-with-variants pair.
    // Its list-field semantics match the old PUT exactly: the variants we
    // send become the complete set (entries omitted are deleted). One call
    // covers both create (no id) and update (id present); the "Edition"
    // option + optionValues replace REST's options/option1.
    const gqlVariants = [
      {
        ...(productId && album.shopifyPushEditionVariantId
          ? { id: variantGid(album.shopifyPushEditionVariantId) }
          : {}),
        optionValues: [{ optionName: "Edition", name: editionVariant.option1 }],
        price: editionVariant.price,
        sku: editionVariant.sku,
        taxable: true,
        inventoryPolicy: "DENY",
        inventoryItem: {
          tracked: editionInventory != null,
          requiresShipping: false,
        },
      },
      ...(certVariant
        ? [
            {
              ...(productId && album.shopifyPushCertVariantId
                ? { id: variantGid(album.shopifyPushCertVariantId) }
                : {}),
              optionValues: [{ optionName: "Edition", name: certVariant.option1 }],
              price: certVariant.price,
              sku: certVariant.sku,
              taxable: true,
              inventoryPolicy: "DENY",
              inventoryItem: {
                tracked: certInventory != null,
                requiresShipping: true,
              },
            },
          ]
        : []),
    ];
    const setInput: Record<string, unknown> = {
      ...(productId ? { id: productGid(productId) } : {}),
      title,
      descriptionHtml: bodyHtml,
      vendor,
      tags: [tags],
      status: "DRAFT",
      productOptions: [
        {
          name: "Edition",
          position: 1,
          values: gqlVariants.map((v) => ({ name: v.optionValues[0].name })),
        },
      ],
      variants: gqlVariants,
      ...(album.artwork
        ? { files: [{ originalSource: album.artwork, contentType: "IMAGE", alt: title }] }
        : {}),
    };

    try {
      const result = await shopifyGraphql<{
        productSet: {
          product: {
            legacyResourceId: string;
            variants: {
              nodes: Array<{
                legacyResourceId: string;
                sku: string | null;
                inventoryItem: { legacyResourceId: string } | null;
              }>;
            };
          } | null;
          userErrors: Array<{ field: string[] | null; message: string }>;
        };
      }>(
        store,
        /* GraphQL */ `
          mutation productSet($input: ProductSetInput!) {
            productSet(input: $input, synchronous: true) {
              product {
                legacyResourceId
                variants(first: 10) {
                  nodes {
                    legacyResourceId
                    sku
                    inventoryItem { legacyResourceId }
                  }
                }
              }
              userErrors { field message }
            }
          }
        `,
        { input: setInput },
      );
      const errs = result.productSet?.userErrors ?? [];
      if (errs.length > 0) {
        const detail = errs.map((e) => `${e.field?.join(".") ?? ""}: ${e.message}`).join("; ");
        console.error(`[shopify-push] productSet userErrors album=${albumId} ${detail.slice(0, 200)}`);
        return res.status(502).json({
          message: `Shopify ${productId ? "update" : "create"} failed`,
          detail: detail.slice(0, 400),
        });
      }
      const p = result.productSet?.product;
      productId = p?.legacyResourceId ? String(p.legacyResourceId) : productId;
      const vs = p?.variants?.nodes ?? [];
      // Match variants back by SKU (stable, we mint them) with an index
      // fallback mirroring the old REST canonical-order assumption.
      const editionNode = vs.find((v) => v.sku === editionVariant.sku) ?? vs[0] ?? null;
      const certNode = certVariant ? vs.find((v) => v.sku === certVariant.sku) ?? vs[1] ?? null : null;
      editionVariantId = editionNode ? String(editionNode.legacyResourceId) : null;
      certVariantId = certNode ? String(certNode.legacyResourceId) : null;
      editionInventoryItemId = editionNode?.inventoryItem?.legacyResourceId ?? null;
      certInventoryItemId = certNode?.inventoryItem?.legacyResourceId ?? null;
    } catch (e: any) {
      console.error(`[shopify-push] productSet failed album=${albumId}: ${e?.message ?? e}`);
      return res.status(502).json({
        message: `Shopify ${existingProductId ? "update" : "create"} failed`,
        detail: String(e?.message ?? e).slice(0, 400),
      });
    }

    // Apply inventory levels for tracked variants. productSet sets
    // `tracked` but not the actual `available` count — that's a separate
    // mutation keyed on (inventoryItemId, locationId). Phase 5: GraphQL
    // (fetchLocations + inventorySetQuantities); the inventory item ids
    // come straight off the productSet response (no product re-read
    // needed). Best-effort: log and continue on failure so the label
    // still has a usable draft.
    if ((editionInventory != null || certInventory != null) && productId) {
      try {
        const locId = (await fetchLocations(store))[0]?.id;
        if (locId && editionInventory != null && editionInventoryItemId) {
          await setInventoryAvailable(store, editionInventoryItemId, locId, editionInventory);
        }
        if (locId && certInventory != null && certInventoryItemId) {
          await setInventoryAvailable(store, certInventoryItemId, locId, certInventory);
        }
      } catch (e: any) {
        console.error(`[shopify-push] inventory set failed album=${albumId}`, e?.message);
      }
    }

    if (!productId) return res.status(502).json({ message: "Shopify returned no product id" });

    await db
      .update(albums)
      .set({
        shopifyPushStoreId: store.id,
        shopifyPushProductId: productId,
        shopifyPushEditionVariantId: editionVariantId,
        shopifyPushCertVariantId: certVariantId,
        shopifyPushedAt: new Date(),
        shopifyPushSnapshot: snapshot,
      })
      .where(eq(albums.id, albumId));

    const action = existingProductId ? "updated" : "created";
    const actorUserId = (req as any).adminUser?.id ?? null;
    // Persist an audit row per push (Task #242 step 3). Best-effort —
    // never block the success response on log-table failure.
    try {
      await db.insert(shopifyPushLog).values({
        albumId,
        storeId: store.id,
        productId: productId!,
        action,
        forced: !!force,
        conflicts: null,
        actorUserId,
      });
    } catch (e: any) {
      console.error(`[shopify-push] audit insert failed album=${albumId}`, e?.message);
    }
    console.log(
      `[shopify-push] album=${albumId} ${action} store=${store.shopDomain} product=${productId} ` +
        `edition=${editionVariantId ?? "-"} cert=${certVariantId ?? "-"}${force ? " (force)" : ""}`,
    );

    res.json({
      productId,
      editionVariantId,
      certVariantId,
      storeId: store.id,
      shopDomain: store.shopDomain,
      adminUrl: `https://${store.shopDomain}/admin/products/${productId}`,
      pushedAt: new Date().toISOString(),
      action,
    });
  });

  // GET — read-only view for the UI. Returns push status + connected
  // stores + cert earnings preview (computed from the wholesale ladder
  // using the addon's plannedQuantity). The album record itself carries
  // the persistent ids; this endpoint just shapes them for the panel
  // and saves the panel a second round-trip for the store list.
  app.get("/api/admin/albums/:id/shopify-push", requireAdmin, async (req, res) => {
    const albumId = String(req.params.id);
    const album = await storage.getAlbumById(albumId, { includeHidden: true });
    if (!album) return res.status(404).json({ message: "Album not found" });
    const stores = await db.select().from(shopifyStores).where(isNull(shopifyStores.uninstalledAt));
    const [certAddon] = await db
      .select()
      .from(albumAddons)
      .where(and(eq(albumAddons.albumId, albumId), eq(albumAddons.kind, "signed_cert"), eq(albumAddons.active, true)));
    const { getPayoutSettings } = await import("./payouts");
    const payoutSettings = await getPayoutSettings();
    const ladderRungs = payoutSettings.signedCertLadder ?? undefined;
    const rung = certAddon ? lookupSignedCertRung(certAddon.plannedQuantity, ladderRungs) : null;
    const earnings = rung && album.signedCertRetailCents != null
      ? {
          plannedQuantity: certAddon!.plannedQuantity,
          wholesaleCents: rung.wholesaleCents,
          retailCents: album.signedCertRetailCents,
          perCertCents: album.signedCertRetailCents - rung.wholesaleCents,
          totalCents: (album.signedCertRetailCents - rung.wholesaleCents) * (certAddon!.plannedQuantity ?? 0),
          rungLabel: rung.label,
        }
      : null;
    const pushedStore = album.shopifyPushStoreId
      ? stores.find((s) => s.id === album.shopifyPushStoreId) ?? null
      : null;
    // Recent push audit trail (Task #242 step 3). Newest first, capped
    // at 20 so the panel can show a "history" disclosure without
    // dragging a huge payload on every album-edit open.
    const recentPushes = await db
      .select()
      .from(shopifyPushLog)
      .where(eq(shopifyPushLog.albumId, albumId))
      .orderBy(desc(shopifyPushLog.createdAt))
      .limit(20);
    res.json({
      recentPushes: recentPushes.map((r) => ({
        id: r.id,
        storeId: r.storeId,
        productId: r.productId,
        action: r.action,
        forced: r.forced,
        actorUserId: r.actorUserId,
        createdAt: r.createdAt,
      })),
      album: {
        priceCents: album.priceCents,
        maxRedemptions: album.maxRedemptions,
        signedCertRetailCents: album.signedCertRetailCents,
      },
      cert: certAddon
        ? {
            plannedQuantity: certAddon.plannedQuantity,
            minPriceCents: certAddon.minPriceCents,
          }
        : null,
      earnings,
      stores: stores.map((s) => ({ id: s.id, shopDomain: s.shopDomain, storeName: s.storeName })),
      push: album.shopifyPushProductId
        ? {
            storeId: album.shopifyPushStoreId,
            shopDomain: pushedStore?.shopDomain ?? null,
            storeName: pushedStore?.storeName ?? null,
            productId: album.shopifyPushProductId,
            editionVariantId: album.shopifyPushEditionVariantId,
            certVariantId: album.shopifyPushCertVariantId,
            pushedAt: album.shopifyPushedAt,
            adminUrl: pushedStore
              ? `https://${pushedStore.shopDomain}/admin/products/${album.shopifyPushProductId}`
              : null,
          }
        : null,
    });
  });

  // ─── Per-variant retail + units sold (Task #243) ─────────────────
  // Read-only mirror of what Shopify reports for the album's pushed
  // product so admins can answer "what's it priced at, and how many
  // moved?" without leaving the album panel. The variant set comes
  // from the Push-to-Shopify columns on the album (edition + cert);
  // legacy URL-pasted mappings aren't surfaced here because they
  // don't model the edition-vs-cert split.
  //
  // - Retail: live fetch from the store's Admin API per variant. We
  //   tolerate the variant being deleted on Shopify ("removed in
  //   Shopify") by surfacing a `removed:true` flag instead of erroring.
  // - Units sold: SUM(quantity) on order_items for that variant's
  //   sku token (`shopify:<variant_id>`) joined to PAID, non-refunded
  //   orders. Mirrors the same ingest used for redemptions (Task #234),
  //   we just aggregate by variant.
  // - Caching: a 60-second in-memory cache on the *live retail* fetch
  //   only, keyed by storeId+variantId. The DB aggregation is cheap
  //   enough to run on every open; a manual Refresh clears both.
  app.get("/api/admin/albums/:id/shopify-sales", requireAdmin, async (req, res) => {
    const albumId = String(req.params.id);
    const album = await storage.getAlbumById(albumId, { includeHidden: true });
    if (!album) return res.status(404).json({ message: "Album not found" });
    if (!album.shopifyPushStoreId || !album.shopifyPushProductId) {
      return res.json({ mapped: false, variants: [] });
    }
    const store = await getStoreById(album.shopifyPushStoreId);
    if (!store) return res.json({ mapped: false, variants: [] });
    const force = String(req.query.refresh ?? "") === "1";

    const variantSpecs: { kind: "edition" | "cert"; label: string; variantId: string }[] = [];
    if (album.shopifyPushEditionVariantId) {
      variantSpecs.push({ kind: "edition", label: "GoodTunes Edition", variantId: album.shopifyPushEditionVariantId });
    }
    if (album.shopifyPushCertVariantId) {
      variantSpecs.push({ kind: "cert", label: "Signed-cert", variantId: album.shopifyPushCertVariantId });
    }
    if (variantSpecs.length === 0) return res.json({ mapped: false, variants: [] });

    // Units-sold aggregation — paid orders only, non-refunded. The
    // sku token on order_items.format rows is `shopify:<variant_id>`
    // (see materializeOrderFromShopify), so we filter on that exact
    // string per variant. Scoped to this album so cross-album SKU
    // collisions can't bleed in.
    const skuTokens = variantSpecs.map((v) => `shopify:${v.variantId}`);
    const soldRows = await db.execute<{ sku: string; units: number }>(sql`
      SELECT oi.sku AS sku, COALESCE(SUM(oi.quantity), 0)::int AS units
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      WHERE o.album_id = ${albumId}
        AND o.status = 'paid'
        AND oi.sku IN (${sql.join(skuTokens.map((t) => sql`${t}`), sql`, `)})
      GROUP BY oi.sku
    `);
    const unitsBySku = new Map(soldRows.rows.map((r) => [r.sku, Number(r.units ?? 0)]));

    const out = await Promise.all(
      variantSpecs.map(async (spec) => {
        const cacheKey = `${store.id}:${spec.variantId}`;
        let retail: { priceCents: number | null; currency: string | null; removed: boolean } | null = null;
        const cached = force ? null : variantRetailCache.get(cacheKey);
        if (cached && Date.now() - cached.at < VARIANT_RETAIL_TTL_MS) {
          retail = cached.value;
        } else {
          try {
            // GraphQL productVariant (Phase 3). A deleted variant comes back
            // as `productVariant: null` (GraphQL never 404s) → removed:true.
            const data = await shopifyGraphql<{ productVariant: { price: string } | null }>(
              store,
              /* GraphQL */ `
                query productVariant($id: ID!) {
                  productVariant(id: $id) { price }
                }
              `,
              { id: variantGid(spec.variantId) },
            );
            if (!data.productVariant) {
              retail = { priceCents: null, currency: null, removed: true };
            } else {
              const priceStr = data.productVariant.price ?? null;
              retail = {
                priceCents: priceStr ? dollarsToCents(priceStr) : null,
                currency: "USD", // store currency is uniform; price carries no currency
                removed: false,
              };
            }
            if (retail) variantRetailCache.set(cacheKey, { at: Date.now(), value: retail });
          } catch (e: any) {
            console.error(`[shopify-sales] variant fetch failed album=${albumId} variant=${spec.variantId}`, e?.message);
            retail = { priceCents: null, currency: null, removed: false };
          }
        }
        return {
          kind: spec.kind,
          label: spec.label,
          variantId: spec.variantId,
          retail,
          unitsSold: unitsBySku.get(`shopify:${spec.variantId}`) ?? 0,
        };
      }),
    );

    res.json({
      mapped: true,
      storeName: store.storeName ?? store.shopDomain,
      fetchedAt: new Date().toISOString(),
      variants: out,
    });
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

    const REVENUE_STATUSES = new Set(["paid", "shipped", "complete", "completed"]);
    const paid = orderRows.filter((o) => REVENUE_STATUSES.has(o.status));
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
export const __internal = {
  generateRedemptionCode,
  materializeOrderFromShopify,
  handleShopifyRefund,
  // Phase 3 GraphQL plumbing, exported for hermetic tests.
  gqlProductToRest,
  fetchProductByLegacyId,
  productGid,
  variantGid,
  diffPushSnapshot,
  // Phase 4 GraphQL plumbing (webhooks, orderUpdate, transactions).
  orderGid,
  webhookEnumToTopic,
  createWebhookSubscription,
  listWebhookSubscriptions,
  updateOrderCustomAttributes,
  gqlTransactionToRest,
  fetchOrderTransactions,
  // Phase 5 GraphQL plumbing (locations, inventory).
  locationGid,
  inventoryItemGid,
  fetchLocations,
  setInventoryAvailable,
};
