// Task #3091 — EasyPost shipping labels for the signed-cert round-trip.
//
// GoodTunes pays to ship a printed GoodDeed cert batch from the printer to
// the artist/manager for wet signatures, with a prepaid RETURN label riding
// inside the box so the signed stack comes back to the next destination
// (the printer for the hologram/shrinkwrap leg, else the routed fulfillment
// partner). Labels are bought via EasyPost on the GoodTunes UPS carrier
// account (decided 2026-08-12): EasyPost is a purpose-built label API,
// prepaid return labels are first-class (`is_return: true`), and adding the
// UPS account as an EasyPost Carrier Account keeps rates/billing on the
// existing UPS relationship. Order Desk stays untouched — it's the
// customer-order fulfillment hub, not a label API.
//
// Config (Replit Secrets — set up with Bill/gogoods, who hold the EasyPost
// dashboard):
//   EASYPOST_API_KEY                 — required. Test key buys test labels.
//   EASYPOST_UPS_CARRIER_ACCOUNT_ID  — optional `ca_…` id pinning purchases
//                                      to the GoodTunes UPS carrier account.
//                                      Without it we filter rates to UPS.
// No key → easypostConfigured()=false and every purchase path returns a
// reason-coded, operator-visible error (never a silent no-op).
//
// Deliberately a thin fetch client (no npm SDK): two endpoints, and the
// esbuild server bundle stays free of another dependency.

const EASYPOST_BASE = "https://api.easypost.com/v2";

export function easypostConfigured(): boolean {
  return !!process.env.EASYPOST_API_KEY;
}

// EasyPost address shape (their field names, not ours).
export interface EasyPostAddress {
  name: string;
  company?: string | null;
  street1: string;
  street2?: string | null;
  city: string;
  state: string;
  zip: string;
  country?: string | null; // defaults to US
  phone?: string | null;
  email?: string | null;
}

export interface EasyPostParcel {
  // EasyPost wants ounces + inches.
  weightOz: number;
  lengthIn?: number | null;
  widthIn?: number | null;
  heightIn?: number | null;
}

export type EasyPostBuyResult =
  | {
      ok: true;
      shipmentId: string;
      trackingCode: string;
      labelUrl: string;
      carrier: string;
      service: string;
      rateCents: number;
      isReturn: boolean;
    }
  | {
      ok: false;
      // Reason codes the route can branch on; `message` is always the
      // operator-facing text (carrier/EasyPost message included verbatim).
      reason: "not_configured" | "no_ups_rates" | "api_error" | "network_error";
      message: string;
    };

function authHeader(): string {
  // EasyPost uses HTTP Basic with the key as username, blank password.
  return `Basic ${Buffer.from(`${process.env.EASYPOST_API_KEY}:`).toString("base64")}`;
}

async function epFetch(path: string, body?: unknown): Promise<{ status: number; json: any }> {
  const res = await fetch(`${EASYPOST_BASE}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { Authorization: authHeader(), ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(30_000),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

// Shape a purchased EasyPost shipment payload into our success result.
// Returns null when the shipment has no purchased postage yet.
export function purchasedShipmentResult(s: any): Extract<EasyPostBuyResult, { ok: true }> | null {
  if (!s?.postage_label?.label_url || !s?.tracking_code) return null;
  return {
    ok: true,
    shipmentId: String(s.id),
    trackingCode: String(s.tracking_code),
    labelUrl: String(s.postage_label.label_url),
    carrier: String(s.selected_rate?.carrier ?? "UPS"),
    service: String(s.selected_rate?.service ?? ""),
    rateCents: Math.round(parseFloat(String(s.selected_rate?.rate ?? "0")) * 100),
    isReturn: s?.is_return === true,
  };
}

// Crash-recovery lookup: was this shipment already bought on EasyPost's side?
// Used when a durable per-leg intent (shipment id) exists but no purchase
// snapshot landed in our DB — i.e. we may have charged and then died.
export async function retrieveShipment(
  shipmentId: string,
): Promise<
  | { ok: true; purchased: Extract<EasyPostBuyResult, { ok: true }> | null }
  | { ok: false; reason: "not_configured" | "api_error" | "network_error"; message: string }
> {
  if (!easypostConfigured()) {
    return { ok: false, reason: "not_configured", message: "EasyPost is not configured (EASYPOST_API_KEY missing)." };
  }
  try {
    const got = await epFetch(`/shipments/${shipmentId}`);
    if (got.status >= 400) return { ok: false, reason: "api_error", message: epErrorMessage(got.json) };
    return { ok: true, purchased: purchasedShipmentResult(got.json) };
  } catch (e: any) {
    return { ok: false, reason: "network_error", message: `Could not reach EasyPost: ${e?.message ?? e}` };
  }
}

// Pull the human-readable error out of an EasyPost error payload —
// carrier messages ride in error.errors[]/error.message and MUST surface
// to the operator (task requirement: failures are never silent/opaque).
function epErrorMessage(json: any): string {
  const err = json?.error;
  if (!err) return "EasyPost returned an unrecognized error.";
  const details = Array.isArray(err.errors)
    ? err.errors
        .map((e: any) => (typeof e === "string" ? e : [e?.field, e?.message].filter(Boolean).join(": ")))
        .filter(Boolean)
        .join("; ")
    : "";
  return [err.message, details].filter(Boolean).join(" — ") || "EasyPost error.";
}

function toEpAddress(a: EasyPostAddress) {
  return {
    name: a.name,
    company: a.company || undefined,
    street1: a.street1,
    street2: a.street2 || undefined,
    city: a.city,
    state: a.state,
    zip: a.zip,
    country: a.country || "US",
    phone: a.phone || undefined,
    email: a.email || undefined,
  };
}

// Create a shipment and buy the cheapest UPS rate on the GoodTunes carrier
// account. `isReturn: true` makes EasyPost swap to/from on the printed label
// (prepaid return — first-class support, exactly why EasyPost was chosen).
export async function buyUpsLabel(args: {
  to: EasyPostAddress;
  from: EasyPostAddress;
  parcel: EasyPostParcel;
  isReturn: boolean;
  reference: string;
}): Promise<EasyPostBuyResult> {
  const created = await createUpsShipment(args);
  if (!created.ok) return created;
  return buyShipmentRate(created.shipmentId, created.rate);
}

// Phase 1: create the shipment + pick the rate. Creating a shipment is FREE
// (no charge until /buy), so the caller can durably persist the shipment id
// as a purchase intent BEFORE any money moves — a crash after /buy is then
// recoverable via retrieveShipment instead of a blind (double-charging) re-buy.
export async function createUpsShipment(args: {
  to: EasyPostAddress;
  from: EasyPostAddress;
  parcel: EasyPostParcel;
  isReturn: boolean;
  reference: string;
}): Promise<
  | { ok: true; shipmentId: string; rate: { id: string; carrier?: string; service?: string; rate?: string } }
  | Extract<EasyPostBuyResult, { ok: false }>
> {
  if (!easypostConfigured()) {
    return {
      ok: false,
      reason: "not_configured",
      message:
        "EasyPost is not configured (EASYPOST_API_KEY missing). Set it up with the gogoods EasyPost dashboard before buying labels.",
    };
  }
  const carrierAccountId = process.env.EASYPOST_UPS_CARRIER_ACCOUNT_ID || null;
  try {
    const create = await epFetch("/shipments", {
      shipment: {
        to_address: toEpAddress(args.to),
        from_address: toEpAddress(args.from),
        parcel: {
          weight: args.parcel.weightOz,
          ...(args.parcel.lengthIn ? { length: args.parcel.lengthIn } : {}),
          ...(args.parcel.widthIn ? { width: args.parcel.widthIn } : {}),
          ...(args.parcel.heightIn ? { height: args.parcel.heightIn } : {}),
        },
        is_return: args.isReturn,
        reference: args.reference,
        options: { label_format: "PDF" },
        ...(carrierAccountId ? { carrier_accounts: [carrierAccountId] } : {}),
      },
    });
    if (create.status >= 400) {
      return { ok: false, reason: "api_error", message: epErrorMessage(create.json) };
    }
    const rate = pickUpsRate(create.json?.rates ?? []);
    if (!rate) {
      // Surface EasyPost's per-carrier failure messages (bad address, UPS
      // account problem, …) so the operator sees WHY there were no rates.
      const msgs = (create.json?.messages ?? [])
        .map((m: any) => [m?.carrier, m?.message].filter(Boolean).join(": "))
        .filter(Boolean)
        .join("; ");
      return {
        ok: false,
        reason: "no_ups_rates",
        message: msgs
          ? `No UPS rates returned — ${msgs}`
          : "No UPS rates returned for this shipment. Check the UPS carrier account in the EasyPost dashboard and the addresses.",
      };
    }
    return { ok: true, shipmentId: String(create.json.id), rate };
  } catch (e: any) {
    return {
      ok: false,
      reason: "network_error",
      message: `Could not reach EasyPost: ${e?.message ?? e}`,
    };
  }
}

// Phase 2: buy the picked rate — the step that charges money. On any error
// the caller must NOT blindly retry a new shipment; it re-checks the intent
// via retrieveShipment first (the buy may have been accepted before a
// network failure).
export async function buyShipmentRate(
  shipmentId: string,
  rate: { id: string; carrier?: string; service?: string; rate?: string },
): Promise<EasyPostBuyResult> {
  try {
    const buy = await epFetch(`/shipments/${shipmentId}/buy`, { rate: { id: rate.id } });
    if (buy.status >= 400) {
      return { ok: false, reason: "api_error", message: epErrorMessage(buy.json) };
    }
    const done = purchasedShipmentResult(buy.json);
    if (!done) {
      return {
        ok: false,
        reason: "api_error",
        message: "EasyPost buy succeeded but returned no label URL / tracking code.",
      };
    }
    return done;
  } catch (e: any) {
    return {
      ok: false,
      reason: "network_error",
      message: `Could not reach EasyPost: ${e?.message ?? e}`,
    };
  }
}

// Cheapest UPS rate. When a carrier-account id is pinned every returned rate
// is already UPS; the name filter (UPS / UPSDAP) covers the unpinned case.
export function pickUpsRate(
  rates: Array<{ id: string; carrier?: string; service?: string; rate?: string }>,
): { id: string; carrier?: string; service?: string; rate?: string } | null {
  const ups = rates.filter((r) => /^UPS/i.test(String(r.carrier ?? "")));
  const pool = process.env.EASYPOST_UPS_CARRIER_ACCOUNT_ID ? (ups.length ? ups : rates) : ups;
  if (pool.length === 0) return null;
  return pool.reduce((best, r) =>
    parseFloat(String(r.rate ?? "Infinity")) < parseFloat(String(best.rate ?? "Infinity")) ? r : best,
  );
}
