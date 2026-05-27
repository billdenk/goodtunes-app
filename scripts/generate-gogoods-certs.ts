// Task #435 — Bulk-generate signed_cert_certificates rows for every
// imported gogoods.com owner so each fan has a fresh GoodTunes
// GoodDeed PDF they can re-download from their Library. Re-running is
// safe: we read what's already in `signed_cert_certificates` and only
// INSERT the gaps. Paper size is inferred from the customer's shipping
// country (US/CA/MX → Letter, else A4, fallback Letter), and the
// printed name is the customer's `realName` (preferred) or
// `displayName` (fallback) — matching the identity-picker default a
// fan sees in their order row.
//
// Why per-user_album, not per-order:
//   The gogoods import collapses a multi-collectible transaction into
//   a single order whose `goodDeedNumber` is the lowest index in the
//   bundle. A fan who bought a 3-pack therefore has 3 user_albums rows
//   (each with its own `certificateNumber`) but only ONE order. To
//   keep #042 → #042, we mint a separate (synthetic) order per
//   user_albums row that doesn't already have its own matching order,
//   then create one cert per order — preserving the cert table's
//   `unique(orderId)` constraint without losing #043/#044.
//
// All legacy certs land as `nameStatus = 'printed'` with `printedAt =
// the order's createdAt`. Fans already physically own the original
// gogoods.com cert, so we are NOT queueing 3,006 prints — the admin
// print queue stays clean (the Printed tab gets a "Legacy" badge so
// operators can tell them apart at a glance).
//
// Usage:
//   tsx scripts/generate-gogoods-certs.ts            # DRY RUN — counts only
//   tsx scripts/generate-gogoods-certs.ts --apply    # writes
//
// Writes a markdown summary to docs/migrations/gogoods-certs-<date>.md.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { and, eq, isNotNull, sql } from "drizzle-orm";
import { db } from "../server/db";
import {
  albums,
  customerUsers,
  orders,
  signedCertCertificates,
  userAlbums,
} from "../shared/schema";
import { paperSizeFromCountry } from "../server/certificates";

const APPLY = process.argv.includes("--apply");

const ALPHABET = "23456789abcdefghijkmnpqrstuvwxyz";
function generateShortId(): string {
  const bytes = crypto.randomBytes(10);
  let out = "";
  for (let i = 0; i < 10; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

type Report = {
  legacyUserAlbumsTotal: number;
  alreadyHadCert: number;
  reusedExistingOrder: number;
  syntheticOrdersCreated: number;
  certsCreated: number;
  skippedNoCertNumber: { userAlbumId: string; reason: string }[];
  byPaper: { letter: number; a4: number };
  errors: { userAlbumId: string; error: string }[];
};

async function main() {
  console.log(`[gogoods-certs] mode: ${APPLY ? "APPLY" : "DRY RUN"}`);

  // Pull every user_albums row whose owner is a legacy gogoods customer.
  // We can't filter on user_albums.legacyGogoodsId — that column doesn't
  // exist; provenance lives on the customer row instead.
  const rows = await db
    .select({
      ua: userAlbums,
      customer: customerUsers,
      album: albums,
    })
    .from(userAlbums)
    .innerJoin(customerUsers, eq(customerUsers.id, userAlbums.userId))
    .innerJoin(albums, eq(albums.id, userAlbums.albumId))
    .where(isNotNull(customerUsers.legacyGogoodsId));

  const report: Report = {
    legacyUserAlbumsTotal: rows.length,
    alreadyHadCert: 0,
    reusedExistingOrder: 0,
    syntheticOrdersCreated: 0,
    certsCreated: 0,
    skippedNoCertNumber: [],
    byPaper: { letter: 0, a4: 0 },
    errors: [],
  };

  console.log(`[gogoods-certs] candidate user_albums rows: ${rows.length}`);

  for (const r of rows) {
    const ua = r.ua;
    const customer = r.customer;
    if (ua.certificateNumber == null) {
      report.skippedNoCertNumber.push({
        userAlbumId: ua.id,
        reason: "user_albums.certificateNumber is null",
      });
      continue;
    }

    try {
      // 1. Find an order that already represents this exact (customer,
      //    album, goodDeedNumber). If found, we attach the cert there.
      const [existingOrder] = await db
        .select()
        .from(orders)
        .where(
          and(
            eq(orders.customerId, customer.id),
            eq(orders.albumId, ua.albumId),
            eq(orders.goodDeedNumber, ua.certificateNumber),
          ),
        );

      let orderId: string;
      let orderCreatedAt: Date;
      let shippingCountry: string | null;

      if (existingOrder) {
        orderId = existingOrder.id;
        orderCreatedAt = existingOrder.createdAt ?? new Date();
        shippingCountry =
          (existingOrder.shippingAddress as any)?.country ??
          (customer.shippingAddress as any)?.country ??
          null;
        report.reusedExistingOrder++;
      } else {
        // 2. Synthesize a $0 legacy order so the cert table's
        //    unique(orderId) constraint stays honest. legacyGogoodsId
        //    keeps the synthetic rows distinguishable from real txns
        //    via a `legacy-ua-<userAlbumId>` prefix and prevents a
        //    re-run from double-inserting them (uniqueIndex).
        const syntheticLegacyId = `legacy-ua-${ua.id}`;
        const acquiredAt = ua.acquiredAt ?? new Date();
        shippingCountry =
          (customer.shippingAddress as any)?.country ?? null;
        if (APPLY) {
          const [created] = await db
            .insert(orders)
            .values({
              customerId: customer.id,
              albumId: ua.albumId,
              totalCents: 0,
              currency: "usd",
              status: "complete",
              goodDeedNumber: ua.certificateNumber,
              origin: "legacy:gogoods",
              skuKind: "gooddeed",
              legacyGogoodsId: syntheticLegacyId,
              buyerEmail: customer.email,
              createdAt: acquiredAt,
            } as any)
            .onConflictDoNothing({ target: orders.legacyGogoodsId })
            .returning({ id: orders.id, createdAt: orders.createdAt });
          if (created) {
            orderId = created.id;
            orderCreatedAt = created.createdAt ?? acquiredAt;
          } else {
            // Conflict on legacyGogoodsId — pull the existing row.
            const [pre] = await db
              .select()
              .from(orders)
              .where(eq(orders.legacyGogoodsId, syntheticLegacyId));
            if (!pre) throw new Error("synthetic legacy order vanished after conflict");
            orderId = pre.id;
            orderCreatedAt = pre.createdAt ?? acquiredAt;
          }
          report.syntheticOrdersCreated++;
        } else {
          // Dry-run: pretend we created it so downstream accounting matches.
          orderId = `DRY-${ua.id}`;
          orderCreatedAt = acquiredAt;
          report.syntheticOrdersCreated++;
        }
      }

      // 3. Cert already there? skip.
      if (APPLY) {
        const [existingCert] = await db
          .select({ id: signedCertCertificates.id })
          .from(signedCertCertificates)
          .where(eq(signedCertCertificates.orderId, orderId));
        if (existingCert) {
          report.alreadyHadCert++;
          continue;
        }
      }

      const paperSize = paperSizeFromCountry(shippingCountry);
      const confirmedName =
        customer.realName?.trim() ||
        customer.displayName?.trim() ||
        customer.username;

      if (APPLY) {
        // Retry on short_id collision — same loop ensureCertificateForOrder uses.
        let inserted = false;
        for (let attempt = 0; attempt < 5 && !inserted; attempt++) {
          try {
            await db
              .insert(signedCertCertificates)
              .values({
                orderId,
                shortId: generateShortId(),
                nameStatus: "printed",
                confirmedIdentityKind: "display",
                confirmedName,
                paperSize,
                paperSizeOverridden: false,
                // printedAt back-dates to the order createdAt so the
                // Printed tab sorts legacy rows alongside the
                // historical purchase date, not today.
                printedAt: orderCreatedAt,
                confirmedAt: orderCreatedAt,
              })
              .onConflictDoNothing({ target: signedCertCertificates.orderId });
            inserted = true;
          } catch (e: any) {
            if (!String(e?.message ?? "").includes("short_id")) throw e;
          }
        }
        if (!inserted) throw new Error("could not mint unique shortId after 5 attempts");
      }
      report.certsCreated++;
      report.byPaper[paperSize]++;
    } catch (e: any) {
      report.errors.push({ userAlbumId: ua.id, error: e?.message ?? String(e) });
      console.error(`[gogoods-certs] error on user_album ${ua.id}:`, e?.message ?? e);
    }
  }

  // ── Report ──────────────────────────────────────────────────────
  const today = new Date().toISOString().slice(0, 10);
  const reportPath = path.resolve(
    process.cwd(),
    `docs/migrations/gogoods-certs-${today}.md`,
  );
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  const lines: string[] = [];
  lines.push(`# gogoods.com Legacy Certs — ${today}`);
  lines.push("");
  lines.push(`Mode: **${APPLY ? "APPLY" : "DRY RUN"}**`);
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(`| Metric | Count |`);
  lines.push(`|---|---:|`);
  lines.push(`| Legacy user_albums scanned | ${report.legacyUserAlbumsTotal} |`);
  lines.push(`| Reused existing legacy order | ${report.reusedExistingOrder} |`);
  lines.push(`| Synthetic \`legacy-ua-*\` orders created | ${report.syntheticOrdersCreated} |`);
  lines.push(`| Certs created | ${report.certsCreated} |`);
  lines.push(`| Already had a cert (skipped) | ${report.alreadyHadCert} |`);
  lines.push(`| Skipped — no \`certificateNumber\` | ${report.skippedNoCertNumber.length} |`);
  lines.push(`| Errors | ${report.errors.length} |`);
  lines.push("");
  lines.push(`### Paper size distribution`);
  lines.push("");
  lines.push(`- Letter: ${report.byPaper.letter}`);
  lines.push(`- A4:     ${report.byPaper.a4}`);
  lines.push("");
  if (report.skippedNoCertNumber.length) {
    lines.push("## Skipped — missing certificateNumber");
    lines.push("");
    for (const s of report.skippedNoCertNumber.slice(0, 50)) {
      lines.push(`- user_album ${s.userAlbumId} — ${s.reason}`);
    }
    if (report.skippedNoCertNumber.length > 50) {
      lines.push(`- … and ${report.skippedNoCertNumber.length - 50} more`);
    }
    lines.push("");
  }
  if (report.errors.length) {
    lines.push("## Errors");
    lines.push("");
    for (const e of report.errors.slice(0, 50)) {
      lines.push(`- user_album ${e.userAlbumId} — ${e.error}`);
    }
    lines.push("");
  }
  fs.writeFileSync(reportPath, lines.join("\n"));
  console.log(`[gogoods-certs] report written → ${reportPath}`);
  console.log(
    `[gogoods-certs] done — created=${report.certsCreated} skipped=${report.alreadyHadCert} errors=${report.errors.length}`,
  );

  if (!APPLY) {
    console.log("[gogoods-certs] DRY RUN — re-run with --apply to actually write.");
  }
  process.exit(report.errors.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
