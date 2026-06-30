// Task #77 — Admin & super-admin god-view report routes.
//
// All routes here are gated to super_admin. Partner-scoped versions of
// the basic cuts (sales/plays/payouts/etc.) live in ./routes.ts.
import type { Express, Request, Response } from "express";
import { requireRole } from "../auth/roles";
import {
  platformKpis,
  revenueBreakdown,
  topContent,
  opsHealth,
  payoutReconciliation,
  rawEvents,
  posthogEmbeds,
  incompleteAlbums,
  funnelReleases,
  acquisitionFunnel,
  type AdminReportContext,
} from "./admin";
import { partnerActivity, partnerActivityTimelineByInviteId } from "./partnerActivity";
import { toCsv, dollarsFromCents } from "./csv";

function parseRange(req: Request): { from: Date; to: Date } {
  const fromStr = String(req.query.from || "");
  const toStr = String(req.query.to || "");
  const now = new Date();
  const to = toStr ? new Date(toStr) : now;
  const from = fromStr ? new Date(fromStr) : new Date(now.getTime() - 30 * 86400_000);
  from.setUTCHours(0, 0, 0, 0);
  const toEnd = new Date(to);
  toEnd.setUTCHours(23, 59, 59, 999);
  return { from, to: toEnd };
}

function ctxFromReq(req: Request): AdminReportContext {
  return parseRange(req);
}

function sendCsv(res: Response, filename: string, body: string) {
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(body);
}

function wrap(fn: (req: Request, res: Response) => Promise<any>) {
  return async (req: Request, res: Response) => {
    try {
      await fn(req, res);
    } catch (e: any) {
      console.error("[admin/reports]", req.path, e);
      res.status(500).json({ message: e.message });
    }
  };
}

export function registerAdminReportRoutes(app: Express) {
  // Two-tier gating:
  //   * adminGuard — broader admin tier. Allowed: super_admin + admin.
  //     Covers non-sensitive god-view cuts (platform KPIs, revenue
  //     breakdown, top content, ops health, PostHog embeds).
  //   * superGuard — super-admin only. Covers sensitive cuts: payout
  //     reconciliation (exposes Stripe Connect deltas across all owners)
  //     and the raw event explorer (full per-user analytics history).
  const adminGuard = requireRole("super_admin", "admin");
  const superGuard = requireRole("super_admin");

  // ─── Platform KPIs ───────────────────────────────────────────────
  app.get("/api/admin/reports/kpis", adminGuard, wrap(async (req, res) => {
    const data = await platformKpis(ctxFromReq(req));
    res.json(data);
  }));
  app.get("/api/admin/reports/kpis.csv", adminGuard, wrap(async (req, res) => {
    const data = await platformKpis(ctxFromReq(req));
    sendCsv(res, "platform-kpis.csv", toCsv(
      data.series.map((r) => ({ date: r.date, gmv: dollarsFromCents(r.gmvCents), orders: r.orders, signups: r.signups, plays: r.plays })),
      ["date", "gmv", "orders", "signups", "plays"],
    ));
  }));

  // ─── Revenue breakdown ───────────────────────────────────────────
  app.get("/api/admin/reports/revenue", adminGuard, wrap(async (req, res) => {
    const data = await revenueBreakdown(ctxFromReq(req));
    res.json(data);
  }));
  app.get("/api/admin/reports/revenue.csv", adminGuard, wrap(async (req, res) => {
    const data = await revenueBreakdown(ctxFromReq(req));
    const dim = String(req.query.dim || "sku");
    if (dim === "sku") {
      sendCsv(res, "revenue-by-sku.csv", toCsv(
        data.bySku.map((r) => ({ kind: r.kind, units: r.units, dollars: dollarsFromCents(r.cents) })),
        ["kind", "units", "dollars"],
      ));
    } else if (dim === "label") {
      sendCsv(res, "revenue-by-label.csv", toCsv(
        data.byLabel.map((r) => ({ label: r.name, labelId: r.id, units: r.units, dollars: dollarsFromCents(r.cents) })),
        ["label", "labelId", "units", "dollars"],
      ));
    } else if (dim === "artist") {
      sendCsv(res, "revenue-by-artist.csv", toCsv(
        data.byArtist.map((r) => ({ artist: r.name, artistId: r.id, units: r.units, dollars: dollarsFromCents(r.cents) })),
        ["artist", "artistId", "units", "dollars"],
      ));
    } else {
      sendCsv(res, "revenue-by-country.csv", toCsv(
        data.byCountry.map((r) => ({ country: r.country, units: r.units, dollars: dollarsFromCents(r.cents) })),
        ["country", "units", "dollars"],
      ));
    }
  }));

  // ─── Top content (plays) ─────────────────────────────────────────
  app.get("/api/admin/reports/top-content", adminGuard, wrap(async (req, res) => {
    const data = await topContent(ctxFromReq(req));
    res.json(data);
  }));
  app.get("/api/admin/reports/top-content.csv", adminGuard, wrap(async (req, res) => {
    const data = await topContent(ctxFromReq(req));
    const dim = String(req.query.dim || "songs");
    if (dim === "songs") {
      sendCsv(res, "top-songs.csv", toCsv(data.songs, ["songId", "title", "artist", "albumTitle", "plays", "listeners"]));
    } else if (dim === "albums") {
      sendCsv(res, "top-albums.csv", toCsv(data.albums, ["albumId", "title", "artist", "plays", "listeners"]));
    } else if (dim === "artists") {
      sendCsv(res, "top-artists.csv", toCsv(data.artists, ["artistId", "name", "plays", "listeners"]));
    } else {
      sendCsv(res, "top-labels.csv", toCsv(data.labels, ["labelId", "name", "plays", "listeners"]));
    }
  }));

  // ─── Ops health ──────────────────────────────────────────────────
  app.get("/api/admin/reports/ops", adminGuard, wrap(async (req, res) => {
    const data = await opsHealth(ctxFromReq(req));
    res.json(data);
  }));
  // Per-table CSV exports — each tabular cut on the Ops tab gets its
  // own download so an operator can pipe just the rows they need.
  app.get("/api/admin/reports/ops/stuck.csv", adminGuard, wrap(async (req, res) => {
    const data = await opsHealth(ctxFromReq(req));
    sendCsv(res, "failed-fulfillment-pushes.csv", toCsv(
      data.stuckFulfillments.rows.map((r: any) => ({
        orderId: r.id,
        buyer: r.buyerName || r.buyerEmail || "",
        fulfillmentStatus: r.fulfillmentStatus ?? "",
        fulfillmentError: r.fulfillmentError ?? "",
        orderDeskOrderId: r.orderDeskOrderId ?? "",
        createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : "",
      })),
      ["orderId", "buyer", "fulfillmentStatus", "fulfillmentError", "orderDeskOrderId", "createdAt"],
    ));
  }));
  app.get("/api/admin/reports/ops/failed.csv", adminGuard, wrap(async (req, res) => {
    const data = await opsHealth(ctxFromReq(req));
    sendCsv(res, "failed-checkouts.csv", toCsv(
      data.failedCheckouts.rows.map((r: any) => ({
        orderId: r.id,
        buyerEmail: r.buyerEmail ?? "",
        amountDollars: dollarsFromCents(r.totalCents),
        albumId: r.albumId ?? "",
        createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : "",
      })),
      ["orderId", "buyerEmail", "amountDollars", "albumId", "createdAt"],
    ));
  }));

  // ─── Incomplete-albums audit ("Needs attention") ─────────────────
  // Task #1967 — operator-reachable (adminGuard) audit of GoodTunes
  // releases short of complete in at least one production dimension.
  app.get("/api/admin/reports/incomplete-albums", adminGuard, wrap(async (_req, res) => {
    const data = await incompleteAlbums();
    // Task #2372 — enrich each art-less row with its effective press logo +
    // jacket art so the Attention tab shows the press placeholder, matching the
    // grid/list views. Admin-only route, so these fields never leak to fans.
    const { batchEnrichWithPressPlaceholders } = await import("../routes");
    const rows = await batchEnrichWithPressPlaceholders(data.rows);
    res.json({ rows });
  }));

  // ─── Payout reconciliation (super-admin) ─────────────────────────
  app.get("/api/admin/reports/reconciliation", superGuard, wrap(async (req, res) => {
    const data = await payoutReconciliation(ctxFromReq(req));
    res.json(data);
  }));
  app.get("/api/admin/reports/reconciliation.csv", superGuard, wrap(async (req, res) => {
    const data = await payoutReconciliation(ctxFromReq(req));
    sendCsv(res, "payout-reconciliation.csv", toCsv(
      data.rows.map((r) => ({
        kind: r.kind,
        ownerName: r.ownerName,
        ownerId: r.id,
        stripeAccountId: r.stripeAccountId ?? "",
        payoutsEnabled: r.payoutsEnabled ? "yes" : "no",
        shippedCount: r.shippedCount,
        transferredCount: r.transferredCount,
        failedCount: r.failedCount,
        computedDollars: dollarsFromCents(r.computedCents),
        transferredDollars: dollarsFromCents(r.transferredCents),
        pendingDollars: dollarsFromCents(r.pendingCents),
        deltaDollars: dollarsFromCents(r.deltaCents),
      })),
      ["kind", "ownerName", "ownerId", "stripeAccountId", "payoutsEnabled", "shippedCount", "transferredCount", "failedCount", "computedDollars", "transferredDollars", "pendingDollars", "deltaDollars"],
    ));
  }));

  // ─── Raw event explorer ─────────────────────────────────────────
  app.get("/api/admin/reports/events", superGuard, wrap(async (req, res) => {
    const data = await rawEvents(ctxFromReq(req), {
      name: (req.query.name as string) || undefined,
      userId: (req.query.userId as string) || undefined,
      sessionId: (req.query.sessionId as string) || undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
    });
    res.json(data);
  }));
  app.get("/api/admin/reports/events.csv", superGuard, wrap(async (req, res) => {
    const data = await rawEvents(ctxFromReq(req), {
      name: (req.query.name as string) || undefined,
      userId: (req.query.userId as string) || undefined,
      sessionId: (req.query.sessionId as string) || undefined,
      limit: 1000,
    });
    sendCsv(res, "raw-events.csv", toCsv(
      data.rows.map((r: any) => ({
        ts: r.ts ? new Date(r.ts).toISOString() : "",
        name: r.name,
        userId: r.userId ?? "",
        sessionId: r.sessionId ?? "",
        payload: r.payload ? JSON.stringify(r.payload) : "",
      })),
      ["ts", "name", "userId", "sessionId", "payload"],
    ));
  }));

  // ─── PostHog embed config ────────────────────────────────────────
  app.get("/api/admin/reports/posthog", adminGuard, wrap(async (_req, res) => {
    res.json(posthogEmbeds());
  }));

  // ─── Partner activity report (super-admin) ───────────────────────
  app.get("/api/admin/reports/partner-activity", superGuard, wrap(async (_req, res) => {
    res.json(await partnerActivity());
  }));

  // Per-partner timeline — fetched on row-expand to avoid N+1 in the list.
  app.get("/api/admin/reports/partner-activity/:inviteId/timeline", superGuard, wrap(async (req, res) => {
    const timeline = await partnerActivityTimelineByInviteId(req.params.inviteId);
    res.json({ timeline });
  }));

  // ─── Release acquisition funnel (Task #2127) ─────────────────────
  // Releases that have any funnel traffic — powers the picker. Not
  // date-bounded so the list stays stable as the window changes.
  app.get("/api/admin/reports/funnel/releases", adminGuard, wrap(async (_req, res) => {
    res.json(await funnelReleases());
  }));

  // The funnel itself for one release, date-ranged + broken down by source.
  app.get("/api/admin/reports/funnel", adminGuard, wrap(async (req, res) => {
    const albumId = String(req.query.albumId || "");
    // Task #2257 — opt-in internal/test-traffic exclusion. Off by default so
    // the headline number stays the raw total; the operator flips it on to
    // see the funnel with operator/staff + flagged-device sessions removed.
    const excludeInternal =
      req.query.excludeInternal === "1" || req.query.excludeInternal === "true";
    const data = await acquisitionFunnel(ctxFromReq(req), {
      albumId,
      groupBy: req.query.groupBy === "source" ? "source" : null,
      excludeInternal,
    });
    res.json(data);
  }));
}
