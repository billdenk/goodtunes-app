// Google Places (New) admin-only proxy.
//
// Why a proxy: keeps the API key server-side (never shipped to the
// browser), shares one rate-limit pool, and lets the client speak a
// stable shape regardless of upstream changes. Every endpoint requires
// admin auth — autocomplete is paid-per-request, no fan ever hits it.
//
// Session tokens: Google bills autocomplete-then-details as a single
// "session" only when the same session token is forwarded on every
// autocomplete request *and* the final details call. The client picks
// a UUID per typing burst, sends it on every keystroke, and replays it
// on selection. Server forwards it verbatim.
//
// Normalized output (matches StripeAddressSnapshot in shared/schema.ts
// minus `name`):
//   { formatted, line1, line2, city, region, postalCode, country }
//
// Missing key: every endpoint returns { configured: false } / 503 with
// the same shape so the client can transparently fall back to plain
// text. We never surface the key absence as a 500.

import type { Express, Request, Response } from "express";

const AUTOCOMPLETE_URL = "https://places.googleapis.com/v1/places:autocomplete";
const DETAILS_URL = "https://places.googleapis.com/v1/places";

const DETAILS_FIELD_MASK = [
  "id",
  "formattedAddress",
  "addressComponents",
].join(",");

const AUTOCOMPLETE_FIELD_MASK = [
  "suggestions.placePrediction.placeId",
  "suggestions.placePrediction.text",
  "suggestions.placePrediction.structuredFormat",
].join(",");

type AddressComponent = {
  longText?: string;
  shortText?: string;
  types?: string[];
};

export type NormalizedAddress = {
  formatted: string;
  line1: string;
  line2: string;
  city: string;
  region: string;
  postalCode: string;
  country: string;
};

function normalize(
  components: AddressComponent[] | undefined,
  formatted: string,
): NormalizedAddress {
  const by = (type: string, short = false) => {
    const c = (components ?? []).find((c) => (c.types ?? []).includes(type));
    if (!c) return "";
    return (short ? c.shortText : c.longText) ?? c.longText ?? c.shortText ?? "";
  };

  const streetNumber = by("street_number");
  const route = by("route");
  const line1 = [streetNumber, route].filter(Boolean).join(" ").trim();
  const subpremise = by("subpremise");
  // City: locality first, then postal_town, then sublocality_level_1,
  // then admin_area_level_2 — covers US ("Brooklyn"), UK ("Camden"),
  // JP wards, and rural US counties where locality is empty.
  const city =
    by("locality") ||
    by("postal_town") ||
    by("sublocality_level_1") ||
    by("administrative_area_level_2");
  const region = by("administrative_area_level_1", true);
  const postalCode = by("postal_code");
  const country = by("country", true);

  return {
    formatted: formatted || "",
    line1,
    line2: subpremise,
    city,
    region,
    postalCode,
    country,
  };
}

function getKey(): string | null {
  const k = process.env.GOOGLE_PLACES_API_KEY?.trim();
  return k ? k : null;
}

export function registerPlacesRoutes(
  app: Express,
  requireAdmin: (req: Request, res: Response, next: Function) => void,
) {
  // GET /api/admin/places/status
  // Cheap probe the client uses on mount to decide whether to render
  // the autocomplete combobox or fall back to a plain <input>.
  app.get("/api/admin/places/status", requireAdmin, (_req, res) => {
    res.json({ configured: !!getKey() });
  });

  // GET /api/admin/places/autocomplete?q=&sessiontoken=
  app.get("/api/admin/places/autocomplete", requireAdmin, async (req, res) => {
    const key = getKey();
    if (!key) return res.json({ configured: false, suggestions: [] });
    const q = String(req.query.q ?? "").trim();
    const sessiontoken = String(req.query.sessiontoken ?? "").trim();
    if (q.length < 2) return res.json({ configured: true, suggestions: [] });
    try {
      const r = await fetch(AUTOCOMPLETE_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": key,
          "X-Goog-FieldMask": AUTOCOMPLETE_FIELD_MASK,
        },
        body: JSON.stringify({
          input: q,
          ...(sessiontoken ? { sessionToken: sessiontoken } : {}),
        }),
      });
      if (!r.ok) {
        const body = await r.text().catch(() => "");
        return res
          .status(502)
          .json({ configured: true, error: "upstream", status: r.status, body });
      }
      const data = (await r.json()) as {
        suggestions?: Array<{
          placePrediction?: {
            placeId: string;
            text?: { text?: string };
            structuredFormat?: {
              mainText?: { text?: string };
              secondaryText?: { text?: string };
            };
          };
        }>;
      };
      const suggestions = (data.suggestions ?? [])
        .map((s) => s.placePrediction)
        .filter((p): p is NonNullable<typeof p> => !!p?.placeId)
        .map((p) => ({
          placeId: p.placeId,
          text: p.text?.text ?? "",
          mainText: p.structuredFormat?.mainText?.text ?? p.text?.text ?? "",
          secondaryText: p.structuredFormat?.secondaryText?.text ?? "",
        }));
      res.json({ configured: true, suggestions });
    } catch (e: any) {
      res.status(502).json({
        configured: true,
        error: "fetch_failed",
        message: e?.message ?? String(e),
      });
    }
  });

  // GET /api/admin/places/details?placeId=&sessiontoken=
  app.get("/api/admin/places/details", requireAdmin, async (req, res) => {
    const key = getKey();
    if (!key) return res.status(503).json({ configured: false });
    const placeId = String(req.query.placeId ?? "").trim();
    const sessiontoken = String(req.query.sessiontoken ?? "").trim();
    if (!placeId) return res.status(400).json({ error: "placeId required" });
    try {
      const url = new URL(`${DETAILS_URL}/${encodeURIComponent(placeId)}`);
      if (sessiontoken) url.searchParams.set("sessionToken", sessiontoken);
      const r = await fetch(url.toString(), {
        headers: {
          "X-Goog-Api-Key": key,
          "X-Goog-FieldMask": DETAILS_FIELD_MASK,
        },
      });
      if (!r.ok) {
        const body = await r.text().catch(() => "");
        return res
          .status(502)
          .json({ configured: true, error: "upstream", status: r.status, body });
      }
      const data = (await r.json()) as {
        formattedAddress?: string;
        addressComponents?: AddressComponent[];
      };
      const normalized = normalize(
        data.addressComponents,
        data.formattedAddress ?? "",
      );
      res.json({ configured: true, address: normalized });
    } catch (e: any) {
      res.status(502).json({
        configured: true,
        error: "fetch_failed",
        message: e?.message ?? String(e),
      });
    }
  });
}
