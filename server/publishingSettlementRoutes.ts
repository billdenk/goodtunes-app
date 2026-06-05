// Admin API for the Publishing settlement section.
//
// Exposes the mechanical-settlement engine (server/publishingSettlement.ts)
// to the admin UI as two read endpoints:
//
//   GET /api/admin/publishing/settlements
//        catalog-wide roll-up: every album that carries publishing splits,
//        with its per-run owed total, payee count, and data-quality flags.
//
//   GET /api/admin/publishing/albums/:albumId/settlement
//        the full per-payee breakdown for one album (owed, pay-to routing,
//        onboarding status) plus allocation / missing-split guardrails.
//
// Units pressed defaults to the sum of APPROVED pressing-order-request
// quantities for the album, and can be overridden with ?unitsPressed=N so an
// operator can model a run before it's been approved.

import type { Express, Request, Response } from "express";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "./db";
import { albums, pressingOrderRequests, songs, trackPublishingSplits } from "@shared/schema";
import {
  computeAlbumPublishingSettlement,
  getMechanicalRateMicros,
} from "./publishingSettlement";

type AdminGuard = (req: Request, res: Response, next: Function) => unknown;

/**
 * Settlement basis = units PRESSED for the album.
 *
 * Primary source is the sum of APPROVED pressing_order_requests quantities
 * (runs placed through the in-app pressing pipeline). When that is zero —
 * i.e. the album was pressed offline and never went through the pipeline
 * (e.g. Nick Carter's catalog, where Memphis billed the Double LP across two
 * purchase orders) — fall back to the operator-recorded
 * `albums.mechanical_units_pressed`. Null/absent fallback resolves to 0.
 */
async function resolveUnitsPressed(albumId: string): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`coalesce(sum(${pressingOrderRequests.quantity}), 0)` })
    .from(pressingOrderRequests)
    .where(
      and(
        eq(pressingOrderRequests.albumId, albumId),
        eq(pressingOrderRequests.status, "approved"),
      ),
    );
  const approved = Number(row?.total ?? 0);
  if (approved > 0) return approved;

  const [albumRow] = await db
    .select({ units: albums.mechanicalUnitsPressed })
    .from(albums)
    .where(eq(albums.id, albumId))
    .limit(1);
  return Math.max(0, Number(albumRow?.units ?? 0));
}

/** Album ids that carry at least one non-deleted publishing split. */
async function albumIdsWithPublishingSplits(): Promise<string[]> {
  const rows = await db
    .selectDistinct({ albumId: songs.albumId })
    .from(trackPublishingSplits)
    .innerJoin(songs, eq(songs.id, trackPublishingSplits.songId))
    .where(isNull(trackPublishingSplits.deletedAt));
  return rows.map((r) => r.albumId).filter((id): id is string => !!id);
}

export function registerPublishingSettlementRoutes(app: Express, requireAdmin: AdminGuard): void {
  // Catalog-wide roll-up across every album with publishing splits.
  app.get("/api/admin/publishing/settlements", requireAdmin, async (_req, res) => {
    try {
      const rateMicros = await getMechanicalRateMicros();
      const albumIds = await albumIdsWithPublishingSplits();
      if (albumIds.length === 0) {
        return res.json({
          rateMicros,
          totalCents: 0,
          payees: [],
          payeeCount: 0,
          unpaidPayees: 0,
          allocationIssueCount: 0,
          missingSplitCount: 0,
          albums: [],
        });
      }

      const albumRows = await db
        .select({ id: albums.id, title: albums.title, artist: albums.artist, artwork: albums.artwork })
        .from(albums)
        .where(inArray(albums.id, albumIds));
      const metaById = new Map(albumRows.map((a) => [a.id, a]));

      // Accumulate each payee's RAW micros across every album so we can round
      // ONCE per payee at the catalog level. A payee (e.g. Hipgnosis, whose
      // share spans the Double LP and several singles) is cut a single check,
      // so the settlement basis is the sum of their micros rounded once — not
      // the sum of per-album rounded cents, which lets penny drift compound.
      type CatalogPayee = {
        payeeKey: string;
        ownerKind: "organization" | "person" | null;
        ownerId: string | null;
        displayName: string;
        payToName: string | null;
        amountMicros: number;
        lineCount: number;
        hasPayoutAccount: boolean;
        payoutsEnabled: boolean;
      };
      const payeeByKey = new Map<string, CatalogPayee>();

      const items = [];
      let allocationIssueTotal = 0;
      let missingSplitTotal = 0;
      for (const albumId of albumIds) {
        const unitsPressed = await resolveUnitsPressed(albumId);
        const settlement = await computeAlbumPublishingSettlement(albumId, {
          unitsPressed,
          rateMicros,
        });
        const meta = metaById.get(albumId);
        const unpaidPayees = settlement.payees.filter((p) => !p.payoutsEnabled).length;
        allocationIssueTotal += settlement.allocationIssues.length;
        missingSplitTotal += settlement.songsMissingSplits.length;
        items.push({
          albumId,
          title: meta?.title ?? albumId,
          artist: meta?.artist ?? null,
          artwork: meta?.artwork ?? null,
          unitsPressed,
          totalCents: settlement.totalCents,
          payeeCount: settlement.payees.length,
          unpaidPayees,
          allocationIssueCount: settlement.allocationIssues.length,
          missingSplitCount: settlement.songsMissingSplits.length,
        });
        for (const p of settlement.payees) {
          const existing = payeeByKey.get(p.payeeKey);
          if (existing) {
            existing.amountMicros += p.amountMicros;
            existing.lineCount += p.lineCount;
            existing.hasPayoutAccount = existing.hasPayoutAccount || p.hasPayoutAccount;
            existing.payoutsEnabled = existing.payoutsEnabled || p.payoutsEnabled;
          } else {
            payeeByKey.set(p.payeeKey, {
              payeeKey: p.payeeKey,
              ownerKind: p.ownerKind,
              ownerId: p.ownerId,
              displayName: p.displayName,
              payToName: p.payToName,
              amountMicros: p.amountMicros,
              lineCount: p.lineCount,
              hasPayoutAccount: p.hasPayoutAccount,
              payoutsEnabled: p.payoutsEnabled,
            });
          }
        }
      }

      const payees = Array.from(payeeByKey.values())
        .map(({ amountMicros, ...rest }) => ({
          ...rest,
          amountCents: Math.round(amountMicros / 10_000),
        }))
        .sort((a, b) => b.amountCents - a.amountCents);

      // The catalog payout total is the sum of the per-payee rounded amounts —
      // what actually leaves the bank. It can differ from the sum of per-album
      // subtotals by a cent or two purely from rounding granularity; this
      // per-payee figure is the authoritative one.
      const totalCents = payees.reduce((s, p) => s + p.amountCents, 0);
      const unpaidPayees = payees.filter((p) => !p.payoutsEnabled).length;

      items.sort((a, b) => b.totalCents - a.totalCents);
      return res.json({
        rateMicros,
        totalCents,
        payees,
        payeeCount: payees.length,
        unpaidPayees,
        allocationIssueCount: allocationIssueTotal,
        missingSplitCount: missingSplitTotal,
        albums: items,
      });
    } catch (err) {
      console.error("[publishing-settlements]", err);
      return res.status(500).json({ message: "Failed to compute publishing settlements" });
    }
  });

  // Full per-payee breakdown for one album.
  app.get("/api/admin/publishing/albums/:albumId/settlement", requireAdmin, async (req, res) => {
    try {
      const albumId = String(req.params.albumId);
      const [album] = await db
        .select({ id: albums.id, title: albums.title, artist: albums.artist, artwork: albums.artwork })
        .from(albums)
        .where(eq(albums.id, albumId))
        .limit(1);
      if (!album) return res.status(404).json({ message: "Album not found" });

      const override = req.query.unitsPressed;
      let unitsPressed: number;
      if (override != null && override !== "") {
        const n = Number(override);
        if (!Number.isFinite(n) || n < 0 || n > 100_000_000) {
          return res
            .status(400)
            .json({ message: "unitsPressed must be a non-negative number" });
        }
        unitsPressed = Math.trunc(n);
      } else {
        unitsPressed = await resolveUnitsPressed(albumId);
      }

      const settlement = await computeAlbumPublishingSettlement(albumId, { unitsPressed });
      return res.json({ album, ...settlement });
    } catch (err) {
      console.error("[publishing-settlement]", err);
      return res.status(500).json({ message: "Failed to compute publishing settlement" });
    }
  });
}
