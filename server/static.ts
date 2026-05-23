import express, { type Express } from "express";
import fs from "fs";
import path from "path";
import { injectAlbumOg } from "./og";

function getDistPath(): string {
  const distPath = path.resolve(__dirname, "public");
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }
  return distPath;
}

// Mount the built client's static files (index.html, /assets/*, images, etc.)
// BEFORE route registration so Replit's HTTP health probe on `/` gets a 2xx
// immediately after listen(). This does NOT include the SPA catch-all — that
// has to run last so it doesn't shadow /api/* while routes are still being
// registered. Pair this with serveStaticFallback() once init is finished.
export function serveStaticAssets(app: Express) {
  const distPath = getDistPath();
  app.use(
    express.static(distPath, {
      // Content-hashed bundles under /assets/* are safe to cache forever;
      // index.html (and any other top-level html) must NEVER be cached so
      // iOS Safari can't get stuck pointing at a deleted bundle hash after
      // a deploy. The SPA fallback in serveStaticFallback() also sets
      // no-store for the same reason.
      setHeaders: (res, filePath) => {
        if (/\.html$/i.test(filePath)) {
          res.setHeader("Cache-Control", "no-store, must-revalidate");
        } else if (/[\\/]assets[\\/]/.test(filePath)) {
          res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        }
      },
    }),
  );
}

// Mount the album OG injector + SPA index.html fallback. Call this AFTER all
// API routes are registered — its catch-all `/{*path}` would otherwise eat
// every /api/* request during the init window and return index.html instead
// of letting the real route handle it.
export function serveStaticFallback(app: Express) {
  const distPath = getDistPath();

  app.get("/album/:id", (req, res, next) => {
    try {
      const indexPath = path.resolve(distPath, "index.html");
      const template = fs.readFileSync(indexPath, "utf-8");
      const injected = injectAlbumOg(template, req, req.params.id);
      if (!injected) return next();
      res
        .status(200)
        .set({
          "Content-Type": "text/html",
          "Cache-Control": "no-store, must-revalidate",
        })
        .end(injected);
    } catch (e) {
      next(e);
    }
  });

  // fall through to index.html if the file doesn't exist. no-store so iOS
  // Safari always asks for the freshest HTML — bundles are content-hashed
  // and cached forever (see serveStaticAssets), so this is cheap and
  // guarantees a redeploy reaches the user on next navigation.
  app.use("/{*path}", (_req, res) => {
    res.setHeader("Cache-Control", "no-store, must-revalidate");
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
