// Pure, testable field-mapping + brand-resolution helpers for the
// Add-gear scrape route's Shopify-JSON path (Retrofret, Gryphon).
//
// These were extracted verbatim from the
// `/api/admin/instruments/scrape` handler in server/routes.ts so the
// transformation contract (title→name, junk-vendor handling, year
// extraction, tag→specs filtering, price formatting, brand→maker host
// resolution) can be unit-tested against saved fixture payloads without
// standing up the full Express route or a live shop. The route imports
// these directly, so there's no reference-copy drift.
//
// See server/lib/shopifyGearMapping.test.ts.

// Structural subset of routes.ts's KNOWN_HOSTS value shape — only `name`
// and `role` are read here.
export type KnownHostInfo = { name: string; role: string };
export type KnownHosts = Record<string, KnownHostInfo>;

// Vendor "slot" — exactly the fields the Add-gear client uses to render
// preview chips and to find-or-create the row on confirm. Mirrors the
// VendorSlot shape in server/routes.ts.
export type VendorSlot = {
  name: string;
  domain: string | null;
  affiliateUrl: string | null;
  aboutUrl: string | null;
  logoUrl: string | null;
  known: boolean;
  parentDomain?: string | null;
  parentVendorId?: string | null;
  existingVendorId?: string | null;
};

// Free-text brand → maker host. Short brand aliases get explicit
// mappings; everything else falls through to a case-insensitive name
// match against KNOWN_HOSTS maker rows.
export const BRAND_ALIASES: Record<string, string> = {
  "prs": "prsguitars.com",
  "paul reed smith": "prsguitars.com",
  "paul reed smith guitars": "prsguitars.com",
  "martin": "martinguitar.com",
  "c.f. martin": "martinguitar.com",
  "c. f. martin": "martinguitar.com",
  "cf martin & co.": "martinguitar.com",
  "cf martin & co": "martinguitar.com",
  "c.f. martin & co.": "martinguitar.com",
  "c.f. martin & co": "martinguitar.com",
  "mesa": "mesaboogie.com",
  "mesa/boogie": "mesaboogie.com",
  "boogie": "mesaboogie.com",
  "ernie ball music man": "ernieball.com",
  "music man": "ernieball.com",
  "d'addario": "daddario.com",
  "daddario": "daddario.com",
  "earthquaker": "earthquakerdevices.com",
  "chase bliss": "chasebliss.com",
};

export function resolveMakerHostFromBrand(
  brand: string,
  knownHosts: KnownHosts,
): string | null {
  const norm = brand.trim().toLowerCase();
  if (!norm) return null;
  if (BRAND_ALIASES[norm]) return BRAND_ALIASES[norm];
  for (const [host, info] of Object.entries(knownHosts)) {
    if (info.role === "reseller") continue;
    if (info.name.toLowerCase() === norm) return host;
  }
  return null;
}

export function buildHostSlot(
  slotHost: string,
  slotName: string,
  affiliate: string | null,
  knownHosts: KnownHosts,
): VendorSlot {
  return {
    name: slotName,
    domain: slotHost,
    affiliateUrl: affiliate,
    aboutUrl: `https://${slotHost}/`,
    logoUrl: `https://www.google.com/s2/favicons?sz=128&domain=${slotHost}`,
    known: slotHost in knownHosts,
  };
}

// Resolve a free-text brand string into a Maker VendorSlot: prefer a
// known maker host, then an existing catalog row by name, else emit a
// name-only slot (the client skips auto-attach when domain is null
// because vendors.domain is NOT NULL).
export async function makerSlotFromBrand(
  brandStr: string,
  opts: {
    knownHosts: KnownHosts;
    lookupVendorByName: (name: string) => Promise<
      | {
          name: string;
          domain: string | null;
          aboutUrl?: string | null;
          logoUrl?: string | null;
        }
      | undefined
    >;
  },
): Promise<VendorSlot | null> {
  const b = brandStr.trim();
  if (!b) return null;
  const resolvedHost = resolveMakerHostFromBrand(b, opts.knownHosts);
  if (resolvedHost) {
    const info = opts.knownHosts[resolvedHost];
    return buildHostSlot(resolvedHost, info?.name ?? b, null, opts.knownHosts);
  }
  const byName = await opts.lookupVendorByName(b);
  if (byName?.domain) {
    return {
      name: byName.name,
      domain: byName.domain,
      affiliateUrl: null,
      aboutUrl: byName.aboutUrl ?? `https://${byName.domain}/`,
      logoUrl:
        byName.logoUrl ??
        `https://www.google.com/s2/favicons?sz=128&domain=${byName.domain}`,
      known: false,
    };
  }
  return {
    name: b,
    domain: null,
    affiliateUrl: null,
    aboutUrl: null,
    logoUrl: null,
    known: false,
  };
}

// Fail-loud classification of the `/products/<handle>.json` fetch
// result, mirroring the Gruhn handler's "no silent garbage imports"
// stance. `body` is only inspected on a 2xx response; pass `null` (or
// skip parsing) for non-ok statuses since the route doesn't read the
// body there.
export type ShopifyApiOutcome =
  | { kind: "product"; product: ShopifyProduct }
  | { kind: "error"; status: number; message: string };

export function classifyShopifyApiResult(
  res: { status: number; ok: boolean },
  body: unknown,
  shopName: string,
): ShopifyApiOutcome {
  if (res.status === 404) {
    return {
      kind: "error",
      status: 404,
      message: `Item not found on ${shopName} — the listing may have been sold or removed.`,
    };
  }
  if (!res.ok) {
    return {
      kind: "error",
      status: 502,
      message: `${shopName} returned ${res.status} — the item may no longer be listed.`,
    };
  }
  const product = (body as any)?.product;
  if (!product || typeof product !== "object") {
    return {
      kind: "error",
      status: 404,
      message: `${shopName} returned no product data for this URL.`,
    };
  }
  return { kind: "product", product };
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&#x27;/gi, "'");
}

// Shape of the relevant fields from Shopify's `/products/<handle>.json`.
export type ShopifyProduct = {
  title?: unknown;
  vendor?: unknown;
  body_html?: unknown;
  variants?: unknown;
  images?: unknown;
  tags?: unknown;
  product_type?: unknown;
};

export type MappedShopifyGear = {
  name: string | null;
  brand: string | null;
  year: string | null;
  description: string | null;
  price: string | null;
  rawImage: string | null;
  specs: Record<string, string>;
  category: string | null;
};

// Map a Shopify product payload into the gear-preview fields. Pure: no
// network, no DB, no image rehosting (the route rehosts `rawImage`
// afterwards and resolves `brand` into a maker slot via
// makerSlotFromBrand). `shopName` is the host's display name, used to
// detect a vendor field that's just the store's own name.
export function mapShopifyProduct(
  product: ShopifyProduct,
  shopName: string,
): MappedShopifyGear {
  const rawTitle: string =
    typeof product.title === "string" ? product.title.trim() : "";
  const name = rawTitle || null;

  // Year — first 18xx/19xx/20xx token in the title ("1974 Martin D-35").
  const yearMatch = rawTitle.match(/\b(?:18|19|20)\d{2}\b/);
  const year = yearMatch ? yearMatch[0] : null;

  // Shopify `vendor` usually holds the brand, but some shops leave a
  // placeholder ("<Foo> Maker") or the store's own name — treat those as
  // no-brand rather than fabricating a maker.
  const vendorRaw =
    typeof product.vendor === "string" ? product.vendor.trim() : "";
  const brand =
    vendorRaw && vendorRaw.toLowerCase() !== shopName.toLowerCase()
      ? vendorRaw
      : null;

  let description: string | null =
    typeof product.body_html === "string" ? product.body_html : null;
  if (description) {
    description = description
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>\s*<p[^>]*>/gi, "\n\n")
      .replace(/<[^>]+>/g, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    description = decodeEntities(description) || null;
  }

  const variants = Array.isArray(product.variants) ? product.variants : [];
  const priceRaw = variants.length ? (variants[0] as any)?.price : null;
  const price =
    priceRaw != null && priceRaw !== "" && !isNaN(parseFloat(String(priceRaw)))
      ? `USD ${parseFloat(String(priceRaw)).toFixed(2)}`
      : null;

  const images = Array.isArray(product.images) ? product.images : [];
  let rawImage: string | null = images.length
    ? ((images[0] as any)?.src ?? null)
    : null;
  if (rawImage?.startsWith("http://")) {
    rawImage = "https://" + rawImage.slice("http://".length);
  }

  // Specs — Year plus any `Label:Value` tags (skip Shopify's taxonomy
  // navigation tags like "Level 1: Instruments" and overlong junk).
  const specs: Record<string, string> = {};
  if (year) specs.Year = year;
  const tags: string[] = Array.isArray(product.tags)
    ? product.tags.map((t: any) => String(t))
    : typeof product.tags === "string"
      ? product.tags.split(",")
      : [];
  for (const t of tags) {
    const tag = t.trim();
    const ci = tag.indexOf(":");
    if (ci <= 0) continue;
    const label = tag.slice(0, ci).trim();
    const value = tag.slice(ci + 1).trim();
    if (!label || !value) continue;
    if (/^level\s*\d+$/i.test(label)) continue;
    if (label.length > 40 || value.length > 120) continue;
    if (!(label in specs)) specs[label] = value;
  }

  const ptype =
    typeof product.product_type === "string" ? product.product_type.trim() : "";
  const category =
    ptype && !/^(instruments?|otherdefault|default)$/i.test(ptype)
      ? ptype
      : null;

  return { name, brand, year, description, price, rawImage, specs, category };
}
