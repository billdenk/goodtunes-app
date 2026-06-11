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

import type { Express, Request, Response, NextFunction } from "express";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "./db";
import { albums, organizations, payoutAccounts, pressingOrderRequests, songs, trackPublishingSplits } from "@shared/schema";
import {
  computeAlbumPublishingSettlement,
  computePayeeStatement,
  getMechanicalRateMicros,
} from "./publishingSettlement";
import { resolveInviterBranding } from "./inviteBranding";

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
  // requireAdmin (server/routes.ts) already blocks publisher role globally.

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

  // Cross-catalog statement for one payee.
  // payeeKey contains a colon (org:/person:/name:) so it is accepted as a
  // query param rather than a path segment.
  app.get("/api/admin/publishing/payee/statement", requireAdmin, async (req, res) => {
    try {
      const payeeKey = String(req.query.payeeKey ?? "").trim();
      if (!payeeKey) {
        return res.status(400).json({ message: "payeeKey query param is required" });
      }
      const rateMicros = await getMechanicalRateMicros();
      const albumIds = await albumIdsWithPublishingSplits();
      if (albumIds.length === 0) {
        return res.status(404).json({ message: "Payee not found" });
      }

      const albumRows = await db
        .select({ id: albums.id, title: albums.title, artist: albums.artist, artwork: albums.artwork })
        .from(albums)
        .where(inArray(albums.id, albumIds));
      const metaById = new Map(albumRows.map((a) => [a.id, a]));

      const entries = await Promise.all(
        albumIds.map(async (albumId) => {
          const meta = metaById.get(albumId);
          const unitsPressed = await resolveUnitsPressed(albumId);
          return {
            albumId,
            unitsPressed,
            title: meta?.title ?? albumId,
            artist: meta?.artist ?? null,
            artwork: meta?.artwork ?? null,
          };
        }),
      );

      const statement = await computePayeeStatement(payeeKey, entries, rateMicros);
      if (!statement) {
        return res.status(404).json({ message: "Payee not found" });
      }
      return res.json(statement);
    } catch (err) {
      console.error("[publishing-payee-statement]", err);
      return res.status(500).json({ message: "Failed to compute payee statement" });
    }
  });

  // POST /api/admin/publishing/payee/invite — invite a publisher/writer to
  // log in and see their own statement. Validates that the payeeKey refers
  // to a real organization or person (name-only payees can't be invited), then
  // delegates to the standard admin-invite pipeline so the branded invite
  // email + accept flow works identically to every other partner invite.
  //
  // Operator-only (super_admin / admin). requireAdmin admits partner roles
  // too, so we add an explicit role check here matching the pattern already
  // used by move-publishing-data.
  app.post("/api/admin/publishing/payee/invite", requireAdmin, async (req, res) => {
    try {
      const userId = (req.session as { userId?: string } | undefined)?.userId;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });

      // Only operators may create publisher invites.
      const { getUserRole } = await import("./auth/roles");
      const roleInfo = userId ? await getUserRole(userId) : null;
      if (!(roleInfo?.role === "super_admin" || roleInfo?.role === "admin")) {
        return res.status(403).json({ message: "Only GoodTunes operators can invite publishers." });
      }

      const payeeKey = String(req.body?.payeeKey ?? "").trim();
      const email = String(req.body?.email ?? "").trim().toLowerCase();

      if (!payeeKey) return res.status(400).json({ message: "payeeKey is required" });
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
        return res.status(400).json({ message: "A valid email address is required" });
      }

      // Only linked payees (org: or person:) can be invited.
      // Name-only payees (name:…) have no identity record to scope to.
      const colonIdx = payeeKey.indexOf(":");
      const kindRaw = colonIdx >= 0 ? payeeKey.slice(0, colonIdx) : "";
      const entityId = colonIdx >= 0 ? payeeKey.slice(colonIdx + 1) : "";
      if (kindRaw !== "organization" && kindRaw !== "person") {
        return res.status(422).json({
          message:
            "This payee is name-only and has no linked organization or person record. " +
            "Link them to an entity in the publishing splits editor first.",
        });
      }
      if (!entityId) {
        return res.status(422).json({ message: "Invalid payeeKey format" });
      }

      // Verify the entity exists.
      if (kindRaw === "organization") {
        const [org] = await db
          .select({ id: organizations.id })
          .from(organizations)
          .where(eq(organizations.id, entityId))
          .limit(1);
        if (!org) return res.status(404).json({ message: "Organization not found" });
      } else {
        const r = await db.execute<{ id: string }>(
          sql`SELECT id FROM people WHERE id = ${entityId} LIMIT 1`,
        );
        if (((r as any).rows ?? []).length === 0) {
          return res.status(404).json({ message: "Person not found" });
        }
      }

      // Check for a pending invite already in flight for this email+role+scope.
      // Schema uses used_at / revoked_at (not accepted_at).
      const existing = await db.execute<{ id: string }>(sql`
        SELECT id FROM admin_invites
        WHERE email = ${email}
          AND role = 'publisher'
          AND role_scope_id = ${payeeKey}
          AND used_at IS NULL
          AND revoked_at IS NULL
          AND expires_at > NOW()
        LIMIT 1
      `);
      if (((existing as any).rows ?? []).length > 0) {
        return res.status(409).json({ message: "An active invite already exists for this email and publisher." });
      }

      // Inline invite creation — avoids circular dependency on routes.ts while
      // preserving the same token + email flow every other partner invite uses.
      const { randomBytes } = await import("crypto");
      const token = randomBytes(32).toString("hex");
      const INVITE_TTL_DAYS = 14;
      const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 3600 * 1000);

      await db.execute(sql`
        INSERT INTO admin_invites (email, role, role_scope_id, token, expires_at, created_by_user_id)
        VALUES (${email}, 'publisher', ${payeeKey}, ${token}, ${expiresAt}, ${userId ?? null})
      `);

      // Send branded invite email (best-effort — invite row is already
      // written). Mirrors every other partner invite: resolve the inviting
      // operator's display name + avatar/logo (resolveInviterBranding) and
      // name the publisher entity they're being invited to manage, so the
      // email reads like the artist/label invites instead of an anonymous
      // "GoodTunes invited you".
      try {
        const { sendAdminInviteEmail } = await import("./mail");
        const { storage } = await import("./storage");
        const inviter = await storage.getUser(userId);
        const inviterName =
          inviter?.displayName || inviter?.email || "A GoodTunes admin";
        const branding = await resolveInviterBranding(userId);

        // Name the publisher entity (org or person) so the invite makes
        // clear which catalog the recipient will see.
        let publisherName = "";
        if (kindRaw === "organization") {
          const [org] = await db
            .select({ name: organizations.name })
            .from(organizations)
            .where(eq(organizations.id, entityId))
            .limit(1);
          publisherName = org?.name ?? "";
        } else {
          const r = await db.execute<{ name: string }>(
            sql`SELECT name FROM people WHERE id = ${entityId} LIMIT 1`,
          );
          publisherName = ((r as any).rows ?? [])[0]?.name ?? "";
        }
        const roleLabel = publisherName
          ? `Publisher for ${publisherName}`
          : "Publisher";

        const baseUrl = `${req.protocol}://${req.get("host")}`;
        const acceptUrl = `${baseUrl}/invite/${token}`;
        await sendAdminInviteEmail(
          email,
          acceptUrl,
          inviterName,
          roleLabel,
          INVITE_TTL_DAYS,
          branding.photoUrl,
          branding.onBehalfOf,
        );
      } catch (mailErr) {
        console.warn("[publisher-invite] email send failed (invite row committed):", mailErr);
      }

      return res.status(201).json({ invited: true, email });
    } catch (err) {
      console.error("[publisher-invite]", err);
      return res.status(500).json({ message: "Failed to create publisher invite" });
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

// ─── Publisher portal routes ─────────────────────────────────────────────────
//
// Task #1953 — Read-only mechanical-royalty statement for invited
// publisher/writer accounts. Auth is a standalone `requirePublisher`
// middleware (checks role === "publisher" + extracts payeeKey from
// roleScopeId) so this function takes only `app`, no `requireAdmin`.

export function registerPublisherPortalRoutes(app: Express): void {
  /**
   * Verify the caller is a publisher account and attach their payeeKey to
   * the request as `(req as any).publisherPayeeKey`.
   */
  async function requirePublisher(req: Request, res: Response, next: NextFunction): Promise<unknown> {
    const session = (req as any).session as { userId?: string } | undefined;
    const userId = session?.userId;
    if (!userId) return res.status(401).json({ message: "Not authenticated" });
    try {
      const { getUserRole } = await import("./auth/roles");
      const info = await getUserRole(userId);
      if (info?.role !== "publisher") {
        return res.status(403).json({ message: "Publisher account required" });
      }
      const payeeKey = info.roleScopeId;
      if (!payeeKey) {
        return res.status(403).json({ message: "Publisher account has no entity linked" });
      }
      (req as any).publisherPayeeKey = payeeKey;
      return next();
    } catch (err) {
      console.error("[publisher-auth]", err);
      return res.status(500).json({ message: "Auth check failed" });
    }
  }

  // POST /api/publisher/payout-onboard — self-service Stripe Connect
  // onboarding for a publisher. Creates a Stripe Express account for the
  // publisher's linked entity if one doesn't exist yet, then returns a
  // short-lived account_onboarding link the browser navigates to directly.
  // On return/refresh Stripe redirects back to /publisher.
  app.post("/api/publisher/payout-onboard", requirePublisher, async (req, res) => {
    try {
      const payeeKey = (req as any).publisherPayeeKey as string;
      const colonIdx = payeeKey.indexOf(":");
      const kindRaw = colonIdx >= 0 ? payeeKey.slice(0, colonIdx) : "";
      const ownerId = colonIdx >= 0 ? payeeKey.slice(colonIdx + 1) : null;

      if ((kindRaw !== "organization" && kindRaw !== "person") || !ownerId) {
        return res.status(422).json({ message: "Only linked payees can set up a payout account." });
      }
      const ownerKind = kindRaw as "organization" | "person";

      const { getStripe } = await import("./stripe");
      const stripe = await getStripe();

      // Resolve (or create) the payout account row.
      let account = await db
        .select()
        .from(payoutAccounts)
        .where(and(eq(payoutAccounts.ownerKind, ownerKind), eq(payoutAccounts.ownerId, ownerId)))
        .then(([r]) => r ?? null);

      if (!account) {
        // Resolve a display name for the Stripe account.
        let email: string | undefined;
        if (ownerKind === "organization") {
          const [org] = await db
            .select({ email: organizations.email })
            .from(organizations)
            .where(eq(organizations.id, ownerId))
            .limit(1);
          email = (org as any)?.email ?? undefined;
        } else {
          const r = await db.execute<{ contact_email: string }>(
            sql`SELECT contact_email FROM people WHERE id = ${ownerId} LIMIT 1`,
          );
          const row = (r as any).rows?.[0];
          email = row?.contact_email ?? undefined;
        }

        const acct = await stripe.accounts.create({
          type: "express",
          country: "US",
          ...(email ? { email } : {}),
          capabilities: { transfers: { requested: true }, card_payments: { requested: true } },
          metadata: { gt_owner_kind: ownerKind, gt_owner_id: ownerId },
        });
        const requirementsDue = [
          ...(acct.requirements?.currently_due ?? []),
          ...(acct.requirements?.past_due ?? []),
        ];
        const [row] = await db
          .insert(payoutAccounts)
          .values({
            ownerKind,
            ownerId,
            stripeAccountId: acct.id,
            country: "US",
            email: email ?? null,
            payoutsEnabled: !!acct.payouts_enabled,
            chargesEnabled: !!acct.charges_enabled,
            detailsSubmitted: !!acct.details_submitted,
            requirementsDue: Array.from(new Set(requirementsDue)),
            disabledReason: acct.requirements?.disabled_reason ?? null,
            lastSyncedAt: new Date(),
          })
          .returning();
        account = row;
      }

      // Generate the short-lived onboarding link.
      const proto = (req.headers["x-forwarded-proto"] as string | undefined)?.split(",")[0] ?? req.protocol ?? "https";
      const host = req.headers["x-forwarded-host"] || req.headers.host || "";
      const origin = `${proto}://${host}`;
      const link = await stripe.accountLinks.create({
        account: account.stripeAccountId,
        refresh_url: `${origin}/publisher?payout=refresh`,
        return_url: `${origin}/publisher?payout=return`,
        type: "account_onboarding",
      });

      return res.json({ url: link.url });
    } catch (err: any) {
      console.error("[publisher-payout-onboard]", err);
      return res
        .status(502)
        .json({ message: `Stripe error: ${err?.message ?? "onboarding link failed"}` });
    }
  });

  // Publisher entity info + payout account status.
  app.get("/api/publisher/me", requirePublisher, async (req, res) => {
    try {
      const payeeKey = (req as any).publisherPayeeKey as string;
      const colonIdx = payeeKey.indexOf(":");
      const kindRaw = colonIdx >= 0 ? payeeKey.slice(0, colonIdx) : "";
      const ownerId = colonIdx >= 0 ? payeeKey.slice(colonIdx + 1) : null;

      let displayName = "Publisher";
      let ownerKind: "organization" | "person" | null = null;

      if (kindRaw === "organization" && ownerId) {
        ownerKind = "organization";
        const [org] = await db
          .select({ name: organizations.name })
          .from(organizations)
          .where(eq(organizations.id, ownerId))
          .limit(1);
        if (org) displayName = org.name;
      } else if (kindRaw === "person" && ownerId) {
        ownerKind = "person";
        const rows = await db.execute<{ name: string }>(
          sql`SELECT name FROM people WHERE id = ${ownerId} LIMIT 1`,
        );
        const row = (rows as any).rows?.[0];
        if (row) displayName = row.name;
      }

      let hasPayoutAccount = false;
      let payoutsEnabled = false;
      if (ownerId && ownerKind) {
        const [acct] = await db
          .select({ payoutsEnabled: payoutAccounts.payoutsEnabled })
          .from(payoutAccounts)
          .where(
            and(
              eq(payoutAccounts.ownerKind, ownerKind),
              eq(payoutAccounts.ownerId, ownerId),
            ),
          )
          .limit(1);
        if (acct) {
          hasPayoutAccount = true;
          payoutsEnabled = !!acct.payoutsEnabled;
        }
      }

      return res.json({
        payeeKey,
        displayName,
        ownerKind,
        ownerId,
        hasPayoutAccount,
        payoutsEnabled,
      });
    } catch (err) {
      console.error("[publisher-me]", err);
      return res.status(500).json({ message: "Failed to load publisher info" });
    }
  });

  // Cross-catalog payee statement — same data the admin endpoint returns but
  // hard-scoped to the logged-in publisher's own payeeKey. Other payees are
  // never accessible from this endpoint.
  app.get("/api/publisher/statement", requirePublisher, async (req, res) => {
    try {
      const payeeKey = (req as any).publisherPayeeKey as string;
      const rateMicros = await getMechanicalRateMicros();
      const albumIds = await albumIdsWithPublishingSplits();

      if (albumIds.length === 0) {
        return res.status(404).json({ message: "No publishing data found" });
      }

      const albumRows = await db
        .select({ id: albums.id, title: albums.title, artist: albums.artist, artwork: albums.artwork })
        .from(albums)
        .where(inArray(albums.id, albumIds));
      const metaById = new Map(albumRows.map((a) => [a.id, a]));

      const entries = await Promise.all(
        albumIds.map(async (albumId) => {
          const meta = metaById.get(albumId);
          const unitsPressed = await resolveUnitsPressed(albumId);
          return {
            albumId,
            unitsPressed,
            title: meta?.title ?? albumId,
            artist: meta?.artist ?? null,
            artwork: meta?.artwork ?? null,
          };
        }),
      );

      const statement = await computePayeeStatement(payeeKey, entries, rateMicros);
      if (!statement) {
        return res.status(404).json({ message: "No publishing credits found for your account" });
      }
      return res.json(statement);
    } catch (err) {
      console.error("[publisher-statement]", err);
      return res.status(500).json({ message: "Failed to load statement" });
    }
  });
}
