// Shared, dependency-free logging helper.
//
// This intentionally lives OUTSIDE server/index.ts. Modules that only need
// log() — server/odoo.ts, server/giftScheduler.ts, server/credentialExpiry.ts —
// used to `import { log } from "./index"`, which forces Node to evaluate the
// entire server/index.ts module body. That body calls httpServer.listen() on
// the app port (5000) as a top-level side effect. So when the route tree
// lazy-imports one of those modules (e.g. registerRoutes → await import("./odoo")),
// merely booting the routes in a test would inadvertently start a second server
// on port 5000 and race the always-on dev/test workflows (EADDRINUSE). Importing
// log from here keeps logging free of that side effect.
export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}
