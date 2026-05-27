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
  orderItems,
  orders,
  signedCertCertificates,
  type SignedCertCertificate,
} from "@shared/schema";

// ─── Constants ───────────────────────────────────────────────────────
const LETTER_COUNTRIES = new Set(["US", "USA", "CA", "CAN", "MX", "MEX"]);
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
// Creates the row for a paid signed_cert order. Idempotent via the
// unique (order_id) constraint so the webhook + backfill + manual repair
// all converge on the same row.
export async function ensureCertificateForOrder(orderId: string): Promise<void> {
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
  if (!order || order.status !== "paid") return;
  const items = await db.select().from(orderItems).where(
    and(eq(orderItems.orderId, orderId), eq(orderItems.kind, "addon"), eq(orderItems.sku, "signed_cert")),
  );
  if (items.length === 0) return;
  const country = (order.shippingAddress as any)?.country ?? null;
  const paperSize = paperSizeFromCountry(country);
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      await db
        .insert(signedCertCertificates)
        .values({
          orderId,
          shortId: generateShortId(),
          paperSize,
          nameStatus: "awaiting",
        })
        .onConflictDoNothing({ target: signedCertCertificates.orderId });
      return;
    } catch (e: any) {
      // Unique violation on short_id — retry with a fresh id.
      if (!String(e?.message ?? "").includes("short_id")) throw e;
    }
  }
  throw new Error(`Could not mint a unique cert shortId for order ${orderId}`);
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
    if (row.cert.nameStatus === "locked_for_print" || row.cert.nameStatus === "printed") {
      return res.status(409).json({ message: "Already locked for printing — contact support to change the name." });
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

  // ─── Task #435 — Fan-facing cert PDF download ───────────────────
  // Fans hit this from the Orders page "Download certificate" link.
  // Auth: must own the order. Works for every cert state (legacy
  // imports land as `printed` straight from the bulk generator, so
  // gating on `printed` only — like the original Orders link did —
  // would have hidden new-sale certs that are still `confirmed`).
  app.get("/api/orders/:orderId/cert/pdf", async (req, res) => {
    const me = await getCustomerAuth(req);
    if (!me) return res.status(401).json({ message: "Sign in required" });
    const [row] = await db
      .select({ cert: signedCertCertificates, order: orders })
      .from(signedCertCertificates)
      .innerJoin(orders, eq(orders.id, signedCertCertificates.orderId))
      .where(eq(signedCertCertificates.orderId, req.params.orderId));
    if (!row || row.order.customerId !== me.userId) {
      return res.status(404).json({ message: "Not found" });
    }
    const ctx = await loadCertContext(row.cert.id, absoluteOrigin(req));
    if (!ctx) return res.status(404).json({ message: "Not found" });
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

// Draws a single GoodDeed certificate onto an already-added page of `doc`.
// Layout mirrors the four reference PDFs Nick has been hand-producing:
//   - Top ~73% of the mat window: the album artwork, edge-to-edge.
//   - Bottom band (#00062B dark blue): bleeds to the page edges on
//     left/right/bottom so an 8×10 / 20×25 cm mat leaves no white gap.
//     Inside the band, the reference's left column (album thumbnail +
//     title + certifying paragraph + signature) and right column
//     (QR + "GoodDeed™" mark) live inside the safe-zone inset.
async function drawCertOnto(doc: PDFKit.PDFDocument, ctx: CertContext): Promise<void> {
  const { cert, order, album, origin } = ctx;
  const paperSize: "letter" | "a4" = cert.paperSize === "a4" ? "a4" : "letter";
  const L = layoutFor(paperSize);

  // ─── Geometry ───────────────────────────────────────────────────
  // Band height is a fixed fraction of the mat opening — same visual
  // proportion as the reference PDFs (~26% of the 8×10 window).
  const bandH = L.matH * 0.26;
  // Band extends to the BOTTOM and LEFT/RIGHT page edges for bleed.
  // Its top edge sits at the bottom of the artwork (which is inside
  // the mat). Visually, when the 1/8" mat is laid over the print, the
  // mat covers the bleed strip and the band reads as flush to the mat.
  const bandTop = L.matY + L.matH - bandH;
  const bandX = 0;
  const bandW = L.W;
  const bandBottom = L.H; // bleeds off the bottom of the page

  // ─── Artwork (top) ──────────────────────────────────────────────
  // Cover-fit into a rectangle that fills the page from the top edge
  // down to the band top. Bleeds past the mat on top/left/right so
  // there's never a white sliver under the mat. We let pdfkit do the
  // cover-fit math via `cover: [w, h]`.
  const artBox = { x: 0, y: 0, w: L.W, h: bandTop };
  const artBytes = await fetchArtworkBytes(album.artwork);
  if (artBytes) {
    try {
      doc.image(artBytes, artBox.x, artBox.y, { cover: [artBox.w, artBox.h], align: "center", valign: "center" });
    } catch {
      doc.rect(artBox.x, artBox.y, artBox.w, artBox.h).fill("#EEE");
    }
  } else {
    doc.rect(artBox.x, artBox.y, artBox.w, artBox.h).fill("#EEE");
  }

  // ─── Dark band ──────────────────────────────────────────────────
  doc.save();
  doc.rect(bandX, bandTop, bandW, bandBottom - bandTop).fill("#00062B");
  doc.restore();

  // Safe zone inside the band — keep all text/QR/sig at least
  // (matX + safeInset) from each page edge and (matY + safeInset) from
  // the page bottom. This survives a slightly-off mat cut on any side.
  const safeLeft = L.matX + L.safeInset;
  const safeRight = L.W - L.matX - L.safeInset;
  const safeBottom = L.H - L.matY - L.safeInset;
  const safeTop = bandTop + L.safeInset; // a small inset under the artwork edge too

  // ─── Right column (QR + "GoodDeed™") ────────────────────────────
  // Build the QR first so we can lay the left column to its left edge.
  const shortUrl = `${origin}/g/${cert.shortId}`;
  let qrPng: Buffer | null = null;
  try {
    // Rendering at 4x final pt size yields a crisp print at 300dpi.
    qrPng = await QRCode.toBuffer(shortUrl, {
      margin: 0,
      width: 480,
      color: { dark: "#FFFFFF", light: "#00062B" },
    });
  } catch {
    qrPng = null;
  }
  const qrSize = Math.min(78, bandH * 0.55);
  const qrX = safeRight - qrSize;
  const qrY = safeTop + 6;
  // White card behind the QR so the dark/light contrast is sharp on
  // any cover art tone that bled past the mat.
  doc.save();
  doc.rect(qrX - 4, qrY - 4, qrSize + 8, qrSize + 8).fill("#FFFFFF");
  doc.restore();
  if (qrPng) {
    try { doc.image(qrPng, qrX, qrY, { width: qrSize, height: qrSize }); } catch {}
  }
  // "GoodDeed™" mark caption, lower-right.
  doc.font("Helvetica").fontSize(8).fillColor("#FFFFFF").text(
    "GoodDeed\u2122",
    qrX - 10,
    qrY + qrSize + 6,
    { width: qrSize + 20, align: "center", lineBreak: false },
  );

  // ─── Left column (title block + certifying copy + signature) ────
  // The whole left column is bounded by the QR's left edge.
  const colLeft = safeLeft;
  const colRight = qrX - 16;
  const colWidth = colRight - colLeft;

  // Album thumbnail (small square) + title block to its right.
  const thumbSize = Math.min(44, bandH * 0.32);
  const thumbX = colLeft;
  const thumbY = safeTop + 4;
  if (artBytes) {
    try { doc.image(artBytes, thumbX, thumbY, { cover: [thumbSize, thumbSize] }); } catch {}
  } else {
    doc.rect(thumbX, thumbY, thumbSize, thumbSize).fill("#1A2052");
  }
  const titleX = thumbX + thumbSize + 10;
  const titleW = colRight - titleX;
  // Artist name — small white.
  doc.font("Helvetica").fontSize(10).fillColor("#FFFFFF").text(album.artist, titleX, thumbY, {
    width: titleW,
    lineBreak: false,
    ellipsis: true,
  });
  // Album title — bold white, larger.
  doc.font("Helvetica-Bold").fontSize(14).fillColor("#FFFFFF").text(album.title, titleX, thumbY + 12, {
    width: titleW,
    lineBreak: false,
    ellipsis: true,
  });
  // Genre • GOODTUNES RELEASE YEAR — small muted.
  const year = album.year ?? (album.goodTunesReleaseDate ? Number(album.goodTunesReleaseDate.slice(0, 4)) : null);
  const subPieces: string[] = [];
  if (album.genre) subPieces.push(album.genre.toUpperCase());
  subPieces.push(year ? `GOODTUNES RELEASE ${year}` : "GOODTUNES RELEASE");
  const subline = subPieces.join("\u2022"); // bullet (the reference uses a tight bullet)
  doc.font("Helvetica").fontSize(7).fillColor("#A6B2D6").text(subline, titleX, thumbY + 28, {
    width: titleW,
    characterSpacing: 0.6,
    lineBreak: false,
    ellipsis: true,
  });

  // Certifying paragraph block.
  const fanName = (cert.confirmedName && cert.confirmedName.trim()) || order.buyerName || "GoodTunes Fan";
  const goodDeedNum = order.goodDeedNumber != null ? String(order.goodDeedNumber) : cert.shortId.toUpperCase();
  const certifyY = thumbY + thumbSize + 14;

  // Line 1 — bold, the headline sentence.
  const headline = `This certifies that ${fanName} owns no. ${goodDeedNum} of ${album.title}.`;
  doc.font("Helvetica-Bold").fontSize(10).fillColor("#FFFFFF").text(headline, colLeft, certifyY, {
    width: colWidth,
    lineGap: 1.5,
  });
  const afterHeadlineY = doc.y + 4;

  // Line 2 — smaller, the provenance / transfer paragraph (verbatim
  // from the reference, with the fan's name substituted in).
  const provenance =
    `Digital provenance can be confirmed by accessing the QR code on this GoodDeed. ` +
    `In the event that ownership has been transferred since this certificate was issued, this GoodDeed\u2122 ` +
    `will serve as the moment in time in which ${fanName} possessed ownership of this good.`;
  doc.font("Helvetica").fontSize(7.5).fillColor("#C7CFE8").text(provenance, colLeft, afterHeadlineY, {
    width: colWidth,
    lineGap: 1.5,
  });

  // ─── Signature + founder line (bottom-left) ─────────────────────
  // The signature PNG is white-on-transparent (2× resolution, 1048×254).
  // pdfkit will downscale it cleanly — never upscale, per the task spec.
  const sigW = Math.min(120, colWidth * 0.45);
  const sigAspect = 254 / 1048;
  const sigH = sigW * sigAspect;
  const sigY = safeBottom - sigH - 12;
  const sigX = colLeft;
  if (fs.existsSync(SIGNATURE_ASSET)) {
    try {
      doc.image(SIGNATURE_ASSET, sigX, sigY, { width: sigW });
    } catch {}
  }
  // Founder line directly under the signature.
  doc.font("Helvetica").fontSize(6.5).fillColor("#FFFFFF").text(
    "William E. Denk, CEO/Founder GoodTunes\u2122",
    sigX,
    sigY + sigH + 2,
    { width: sigW * 1.6, lineBreak: false },
  );
}
