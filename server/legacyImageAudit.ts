// Task #434 — Audit legacy images still on off-platform CDNs.
//
// The gogoods.com importer stamped every imported Person, Album, and
// album bonus video with its original image URL on `tinifycdn.com` (and
// occasionally other off-platform hosts). Those CDNs are not ours — if
// they disappear, every imported cover/photo/thumbnail 404s.
//
// We don't auto-rehost (image quality + cropping is editorial — Bill
// re-uploads by hand). This module is reporting only: it scans every
// row carrying a `legacy_gogoods_id` and lists the ones whose image
// URL is NOT an Object Storage path (`/objects/uploads/...`). The
// admin page at `/admin/legacy-image-audit` and the CSV export hit
// the same two endpoints below.

import type { Express, Request, Response, RequestHandler } from "express";
import { db } from "./db";
import { sql, and, isNotNull, isNull } from "drizzle-orm";
import { albums, people, albumVideos } from "@shared/schema";

export type LegacyImageEntityType = "person" | "album" | "bonus_video";

export type LegacyImageRow = {
  entityType: LegacyImageEntityType;
  entityId: string;
  // Row the operator opens to fix it. For bonus videos this is the
  // owning album's admin page (the album editor surfaces its bonus
  // content). For Person / Album it's the entity itself.
  adminHref: string;
  displayName: string;
  // Which image column on the row is still off-platform.
  field: "photoUrl" | "coverUrl" | "posterUrl";
  currentUrl: string;
  // Hostname of the current URL (e.g. "tinifycdn.com") — surfaced in
  // the UI so the operator can see at-a-glance that everything below
  // is the same vendor before working through it.
  host: string;
};

export type LegacyImageAuditReport = {
  generatedAt: string;
  total: number;
  byEntityType: Record<LegacyImageEntityType, LegacyImageRow[]>;
};

const OBJECT_STORAGE_PREFIX = "/objects/uploads/";

function isOffPlatform(url: string | null | undefined): url is string {
  if (!url) return false;
  const trimmed = url.trim();
  if (!trimmed) return false;
  return !trimmed.startsWith(OBJECT_STORAGE_PREFIX);
}

function hostOf(url: string): string {
  try {
    return new URL(url).host || "—";
  } catch {
    return "—";
  }
}

function compareName(a: LegacyImageRow, b: LegacyImageRow) {
  return a.displayName.localeCompare(b.displayName, undefined, { sensitivity: "base" });
}

export async function buildLegacyImageAuditReport(): Promise<LegacyImageAuditReport> {
  const peopleRows = await db
    .select({
      id: people.id,
      name: people.name,
      photoUrl: people.photoUrl,
      coverUrl: people.coverUrl,
    })
    .from(people)
    .where(and(isNotNull(people.legacyGogoodsId), isNull(people.deletedAt)));

  const albumRows = await db
    .select({
      id: albums.id,
      title: albums.title,
      artist: albums.artist,
      artwork: albums.artwork,
    })
    .from(albums)
    .where(and(isNotNull(albums.legacyGogoodsId), isNull(albums.deletedAt)));

  // Bonus videos don't carry their own legacy id — they inherit
  // off-platform status from the album they're attached to. Scope to
  // videos whose album has a legacy id AND whose poster (the only
  // image field on the row) is still off-platform.
  const videoRows = await db
    .select({
      id: albumVideos.id,
      title: albumVideos.title,
      posterUrl: albumVideos.posterUrl,
      albumId: albumVideos.albumId,
      albumTitle: albums.title,
    })
    .from(albumVideos)
    .innerJoin(albums, sql`${albums.id} = ${albumVideos.albumId}`)
    .where(
      and(
        isNotNull(albums.legacyGogoodsId),
        isNull(albumVideos.deletedAt),
        isNull(albums.deletedAt),
      ),
    );

  const personOut: LegacyImageRow[] = [];
  for (const p of peopleRows) {
    if (isOffPlatform(p.photoUrl)) {
      personOut.push({
        entityType: "person",
        entityId: p.id,
        adminHref: `/admin/people/${p.id}`,
        displayName: p.name,
        field: "photoUrl",
        currentUrl: p.photoUrl,
        host: hostOf(p.photoUrl),
      });
    }
    if (isOffPlatform(p.coverUrl)) {
      personOut.push({
        entityType: "person",
        entityId: p.id,
        adminHref: `/admin/people/${p.id}`,
        displayName: p.name,
        field: "coverUrl",
        currentUrl: p.coverUrl,
        host: hostOf(p.coverUrl),
      });
    }
  }

  const albumOut: LegacyImageRow[] = [];
  for (const a of albumRows) {
    if (isOffPlatform(a.artwork)) {
      albumOut.push({
        entityType: "album",
        entityId: a.id,
        adminHref: `/admin/albums/${a.id}`,
        displayName: `${a.title} — ${a.artist}`,
        // The album cover lives on `albums.artwork`; surface it as
        // `coverUrl` in the report so the three entity types share a
        // small, consistent vocabulary.
        field: "coverUrl",
        currentUrl: a.artwork,
        host: hostOf(a.artwork),
      });
    }
  }

  const videoOut: LegacyImageRow[] = [];
  for (const v of videoRows) {
    if (isOffPlatform(v.posterUrl)) {
      videoOut.push({
        entityType: "bonus_video",
        entityId: v.id,
        adminHref: `/admin/albums/${v.albumId}`,
        displayName: `${v.albumTitle} · ${v.title}`,
        field: "posterUrl",
        currentUrl: v.posterUrl,
        host: hostOf(v.posterUrl),
      });
    }
  }

  personOut.sort(compareName);
  albumOut.sort(compareName);
  videoOut.sort(compareName);

  return {
    generatedAt: new Date().toISOString(),
    total: personOut.length + albumOut.length + videoOut.length,
    byEntityType: {
      person: personOut,
      album: albumOut,
      bonus_video: videoOut,
    },
  };
}

function escapeCsv(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function renderLegacyImageAuditCsv(report: LegacyImageAuditReport): string {
  const header = [
    "entity_type",
    "entity_id",
    "display_name",
    "field",
    "host",
    "current_url",
    "admin_href",
  ].join(",");
  const lines: string[] = [header];
  const order: LegacyImageEntityType[] = ["person", "album", "bonus_video"];
  for (const t of order) {
    for (const row of report.byEntityType[t]) {
      lines.push(
        [
          row.entityType,
          row.entityId,
          row.displayName,
          row.field,
          row.host,
          row.currentUrl,
          row.adminHref,
        ]
          .map(escapeCsv)
          .join(","),
      );
    }
  }
  return lines.join("\n") + "\n";
}

export function registerLegacyImageAuditRoutes(
  app: Express,
  requireAdmin: RequestHandler,
) {
  app.get(
    "/api/admin/legacy-image-audit",
    requireAdmin,
    async (_req: Request, res: Response) => {
      try {
        const report = await buildLegacyImageAuditReport();
        res.json(report);
      } catch (e: any) {
        console.error("[legacy-image-audit] failed", e?.message);
        res.status(500).json({ message: "Failed to build report" });
      }
    },
  );

  app.get(
    "/api/admin/legacy-image-audit.csv",
    requireAdmin,
    async (_req: Request, res: Response) => {
      try {
        const report = await buildLegacyImageAuditReport();
        const csv = renderLegacyImageAuditCsv(report);
        const filename = `legacy-image-audit-${report.generatedAt.slice(0, 10)}.csv`;
        res.setHeader("Content-Type", "text/csv; charset=utf-8");
        res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
        res.send(csv);
      } catch (e: any) {
        console.error("[legacy-image-audit] csv failed", e?.message);
        res.status(500).json({ message: "Failed to build CSV" });
      }
    },
  );
}
