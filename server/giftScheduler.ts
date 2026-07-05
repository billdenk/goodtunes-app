// Task #550 — Daily delivery scheduler for scheduled gifts.
//
// Mirrors the trash-sweeper / payout-digest pattern in server/index.ts:
// long-ish first tick after boot so logs settle, then a 24h interval.
// An in-process guard variable prevents overlap if a tick ever runs
// long. The work itself lives in server/gifts.ts (runDueGiftDeliveries)
// so this module stays tiny and the unit-of-work is reusable from a
// debug admin endpoint if we ever add one.
import type { Express } from "express";
import { log } from "./log";
import { runDueGiftDeliveries } from "./gifts";

export function armGiftDeliveryScheduler() {
  let ticking = false;
  const tick = async () => {
    if (ticking) return;
    ticking = true;
    try {
      const n = await runDueGiftDeliveries();
      if (n > 0) log(`delivered ${n} scheduled gift(s)`, "gift-scheduler");
    } catch (e: any) {
      log(`gift scheduler tick failed: ${e?.message ?? e}`, "gift-scheduler");
    } finally {
      ticking = false;
    }
  };
  // First tick ~90s after boot (slightly after the trash sweeper) so
  // we never crowd boot logs with three "first run" lines at once.
  setTimeout(tick, 90 * 1000);
  setInterval(tick, 24 * 60 * 60 * 1000);
  log("gift delivery scheduler armed (daily tick)", "gift-scheduler");
}

// Optional debug hook — admin can poke `/api/admin/gifts/run-deliveries`
// to flush the queue without waiting for the daily tick. Mounted only
// when registerGiftSchedulerDebug is called from server/routes.ts.
export function registerGiftSchedulerDebug(app: Express) {
  app.post("/api/admin/gifts/run-deliveries", async (req, res) => {
    const { storage } = await import("./storage");
    const auth = req.headers.authorization;
    let ok = false;
    if (auth?.startsWith("Bearer ")) {
      const a = await storage.getAuthBy(auth.slice(7));
      if (a?.kind === "admin") ok = true;
    }
    if (!ok && req.session?.kind === "admin") ok = true;
    if (!ok) return res.status(401).json({ message: "Admin only" });
    const n = await runDueGiftDeliveries();
    res.json({ delivered: n });
  });
}
