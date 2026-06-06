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

  // Pre-delete impact probe. Surfaces the publishing data that the album's
  // soft-delete cascade would silently take down with it — the
  // mechanical-settlement splits (which ride on the album's songs) and the
  // units-pressed figure — so the delete-confirm dialog can warn the operator
  // and offer to move it first. Counts use the SAME song→split join the
  // settlement engine uses, so the numbers match what the payout run sees.
  app.get("/api/admin/albums/:albumId/publishing-impact", requireAdmin, async (req, res) => {
    try {
      const albumId = String(req.params.albumId);
      const songRows = await db
        .select({ id: songs.id })
        .from(songs)
        .where(and(eq(songs.albumId, albumId), isNull(songs.deletedAt)));
      const songIds = songRows.map((s) => s.id);

      let splitCount = 0;
      let songsWithSplits = 0;
      if (songIds.length) {
        const splitRows = await db
          .select({ songId: trackPublishingSplits.songId })
          .from(trackPublishingSplits)
          .where(
            and(
              inArray(trackPublishingSplits.songId, songIds),
              isNull(trackPublishingSplits.deletedAt),
            ),
          );
        splitCount = splitRows.length;
        songsWithSplits = new Set(splitRows.map((r) => r.songId)).size;
      }

      const unitsPressed = await resolveUnitsPressed(albumId);
      return res.json({
        albumId,
        trackCount: songIds.length,
        splitCount,
        songsWithSplits,
        unitsPressed,
        hasPublishingData: splitCount > 0 || unitsPressed > 0,
      });
    } catch (err) {
      console.error("[publishing-impact]", err);
      return res.status(500).json({ message: "Failed to compute publishing impact" });
    }
  });

  // Move an album's publishing data onto another album so it survives a
  // delete. Publishing splits ride on `song_id` (there is no clean
  // split→target-track match), so the honest, non-lossy move is to re-point
  // the SONGS that carry non-deleted splits onto the target album — the splits
  // follow. The operator-recorded units-pressed figure is added onto the
  // target and cleared from the source. Re-pointing songs can leave duplicate
  // tracks on the target; reconciling those is the operator's job afterward.
  app.post("/api/admin/albums/:albumId/move-publishing-data", requireAdmin, async (req, res) => {
    try {
      // Re-pointing data across albums is an operator-only action; partner
      // admins (artist/label) don't get it even though they pass requireAdmin.
      const userId = (req.session as { userId?: string } | undefined)?.userId;
      const { getUserRole } = await import("./auth/roles");
      const info = userId ? await getUserRole(userId) : null;
      if (!(info?.role === "super_admin" || info?.role === "admin")) {
        return res
          .status(403)
          .json({ message: "Only GoodTunes operators can move publishing data." });
      }

      const sourceId = String(req.params.albumId);
      const targetId = String(req.body?.targetAlbumId ?? "").trim();
      if (!targetId) {
        return res.status(400).json({ message: "targetAlbumId is required" });
      }
      if (targetId === sourceId) {
        return res
          .status(400)
          .json({ message: "Pick a different album to move the publishing data to." });
      }

      const [source] = await db
        .select({ id: albums.id, units: albums.mechanicalUnitsPressed })
        .from(albums)
        .where(eq(albums.id, sourceId))
        .limit(1);
      if (!source) return res.status(404).json({ message: "Album not found" });

      const [target] = await db
        .select({
          id: albums.id,
          units: albums.mechanicalUnitsPressed,
          deletedAt: albums.deletedAt,
        })
        .from(albums)
        .where(eq(albums.id, targetId))
        .limit(1);
      if (!target || target.deletedAt) {
        return res.status(404).json({ message: "Target album not found or is in the trash." });
      }

      const songRows = await db
        .select({ id: songs.id })
        .from(songs)
        .where(and(eq(songs.albumId, sourceId), isNull(songs.deletedAt)));
      const songIds = songRows.map((s) => s.id);

      let carrierIds: string[] = [];
      let splitCount = 0;
      if (songIds.length) {
        const splitRows = await db
          .select({ songId: trackPublishingSplits.songId })
          .from(trackPublishingSplits)
          .where(
            and(
              inArray(trackPublishingSplits.songId, songIds),
              isNull(trackPublishingSplits.deletedAt),
            ),
          );
        splitCount = splitRows.length;
        carrierIds = Array.from(new Set(splitRows.map((r) => r.songId)));
      }

      const sourceUnits = Math.max(0, Number(source.units ?? 0));
      const targetUnits = Math.max(0, Number(target.units ?? 0));

      if (carrierIds.length === 0 && sourceUnits === 0) {
        return res
          .status(400)
          .json({ message: "This album has no publishing data to move." });
      }

      await db.transaction(async (tx) => {
        if (carrierIds.length) {
          await tx
            .update(songs)
            .set({ albumId: targetId })
            .where(inArray(songs.id, carrierIds));
        }
        if (sourceUnits > 0) {
          await tx
            .update(albums)
            .set({ mechanicalUnitsPressed: targetUnits + sourceUnits })
            .where(eq(albums.id, targetId));
          await tx
            .update(albums)
            .set({ mechanicalUnitsPressed: null })
            .where(eq(albums.id, sourceId));
        }
      });

      return res.json({
        movedSongs: carrierIds.length,
        movedSplits: splitCount,
        unitsMoved: sourceUnits,
        targetAlbumId: targetId,
      });
    } catch (err) {
      console.error("[move-publishing-data]", err);
      return res.status(500).json({ message: "Failed to move publishing data" });
    }
  });
}
