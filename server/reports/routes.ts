import type { Express, Request, Response } from "express";
import { requireReportScope } from "../auth/roles";
import {
  salesOverTime,
  playsEngagement,
  payoutsReceived,
  shopifyRedemption,
  topFans,
  fanMap,
  referralEarnings,
  partnerFunnelReleases,
  partnerAcquisitionFunnel,
  type ReportContext,
} from "./index";
import { toCsv, dollarsFromCents } from "./csv";

function parseRange(req: Request): { from: Date; to: Date } {
  const fromStr = String(req.query.from || "");
  const toStr = String(req.query.to || "");
  const now = new Date();
  const to = toStr ? new Date(toStr) : now;
  const from = fromStr ? new Date(fromStr) : new Date(now.getTime() - 30 * 86400_000);
  // Normalize to UTC day boundaries — half-open is fine.
  from.setUTCHours(0, 0, 0, 0);
  const toEnd = new Date(to);
  toEnd.setUTCHours(23, 59, 59, 999);
  return { from, to: toEnd };
}

function ctxFromReq(req: Request): ReportContext {
  return {
    scope: (req as any).reportScope,
    ...parseRange(req),
    albumId: (req.query.albumId as string) || null,
  };
}

function sendCsv(res: Response, filename: string, body: string) {
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(body);
}

export function registerReportRoutes(app: Express) {
  app.get("/api/partner/reports/sales", requireReportScope, async (req, res) => {
    try {
      const data = await salesOverTime(ctxFromReq(req));
      res.json(data);
    } catch (e: any) {
      console.error("[reports/sales]", e);
      res.status(500).json({ message: e.message });
    }
  });
  app.get("/api/partner/reports/sales.csv", requireReportScope, async (req, res) => {
    const data = await salesOverTime(ctxFromReq(req));
    const body = toCsv(
      data.series.map((r) => ({ date: r.date, units: r.units, dollars: dollarsFromCents(r.dollarsCents) })),
      ["date", "units", "dollars"],
    );
    sendCsv(res, "sales.csv", body);
  });

  app.get("/api/partner/reports/plays", requireReportScope, async (req, res) => {
    try {
      const data = await playsEngagement(ctxFromReq(req));
      res.json(data);
    } catch (e: any) {
      console.error("[reports/plays]", e);
      res.status(500).json({ message: e.message });
    }
  });
  app.get("/api/partner/reports/plays.csv", requireReportScope, async (req, res) => {
    const data = await playsEngagement(ctxFromReq(req));
    sendCsv(res, "plays.csv", toCsv(data.series, ["date", "playStarts", "play30s", "playCompletes", "lyricsOpens"]));
  });

  app.get("/api/partner/reports/payouts", requireReportScope, async (req, res) => {
    try {
      const data = await payoutsReceived(ctxFromReq(req));
      res.json(data);
    } catch (e: any) {
      console.error("[reports/payouts]", e);
      res.status(500).json({ message: e.message });
    }
  });
  app.get("/api/partner/reports/payouts.csv", requireReportScope, async (req, res) => {
    const data = await payoutsReceived(ctxFromReq(req));
    sendCsv(res, "payouts.csv", toCsv(
      data.series.map((r) => ({ date: r.date, dollars: dollarsFromCents(r.dollarsCents) })),
      ["date", "dollars"],
    ));
  });

  app.get("/api/partner/reports/redemption", requireReportScope, async (req, res) => {
    try {
      const data = await shopifyRedemption(ctxFromReq(req));
      res.json(data);
    } catch (e: any) {
      console.error("[reports/redemption]", e);
      res.status(500).json({ message: e.message });
    }
  });
  app.get("/api/partner/reports/redemption.csv", requireReportScope, async (req, res) => {
    const data = await shopifyRedemption(ctxFromReq(req));
    sendCsv(res, "redemption.csv", toCsv(data.series, ["date", "ordered", "redeemed"]));
  });

  app.get("/api/partner/reports/top-fans", requireReportScope, async (req, res) => {
    try {
      const data = await topFans(ctxFromReq(req));
      res.json(data);
    } catch (e: any) {
      console.error("[reports/top-fans]", e);
      res.status(500).json({ message: e.message });
    }
  });
  app.get("/api/partner/reports/top-fans.csv", requireReportScope, async (req, res) => {
    const data = await topFans(ctxFromReq(req), 1000);
    sendCsv(res, "top-fans.csv", toCsv(
      data.rows.map((r) => ({
        name: r.name,
        city: r.city ?? "",
        region: r.region ?? "",
        country: r.country ?? "",
        units: r.units,
        spend: dollarsFromCents(r.spendCents),
      })),
      ["name", "city", "region", "country", "units", "spend"],
    ));
  });

  app.get("/api/partner/reports/fan-map", requireReportScope, async (req, res) => {
    try {
      const data = await fanMap(ctxFromReq(req));
      res.json(data);
    } catch (e: any) {
      console.error("[reports/fan-map]", e);
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/partner/reports/referrals", requireReportScope, async (req, res) => {
    try {
      const data = await referralEarnings(ctxFromReq(req));
      res.json(data);
    } catch (e: any) {
      console.error("[reports/referrals]", e);
      res.status(500).json({ message: e.message });
    }
  });
  app.get("/api/partner/reports/referrals.csv", requireReportScope, async (req, res) => {
    const data = await referralEarnings(ctxFromReq(req));
    sendCsv(res, "referrals.csv", toCsv(
      data.artists.map((a) => ({
        artist: a.artistName,
        units: a.units,
        perUnit: dollarsFromCents(a.perUnitCents),
        earnings: dollarsFromCents(a.earningsCents),
      })),
      ["artist", "units", "perUnit", "earnings"],
    ));
  });

  // Task #2258 — partner acquisition funnel, scoped to the partner's own
  // releases (super_admin impersonation honored by requireReportScope).
  app.get("/api/partner/reports/funnel/releases", requireReportScope, async (req, res) => {
    try {
      const data = await partnerFunnelReleases(ctxFromReq(req));
      res.json(data);
    } catch (e: any) {
      console.error("[reports/funnel/releases]", e);
      res.status(500).json({ message: e.message });
    }
  });
  app.get("/api/partner/reports/funnel", requireReportScope, async (req, res) => {
    try {
      const data = await partnerAcquisitionFunnel(ctxFromReq(req), {
        albumId: String(req.query.albumId || ""),
        excludeInternal: req.query.excludeInternal === "1" || req.query.excludeInternal === "true",
      });
      res.json(data);
    } catch (e: any) {
      console.error("[reports/funnel]", e);
      res.status(500).json({ message: e.message });
    }
  });

  // Header endpoint — tells the client what scope the caller has so
  // the page can hide reports the partner shouldn't see.
  app.get("/api/partner/reports/scope", requireReportScope, async (req, res) => {
    const scope = (req as any).reportScope;
    res.json({
      role: scope.role,
      roleScopeId: scope.roleScopeId,
      viewAs: scope.viewAs ?? null,
    });
  });
}
