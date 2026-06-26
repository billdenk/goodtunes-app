// Task #2047 — GoodDeed Quickprinter portal.
//
// A "quickprinter" is a `vendors` row with `is_quickprinter = true`. These
// partners only ever do one job: print the signed GoodDeed certificates the
// platform routes to them. This module gives them their own scoped portal
// (mounted under /api/printer/:id/*) that mirrors the press portal's shape
// but is centered on a Print Queue instead of a customer pipeline.
//
// SCOPE — what a printer can see is strictly the certificates whose resolved
// print vendor is THIS vendor. Cert print routing is global, not per-printer:
//   resolvedPrintVendor(album) =
//     album_addons.print_vendor_id (legacy per-album override)
//     ?? payout_settings.default_print_vendor_id (platform default)
// So a printer's queue = certs on albums that resolve to them. A printer that
// is neither the platform default nor has any per-album override sees an empty
// (graceful) queue — never an error.
//
// This module deliberately does NOT touch press/reseller/fulfillment/vendor
// routing or pricing, and gives printers NO artist invite-roster surface. The
// Catalog (GoodDeed Services pricing) and Staff tabs reuse existing
// vendor-scoped endpoints from the client side.
import type { Express, Request, Response } from "express";
import { and, asc, desc, eq, inArray, isNotNull, ne, sql } from "drizzle-orm";
import { db } from "./db";
import { storage } from "./storage";
import {
  albumAddons,
  albums,
  certNameAudits,
  customerUsers,
  labels,
  orders,
  payoutAccounts,
  payoutSettings,
  people,
  signedCertCertificates,
} from "@shared/schema";
import {
  absoluteOrigin,
  certFilename,
  loadCertContext,
  renderCertPdf,
  runCertPrintBatch,
} from "./certificates";

type IdentityKind = "display" | "username" | "real";

// Resolve which albums route their GoodDeed certs to this printer.
//   forUs  — albumIds with an explicit per-album print_vendor_id == this printer
//   away   — albumIds with an explicit print_vendor_id pointing elsewhere
//   isDefault — this printer is the platform default print vendor
// A cert routes to this printer when its album is in `forUs`, OR this printer
// is the platform default AND the album is not overridden away.
async function resolvePrinterAlbumScope(vendorId: string): Promise<{
  isDefault: boolean;
  forUs: Set<string>;
  away: Set<string>;
}> {
  const [settings] = await db.select().from(payoutSettings).limit(1);
  const isDefault = !!settings?.defaultPrintVendorId && settings.defaultPrintVendorId === vendorId;

  const overrideRows = await db
    .select({ albumId: albumAddons.albumId, printVendorId: albumAddons.printVendorId })
    .from(albumAddons)
    .where(isNotNull(albumAddons.printVendorId));

  const forUs = new Set<string>();
  const away = new Set<string>();
  for (const r of overrideRows) {
    if (!r.albumId) continue;
    if (r.printVendorId === vendorId) forUs.add(r.albumId);
    else away.add(r.albumId);
  }
  return { isDefault, forUs, away };
}

function certRoutesToPrinter(
  albumId: string | null | undefined,
  scope: { isDefault: boolean; forUs: Set<string>; away: Set<string> },
): boolean {
  if (!albumId) return false;
  if (scope.forUs.has(albumId)) return true;
  if (scope.isDefault && !scope.away.has(albumId)) return true;
  return false;
}

// Pull every queue row (cert + order + album + customer) that routes to this
// printer, optionally filtered by status. Shape mirrors the admin print queue
// so the client can share the AdminPrintQueue row renderer.
async function loadPrinterQueue(
  vendorId: string,
  status?: string,
): Promise<any[]> {
  const scope = await resolvePrinterAlbumScope(vendorId);
  // Nothing routes here → graceful empty queue, no query needed.
  if (!scope.isDefault && scope.forUs.size === 0) return [];

  let q = db
    .select({ cert: signedCertCertificates, order: orders, album: albums, customer: customerUsers })
    .from(signedCertCertificates)
    .innerJoin(orders, eq(orders.id, signedCertCertificates.orderId))
    .innerJoin(albums, eq(albums.id, orders.albumId))
    .innerJoin(customerUsers, eq(orders.customerId, customerUsers.id))
    // Task #2270 — exclude QA test-purchase orders from the print queue.
    .where(ne(orders.origin, "qa:test"))
    .$dynamic();
  if (status) q = q.where(eq(signedCertCertificates.nameStatus, status));
  const rows = await q
    .orderBy(asc(signedCertCertificates.confirmedAt), desc(signedCertCertificates.createdAt))
    .limit(500);

  return rows
    .filter((r) => certRoutesToPrinter(r.order.albumId, scope))
    .map((r) => ({
      ...r.cert,
      albumTitle: r.album.title,
      albumArtist: r.album.artist,
      albumArtwork: r.album.artwork,
      goodDeedNumber: r.order.goodDeedNumber,
      orderId: r.order.id,
      customerEmail: r.customer.email,
      customerDisplayName: r.customer.displayName,
      shippingCountry: (r.order.shippingAddress as any)?.country ?? null,
      origin: r.order.origin,
    }));
}

// Assert a single cert routes to this printer (used by per-cert routes).
async function certBelongsToPrinter(vendorId: string, certId: string): Promise<boolean> {
  const [row] = await db
    .select({ albumId: orders.albumId })
    .from(signedCertCertificates)
    .innerJoin(orders, eq(orders.id, signedCertCertificates.orderId))
    .where(eq(signedCertCertificates.id, certId))
    .limit(1);
  if (!row) return false;
  const scope = await resolvePrinterAlbumScope(vendorId);
  return certRoutesToPrinter(row.albumId, scope);
}

export function registerPrinterPortalRoutes(app: Express, requireAdmin: any) {
  // Scope gate — super_admin/admin (platform staff) OR a vendor-scoped
  // membership matching this printer. ALWAYS asserts the vendor exists and
  // is a quickprinter, so the printer portal can't be pointed at a maker /
  // reseller vendor.
  const requirePrinterScope = async (req: Request, res: Response, next: () => void) => {
    const userId = (req as any).adminUserId as string | undefined;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    const vendorId = String(req.params.id);
    const vendor = await storage.getVendorById(vendorId);
    if (!vendor) return res.status(404).json({ message: "Printer not found" });
    if (!(vendor as any).isQuickprinter) {
      return res.status(404).json({ message: "Not a GoodDeed printer" });
    }
    (req as any).printerVendor = vendor;
    const { getUserRole, findMembershipForScope } = await import("./auth/roles");
    const info = await getUserRole(userId);
    if (!info) return res.status(403).json({ message: "Forbidden" });
    if (info.role === "super_admin" || info.role === "admin") return next();
    if (await findMembershipForScope(userId, "vendor", vendorId)) return next();
    return res.status(403).json({ message: "Forbidden" });
  };

  // GET /api/printer/:id/me — profile + flags the portal shell needs.
  app.get("/api/printer/:id/me", requireAdmin, requirePrinterScope, async (req, res) => {
    const vendor = (req as any).printerVendor;
    const [settings] = await db.select().from(payoutSettings).limit(1);
    res.json({
      id: vendor.id,
      name: vendor.name,
      logoUrl: vendor.logoUrl ?? null,
      isQuickprinter: true,
      // Vendors have no owner/staff split wired, so any scope holder can edit.
      canEdit: true,
      isDefaultPrinter: !!settings?.defaultPrintVendorId && settings.defaultPrintVendorId === vendor.id,
      homeUrl: vendor.homeUrl ?? null,
      tagline: vendor.tagline ?? null,
      bio: vendor.bio ?? null,
      location: vendor.location ?? null,
    });
  });

  // GET /api/printer/:id/dashboard — queue counts + recent printed activity.
  app.get("/api/printer/:id/dashboard", requireAdmin, requirePrinterScope, async (req, res) => {
    const vendorId = String(req.params.id);
    const rows = await loadPrinterQueue(vendorId);
    const counts = { awaiting: 0, confirmed: 0, locked_for_print: 0, printed: 0 } as Record<string, number>;
    for (const r of rows) {
      if (counts[r.nameStatus] != null) counts[r.nameStatus] += 1;
    }
    const recentPrinted = rows
      .filter((r) => r.nameStatus === "printed")
      .sort((a, b) => new Date(b.printedAt ?? 0).getTime() - new Date(a.printedAt ?? 0).getTime())
      .slice(0, 8)
      .map((r) => ({
        id: r.id,
        goodDeedNumber: r.goodDeedNumber,
        albumTitle: r.albumTitle,
        albumArtist: r.albumArtist,
        confirmedName: r.confirmedName,
        printedAt: r.printedAt,
      }));
    const [settings] = await db.select().from(payoutSettings).limit(1);
    res.json({
      isDefaultPrinter: !!settings?.defaultPrintVendorId && settings.defaultPrintVendorId === vendorId,
      counts,
      totalInScope: rows.length,
      recentPrinted,
    });
  });

  // GET /api/printer/:id/print-queue?status= — scoped queue (the centerpiece).
  app.get("/api/printer/:id/print-queue", requireAdmin, requirePrinterScope, async (req, res) => {
    const status = (req.query.status as string | undefined)?.trim();
    res.json(await loadPrinterQueue(String(req.params.id), status || undefined));
  });

  // POST /api/printer/:id/print-queue/batch-download — same batch builder as
  // the admin queue, but certIds are first filtered to ones routing to THIS
  // printer (so a printer can't print another printer's certs).
  app.post("/api/printer/:id/print-queue/batch-download", requireAdmin, requirePrinterScope, async (req, res) => {
    const vendorId = String(req.params.id);
    const userId = (req as any).adminUserId as string;
    const requested: string[] = Array.isArray(req.body?.certIds) ? req.body.certIds : [];
    const format: "zip" | "merged_pdf" = req.body?.format === "merged_pdf" ? "merged_pdf" : "zip";
    if (requested.length === 0) return res.status(400).json({ message: "certIds required" });

    const scope = await resolvePrinterAlbumScope(vendorId);
    const owned = await db
      .select({ id: signedCertCertificates.id, albumId: orders.albumId })
      .from(signedCertCertificates)
      .innerJoin(orders, eq(orders.id, signedCertCertificates.orderId))
      .where(inArray(signedCertCertificates.id, requested));
    const scopedIds = owned.filter((r) => certRoutesToPrinter(r.albumId, scope)).map((r) => r.id);
    if (scopedIds.length === 0) {
      return res.status(403).json({ message: "None of those certificates route to this printer." });
    }

    const result = await runCertPrintBatch(scopedIds, format, absoluteOrigin(req), userId);
    if (!result.ok) return res.status(result.status).json({ message: result.message });
    res.setHeader("Content-Type", result.contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${result.filename}"`);
    res.send(result.buffer);
    // Flip to printed once the file is sent (send failure leaves the rows at
    // locked_for_print so the same ids re-emit without re-confirming).
    await db
      .update(signedCertCertificates)
      .set({ nameStatus: "printed", printedAt: new Date(), updatedAt: new Date() })
      .where(inArray(signedCertCertificates.id, result.printedCertIds));
  });

  // GET /api/printer/:id/print-queue/cert/:certId/pdf — single-cert preview.
  app.get("/api/printer/:id/print-queue/cert/:certId/pdf", requireAdmin, requirePrinterScope, async (req, res) => {
    if (!(await certBelongsToPrinter(String(req.params.id), req.params.certId))) {
      return res.status(404).json({ message: "Not found" });
    }
    const ctx = await loadCertContext(req.params.certId, absoluteOrigin(req));
    if (!ctx) return res.status(404).json({ message: "Not found" });
    const pdf = await renderCertPdf(ctx, true);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${certFilename(ctx)}"`);
    res.send(pdf);
  });

  // PATCH paper-size override (printer, scoped).
  app.patch("/api/printer/:id/print-queue/cert/:certId/paper-size", requireAdmin, requirePrinterScope, async (req, res) => {
    const paperSize = req.body?.paperSize;
    if (paperSize !== "letter" && paperSize !== "a4") {
      return res.status(400).json({ message: "paperSize must be 'letter' or 'a4'" });
    }
    if (!(await certBelongsToPrinter(String(req.params.id), req.params.certId))) {
      return res.status(404).json({ message: "Not found" });
    }
    await db
      .update(signedCertCertificates)
      .set({ paperSize, paperSizeOverridden: true, updatedAt: new Date() })
      .where(eq(signedCertCertificates.id, req.params.certId));
    res.json({ ok: true });
  });

  // PATCH recipient-name override (printer, scoped) — blocked once printed.
  app.patch("/api/printer/:id/print-queue/cert/:certId/name", requireAdmin, requirePrinterScope, async (req, res) => {
    const userId = (req as any).adminUserId as string;
    const name: string | undefined = req.body?.name;
    const kind: IdentityKind | undefined = req.body?.identityKind;
    if (!name || !kind) return res.status(400).json({ message: "name + identityKind required" });
    if (!(await certBelongsToPrinter(String(req.params.id), req.params.certId))) {
      return res.status(404).json({ message: "Not found" });
    }
    const [cert] = await db
      .select()
      .from(signedCertCertificates)
      .where(eq(signedCertCertificates.id, req.params.certId));
    if (!cert) return res.status(404).json({ message: "Not found" });
    if (cert.nameStatus === "printed") {
      return res.status(409).json({ message: "Already printed — cannot change the recipient name." });
    }
    await db.transaction(async (tx) => {
      await tx.insert(certNameAudits).values({
        certId: cert.id,
        changedByKind: "admin",
        changedByUserId: userId,
        fromIdentityKind: cert.confirmedIdentityKind,
        fromName: cert.confirmedName,
        toIdentityKind: kind,
        toName: name,
      });
      await tx
        .update(signedCertCertificates)
        .set({
          confirmedIdentityKind: kind,
          confirmedName: name,
          nameStatus: cert.nameStatus === "awaiting" ? "confirmed" : cert.nameStatus,
          confirmedAt: cert.confirmedAt ?? new Date(),
          updatedAt: new Date(),
        })
        .where(eq(signedCertCertificates.id, cert.id));
    });
    res.json({ ok: true });
  });

  // GET /api/printer/:id/albums — derived, read-only: albums whose certs route
  // to this printer, with cert + printed counts. Graceful empty list.
  app.get("/api/printer/:id/albums", requireAdmin, requirePrinterScope, async (req, res) => {
    const rows = await loadPrinterQueue(String(req.params.id));
    const byAlbum = new Map<string, any>();
    for (const r of rows) {
      const a = byAlbum.get(r.albumTitle + "|" + r.albumArtist) ?? {
        title: r.albumTitle,
        artist: r.albumArtist,
        artwork: r.albumArtwork,
        certCount: 0,
        printedCount: 0,
      };
      a.certCount += 1;
      if (r.nameStatus === "printed") a.printedCount += 1;
      byAlbum.set(r.albumTitle + "|" + r.albumArtist, a);
    }
    res.json(Array.from(byAlbum.values()).sort((a, b) => a.title.localeCompare(b.title)));
  });

  // GET /api/printer/:id/people — derived, read-only: the artists + labels
  // behind the albums this printer prints for ("who they print for"). NOT an
  // invite roster — purely a reference list, no actions.
  app.get("/api/printer/:id/people", requireAdmin, requirePrinterScope, async (req, res) => {
    const vendorId = String(req.params.id);
    const scope = await resolvePrinterAlbumScope(vendorId);
    if (!scope.isDefault && scope.forUs.size === 0) return res.json({ people: [], labels: [] });

    // Distinct albumIds in scope from the cert rows.
    const certAlbums = await db
      .select({ albumId: orders.albumId })
      .from(signedCertCertificates)
      .innerJoin(orders, eq(orders.id, signedCertCertificates.orderId))
      .limit(2000);
    const albumIds = Array.from(
      new Set(certAlbums.map((r) => r.albumId).filter((id): id is string => !!id && certRoutesToPrinter(id, scope))),
    );
    if (albumIds.length === 0) return res.json({ people: [], labels: [] });

    const albumRows = await db
      .select({
        primaryArtistId: albums.primaryArtistId,
        labelId: albums.labelId,
        artist: albums.artist,
      })
      .from(albums)
      .where(inArray(albums.id, albumIds));

    const artistIds = Array.from(new Set(albumRows.map((a) => a.primaryArtistId).filter((x): x is string => !!x)));
    const labelIds = Array.from(new Set(albumRows.map((a) => a.labelId).filter((x): x is string => !!x)));

    const peopleRows = artistIds.length
      ? await db
          .select({ id: people.id, name: people.name, photoUrl: people.photoUrl })
          .from(people)
          .where(inArray(people.id, artistIds))
      : [];
    const labelRows = labelIds.length
      ? await db
          .select({ id: labels.id, name: labels.name, logoUrl: labels.logoUrl })
          .from(labels)
          .where(inArray(labels.id, labelIds))
      : [];

    // Fall back to the album's display-string artist for albums with no
    // linked People row, so the list is never silently empty.
    const linkedArtistNames = new Set(peopleRows.map((p) => p.name));
    const looseArtists = Array.from(
      new Set(
        albumRows
          .filter((a) => !a.primaryArtistId && a.artist && !linkedArtistNames.has(a.artist))
          .map((a) => a.artist),
      ),
    ).map((name) => ({ id: null as string | null, name, photoUrl: null as string | null }));

    res.json({
      people: [...peopleRows, ...looseArtists].sort((a, b) => a.name.localeCompare(b.name)),
      labels: labelRows.sort((a, b) => a.name.localeCompare(b.name)),
    });
  });

  // PATCH /api/printer/:id/profile — editable Settings fields (printer self-serve).
  app.patch("/api/printer/:id/profile", requireAdmin, requirePrinterScope, async (req, res) => {
    const vendorId = String(req.params.id);
    const patch: Record<string, any> = {};
    for (const f of ["name", "logoUrl", "homeUrl", "tagline", "bio", "location"]) {
      if (typeof req.body?.[f] === "string") patch[f] = req.body[f];
    }
    if (Object.keys(patch).length === 0) return res.status(400).json({ message: "Nothing to update" });
    // __bypassLogoLock — an operator-initiated profile save is an explicit
    // human action, so it may overwrite a curation-locked logo.
    const updated = await storage.updateVendor(vendorId, { ...patch, __bypassLogoLock: true } as any);
    res.json({ ok: true, vendor: updated });
  });

  // GET /api/printer/:id/payouts — read-only Stripe-connect status. No fake
  // data: returns connected:false with a graceful note when no payout account
  // is wired for this vendor.
  app.get("/api/printer/:id/payouts", requireAdmin, requirePrinterScope, async (req, res) => {
    const vendorId = String(req.params.id);
    const [acct] = await db
      .select()
      .from(payoutAccounts)
      .where(and(eq(payoutAccounts.ownerId, vendorId), ne(payoutAccounts.ownerKind, "")))
      .limit(1);
    if (!acct) {
      return res.json({
        connected: false,
        note: "GoodTunes settles your GoodDeed print runs directly. No Stripe payout account is connected for this printer yet.",
      });
    }
    res.json({
      connected: true,
      payoutsEnabled: acct.payoutsEnabled,
      chargesEnabled: acct.chargesEnabled,
      // Mask the Stripe id — the portal only needs to confirm it's wired.
      stripeAccountIdLast4: acct.stripeAccountId.slice(-4),
    });
  });
}
