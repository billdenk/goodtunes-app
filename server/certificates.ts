// Task #128 — Printable GoodDeed certificates.
//
// One `signed_cert_certificates` row per paid order that carries a
// `signed_cert` add-on. The fan confirms the name in /orders, the admin
// batches confirmed rows into a ZIP/merged PDF from /admin/print-queue,
// and downloading the batch flips every row to `printed` in one go. PDFs
// are rendered on-demand (no object-storage round-trip) so a regenerate
// is just a re-hit of the endpoint — useful when a row is unlocked or
// the cover art changes.
import type { Express, Request, Response } from "express";
import { and, asc, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import PDFDocument from "pdfkit";
// qrcode ships no bundled types and we don't want to vendor a .d.ts just
// for this single import — same pattern as server/auth/totp.ts.
// @ts-ignore
import QRCode from "qrcode";
import AdmZip from "adm-zip";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { db } from "./db";
import { storage } from "./storage";
import {
  albums,
  certNameAudits,
  certPrintBatches,
  customerUsers,
  orderCopies,
  orderItems,
  orders,
  signedCertCertificates,
  type SignedCertCertificate,
} from "@shared/schema";
// Task #551 — the ONE locked print template. drawCertOnto below is a
// thin adapter that maps the legacy CertContext shape onto the
// template's normalised `{albumId, sequenceNumber, recipientName,
// qrPayload, paperSize}` inputs.
import { drawGoodDeedPageOnto, type GoodDeedPrintInputs } from "./goodDeedPrintTemplate";

// ─── Constants ───────────────────────────────────────────────────────
const LETTER_COUNTRIES = new Set(["US", "USA", "CA", "CAN", "MX", "MEX"]);
// Order statuses that count as "finalized" for cert download. "complete"
// is the legacy gogoods import status; "paid"/"shipped"/"n"/"nd" are the
// live paid-ish states (mirrors the reports/storage paid-ish filter).
const FINALIZED_CERT_ORDER_STATUSES = new Set(["paid", "complete", "shipped", "n", "nd"]);
const SIGNATURE_ASSET = path.resolve(
  process.cwd(),
  "attached_assets",
  "signature-GoodDeed_1779414807544.png",
);

export function paperSizeFromCountry(country: string | null | undefined): "letter" | "a4" {
  if (!country) return "letter";
  return LETTER_COUNTRIES.has(country.toUpperCase()) ? "letter" : "a4";
}

// Short, URL-safe, ambiguity-free (no 0/O/1/I/l). 10 chars × 32 alphabet
// ≈ 50 bits of entropy — uneconomic to enumerate the /g/:shortId space.
const ALPHABET = "23456789abcdefghijkmnpqrstuvwxyz";
function generateShortId(): string {
  const bytes = crypto.randomBytes(10);
  let out = "";
  for (let i = 0; i < 10; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

// ─── Cert lifecycle helpers ──────────────────────────────────────────
// Creates the row(s) for a paid signed_cert order. Idempotent via the
// partial unique indexes on signed_cert_certificates (legacy: one row
// per order with copy_id NULL; per-copy: one row per (order_id, copy_id)).
// Task #549 — multi-quantity orders mint one cert row per signed
// `order_copies` entry; legacy single-copy orders (no order_copies rows)
// fall back to the original one-cert-per-order shape with copy_id NULL.
export async function ensureCertificateForOrder(orderId: string): Promise<void> {
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
  if (!order || order.status !== "paid") return;
  const country = (order.shippingAddress as any)?.country ?? null;
  const paperSize = paperSizeFromCountry(country);

  // Per-copy path: iterate signed `order_copies` and mint one cert per
  // copy. The partial unique index `signed_cert_certs_order_copy_uniq`
  // makes the insert idempotent on (order_id, copy_id).
  const copies = await db
    .select()
    .from(orderCopies)
    .where(and(eq(orderCopies.orderId, orderId), eq(orderCopies.signedCert, true)));
  if (copies.length > 0) {
    for (const c of copies) {
      await insertCertRowWithShortIdRetry({
        orderId,
        copyId: c.id,
        paperSize,
      });
    }
    return;
  }

  // Legacy single-cert path: orders written before Task #549 don't have
  // any `order_copies` rows yet. Fall back to the original behaviour —
  // one row per order with copy_id NULL, guarded by
  // `signed_cert_certs_order_legacy_uniq`.
  const addonItems = await db.select().from(orderItems).where(
    and(eq(orderItems.orderId, orderId), eq(orderItems.kind, "addon"), eq(orderItems.sku, "signed_cert")),
  );
  if (addonItems.length === 0) return;
  await insertCertRowWithShortIdRetry({ orderId, copyId: null, paperSize });
}

async function insertCertRowWithShortIdRetry(opts: {
  orderId: string;
  copyId: string | null;
  paperSize: "letter" | "a4";
}): Promise<void> {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      // Idempotency comes from the partial unique indexes on (order_id)
      // and (order_id, copy_id); the orderId-only `onConflictDoNothing`
      // target we used pre-549 no longer exists as a constraint. Catch
      // 23505s and treat them as "already inserted".
      await db
        .insert(signedCertCertificates)
        .values({
          orderId: opts.orderId,
          copyId: opts.copyId,
          shortId: generateShortId(),
          paperSize: opts.paperSize,
          nameStatus: "awaiting",
        });
      return;
    } catch (e: any) {
      const code = e?.code ?? e?.cause?.code;
      const msg = String(e?.message ?? e?.cause?.message ?? "");
      if (code === "23505" && msg.includes("short_id")) continue; // retry
      if (code === "23505") return; // already minted for this (order, copy) — done
      throw e;
    }
  }
  throw new Error(`Could not mint a unique cert shortId for order ${opts.orderId}`);
}

// One-shot backfill: every paid signed_cert order that lacks a cert row
// gets one in `awaiting` with paper-size inferred from shipping country.
// Runs at boot — safe to call repeatedly because ensureCertificateForOrder
// is idempotent.
export async function backfillCertificates(): Promise<{ created: number }> {
  const rows = await db
    .select({ orderId: orders.id })
    .from(orders)
    .innerJoin(
      orderItems,
      and(
        eq(orderItems.orderId, orders.id),
        eq(orderItems.kind, "addon"),
        eq(orderItems.sku, "signed_cert"),
      ),
    )
    .leftJoin(signedCertCertificates, eq(signedCertCertificates.orderId, orders.id))
    .where(and(eq(orders.status, "paid"), isNull(signedCertCertificates.id)));
  let created = 0;
  for (const r of rows) {
    try {
      await ensureCertificateForOrder(r.orderId);
      created++;
    } catch (e: any) {
      console.error(`[certificates] backfill failed for ${r.orderId}`, e?.message);
    }
  }
  if (created > 0) console.log(`[certificates] backfilled ${created} signed_cert certificate row(s)`);
  return { created };
}

// ─── Identity resolution ─────────────────────────────────────────────
// Mirrors GoodDeedCertificate.tsx pickIdentity: fan picks display /
// username / real and the server snapshots both the kind and the actual
// string so a later rename doesn't change what's already been printed.
type IdentityKind = "display" | "username" | "real";

async function resolveName(
  customerId: string,
  kind: IdentityKind,
): Promise<{ name: string; kind: IdentityKind } | { error: string }> {
  const [c] = await db.select().from(customerUsers).where(eq(customerUsers.id, customerId));
  if (!c) return { error: "Customer not found" };
  if (kind === "real") {
    if (!c.realName) return { error: "No real name on file — add one in your profile first." };
    return { name: c.realName, kind };
  }
  if (kind === "username") return { name: `@${c.username}`, kind };
  return { name: c.displayName || c.username, kind: "display" };
}

// ─── PDF rendering ───────────────────────────────────────────────────
async function fetchArtworkBytes(url: string | null): Promise<Buffer | null> {
  if (!url) return null;
  try {
    // Local /objects/uploads/<id> → read from object storage via the
    // standard fetch (the express app serves these). For absolute URLs
    // we just fetch; for local paths we resolve against absoluteOrigin.
    const full = /^https?:\/\//.test(url) ? url : `http://127.0.0.1:${process.env.PORT ?? 5000}${url.startsWith("/") ? "" : "/"}${url}`;
    const r = await fetch(full);
    if (!r.ok) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    return buf;
  } catch {
    return null;
  }
}

export type CertContext = {
  cert: SignedCertCertificate;
  order: typeof orders.$inferSelect;
  album: typeof albums.$inferSelect;
  origin: string;
};

export async function loadCertContext(certId: string, origin: string): Promise<CertContext | null> {
  const [row] = await db
    .select({ cert: signedCertCertificates, order: orders, album: albums })
    .from(signedCertCertificates)
    .innerJoin(orders, eq(orders.id, signedCertCertificates.orderId))
    .innerJoin(albums, eq(albums.id, orders.albumId))
    .where(eq(signedCertCertificates.id, certId));
  return row ? { ...row, origin } : null;
}

// ─── Layout constants ────────────────────────────────────────────────
// We design to the framed-mat window, not the paper. Letter prints sit
// behind an 8×10 mat (576×720 pt), A4 behind a 20×25 cm mat
// (566.93×708.66 pt). Anything important must stay inside the mat
// (the "safe zone"); the dark band must extend past the mat to the
// page edge so the framing leaves no white gap (this is the bleed).
// Numbers are points (1pt = 1/72 in; 25.4 mm = 72 pt).
type LayoutDims = {
  W: number; H: number;
  matW: number; matH: number;
  matX: number; matY: number;
  // "Safe" inset inside the mat — what we keep text/QR away from the
  // mat edge to absorb mat-cut variance + a hair of printer drift.
  safeInset: number;
};
function layoutFor(paperSize: "letter" | "a4"): LayoutDims {
  if (paperSize === "a4") {
    const W = 595.28, H = 841.89;
    // 20×25 cm mat opening — the most common metric "8×10 equivalent".
    const matW = (200 / 25.4) * 72; // ≈ 566.93
    const matH = (250 / 25.4) * 72; // ≈ 708.66
    return {
      W, H, matW, matH,
      matX: (W - matW) / 2,
      matY: (H - matH) / 2,
      // ~3 mm inside the mat = ~8.5 pt. We use 14 pt of safe inset on
      // top of the natural ~14.6 pt of bleed on each side — keeps text
      // a comfortable distance from a slightly-misaligned mat cut.
      safeInset: 14,
    };
  }
  const W = 612, H = 792;
  const matW = 8 * 72; // 576
  const matH = 10 * 72; // 720
  return {
    W, H, matW, matH,
    matX: (W - matW) / 2, // 18 — exactly 1/4" of bleed on left/right
    matY: (H - matH) / 2, // 36 — 1/2" top/bottom; safe across all framers
    // The task spec calls out a 1/8" full-bleed extension; we keep at
    // least that on every side and treat the extra 1/8"+ above it as
    // extra safety margin against framer drift.
    safeInset: 14,
  };
}

// pdfkit is callback-driven; collect chunks and resolve with a Buffer.
// The page itself is sized to the chosen paper; the layout below treats
// the framed-mat window (8×10 / 20×25 cm) as the design surface and lets
// the dark band bleed past it to the page edge.
export async function renderCertPdf(ctx: CertContext): Promise<Buffer> {
  const size = ctx.cert.paperSize === "a4" ? "A4" : "LETTER";
  // No margin — we're managing the mat / bleed math ourselves.
  const doc = new PDFDocument({ size, margin: 0 });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));
  await drawCertOnto(doc, ctx);
  doc.end();
  return done;
}

// ─── Filename helpers ────────────────────────────────────────────────
function slugify(s: string): string {
  // ASCII-only — keeps `/u` out of the regex (the project's tsconfig
  // target predates that flag). For non-ASCII names we fall back to a
  // generic "Recipient" upstream via certFilename.
  return s
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}
function certFilename(ctx: CertContext): string {
  const num = ctx.order.goodDeedNumber != null ? `No${String(ctx.order.goodDeedNumber).padStart(3, "0")}` : `No-${ctx.cert.shortId}`;
  const nameSlug = slugify(ctx.cert.confirmedName ?? ctx.order.buyerName ?? "Recipient");
  return `GoodDeed-${slugify(ctx.album.artist)}-${slugify(ctx.album.title)}-${num}-${nameSlug}.pdf`;
}

// ─── Routes ──────────────────────────────────────────────────────────
function absoluteOrigin(req: Request): string {
  const proto = (req.headers["x-forwarded-proto"] as string)?.split(",")[0]?.trim() || req.protocol || "http";
  const host = (req.headers["x-forwarded-host"] as string) || req.headers.host;
  return `${proto}://${host}`;
}

async function getCustomerAuth(req: Request): Promise<{ userId: string } | null> {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) return null;
  const a = await storage.getAuthBy(auth.slice(7));
  if (!a || a.kind !== "customer") return null;
  return { userId: a.userId };
}

async function getAdminAuth(req: Request): Promise<{ userId: string } | null> {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) return null;
  const a = await storage.getAuthBy(auth.slice(7));
  if (!a) return null;
  const user = await storage.getUser(a.userId);
  if (!user?.isAdmin) return null;
  return { userId: a.userId };
}

export function registerCertificateRoutes(app: Express) {
  // ─── Public provenance lookup (signed-out friendly) ─────────────
  // GET /api/g/:shortId — minimal payload the SPA /g/:shortId page
  // renders. No auth: the short id IS the access token, the QR is the
  // distribution channel, and we never leak the buyer's address or
  // email — just the album, GoodDeed #, confirmed name, and issued date.
  app.get("/api/g/:shortId", async (req, res) => {
    const [row] = await db
      .select({ cert: signedCertCertificates, order: orders, album: albums })
      .from(signedCertCertificates)
      .innerJoin(orders, eq(orders.id, signedCertCertificates.orderId))
      .innerJoin(albums, eq(albums.id, orders.albumId))
      .where(eq(signedCertCertificates.shortId, req.params.shortId));
    if (!row) return res.status(404).json({ message: "Not found" });
    res.json({
      shortId: row.cert.shortId,
      goodDeedNumber: row.order.goodDeedNumber,
      issuedAt: row.order.createdAt,
      albumTitle: row.album.title,
      albumArtist: row.album.artist,
      albumArtwork: row.album.artwork,
      recipientName: row.cert.confirmedName,
      nameStatus: row.cert.nameStatus,
    });
  });

  // ─── Fan: read + confirm name ───────────────────────────────────
  app.get("/api/orders/:orderId/cert", async (req, res) => {
    const me = await getCustomerAuth(req);
    if (!me) return res.status(401).json({ message: "Sign in required" });
    const [row] = await db
      .select({ cert: signedCertCertificates, order: orders })
      .from(signedCertCertificates)
      .innerJoin(orders, eq(orders.id, signedCertCertificates.orderId))
      .where(eq(signedCertCertificates.orderId, req.params.orderId));
    if (!row || row.order.customerId !== me.userId) return res.status(404).json({ message: "Not found" });
    res.json(row.cert);
  });

  app.post("/api/orders/:orderId/cert/confirm", async (req, res) => {
    const me = await getCustomerAuth(req);
    if (!me) return res.status(401).json({ message: "Sign in required" });
    const [row] = await db
      .select({ cert: signedCertCertificates, order: orders })
      .from(signedCertCertificates)
      .innerJoin(orders, eq(orders.id, signedCertCertificates.orderId))
      .where(eq(signedCertCertificates.orderId, req.params.orderId));
    if (!row || row.order.customerId !== me.userId) return res.status(404).json({ message: "Not found" });
    // Task #551 — One-shot lock. Once a fan has confirmed a name (any
    // status other than "awaiting"), the printed cert is permanent and
    // the fan cannot change it. The picker copy + warning banner make
    // this explicit on the client; this server-side check is the
    // authoritative gate against a stale tab POSTing a second pick.
    if (row.cert.nameStatus !== "awaiting") {
      return res.status(409).json({
        message:
          "Name already confirmed — this is permanent for the printed certificate. Contact support if it needs to change.",
      });
    }
    const kind = req.body?.identityKind as IdentityKind | undefined;
    if (!kind || !["display", "username", "real"].includes(kind)) {
      return res.status(400).json({ message: "identityKind required (display|username|real)" });
    }
    const resolved = await resolveName(me.userId, kind);
    if ("error" in resolved) return res.status(400).json({ message: resolved.error });
    await db.transaction(async (tx) => {
      await tx.insert(certNameAudits).values({
        certId: row.cert.id,
        changedByKind: "fan",
        changedByUserId: me.userId,
        fromIdentityKind: row.cert.confirmedIdentityKind,
        fromName: row.cert.confirmedName,
        toIdentityKind: resolved.kind,
        toName: resolved.name,
      });
      await tx
        .update(signedCertCertificates)
        .set({
          confirmedIdentityKind: resolved.kind,
          confirmedName: resolved.name,
          nameStatus: "confirmed",
          confirmedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(signedCertCertificates.id, row.cert.id));
    });
    res.json({ ok: true });
  });

  // ─── Admin print queue ──────────────────────────────────────────
  app.get("/api/admin/print-queue", async (req, res) => {
    const me = await getAdminAuth(req);
    if (!me) return res.status(403).json({ message: "Admin only" });
    const status = (req.query.status as string | undefined)?.trim();
    let q = db
      .select({ cert: signedCertCertificates, order: orders, album: albums, customer: customerUsers })
      .from(signedCertCertificates)
      .innerJoin(orders, eq(orders.id, signedCertCertificates.orderId))
      .innerJoin(albums, eq(albums.id, orders.albumId))
      .innerJoin(customerUsers, eq(orders.customerId, customerUsers.id))
      .$dynamic();
    if (status) q = q.where(eq(signedCertCertificates.nameStatus, status));
    const rows = await q.orderBy(asc(signedCertCertificates.confirmedAt), desc(signedCertCertificates.createdAt)).limit(500);
    res.json(
      rows.map((r) => ({
        ...r.cert,
        albumTitle: r.album.title,
        albumArtist: r.album.artist,
        albumArtwork: r.album.artwork,
        goodDeedNumber: r.order.goodDeedNumber,
        orderId: r.order.id,
        customerEmail: r.customer.email,
        customerDisplayName: r.customer.displayName,
        shippingCountry: (r.order.shippingAddress as any)?.country ?? null,
        // Task #435 — origin lets the queue render a "Legacy" pill so
        // operators don't accidentally re-print imported gogoods certs.
        origin: r.order.origin,
      })),
    );
  });

  // PATCH paper-size override (admin).
  app.patch("/api/admin/print-queue/cert/:certId/paper-size", async (req, res) => {
    const me = await getAdminAuth(req);
    if (!me) return res.status(403).json({ message: "Admin only" });
    const paperSize = req.body?.paperSize;
    if (paperSize !== "letter" && paperSize !== "a4") {
      return res.status(400).json({ message: "paperSize must be 'letter' or 'a4'" });
    }
    await db
      .update(signedCertCertificates)
      .set({ paperSize, paperSizeOverridden: true, updatedAt: new Date() })
      .where(eq(signedCertCertificates.id, req.params.certId));
    res.json({ ok: true });
  });

  // PATCH name override (admin) — even after lock; logs an audit row.
  app.patch("/api/admin/print-queue/cert/:certId/name", async (req, res) => {
    const me = await getAdminAuth(req);
    if (!me) return res.status(403).json({ message: "Admin only" });
    const name: string | undefined = req.body?.name;
    const kind: IdentityKind | undefined = req.body?.identityKind;
    if (!name || !kind) return res.status(400).json({ message: "name + identityKind required" });
    const [cert] = await db.select().from(signedCertCertificates).where(eq(signedCertCertificates.id, req.params.certId));
    if (!cert) return res.status(404).json({ message: "Not found" });
    // Spec: admin can edit the name on a queued cert before it's
    // printed. Once `printed`, the physical artifact is out the door —
    // mutating the row would silently break the audit trail.
    if (cert.nameStatus === "printed") {
      return res.status(409).json({ message: "Already printed — cannot change the recipient name." });
    }
    await db.transaction(async (tx) => {
      await tx.insert(certNameAudits).values({
        certId: cert.id,
        changedByKind: "admin",
        changedByUserId: me.userId,
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

  // Single-cert PDF preview (admin only — fans see the digital cert).
  app.get("/api/admin/print-queue/cert/:certId/pdf", async (req, res) => {
    const me = await getAdminAuth(req);
    if (!me) return res.status(403).json({ message: "Admin only" });
    const ctx = await loadCertContext(req.params.certId, absoluteOrigin(req));
    if (!ctx) return res.status(404).json({ message: "Not found" });
    const pdf = await renderCertPdf(ctx);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${certFilename(ctx)}"`);
    res.send(pdf);
  });

  // ─── Task #435 / #1458 — Fan-facing cert PDF download ───────────
  // Fans hit this from the Orders page "Download certificate" link.
  // Auth: must own the order.
  //
  // Two paths:
  //  1. A real `signed_cert_certificates` row exists (physical signed-
  //     cert add-on). Render from it so the confirmed name, paper size,
  //     and print-batch state all come from the row. Works for every
  //     cert state (legacy imports land as `printed`; new sales sit at
  //     `confirmed`), so we never gate on a single status here.
  //  2. No row exists. Plain digital GoodDeed orders never mint a row,
  //     and the legacy bulk generator never populated the table in prod,
  //     so the row-only path 404'd for every fan. Synthesize the cert
  //     in-memory from the owned, finalized order — the same approach as
  //     the admin legacy-cert-preview endpoint — so the digital download
  //     works for everyone. (Task #1458.)
  app.get("/api/orders/:orderId/cert/pdf", async (req, res) => {
    const me = await getCustomerAuth(req);
    if (!me) return res.status(401).json({ message: "Sign in required" });

    // Path 1 — real row.
    const [row] = await db
      .select({ cert: signedCertCertificates, order: orders })
      .from(signedCertCertificates)
      .innerJoin(orders, eq(orders.id, signedCertCertificates.orderId))
      .where(eq(signedCertCertificates.orderId, req.params.orderId));
    if (row) {
      if (row.order.customerId !== me.userId) {
        return res.status(404).json({ message: "Not found" });
      }
      const ctx = await loadCertContext(row.cert.id, absoluteOrigin(req));
      if (!ctx) return res.status(404).json({ message: "Not found" });
      const pdf = await renderCertPdf(ctx);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="${certFilename(ctx)}"`);
      res.send(pdf);
      return;
    }

    // Path 2 — synthesize from the owned, finalized order.
    const [o] = await db
      .select({ order: orders, album: albums, customer: customerUsers })
      .from(orders)
      .innerJoin(albums, eq(albums.id, orders.albumId))
      .innerJoin(customerUsers, eq(customerUsers.id, orders.customerId))
      .where(eq(orders.id, req.params.orderId));
    if (!o || o.order.customerId !== me.userId) {
      return res.status(404).json({ message: "Not found" });
    }
    // Only finalized/paid orders with an assigned GoodDeed number have a
    // cert to show. "complete" is the legacy gogoods import status; "paid"
    // / "shipped" / "n" / "nd" are the live paid-ish states.
    if (!FINALIZED_CERT_ORDER_STATUSES.has(o.order.status) || o.order.goodDeedNumber == null) {
      return res.status(404).json({ message: "Not found" });
    }
    const paperSize = paperSizeFromCountry((o.order.shippingAddress as any)?.country ?? null);
    const confirmedName =
      o.customer.realName || o.customer.displayName || o.customer.username;
    // Synthetic in-memory cert — never written to the DB.
    const syntheticCert: SignedCertCertificate = {
      id: "synthetic",
      orderId: o.order.id,
      copyId: null,
      shortId: "synthetic" + o.order.id.slice(0, 8),
      nameStatus: "confirmed",
      confirmedIdentityKind: "display",
      confirmedName,
      paperSize,
      paperSizeOverridden: false,
      printBatchId: null,
      lockedAt: null,
      printedAt: null,
      confirmedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const ctx: CertContext = {
      cert: syntheticCert,
      order: o.order,
      album: o.album,
      origin: absoluteOrigin(req),
    };
    const pdf = await renderCertPdf(ctx);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${certFilename(ctx)}"`);
    res.send(pdf);
  });

  // ─── Task #435 — Legacy-import preview tool (admin only) ────────
  // Renders cert PDFs on the fly from any order — no `signed_cert_
  // certificates` row required. We synthesize a SignedCertCertificate
  // shape in-memory so loadCertContext-style consumers (renderCertPdf,
  // drawCertOnto) don't care that the row never hit the DB. This is
  // the design-review checkpoint Bill clicks through before the bulk
  // generator runs against the 3,006 imported gogoods owners.
  //
  // /samples returns five hand-picked candidates so the preview covers
  // Letter, A4, long-title, Nick Carter LLT, and short-title.
  app.get("/api/admin/legacy-cert-preview/samples", async (req, res) => {
    const me = await getAdminAuth(req);
    if (!me) return res.status(403).json({ message: "Admin only" });
    const rows = await db
      .select({ order: orders, album: albums, customer: customerUsers })
      .from(orders)
      .innerJoin(albums, eq(albums.id, orders.albumId))
      .innerJoin(customerUsers, eq(customerUsers.id, orders.customerId))
      .where(and(eq(orders.origin, "legacy:gogoods"), isNotNull(orders.goodDeedNumber)));
    if (rows.length === 0) return res.json({ samples: [] });
    // Score each candidate so we can pick a varied set.
    type Scored = {
      orderId: string;
      goodDeedNumber: number | null;
      albumTitle: string;
      albumArtist: string;
      displayName: string;
      titleLen: number;
      isNickCarter: boolean;
    };
    const scored: Scored[] = rows.map((r) => ({
      orderId: r.order.id,
      goodDeedNumber: r.order.goodDeedNumber,
      albumTitle: r.album.title,
      albumArtist: r.album.artist,
      displayName: r.customer.displayName ?? r.customer.username,
      titleLen: r.album.title.length + r.album.artist.length,
      isNickCarter: /nick\s*carter/i.test(r.album.artist),
    }));
    const picks: Scored[] = [];
    const seen = new Set<string>();
    function take(s: Scored | undefined, _label: string) {
      if (!s || seen.has(s.orderId)) return;
      picks.push(s);
      seen.add(s.orderId);
    }
    // 1. Nick Carter LLT (longest title wins inside that bucket).
    const nick = scored.filter((s) => s.isNickCarter).sort((a, b) => b.titleLen - a.titleLen)[0];
    take(nick, "nick-carter");
    // 2. Longest title overall (Letter target).
    const longest = scored.slice().sort((a, b) => b.titleLen - a.titleLen)[0];
    take(longest, "long-title");
    // 3. Short title (clean rendering).
    const short = scored.slice().sort((a, b) => a.titleLen - b.titleLen)[0];
    take(short, "short-title");
    // 4. Another distinct artist for variety.
    const distinct = scored.find(
      (s) => !picks.some((p) => p.albumArtist === s.albumArtist),
    );
    take(distinct, "variety");
    // 5. Whatever else fills the slot.
    take(scored.find((s) => !seen.has(s.orderId)), "filler");

    res.json({
      total: rows.length,
      samples: picks.map((p) => ({
        orderId: p.orderId,
        goodDeedNumber: p.goodDeedNumber,
        albumTitle: p.albumTitle,
        albumArtist: p.albumArtist,
        displayName: p.displayName,
        previewLetterUrl: `/api/admin/legacy-cert-preview/order/${p.orderId}.pdf?paperSize=letter`,
        previewA4Url: `/api/admin/legacy-cert-preview/order/${p.orderId}.pdf?paperSize=a4`,
      })),
    });
  });

  app.get("/api/admin/legacy-cert-preview/order/:orderId.pdf", async (req, res) => {
    const me = await getAdminAuth(req);
    if (!me) return res.status(403).json({ message: "Admin only" });
    const [row] = await db
      .select({ order: orders, album: albums, customer: customerUsers })
      .from(orders)
      .innerJoin(albums, eq(albums.id, orders.albumId))
      .innerJoin(customerUsers, eq(customerUsers.id, orders.customerId))
      .where(eq(orders.id, req.params.orderId));
    if (!row) return res.status(404).json({ message: "Order not found" });
    const paperSize: "letter" | "a4" =
      req.query.paperSize === "a4" ? "a4" : req.query.paperSize === "letter" ? "letter" : "letter";
    const nameOverride = typeof req.query.name === "string" ? req.query.name.trim() : "";
    const confirmedName =
      nameOverride || row.customer.realName || row.customer.displayName || row.customer.username;
    // Synthetic in-memory cert — never written to the DB.
    const syntheticCert: SignedCertCertificate = {
      id: "preview",
      orderId: row.order.id,
      copyId: null,
      shortId: "preview" + row.order.id.slice(0, 8),
      nameStatus: "confirmed",
      confirmedIdentityKind: "display",
      confirmedName,
      paperSize,
      paperSizeOverridden: false,
      printBatchId: null,
      lockedAt: null,
      printedAt: null,
      confirmedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const ctx: CertContext = {
      cert: syntheticCert,
      order: row.order,
      album: row.album,
      origin: absoluteOrigin(req),
    };
    const pdf = await renderCertPdf(ctx);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${certFilename(ctx)}"`);
    res.send(pdf);
  });

  // POST batch-download. Body: { certIds: string[], format: "zip"|"merged_pdf" }
  // Locks every confirmed row in the batch (idempotent for already-locked),
  // renders PDFs, streams the ZIP/merged file, then on the same request
  // flips each row to `printed` and stamps `printed_at`. Failure to send
  // the response leaves rows at `locked_for_print` — re-downloading the
  // same batch ids re-emits PDFs without re-confirming.
  app.post("/api/admin/print-queue/batch-download", async (req, res) => {
    const me = await getAdminAuth(req);
    if (!me) return res.status(403).json({ message: "Admin only" });
    const certIds: string[] = Array.isArray(req.body?.certIds) ? req.body.certIds : [];
    const format: "zip" | "merged_pdf" = req.body?.format === "merged_pdf" ? "merged_pdf" : "zip";
    if (certIds.length === 0) return res.status(400).json({ message: "certIds required" });
    const certs = await db.select().from(signedCertCertificates).where(inArray(signedCertCertificates.id, certIds));
    const eligible = certs.filter((c) => c.nameStatus === "confirmed" || c.nameStatus === "locked_for_print");
    if (eligible.length === 0) return res.status(400).json({ message: "No confirmed certificates in batch" });

    const [batch] = await db
      .insert(certPrintBatches)
      .values({ format, certCount: eligible.length, downloadedByAdminId: me.userId })
      .returning();

    // Lock everything in the batch.
    await db
      .update(signedCertCertificates)
      .set({
        nameStatus: "locked_for_print",
        lockedAt: sql`COALESCE(${signedCertCertificates.lockedAt}, NOW())`,
        printBatchId: batch.id,
        updatedAt: new Date(),
      })
      .where(inArray(signedCertCertificates.id, eligible.map((c) => c.id)));

    const origin = absoluteOrigin(req);
    const contexts: CertContext[] = [];
    for (const c of eligible) {
      const ctx = await loadCertContext(c.id, origin);
      if (ctx) contexts.push(ctx);
    }
    if (contexts.length === 0) return res.status(500).json({ message: "Could not load contexts" });

    if (format === "zip") {
      const zip = new AdmZip();
      for (const ctx of contexts) {
        const pdf = await renderCertPdf(ctx);
        zip.addFile(certFilename(ctx), pdf);
      }
      const buf = zip.toBuffer();
      res.setHeader("Content-Type", "application/zip");
      res.setHeader("Content-Disposition", `attachment; filename="gooddeed-print-batch-${batch.id}.zip"`);
      res.send(buf);
    } else {
      // Merged PDF — render each into the same doc by drawing on a new
      // page sized to that cert's paperSize. pdfkit lets us switch page
      // size per `addPage`.
      // No default margin — drawCertOnto manages its own mat/bleed math.
      const merged = new PDFDocument({ autoFirstPage: false, margin: 0 });
      const chunks: Buffer[] = [];
      merged.on("data", (c: Buffer) => chunks.push(c));
      const done = new Promise<Buffer>((resolve) => merged.on("end", () => resolve(Buffer.concat(chunks))));
      // Simplest correct approach: render each cert to its own PDF then
      // re-emit page-by-page into the merged doc. pdfkit can't import
      // other PDFs natively, so we instead just call renderCertPdf into
      // pages inline. We re-implement by adding pages to `merged`
      // directly to keep a single PDF object.
      for (const ctx of contexts) {
        // Add a new page to `merged` matching this cert's size.
        merged.addPage({ size: ctx.cert.paperSize === "a4" ? "A4" : "LETTER", margin: 0 });
        await drawCertOnto(merged, ctx);
      }
      merged.end();
      const buf = await done;
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="gooddeed-print-batch-${batch.id}.pdf"`);
      res.send(buf);
    }

    // Flip to printed once the file is sent.
    await db
      .update(signedCertCertificates)
      .set({ nameStatus: "printed", printedAt: new Date(), updatedAt: new Date() })
      .where(inArray(signedCertCertificates.id, eligible.map((c) => c.id)));
  });
}

// Task #551 — Adapter onto the locked GoodDeedPrintTemplate. The
// template owns every layout/font/QR decision; this function exists
// only because the admin print-queue batch-download path assembles its
// own merged PDF (mixing per-cert paper sizes) and wants to draw onto
// a doc it already controls. New callers should use
// renderGoodDeedPdf() / renderGoodDeedBatchPdf() directly.
function ctxToTemplateInputs(ctx: CertContext): GoodDeedPrintInputs {
  return {
    albumId: ctx.album.id,
    sequenceNumber: ctx.order.goodDeedNumber,
    recipientName:
      (ctx.cert.confirmedName && ctx.cert.confirmedName.trim()) ||
      ctx.order.buyerName ||
      "GoodTunes Fan",
    qrPayload: `${ctx.origin}/g/${ctx.cert.shortId}`,
    paperSize: ctx.cert.paperSize === "a4" ? "a4" : "letter",
  };
}
async function drawCertOnto(doc: PDFKit.PDFDocument, ctx: CertContext): Promise<void> {
  await drawGoodDeedPageOnto(doc, ctxToTemplateInputs(ctx));
}
