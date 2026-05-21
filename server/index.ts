import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStaticAssets, serveStaticFallback } from "./static";
import { createServer } from "http";
import { seedCatalog } from "./storage";
import { prewarmSpotifyToken } from "./lib/spotify";
import { authKindMiddleware, canonicalHostRedirect } from "./auth/host";

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

(async () => {
  await seedCatalog();
  await registerRoutes(httpServer, app);

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
