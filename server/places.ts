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

  // POST /api/admin/places/backfill-addresses
  // Task #489 — one-shot job that re-geocodes the existing free-text
  // `location` (or `shipping_address`) strings on partner tables and
  // fills the new structured-snapshot jsonb columns. Idempotent: skips
  // rows that already have a struct and rows whose top suggestion
  // doesn't confidently match the text (so we never write a wrong
  // address). Returns a per-table summary the admin can rerun safely.
  //
  // Body is optional:
  //   { tables?: ("labels"|"vendors"|"manufacturers"|"fulfillment_partners")[],
  //     dryRun?: boolean,
  //     limit?: number }  // default 200 per call
  app.post("/api/admin/places/backfill-addresses", requireAdmin, async (req, res) => {
    const key = getKey();
    if (!key) return res.status(503).json({ configured: false });
    const { db } = await import("./db");
    const { sql } = await import("drizzle-orm");
    const body = (req.body ?? {}) as {
      tables?: string[];
      dryRun?: boolean;
      limit?: number;
    };
    const allow = new Set(
      body.tables && body.tables.length > 0
        ? body.tables
        : ["labels", "vendors", "manufacturers", "fulfillment_partners"],
    );
    const limit = Math.min(Math.max(Number(body.limit) || 200, 1), 1000);
    const dryRun = !!body.dryRun;

    type Target = {
      table: string;
      textCol: string;
      structCol: string;
    };
    const targets: Target[] = [
      { table: "labels", textCol: "location", structCol: "location_address" },
      { table: "vendors", textCol: "location", structCol: "location_address" },
      { table: "manufacturers", textCol: "location", structCol: "location_address" },
      { table: "fulfillment_partners", textCol: "location", structCol: "location_address" },
      { table: "fulfillment_partners", textCol: "shipping_address", structCol: "shipping_address_struct" },
    ].filter((t) => allow.has(t.table));

    // Confidence guard: only accept the top suggestion when its
    // returned `formatted` address starts with (or contains) the
    // operator-typed free-text after both sides are normalized to
    // lowercase letters+digits only. That keeps "Berkeley, CA" from
    // grabbing the first random Berkeley match in the Bay Area while
    // still letting "1600 Amphitheatre Pkwy, Mountain View, CA"
    // through.
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

    async function geocodeOne(text: string): Promise<NormalizedAddress | null> {
      try {
        const ar = await fetch(AUTOCOMPLETE_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": key as string,
            "X-Goog-FieldMask": AUTOCOMPLETE_FIELD_MASK,
          },
          body: JSON.stringify({ input: text }),
        });
        if (!ar.ok) return null;
        const adata = (await ar.json()) as {
          suggestions?: Array<{
            placePrediction?: {
              placeId: string;
              text?: { text?: string };
            };
          }>;
        };
        const top = adata.suggestions?.[0]?.placePrediction;
        if (!top?.placeId) return null;
        const dr = await fetch(
          `${DETAILS_URL}/${encodeURIComponent(top.placeId)}`,
          {
            headers: {
              "X-Goog-Api-Key": key as string,
              "X-Goog-FieldMask": DETAILS_FIELD_MASK,
            },
          },
        );
        if (!dr.ok) return null;
        const ddata = (await dr.json()) as {
          formattedAddress?: string;
          addressComponents?: AddressComponent[];
        };
        const normalized = normalize(
          ddata.addressComponents,
          ddata.formattedAddress ?? "",
        );
        // Confidence check on the returned formatted address.
        const nTyped = norm(text);
        const nGot = norm(normalized.formatted || "");
        if (!nGot.includes(nTyped) && !nTyped.includes(nGot)) {
          // Ambiguous — refuse to write.
          return null;
        }
        return normalized;
      } catch {
        return null;
      }
    }

    function toStruct(n: NormalizedAddress) {
      return {
        line1: n.line1 || null,
        line2: n.line2 || null,
        city: n.city || null,
        state: n.region || null,
        postalCode: n.postalCode || null,
        country: n.country || null,
      };
    }

    const summary: Record<
      string,
      { scanned: number; updated: number; skippedAmbiguous: number; failed: number }
    > = {};

    let budget = limit;
    for (const t of targets) {
      const key = `${t.table}.${t.structCol}`;
      summary[key] = { scanned: 0, updated: 0, skippedAmbiguous: 0, failed: 0 };
      if (budget <= 0) break;
      const rows = (await db.execute(
        sql.raw(
          `SELECT id, ${t.textCol} AS txt FROM ${t.table}
             WHERE ${t.textCol} IS NOT NULL
               AND ${t.textCol} <> ''
               AND ${t.structCol} IS NULL
             ORDER BY id
             LIMIT ${Math.max(1, budget)}`,
        ),
      )) as unknown as { rows: Array<{ id: string; txt: string }> };
      for (const r of rows.rows) {
        summary[key].scanned++;
        budget--;
        const snap = await geocodeOne(r.txt);
        if (!snap) {
          summary[key].skippedAmbiguous++;
          continue;
        }
        if (dryRun) {
          summary[key].updated++;
          continue;
        }
        try {
          await db.execute(
            sql`UPDATE ${sql.raw(t.table)} SET ${sql.raw(t.structCol)} = ${JSON.stringify(toStruct(snap))}::jsonb WHERE id = ${r.id}`,
          );
          summary[key].updated++;
        } catch {
          summary[key].failed++;
        }
      }
    }
    res.json({ configured: true, dryRun, summary });
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
