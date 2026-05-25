import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStaticAssets, serveStaticFallback } from "./static";
import { createServer } from "http";
import { seedCatalog } from "./storage";
import { prewarmSpotifyToken } from "./lib/spotify";
import { authKindMiddleware, canonicalHostRedirect } from "./auth/host";
import { forwardToPostHog, geoFromRequest } from "./analytics";

const app = express();
app.set("trust proxy", 1);

// Tag every request with `req.authKind` (admin | customer) from the host,
// and redirect *.replit.app traffic to the canonical subdomain in prod.
// Both run before the body parsers so the redirect can short-circuit
// before we read any payload.
app.use(canonicalHostRedirect);
app.use(authKindMiddleware);
const httpServer = createServer(app)

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

// Stripe webhooks must read the **raw** request body so the signature
// header verifies against the exact bytes Stripe sent. We mount raw()
// only on the webhook path; every other route still gets JSON below.
app.use("/api/webhooks/stripe", express.raw({ type: "*/*", limit: "1mb" }));
// Task #49 — Shopify webhook handler. Same raw-body posture as Stripe so
// the X-Shopify-Hmac-Sha256 header verifies against the exact bytes
// Shopify signed.
app.use("/api/webhooks/shopify", express.raw({ type: "*/*", limit: "1mb" }));
// Task #73 — Order Desk webhook. Same raw-body posture so the
// X-Orderdesk-Signature header HMAC-verifies against the exact bytes
// Order Desk signed.
app.use("/api/webhooks/orderdesk", express.raw({ type: "*/*", limit: "1mb" }));

app.use(
  express.json({
    // 10MB ceiling so profile-photo and other small image data-URLs
    // (≤5MB raw → ~7MB base64) make it past the body parser. Real
    // file uploads (audio/video/album art) go through multer, not
    // JSON, so this isn't the limit for anything large.
    limit: "10mb",
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

// Admin-uploaded images now live in Replit Object Storage and are served by
// GET /objects/uploads/<id> (see server/routes.ts). The old local "uploads/"
// disk was ephemeral on Autoscale deploys and is no longer used.

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      // Never echo auth payloads — TOTP secrets, QR data URLs, recovery
      // codes, bearer tokens, OAuth state, and password hashes all flow
      // through /api/auth/* and /api/{login,register,logout,me}. Logging
      // any of them defeats the auth design. We still log status + path
      // so we can see traffic shape, just not the body.
      const isAuthPath =
        path.startsWith("/api/auth/") ||
        path === "/api/login" ||
        path === "/api/register" ||
        path === "/api/me" ||
        path === "/api/logout";
      if (capturedJsonResponse && !isAuthPath) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);

      // Task #151 — Admin list error alarm. When a GET on an admin endpoint
      // returns 5xx, emit a structured log line and (in prod) a PostHog
      // event so schema drift / handler crashes surface the moment they
      // land — instead of waiting for Nick to open the affected page.
      if (
        res.statusCode >= 500 &&
        req.method === "GET" &&
        path.startsWith("/api/admin/")
      ) {
        const errorMessage =
          (capturedJsonResponse && typeof capturedJsonResponse.message === "string"
            ? capturedJsonResponse.message
            : null) || "unknown error";
        const logPayload = {
          route: path,
          method: req.method,
          status: res.statusCode,
          durationMs: duration,
          message: errorMessage,
        };
        console.error("[admin-list-error]", JSON.stringify(logPayload));

        if (process.env.NODE_ENV === "production") {
          const geo = geoFromRequest(req);
          // Fire-and-forget — never block the response on PostHog.
          void forwardToPostHog([
            {
              name: "admin_list_error",
              payload: logPayload,
              ts: new Date(),
              country: geo.country,
              region: geo.region,
            },
          ]);
        }
      }
    }
  });

  next();
});

// In production, mount the built client's static assets BEFORE listen() so
// Replit's deploy health probe — an HTTP GET on `/` — gets a real 2xx with
// index.html the moment the port opens. Without this, the probe lands while
// seedCatalog + registerRoutes are still running and gets a 404, which
// Replit reads as unhealthy and kills the Promote stage. The SPA catch-all
// (serveStaticFallback) and OG injector mount AFTER routes so they don't
// shadow /api/*.
if (process.env.NODE_ENV === "production") {
  serveStaticAssets(app);
}

// Bind the port FIRST so the health probe finds an open socket within the
// Promote-stage window. Route registration, catalog seeding, Vite/static
// fallback, and Spotify pre-warm all run AFTER listen().
const port = parseInt(process.env.PORT || "5000", 10);
httpServer.listen(
  {
    port,
    host: "0.0.0.0",
    reusePort: true,
  },
  () => {
    log(`serving on port ${port}`);
  },
);

// Task #256 — Idempotent founder + access-request bootstrap.
//
// `bill@gogoods.com` MUST always carry role=super_admin: if a manual
// edit, restore, or migration knocks the role off his users row, the
// next boot puts it back. The row itself is not created from scratch
// (we have no password to seed) — this only updates an existing row.
//
// Also ensures the admin_access_requests table exists so the customer→
// admin-shell promote flow has somewhere to record cross-shell hits.
// CREATE-IF-NOT-EXISTS keeps it safe in both DEV and PROD (prod schema
// drift is the documented norm; see .agents/memory/MEMORY.md).
async function bootstrapAccessGuard() {
  const { pool } = await import("./db");
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS admin_access_requests (
        customer_user_id varchar PRIMARY KEY,
        email text NOT NULL,
        display_name text NOT NULL,
        first_requested_at timestamp NOT NULL DEFAULT NOW(),
        last_requested_at timestamp NOT NULL DEFAULT NOW(),
        last_notified_at timestamp,
        resolved_at timestamp
      )
    `);
  } catch (e: any) {
    log(`admin_access_requests ensure failed: ${e?.message ?? e}`, "auth");
  }
  try {
    const r = await pool.query(
      `UPDATE users SET role = 'super_admin'
        WHERE lower(email) = 'bill@gogoods.com'
          AND (role IS NULL OR role <> 'super_admin')
        RETURNING email`,
    );
    if (r.rowCount && r.rowCount > 0) {
      log(`promoted ${r.rows[0].email} to super_admin (founder safety net)`, "auth");
    }
  } catch (e: any) {
    log(`founder super_admin seed skipped: ${e?.message ?? e}`, "auth");
  }
}

(async () => {
  await seedCatalog();
  await registerRoutes(httpServer, app);
  await bootstrapAccessGuard();

  // Task #246 — Signed-cert sale-window scheduler. In-process tick every
  // 5 minutes promotes `scheduled` → `open` and closes any window whose
  // `closesAt` has passed (min-check, refund pass, or production flip).
  // Single-node only — if we scale out, lift this into a pg-advisory-
  // lock-guarded job.
  try {
    const { runDueSaleWindows } = await import("./saleWindow");
    runDueSaleWindows().catch((e) => log(`saleWindow first run failed: ${e?.message ?? e}`, "sale-window"));
    setInterval(() => {
      runDueSaleWindows().catch((e) => log(`saleWindow tick failed: ${e?.message ?? e}`, "sale-window"));
    }, 5 * 60 * 1000);
    log("signed-cert sale-window scheduler armed (5min tick)", "sale-window");
  } catch (e: any) {
    log(`saleWindow scheduler init failed: ${e?.message ?? e}`, "sale-window");
  }

  // One-line OAuth provider status so operators can confirm at-a-glance
  // that the Apple/Google sign-in buttons will actually work in this
  // environment (env var present + key normalised). No secret values
  // are printed — only the gate booleans + which Services ID is in use.
  try {
    const { APPLE_CONFIGURED, GOOGLE_CONFIGURED } = await import("./auth/oauth");
    log(
      `oauth: google=${GOOGLE_CONFIGURED ? "on" : "off"} apple=${APPLE_CONFIGURED ? `on (${process.env.APPLE_SERVICES_ID})` : "off"}`,
      "auth",
    );
  } catch (e: any) {
    log(`oauth status check failed: ${e?.message ?? e}`, "auth");
  }

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error("Internal Server Error:", err);

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStaticFallback(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // Fire-and-forget Spotify token pre-warm so the admin's first
  // artist search doesn't pay the cold-start cost (and so a flaky
  // accounts.spotify.com edge has 3 retry attempts before any UI
  // sees a failure).
  prewarmSpotifyToken();
})();
