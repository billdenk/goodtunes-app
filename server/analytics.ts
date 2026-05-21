// Server-side analytics helpers.
//
// 1. Geo enrichment — read CDN-provided country/region headers (Cloudflare,
//    Vercel, Fly). We never do MaxMind lookups here; if the headers aren't
//    present, country stays null. That's honest data — better than guessing
//    from req.ip behind a proxy.
//
// 2. PostHog forwarder — fire-and-forget POST to PostHog's batch endpoint.
//    No SDK dependency, just fetch. When POSTHOG_API_KEY is unset the
//    forwarder is a no-op, so dev / preview / unconfigured prod stays
//    quiet.

import type { Request } from "express";

const POSTHOG_API_KEY = process.env.POSTHOG_API_KEY || "";
const POSTHOG_HOST = (process.env.POSTHOG_HOST || "https://us.i.posthog.com").replace(/\/$/, "");

export type GeoFields = { country: string | null; region: string | null };

export function geoFromRequest(req: Request): GeoFields {
  const h = req.headers;
  // Common CDN/edge headers. First wins; all strings.
  const country =
    (h["cf-ipcountry"] as string) ||
    (h["x-vercel-ip-country"] as string) ||
    (h["x-country-code"] as string) ||
    (h["fly-client-country"] as string) ||
    null;
  const region =
    (h["cf-region"] as string) ||
    (h["x-vercel-ip-country-region"] as string) ||
    null;
  return {
    country: country && country !== "XX" ? country.toUpperCase() : null,
    region: region || null,
  };
}

type ForwardEvent = {
  name: string;
  payload: Record<string, any>;
  ts: Date;
  sessionId?: string | null;
  userId?: string | null;
  clientId?: string | null;
  deviceId?: string | null;
  platform?: string | null;
  referrer?: string | null;
  country?: string | null;
  region?: string | null;
};

export function isPostHogEnabled() {
  return POSTHOG_API_KEY.length > 0;
}

export async function forwardToPostHog(events: ForwardEvent[]): Promise<void> {
  if (!isPostHogEnabled() || events.length === 0) return;
  const batch = events.map((e) => ({
    event: e.name,
    // PostHog requires a distinct_id. Prefer userId so signed-in events
    // stitch to a single user; fall back to deviceId so anonymous events
    // still group by browser; final fallback sessionId.
    distinct_id: e.userId || e.deviceId || e.sessionId || "anonymous",
    timestamp: e.ts.toISOString(),
    properties: {
      ...e.payload,
      $session_id: e.sessionId ?? undefined,
      $device_id: e.deviceId ?? undefined,
      $referrer: e.referrer ?? undefined,
      platform: e.platform ?? undefined,
      country: e.country ?? undefined,
      region: e.region ?? undefined,
      client_event_id: e.clientId ?? undefined,
    },
  }));
  try {
    await fetch(`${POSTHOG_HOST}/batch/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: POSTHOG_API_KEY, batch }),
    });
  } catch (err) {
    // PostHog is best-effort — we already persisted to analytics_events.
    console.error("[analytics] PostHog forward failed", err);
  }
}
