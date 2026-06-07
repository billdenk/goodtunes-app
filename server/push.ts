// Push notifications — device-token storage + APNs/FCM delivery.
//
// Mirrors the established "inert without credentials" pattern used by
// server/mail.ts (Resend) and server/opsAlert.ts: the full delivery code
// ships, but the send path is GATED on provider credentials being present
// in the environment. With no keys configured (dev, and prod until the
// operator loads them) every send is a no-op that logs ONE structured
// line describing what *would* have gone out, so the wiring is verifiable
// end-to-end without an Apple/Google account.
//
// Transports:
//   - iOS      → APNs HTTP/2 (token-based auth, ES256 JWT signed with a
//                .p8 key). Node's built-in `http2` does the transport.
//   - Android  → FCM HTTP v1 (OAuth bearer minted from a service account
//                via google-auth-library).
//
// Required secrets to actually deliver (none in dev — see above):
//   APNs:  APNS_KEY_P8 (the .p8 contents), APNS_KEY_ID, APNS_TEAM_ID,
//          APNS_BUNDLE_ID (defaults to the live iOS id), APNS_PRODUCTION
//          ("0" to hit the sandbox host; defaults to production because
//          the shipped entitlement is aps-environment=production).
//   FCM:   FCM_SERVICE_ACCOUNT_JSON (service-account key as a JSON string),
//          FCM_PROJECT_ID (optional — derived from the JSON's project_id).
//
// Best-effort everywhere: no public function throws. A push failure must
// never break the business action (order ship, etc.) that triggered it.

import http2 from "node:http2";
import { and, eq, isNull, sql } from "drizzle-orm";
import { SignJWT, importPKCS8 } from "jose";
import { db } from "./db";
import { pushDevices, type PushDevice } from "@shared/schema";

export type PushPlatform = "ios" | "android";

export type PushPayload = {
  title: string;
  body: string;
  // Arbitrary string→string data delivered alongside the alert so a tap
  // can deep-link (e.g. { kind: "order_shipped", orderId, albumId }).
  data?: Record<string, string>;
};

// ---- Token storage -------------------------------------------------------

// Upsert a device token for a fan. Keyed on the globally-unique token so
// re-registering the same device just refreshes ownership + lastSeenAt
// (and un-soft-deletes a token that was previously marked invalid).
export async function registerDevice(input: {
  customerId: string;
  platform: PushPlatform;
  token: string;
}): Promise<PushDevice> {
  const [row] = await db
    .insert(pushDevices)
    .values({
      customerId: input.customerId,
      platform: input.platform,
      token: input.token,
    })
    .onConflictDoUpdate({
      target: pushDevices.token,
      set: {
        customerId: input.customerId,
        platform: input.platform,
        lastSeenAt: new Date(),
        deletedAt: null,
      },
    })
    .returning();
  return row;
}

// Soft-delete a token on explicit fan unregister (sign-out / opt-out).
// Returns true when a live row was flipped. Scoped to the owning fan so
// one fan can't revoke another's device.
export async function unregisterDevice(customerId: string, token: string): Promise<boolean> {
  const [row] = await db
    .update(pushDevices)
    .set({ deletedAt: new Date() })
    .where(
      and(
        eq(pushDevices.token, token),
        eq(pushDevices.customerId, customerId),
        isNull(pushDevices.deletedAt),
      ),
    )
    .returning({ id: pushDevices.id });
  return !!row;
}

// Live (not soft-deleted) device rows for a fan.
export async function listDevicesForCustomer(customerId: string): Promise<PushDevice[]> {
  return db
    .select()
    .from(pushDevices)
    .where(and(eq(pushDevices.customerId, customerId), isNull(pushDevices.deletedAt)));
}

// Soft-delete a token the provider told us is dead (Unregistered /
// BadDeviceToken). Idempotent; never throws.
async function markTokenInvalid(token: string, reason: string): Promise<void> {
  try {
    await db
      .update(pushDevices)
      .set({ deletedAt: new Date() })
      .where(and(eq(pushDevices.token, token), isNull(pushDevices.deletedAt)));
    console.log(`[push] retired invalid token reason=${reason}`);
  } catch (e) {
    console.warn(`[push] failed to retire invalid token: ${(e as Error).message}`);
  }
}

// ---- Provider configuration ---------------------------------------------

function apnsConfig(): { keyP8: string; keyId: string; teamId: string; bundleId: string; production: boolean } | null {
  const keyP8 = (process.env.APNS_KEY_P8 || "").trim();
  const keyId = (process.env.APNS_KEY_ID || "").trim();
  const teamId = (process.env.APNS_TEAM_ID || "").trim();
  if (!keyP8 || !keyId || !teamId) return null;
  return {
    keyP8,
    keyId,
    teamId,
    bundleId: (process.env.APNS_BUNDLE_ID || "Io.GoGoods.music").trim(),
    production: (process.env.APNS_PRODUCTION || "1").trim() !== "0",
  };
}

function fcmConfigured(): boolean {
  return (process.env.FCM_SERVICE_ACCOUNT_JSON || "").trim().length > 0;
}

// ---- APNs delivery -------------------------------------------------------

// APNs provider JWTs must be regenerated periodically (Apple rejects ones
// older than ~1h and rate-limits frequent minting). Cache + refresh well
// inside the window.
let apnsJwtCache: { token: string; mintedAt: number } | null = null;
const APNS_JWT_TTL_MS = 50 * 60 * 1000;

async function apnsAuthToken(cfg: NonNullable<ReturnType<typeof apnsConfig>>): Promise<string> {
  const now = Date.now();
  if (apnsJwtCache && now - apnsJwtCache.mintedAt < APNS_JWT_TTL_MS) {
    return apnsJwtCache.token;
  }
  const key = await importPKCS8(cfg.keyP8.replace(/\\n/g, "\n"), "ES256");
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: cfg.keyId })
    .setIssuer(cfg.teamId)
    .setIssuedAt(Math.floor(now / 1000))
    .sign(key);
  apnsJwtCache = { token, mintedAt: now };
  return token;
}

type SendOutcome = { ok: boolean; invalid: boolean; reason?: string };

async function sendApns(
  cfg: NonNullable<ReturnType<typeof apnsConfig>>,
  deviceToken: string,
  payload: PushPayload,
): Promise<SendOutcome> {
  const host = cfg.production ? "https://api.push.apple.com" : "https://api.development.push.apple.com";
  let jwt: string;
  try {
    jwt = await apnsAuthToken(cfg);
  } catch (e) {
    return { ok: false, invalid: false, reason: `apns jwt: ${(e as Error).message}` };
  }
  const body = JSON.stringify({
    aps: { alert: { title: payload.title, body: payload.body }, sound: "default" },
    ...(payload.data ?? {}),
  });

  return new Promise<SendOutcome>((resolve) => {
    let settled = false;
    const done = (o: SendOutcome) => {
      if (settled) return;
      settled = true;
      try { client.close(); } catch { /* noop */ }
      resolve(o);
    };
    const client = http2.connect(host);
    client.on("error", (e) => done({ ok: false, invalid: false, reason: `apns conn: ${e.message}` }));
    const req = client.request({
      ":method": "POST",
      ":path": `/3/device/${deviceToken}`,
      authorization: `bearer ${jwt}`,
      "apns-topic": cfg.bundleId,
      "apns-push-type": "alert",
      "apns-priority": "10",
      "content-type": "application/json",
    });
    let status = 0;
    let respBody = "";
    req.on("response", (h) => { status = Number(h[":status"]) || 0; });
    req.setEncoding("utf8");
    req.on("data", (chunk) => { respBody += chunk; });
    req.on("error", (e) => done({ ok: false, invalid: false, reason: `apns req: ${e.message}` }));
    req.on("end", () => {
      if (status === 200) return done({ ok: true, invalid: false });
      // 410 = Unregistered; 400 with BadDeviceToken = dead token.
      const invalid = status === 410 || /BadDeviceToken|Unregistered/i.test(respBody);
      done({ ok: false, invalid, reason: `apns ${status}: ${respBody.slice(0, 200)}` });
    });
    req.setTimeout(10_000, () => done({ ok: false, invalid: false, reason: "apns timeout" }));
    req.end(body);
  });
}

// ---- FCM delivery --------------------------------------------------------

let fcmAccessTokenCache: { token: string; expiresAt: number } | null = null;
let fcmProjectId: string | null = null;

async function fcmAccessToken(): Promise<{ accessToken: string; projectId: string } | null> {
  try {
    const raw = (process.env.FCM_SERVICE_ACCOUNT_JSON || "").trim();
    if (!raw) return null;
    const creds = JSON.parse(raw) as { client_email: string; private_key: string; project_id?: string };
    const projectId = (process.env.FCM_PROJECT_ID || creds.project_id || "").trim();
    if (!projectId) return null;
    fcmProjectId = projectId;
    const now = Date.now();
    if (fcmAccessTokenCache && now < fcmAccessTokenCache.expiresAt - 60_000) {
      return { accessToken: fcmAccessTokenCache.token, projectId };
    }
    const { GoogleAuth } = await import("google-auth-library");
    const auth = new GoogleAuth({
      credentials: { client_email: creds.client_email, private_key: creds.private_key.replace(/\\n/g, "\n") },
      scopes: ["https://www.googleapis.com/auth/firebase.messaging"],
    });
    const client = await auth.getClient();
    const tok = await client.getAccessToken();
    const accessToken = typeof tok === "string" ? tok : tok?.token ?? "";
    if (!accessToken) return null;
    fcmAccessTokenCache = { token: accessToken, expiresAt: now + 55 * 60 * 1000 };
    return { accessToken, projectId };
  } catch (e) {
    console.warn(`[push] fcm auth failed: ${(e as Error).message}`);
    return null;
  }
}

async function sendFcm(deviceToken: string, payload: PushPayload): Promise<SendOutcome> {
  const auth = await fcmAccessToken();
  if (!auth) return { ok: false, invalid: false, reason: "fcm not configured" };
  try {
    const r = await fetch(`https://fcm.googleapis.com/v1/projects/${auth.projectId}/messages:send`, {
      method: "POST",
      headers: { Authorization: `Bearer ${auth.accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: {
          token: deviceToken,
          notification: { title: payload.title, body: payload.body },
          // Status-bar small icon + tint. Android requires a single-color
          // white-on-transparent silhouette here; `ic_stat_notify` is the
          // monochrome GoodTunes "G" shipped in the Android res drawables.
          // This mirrors the AndroidManifest FCM default meta-data so the
          // icon is correct whether or not the OS falls back to the default.
          android: {
            notification: { icon: "ic_stat_notify", color: "#319ED8" },
          },
          ...(payload.data ? { data: payload.data } : {}),
        },
      }),
    });
    if (r.ok) return { ok: true, invalid: false };
    const text = await r.text().catch(() => "");
    // UNREGISTERED / INVALID_ARGUMENT (bad token) → retire the token.
    const invalid = r.status === 404 || /UNREGISTERED|INVALID_ARGUMENT/i.test(text);
    return { ok: false, invalid, reason: `fcm ${r.status}: ${text.slice(0, 200)}` };
  } catch (e) {
    return { ok: false, invalid: false, reason: `fcm fetch: ${(e as Error).message}` };
  }
}

// ---- Public send path ----------------------------------------------------

export type PushSendResult = { sent: number; failed: number; skipped: number };

// Deliver `payload` to every live device of `customerId`. Picks the
// transport per-device by platform. Inert (logs + skips) when the
// matching provider isn't configured. Never throws.
export async function sendPushToCustomer(customerId: string, payload: PushPayload): Promise<PushSendResult> {
  const result: PushSendResult = { sent: 0, failed: 0, skipped: 0 };
  try {
    const devices = await listDevicesForCustomer(customerId);
    if (devices.length === 0) return result;

    const apns = apnsConfig();
    const hasFcm = fcmConfigured();

    for (const d of devices) {
      const platform = d.platform === "ios" ? "ios" : "android";
      const configured = platform === "ios" ? !!apns : hasFcm;
      if (!configured) {
        // Expected state in dev / before the operator loads keys. Log
        // once per device so the wiring is verifiable without sending.
        console.log(
          `[push:dry-run] would send to customer=${customerId} platform=${platform} title=${JSON.stringify(payload.title)} (no ${platform === "ios" ? "APNs" : "FCM"} credentials)`,
        );
        result.skipped += 1;
        continue;
      }
      const outcome =
        platform === "ios" ? await sendApns(apns!, d.token, payload) : await sendFcm(d.token, payload);
      if (outcome.ok) {
        result.sent += 1;
      } else {
        result.failed += 1;
        if (outcome.invalid) await markTokenInvalid(d.token, outcome.reason ?? "invalid");
        else console.warn(`[push] send failed platform=${platform}: ${outcome.reason}`);
      }
    }
  } catch (e) {
    console.error(`[push] sendPushToCustomer threw for ${customerId}: ${(e as Error).message}`);
  }
  return result;
}

// ---- Triggers ------------------------------------------------------------

// Fire-and-forget order-shipped alert. Called from the admin "mark
// shipped" path; swallows everything so the ship action is never blocked.
export function notifyOrderShipped(opts: {
  customerId: string;
  orderId: string;
  albumId: string;
  albumTitle: string;
}): void {
  void sendPushToCustomer(opts.customerId, {
    title: "Your order has shipped",
    body: `${opts.albumTitle} is on its way.`,
    data: { kind: "order_shipped", orderId: opts.orderId, albumId: opts.albumId },
  }).catch(() => {
    /* best-effort; never surface into the ship request */
  });
}
