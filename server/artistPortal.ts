// Artist Portal Restructure backend (Ruby handoff, Aug 17 2026).
//
// Artist-scoped read endpoints powering the restructured artist portal
// (releases wall, per-release tabs, payments/ledgers, team + connections).
// Scope resolution reuses resolveArtistScope from artistReports.ts — the
// same primary_artist OR payout-owner rule, with label/manager drill-in via
// ?personId= and super_admin via ?personId=.
//
// Everything here is READ-ONLY. Dead-end CTAs in the client stay no-ops.

import type { Express, Request, Response } from "express";
import { db } from "./db";
import { sql } from "drizzle-orm";
import { pgArray } from "./lib/pgArray";
import { resolveArtistScope } from "./artistReports";
import { storage } from "./storage";

// Coarse format bucket for wall badges / heartbeat rows.
function formatKind(fmt: string): "vinyl" | "cd" | "cassette" | "digital" | "other" {
  const f = (fmt || "").toLowerCase();
  if (/vinyl|lp\b|7["”']?|10["”']?|12["”']?|record/.test(f)) return "vinyl";
  if (/\bcd\b|compact/.test(f)) return "cd";
  if (/cassette|tape/.test(f)) return "cassette";
  if (/digital|player|stream/.test(f)) return "digital";
  return "other";
}

const KIND_WORD: Record<string, string> = {
  vinyl: "Vinyl",
  cd: "CD",
  cassette: "Cassette",
  digital: "GoodTunes® Player",
  other: "Format",
};

type FmtRow = {
  id: string;
  format: string;
  kind: string;
  label: string;
  active: boolean;
  lockedAt: string | null;
  status: "live" | "press" | "draft";
};

function skuStatus(album: any, active: boolean, kind: string): "live" | "press" | "draft" {
  const prepping = !!album.is_prepping;
  const hidden = !!album.is_hidden;
  if (!prepping && !hidden && active) return "live";
  if (prepping && album.submitted_to_press_at && (kind === "vinyl" || kind === "cd" || kind === "cassette"))
    return "press";
  return "draft";
}

async function loadAlbums(albumIds: string[]) {
  if (!albumIds.length) return [] as any[];
  const r: any = await db.execute(sql`
    SELECT id, title, artwork, year, good_tunes_release_date, share_slug,
           is_prepping, is_hidden, first_sold_at, sell_mode,
           submitted_to_press_at, primary_artist_id,
           catalog_number, upc
    FROM albums
    WHERE id = ANY(${pgArray(albumIds)})
      AND deleted_at IS NULL
      AND is_goodtunes_release = true
    ORDER BY COALESCE(good_tunes_release_date, year::text) DESC NULLS LAST, title ASC
  `);
  return (r as any).rows ?? [];
}

async function loadSkus(albumIds: string[]) {
  if (!albumIds.length) return new Map<string, FmtRow[]>();
  const r: any = await db.execute(sql`
    SELECT s.id, s.album_id, s.format, s.display_name, s.active, s.locked_at
    FROM album_skus s
    WHERE s.album_id = ANY(${pgArray(albumIds)})
    ORDER BY s.position ASC
  `);
  const map = new Map<string, any[]>();
  for (const row of (r as any).rows ?? []) {
    const list = map.get(row.album_id) ?? [];
    list.push(row);
    map.set(row.album_id, list);
  }
  return map;
}

function shapeFormats(album: any, skus: any[]): FmtRow[] {
  return (skus ?? []).map((s) => {
    const kind = formatKind(s.format);
    return {
      id: s.id,
      format: s.format,
      kind,
      label: s.display_name || KIND_WORD[kind] || s.format,
      active: !!s.active,
      lockedAt: s.locked_at ? new Date(s.locked_at).toISOString() : null,
      status: skuStatus(album, !!s.active, kind),
    };
  });
}

// ─── GET /api/artist/wall ────────────────────────────────────────────
async function wallHandler(req: Request, res: Response) {
  const scope = await resolveArtistScope(req);
  if ("error" in scope) return res.status(scope.status).json({ message: scope.error });

  const albums = await loadAlbums(scope.albumIds);
  const skuMap = await loadSkus(albums.map((a: any) => a.id));

  // Money flag: any pending payment request against one of these albums.
  let pendingAlbumIds = new Set<string>();
  if (albums.length) {
    const pr: any = await db.execute(sql`
      SELECT DISTINCT album_id FROM payment_requests
      WHERE recipient_person_id = ${scope.personId}
        AND status = 'pending' AND album_id IS NOT NULL
    `);
    pendingAlbumIds = new Set(((pr as any).rows ?? []).map((r: any) => r.album_id));
  }

  // Art flag: a vinyl release with no completed-art upload on record yet
  // (completed_template_checks row absent or components empty) still needs
  // print-ready art (Ruby's Aug 19 restructure handoff, GOLDENROD).
  let artAlbumIds = new Set<string>();
  if (albums.length) {
    const tc: any = await db.execute(sql`
      SELECT album_id FROM completed_template_checks
      WHERE album_id = ANY(${pgArray(albums.map((a: any) => a.id))})
        AND jsonb_array_length(COALESCE(components, '[]'::jsonb)) > 0
    `);
    artAlbumIds = new Set(((tc as any).rows ?? []).map((r: any) => r.album_id));
  }

  const cards = albums.map((a: any) => {
    const formats = shapeFormats(a, skuMap.get(a.id) ?? []);
    const anyLive = formats.some((f) => f.status === "live");
    const sellMode = a.sell_mode || null;
    const channel: "goodtunes" | "shopify" | null =
      sellMode === "shopify" || sellMode === "shopify_plus"
        ? "shopify"
        : anyLive
          ? "goodtunes"
          : null;
    return {
      id: a.id,
      name: a.title,
      year: a.good_tunes_release_date
        ? String(a.good_tunes_release_date).slice(0, 4)
        : a.year != null
          ? String(a.year)
          : "",
      cover: a.artwork || null,
      formats,
      channel,
      moneyFlag: pendingAlbumIds.has(a.id) ? "Payment requested" : null,
      needsArt:
        formats.some((f) => f.kind === "vinyl") && !artAlbumIds.has(a.id),
      dimmed: !!a.is_hidden,
      visibility: a.is_hidden ? "Hidden" : a.is_prepping ? "Preview" : "Live",
    };
  });

  return res.json({ cards });
}

// ─── GET /api/artist/albums/:id/portal ───────────────────────────────
async function releaseHandler(req: Request, res: Response) {
  const scope = await resolveArtistScope(req);
  if ("error" in scope) return res.status(scope.status).json({ message: scope.error });
  const albumId = String(req.params.id);
  if (!scope.albumIds.includes(albumId))
    return res.status(404).json({ message: "Album not found" });

  const albums = await loadAlbums([albumId]);
  const album = albums[0];
  if (!album) return res.status(404).json({ message: "Album not found" });

  const skuMap = await loadSkus([albumId]);
  const formats = shapeFormats(album, skuMap.get(albumId) ?? []);

  const person = await storage.getPersonById(String(album.primary_artist_id ?? scope.personId));

  const sc: any = await db.execute(sql`
    SELECT count(*)::int AS n,
           count(*) FILTER (WHERE mux_playback_id IS NOT NULL)::int AS ready
    FROM songs WHERE album_id = ${albumId}
  `);
  const songCounts = ((sc as any).rows ?? [])[0] ?? { n: 0, ready: 0 };

  const pr: any = await db.execute(sql`
    SELECT id, description, amount_cents, currency, status, created_at, paid_at,
           stripe_payment_link_url
    FROM payment_requests
    WHERE album_id = ${albumId} AND recipient_person_id = ${scope.personId}
    ORDER BY created_at DESC
  `);
  // Shape into the client's grouped-project contract: one project per
  // release with its payment requests as milestones. Walk vocabulary:
  // pending → requested, paid → confirmed.
  const milestones = ((pr as any).rows ?? []).map((r: any) => ({
    id: r.id,
    label: r.description || "Payment",
    amountCents: Number(r.amount_cents),
    status: r.status === "paid" ? "confirmed" : r.status === "pending" ? "requested" : r.status,
    note: r.status === "paid" && r.paid_at
      ? `Paid ${new Date(r.paid_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}.`
      : r.created_at
        ? `Requested ${new Date(r.created_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}.`
        : "",
    payUrl: r.status === "pending" ? r.stripe_payment_link_url || null : null,
  }));
  // Press name for the "GoodTunes releases funds to <press>" context line.
  const pressRes: any = milestones.length
    ? await db.execute(sql`
        SELECT m.name FROM album_skus s JOIN manufacturers m ON m.id = s.press_id
        WHERE s.album_id = ${albumId} AND s.press_id IS NOT NULL LIMIT 1
      `)
    : { rows: [] };
  const pressName = ((pressRes as any).rows ?? [])[0]?.name ?? "your press";
  const payments = milestones.length
    ? [{
        id: albumId,
        title: album.title,
        press: pressName,
        summary: "Pressing",
        outstandingCents: milestones
          .filter((m: any) => m.status !== "confirmed")
          .reduce((s: number, m: any) => s + m.amountCents, 0),
        milestones,
      }]
    : [];

  const artistShareSlug = (person as any)?.artistShareSlug ?? null;
  const shareSlug = album.share_slug ?? null;

  return res.json({
    release: {
      id: album.id,
      title: album.title,
      artist: person?.name ?? "",
      artworkUrl: album.artwork || null,
      year: album.good_tunes_release_date
        ? String(album.good_tunes_release_date).slice(0, 4)
        : album.year != null
          ? String(album.year)
          : "",
      tracks: Number(songCounts.n),
      visibility: album.is_hidden ? "Hidden" : album.is_prepping ? "Preview" : "Live",
      editing: album.first_sold_at ? "Locked" : "Open",
      // Task #3178 — catalog identifiers surfaced on the Details tab.
      catalogNumber: album.catalog_number ?? null,
      upc: album.upc ?? null,
    },
    formats,
    store: {
      sellMode: album.sell_mode || null,
      artistUrl: artistShareSlug ? `https://get.goodtunes.music/${artistShareSlug}` : null,
      albumUrl:
        artistShareSlug && shareSlug
          ? `https://get.goodtunes.music/${artistShareSlug}/${shareSlug}`
          : null,
      checklist: {
        art: !!album.artwork,
        audio: Number(songCounts.ready) > 0,
        price: formats.some((f) => f.active),
        channel: !!album.sell_mode || formats.some((f) => f.status === "live"),
      },
    },
    payments,
  });
}

// ─── GET /api/artist/ledgers ─────────────────────────────────────────
async function ledgersHandler(req: Request, res: Response) {
  const scope = await resolveArtistScope(req);
  if ("error" in scope) return res.status(scope.status).json({ message: scope.error });

  const owedR: any = await db.execute(sql`
    SELECT pr.id, pr.description, pr.amount_cents, pr.created_at, pr.album_id,
           a.title AS album_title
    FROM payment_requests pr
    LEFT JOIN albums a ON a.id = pr.album_id
    WHERE pr.recipient_person_id = ${scope.personId} AND pr.status = 'pending'
    ORDER BY pr.created_at DESC
  `);
  const owed = ((owedR as any).rows ?? []).map((r: any) => ({
    id: r.id,
    label: r.album_title || r.description,
    detail: r.description,
    amountCents: Number(r.amount_cents),
    ts: r.created_at ? new Date(r.created_at).toISOString() : null,
  }));

  let earned: any[] = [];
  if (scope.albumIds.length) {
    const earnedR: any = await db.execute(sql`
      SELECT o.album_id, a.title AS album_title,
             SUM(o.payout_amount_cents)::bigint AS cents,
             MAX(o.payout_at) AS last_at
      FROM orders o
      JOIN albums a ON a.id = o.album_id
      WHERE o.album_id = ANY(${pgArray(scope.albumIds)})
        AND o.payout_status = 'transferred'
        AND o.payout_amount_cents IS NOT NULL
        AND COALESCE(o.origin, '') <> 'qa:test'
      GROUP BY o.album_id, a.title
      ORDER BY MAX(o.payout_at) DESC NULLS LAST
    `);
    earned = ((earnedR as any).rows ?? []).map((r: any) => ({
      id: r.album_id,
      label: r.album_title,
      amountCents: Number(r.cents ?? 0),
      ts: r.last_at ? new Date(r.last_at).toISOString() : null,
    }));
  }

  return res.json({
    owed: { totalCents: owed.reduce((s: number, r: any) => s + r.amountCents, 0), rows: owed },
    earned: { totalCents: earned.reduce((s: number, r: any) => s + r.amountCents, 0), rows: earned },
  });
}

// ─── GET /api/artist/team ────────────────────────────────────────────
async function teamHandler(req: Request, res: Response) {
  const scope = await resolveArtistScope(req);
  if ("error" in scope) return res.status(scope.status).json({ message: scope.error });

  const mr: any = await db.execute(sql`
    SELECT m.id, m.sub_role, u.display_name, u.username, u.email
    FROM memberships m
    JOIN users u ON u.id = m.user_id
    WHERE m.role = 'artist' AND m.scope_kind = 'artist' AND m.scope_id = ${scope.personId}
    ORDER BY m.created_at ASC
  `);
  const team = ((mr as any).rows ?? []).map((r: any) => ({
    id: r.id,
    name: r.display_name || r.username || r.email || "Teammate",
    email: r.email ?? null,
    role: r.sub_role ? r.sub_role.charAt(0).toUpperCase() + r.sub_role.slice(1) : "Owner",
  }));

  const pa: any = await db.execute(sql`
    SELECT payouts_enabled FROM payout_accounts
    WHERE owner_kind = 'person' AND owner_id = ${scope.personId}
    LIMIT 1
  `);
  const paRow = ((pa as any).rows ?? [])[0] ?? null;

  return res.json({
    team,
    payout: paRow
      ? { status: paRow.payouts_enabled ? "enabled" : "pending" }
      : { status: "not_set_up" },
  });
}

export async function registerArtistPortalRoutes(app: Express) {
  const { requireRole } = await import("./auth/roles");
  const gate = requireRole("artist", "label", "manager", "super_admin");
  app.get("/api/artist/wall", gate, wallHandler);
  app.get("/api/artist/albums/:id/portal", gate, releaseHandler);
  app.get("/api/artist/ledgers", gate, ledgersHandler);
  app.get("/api/artist/team", gate, teamHandler);
}
