// Sentry must initialize before anything else loads so its auto-
// instrumentation can hook the runtime. Keep these two lines FIRST.
import "./instrument";
import * as Sentry from "@sentry/node";
import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStaticAssets, serveStaticFallback } from "./static";
import { createServer } from "http";
import { seedCatalog } from "./storage";
import { prewarmSpotifyToken } from "./lib/spotify";
import { authKindMiddleware, canonicalHostRedirect } from "./auth/host";
import { forwardToPostHog, geoFromRequest } from "./analytics";
import { alertOps } from "./opsAlert";
import { describeDbError, type DbErrorInfo } from "./db";
import { isStripeConfigured } from "./stripe";

const app = express();
app.set("trust proxy", 1);

// Health probe for external uptime monitors. Verifies the process is up
// AND the database is reachable (a `SELECT 1` with a hard timeout) so the
// "server is up but the DB is dead" failure mode — which is exactly what
// the login outage looked like from the outside — reports DOWN, not OK.
// No auth, no host gating: mounted before everything (even the canonical
// host redirect) so any monitor on any host gets a straight JSON answer.
app.get("/api/health", async (_req, res) => {
  const startedAt = Date.now();
  const { pool } = await import("./db");

  // Two layers of bounding so a slow/dead DB can't make this probe *worse*
  // than the outage it detects:
  //   1. An overall 4s deadline so the endpoint always answers fast.
  //   2. A driver-level statement_timeout on a dedicated client so the
  //      SELECT itself can't linger and tie up a pooled connection if the
  //      deadline wins the race — the client is always released.
  let timer: NodeJS.Timeout | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error("health probe timed out")), 4000);
  });

  const probe = (async () => {
    const client = await pool.connect();
    try {
      await client.query("SET statement_timeout = 3000");
      await client.query("SELECT 1");
    } finally {
      client.release();
    }
  })();
  // If the deadline wins, the probe still settles on its own and releases
  // its client; swallow its rejection so it never surfaces as unhandled.
  probe.catch(() => {});

  try {
    await Promise.race([probe, deadline]);
    res.status(200).json({
      status: "ok",
      db: "ok",
      uptimeSec: Math.round(process.uptime()),
      checkMs: Date.now() - startedAt,
      ts: new Date().toISOString(),
    });
  } catch (e: any) {
    // Don't leak internal failure detail to an unauthenticated probe — the
    // verbose reason goes to the server log (and the ops alert) instead.
    console.error(`[health] db probe failed: ${e?.message ?? e}`);
    res.status(503).json({
      status: "error",
      db: "unreachable",
      checkMs: Date.now() - startedAt,
      ts: new Date().toISOString(),
    });
  } finally {
    if (timer) clearTimeout(timer);
  }
});

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
        // Unwrap the real Postgres error (SQLSTATE + message + detail) the
        // express error handler stashed on res.locals, so the log names the
        // exact DB failure instead of drizzle's "Failed query:" wrapper.
        const dbErr: DbErrorInfo | undefined = (res.locals as any)?.dbError;
        const logPayload = {
          route: path,
          method: req.method,
          status: res.statusCode,
          durationMs: duration,
          message: errorMessage,
          ...(dbErr
            ? {
                dbCode: dbErr.code,
                dbMessage: dbErr.message,
                ...(dbErr.detail ? { dbDetail: dbErr.detail } : {}),
                ...(dbErr.constraint ? { dbConstraint: dbErr.constraint } : {}),
              }
            : {}),
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

      // Page on-call for ANY server-side 5xx on an /api route — not just
      // the admin GETs handled above. This is the net the login outage
      // fell through: the failing lookup was POST /api/auth/*, which the
      // admin-only alarm never watched. Throttled + deduped in opsAlert;
      // strictly fire-and-forget so it can't affect the response.
      if (res.statusCode >= 500) {
        const errMsg =
          (capturedJsonResponse && typeof capturedJsonResponse.message === "string"
            ? capturedJsonResponse.message
            : null) || "unknown error";
        // Surface the real Postgres error the express error handler stashed
        // on res.locals so the alert email names the exact failure (SQLSTATE
        // + message + detail/constraint), not just drizzle's "Failed query:".
        const dbErr: DbErrorInfo | undefined = (res.locals as any)?.dbError;
        const detail = [
          `When:    ${new Date().toISOString()}`,
          `Where:   ${req.method} ${path}`,
          `Status:  ${res.statusCode}`,
          `Took:    ${duration}ms`,
          `Host:    ${req.headers.host ?? "(unknown)"}`,
          `Message: ${errMsg}`,
          ...(dbErr
            ? [
                `DB code: ${dbErr.code ?? "(none)"}`,
                `DB msg:  ${dbErr.message}`,
                ...(dbErr.detail ? [`DB detail: ${dbErr.detail}`] : []),
                ...(dbErr.constraint ? [`DB constraint: ${dbErr.constraint}`] : []),
              ]
            : []),
        ].join("\n");
        alertOps({
          signature: `${res.statusCode} ${req.method} ${path}`,
          subject: `[GoodTunes] ${res.statusCode} on ${req.method} ${path}`,
          detail,
        });
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
        RETURNING id, email`,
    );
    if (r.rowCount && r.rowCount > 0) {
      log(`promoted ${r.rows[0].email} to super_admin (founder safety net)`, "auth");
      // Task #1036 — keep the membership SET in lock-step with the
      // raw role write above (no-op until the table is backfilled).
      try {
        const { syncUserMembership } = await import("./auth/roles");
        await syncUserMembership(r.rows[0].id);
      } catch (e: any) {
        log(`founder membership sync skipped: ${e?.message ?? e}`, "auth");
      }
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

  // Task #475 — Soft-delete sweeper. Once a day, hard-delete any row
  // whose `deleted_at` is more than 30 days old across the 14 admin
  // tables that opted into soft-delete. The first tick fires ~60s
  // after boot so the server is healthy before we run a write pass,
  // and a guard variable prevents overlap if a sweep ever runs long.
  try {
    const { sweepExpiredTrash } = await import("./softDelete");
    let sweeping = false;
    const runSweep = async () => {
      if (sweeping) return;
      sweeping = true;
      try {
        const out = await sweepExpiredTrash(30);
        const total = out.reduce((n, r) => n + r.purged, 0);
        if (total > 0) {
          log(`trash sweep purged ${total} row(s): ${out.map((r) => `${r.table}=${r.purged}`).join(", ")}`, "trash-sweep");
        }
      } catch (e: any) {
        log(`trash sweep failed: ${e?.message ?? e}`, "trash-sweep");
      } finally {
        sweeping = false;
      }
    };
    setTimeout(runSweep, 60 * 1000);
    setInterval(runSweep, 24 * 60 * 60 * 1000);
    log("trash sweeper armed (daily tick, 30-day TTL)", "trash-sweep");
  } catch (e: any) {
    log(`trash sweeper init failed: ${e?.message ?? e}`, "trash-sweep");
  }

  // Task #543 — Daily digest mail to Bill of every still-HELD payout
  // earmark. Mirrors the trash sweeper shape (long first delay so boot
  // logs settle, then a 24h tick; in-process guard prevents overlap).
  // The digest helper itself short-circuits if a digest already went
  // out in the last ~20h so a server restart never double-mails.
  try {
    const { sendBillDailyDigest } = await import("./payoutEarmarks");
    let digesting = false;
    const runDigest = async () => {
      if (digesting) return;
      digesting = true;
      try {
        const out = await sendBillDailyDigest();
        if (out.sent) {
          log(`payout digest sent to Bill — ${out.count} held / $${((out.totalCents ?? 0) / 100).toFixed(2)}`, "earmark-digest");
        }
      } catch (e: any) {
        log(`payout digest tick failed: ${e?.message ?? e}`, "earmark-digest");
      } finally {
        digesting = false;
      }
    };
    setTimeout(runDigest, 5 * 60 * 1000);
    setInterval(runDigest, 24 * 60 * 60 * 1000);
    log("payout digest scheduler armed (daily tick)", "earmark-digest");
  } catch (e: any) {
    log(`payout digest scheduler init failed: ${e?.message ?? e}`, "earmark-digest");
  }

  // Task #1783 — Daily sales report digest for artists + their team.
  // Once a day, every `person` / `label` partner with active notification
  // recipients gets an email summary of the last 24h of sales for the
  // releases they can see. Same shape as the payout digest above (long
  // first delay so boot logs settle, then a 24h tick, in-process guard).
  // The digest helper itself short-circuits per-partner via the
  // notification log so a restart never double-mails, and stays quiet on
  // empty-activity days unless DAILY_SALES_DIGEST_SEND_EMPTY=true.
  try {
    const { runDailySalesDigests } = await import("./dailySalesReport");
    let digestingSales = false;
    const runSalesDigest = async () => {
      if (digestingSales) return;
      digestingSales = true;
      try {
        const out = await runDailySalesDigests();
        if (out.sent > 0) {
          log(
            `daily sales digest sent to ${out.sent} partner(s) — ${out.skippedEmpty} quiet, ${out.skippedRecent} already-sent`,
            "sales-digest",
          );
        }
      } catch (e: any) {
        log(`sales digest tick failed: ${e?.message ?? e}`, "sales-digest");
      } finally {
        digestingSales = false;
      }
    };
    setTimeout(runSalesDigest, 6 * 60 * 1000);
    setInterval(runSalesDigest, 24 * 60 * 60 * 1000);
    log("daily sales digest scheduler armed (daily tick)", "sales-digest");
  } catch (e: any) {
    log(`sales digest scheduler init failed: ${e?.message ?? e}`, "sales-digest");
  }

  // Task #550 — Daily scheduler for scheduled-delivery gifts. Stamps
  // deliveredAt on any pending gift whose deliver_on date has arrived
  // so the recipient's claim page unlocks. Same shape as the trash
  // sweeper above (long first delay + 24h tick + in-process guard).
  try {
    const { armGiftDeliveryScheduler } = await import("./giftScheduler");
    armGiftDeliveryScheduler();
  } catch (e: any) {
    log(`gift scheduler init failed: ${e?.message ?? e}`, "gift-scheduler");
  }

  // Task #2084 — Pre-warn before the GitHub build-mirror push token expires.
  // The post-merge mirror push uses GITHUB_TOKEN, a hand-rotated ~90-day PAT;
  // on lapse the push fails silently (iOS builds stale, Android testers stuck
  // on the old .aab). This reads the token's real expiry header and pages
  // on-call (via alertOps) when <14 days remain. No token → quiet no-op.
  try {
    const { armGithubTokenExpiryScheduler } = await import("./githubTokenExpiry");
    armGithubTokenExpiryScheduler();
  } catch (e: any) {
    log(`github-token expiry watch init failed: ${e?.message ?? e}`, "github-token");
  }

  // Task #1976 — Odoo printer integration. In-process poll scheduler that
  // pulls production/shipping status out of Odoo and reconciles it onto our
  // fulfillment_status (Odoo's webhook story is uneven, so we pull instead
  // of receiving). Arms unconditionally; every tick is a clean no-op while
  // the ODOO_* credentials are unset.
  try {
    const { armOdooPollScheduler } = await import("./odoo");
    armOdooPollScheduler();
  } catch (e: any) {
    log(`odoo poll scheduler init failed: ${e?.message ?? e}`, "odoo-poll");
  }

  // Task #364 — Loud one-line warning at boot when Mux isn't fully
  // configured. The pipeline degrades to "raw audio only" without these
  // keys, so the operator needs to see the gap on the next deploy log
  // rather than discovering it when a fan presses Play. Listed secrets
  // are the *missing* ones; if all four are set the line is silent.
  try {
    const { muxMissingSecrets } = await import("./mux");
    const missing = muxMissingSecrets();
    if (missing.length > 0) {
      log(
        `WARNING — Mux is NOT fully configured. Missing: ${missing.join(", ")}. ` +
          `Songs will fall back to raw-audio mode for admin previews and refuse customer playback.`,
        "mux",
      );
    } else {
      log("mux: configured (token + signing key present)", "mux");
    }
  } catch (e: any) {
    log(`mux status check failed: ${e?.message ?? e}`, "mux");
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

  // Apple Pay / Google Pay enablement. Embedded Checkout only renders the
  // wallet buttons once each fan host is registered with Stripe as a
  // payment method domain (and Stripe has fetched the well-known
  // association file off that host). Register best-effort at boot so Apple
  // Pay turns on automatically wherever this runs — the test account in
  // dev, the live account in prod — without any manual step. Fully guarded:
  // a host that doesn't serve the file yet is just logged, never fatal. Run
  // a touch after boot so the route serving the file is already live.
  if (isStripeConfigured()) {
    setTimeout(() => {
      import("./applePay")
        .then(({ ensureApplePayDomainsOnce }) => ensureApplePayDomainsOnce())
        .then((summary) => {
          if (summary) log(`apple-pay domains: ${summary}`, "apple-pay");
        })
        .catch((e: any) => log(`apple-pay domain sync skipped: ${e?.message ?? e}`, "apple-pay"));
    }, 10 * 1000);
  } else {
    log("apple-pay: Stripe not configured, skipping domain registration", "apple-pay");
  }

  app.use((err: any, req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error("Internal Server Error:", err);

    // Unwrap drizzle's wrapper to the real Postgres error and stash it on
    // res.locals so the request-logger's finish handler (the [admin-list-
    // error] log + the ops-alert email) can name the exact SQLSTATE +
    // message + detail/constraint instead of "Failed query: …".
    const dbErr = describeDbError(err);
    if (dbErr) {
      (res.locals as any).dbError = dbErr;
    }

    // Ship server-side faults to Sentry (no-op until SENTRY_DSN is set) so we
    // get the full stack trace, not just the email ping. We attach request
    // context by hand rather than relying on auto-instrumentation, which is
    // unreliable once the server is bundled for production (script/build.ts) —
    // this way the event always carries which route/method/host threw.
    if (status >= 500) {
      Sentry.withScope((scope) => {
        scope.setContext("request", {
          method: req.method,
          url: req.originalUrl,
          host: req.headers.host ?? null,
        });
        Sentry.captureException(err);
      });
    }

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
