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

/** Sum of approved pressing-run quantities for an album (the settlement basis). */
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
  return Number(row?.total ?? 0);
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
        return res.json({ rateMicros, totalCents: 0, albums: [] });
      }

      const albumRows = await db
        .select({ id: albums.id, title: albums.title, artist: albums.artist, artwork: albums.artwork })
        .from(albums)
        .where(inArray(albums.id, albumIds));
      const metaById = new Map(albumRows.map((a) => [a.id, a]));

      const items = [];
      for (const albumId of albumIds) {
        const unitsPressed = await resolveUnitsPressed(albumId);
        const settlement = await computeAlbumPublishingSettlement(albumId, {
          unitsPressed,
          rateMicros,
        });
        const meta = metaById.get(albumId);
        const unpaidPayees = settlement.payees.filter((p) => !p.payoutsEnabled).length;
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
      }

      items.sort((a, b) => b.totalCents - a.totalCents);
      const totalCents = items.reduce((s, a) => s + a.totalCents, 0);
      return res.json({ rateMicros, totalCents, albums: items });
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
