// Task #400 — Welcome-back flow for imported gogoods.com fans.
//
// The gogoods.com importer (#398) backfilled ~2,939 customer_users rows
// with `legacyGogoodsId` stamped (the prior gogoods.com customer id) but
// no password and no OAuth identity. ~1,850 of those rows are also
// `emailVerifiedAt`-stamped (we trust the legacy email-verification
// record) — those are the fans we welcome back here. The remaining
// ~1,088 PENDING rows are excluded; they'd need to do a normal signup.
//
// User journey:
//   1. Admin clicks "Send wave-1 welcome mail" on /admin/welcome-back.
//      We batch-send a single email per eligible fan with a 30-day
//      single-use sign-in link.
//   2. Fan taps the link → GET /api/welcome-back/redeem/:token consumes
//      the token, mints a customer session, redirects to /welcome-back.
//   3. Fan completes the 3-screen onboarding (handle → name → library
//      reveal) which stamps `onboardedAt`. The flow never re-appears.
//
// Self-service entry: a fan who never got the wave-1 mail (or lost it)
// can also enter their email at /login → "Email me a sign-in link" and
// we mint a fresh token + send the same template. Both paths converge.
//
// Account merge: a fan who already created a fresh account before the
// importer ran can tap "These two accounts are me" on their profile.
// We email a confirmation token to the *other* address; clicking it
// triggers the merge (orders + user_albums + playlists move onto the
// surviving account, the losing row gets `mergedIntoId` set so it can
// never sign in again).

import type { Express, Request, Response } from "express";
import { createHash, randomBytes } from "crypto";
import { eq, and, isNull, isNotNull, sql, desc, inArray } from "drizzle-orm";
import { db } from "./db";
import { storage } from "./storage";
import {
  customerUsers,
  welcomeBackTokens,
  welcomeBackEmailSends,
  customerMerges,
  userAlbums,
  orders,
  playlists,
  authTokens,
} from "@shared/schema";
import { sendWelcomeBackEmail } from "./mail";
import { originForKind } from "./auth/host";

// ─── helpers ──────────────────────────────────────────────────────

const WELCOME_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const MERGE_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;        // 24 hours
// Per task spec: 3–30 chars, lowercase letters/digits + `.` `_` `-`.
const USERNAME_RE = /^[a-z0-9._-]{3,30}$/;

function generateRawToken(): string {
  return randomBytes(32).toString("hex");
}
function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

function customerOriginFromReq(req: Request): string {
  // In production the welcome-back link MUST resolve to the canonical
  // customer host (`my.goodtunes.music`) regardless of the host the
  // request came in on. Admin-triggered sends originate from the admin
  // host (`admin.goodtunes.music`); without this hard-pin those links
  // would land on the admin host where customer sessions don't exist
  // and the one-tap sign-in would 401. In dev / preview we fall back
  // to the request host so the dev-link logs are clickable.
  if (process.env.NODE_ENV === "production") {
    return originForKind("customer", req);
  }
  const proto = (req.headers["x-forwarded-proto"] as string) || req.protocol || "https";
  const host = (req.headers["x-forwarded-host"] as string) || req.get("host") || "my.goodtunes.music";
  return `${proto}://${host}`;
}

// Constant-floor latency so a "this email is an imported fan" reply
// can't be timed apart from a "this email is unknown" reply.
async function pad(startMs: number, floorMs = 120): Promise<void> {
  const elapsed = Date.now() - startMs;
  if (elapsed < floorMs) await new Promise((r) => setTimeout(r, floorMs - elapsed));
}

// True when a customer row is eligible for the welcome-back flow:
// - has a legacy gogoods id (importer-stamped)
// - email has been verified (we exclude the ~1,088 PENDING rows)
// - has never been soft-deleted via merge
// - has not already onboarded (avoid resending the link once they're in)
function isEligible(c: { legacyGogoodsId: string | null; emailVerifiedAt: Date | null; onboardedAt: Date | null; mergedIntoId: string | null }): boolean {
  return !!c.legacyGogoodsId && !!c.emailVerifiedAt && !c.onboardedAt && !c.mergedIntoId;
}

// ─── server registration ─────────────────────────────────────────

export function registerWelcomeBackRoutes(
  app: Express,
  helpers: {
    requireAuth: (req: Request, res: Response, next: Function) => any;
    requireAdmin: (req: Request, res: Response, next: Function) => any;
    generateAuthToken: () => string;
  },
): void {
  const { requireAuth, requireAdmin, generateAuthToken } = helpers;

  // ─── public: start (request a sign-in link) ─────────────────────

  // Self-service entry for an imported fan who already knows their old
  // email but never received (or lost) the wave-1 campaign mail. Always
  // returns 200 with the same shape — never enumerates whether the
  // address is an imported fan or not.
  app.post("/api/welcome-back/start", async (req, res) => {
    const started = Date.now();
    const raw = String(req.body?.email ?? "").trim().toLowerCase();
    const valid = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(raw);
    if (valid) {
      const customer = await storage.getCustomerByEmail(raw);
      if (customer && isEligible(customer as any)) {
        const token = await mintWelcomeBackToken(customer.id);
        const origin = customerOriginFromReq(req);
        const signInUrl = `${origin}/api/welcome-back/redeem/${token}`;
        const r = await sendWelcomeBackEmail(raw, customer.displayName ?? null, signInUrl);
        await db.insert(welcomeBackEmailSends).values({
          customerId: customer.id,
          email: raw,
          status: r.ok ? "sent" : "failed",
          reason: r.ok ? null : r.reason,
        });
        if (r.ok) {
          await storage.updateCustomer(customer.id, { welcomeEmailSentAt: new Date() });
        }
        if (process.env.NODE_ENV !== "production") {
          console.log(`[welcome-back] dev-link for ${raw}: ${signInUrl}`);
        }
      }
    }
    await pad(started);
    // Non-enumerating response: identical shape regardless of whether
    // the address matched an eligible imported fan. The UI shows a
    // neutral "If your gogoods email is on file, we just sent you a
    // sign-in link" toast either way.
    return res.json({ ok: true });
  });

  // ─── public: redeem (one-tap sign-in from the email link) ──────

  // Email recipients land here as a top-level navigation. We consume
  // the token, mint a customer session, and bounce into the SPA with
  // the bearer token in the URL fragment (matches the OAuth flow at
  // routes.ts:891 so the existing login-page handler picks it up).
  app.get("/api/welcome-back/redeem/:token", async (req, res) => {
    const raw = String(req.params.token || "");
    const tokenHash = hashToken(raw);
    const [row] = await db
      .select()
      .from(welcomeBackTokens)
      .where(eq(welcomeBackTokens.tokenHash, tokenHash))
      .limit(1);
    const origin = customerOriginFromReq(req);
    const failUrl = `${origin}/login?welcomeback=expired`;
    if (!row) return res.redirect(failUrl);
    if (row.consumedAt) return res.redirect(`${origin}/login?welcomeback=used`);
    if (row.expiresAt.getTime() < Date.now()) return res.redirect(failUrl);

    // Atomic mark-consumed (concurrent-safe — a second click sees the
    // already-set consumedAt and falls through to the "used" branch).
    const consumeRes = await db
      .update(welcomeBackTokens)
      .set({ consumedAt: new Date() })
      .where(and(eq(welcomeBackTokens.id, row.id), isNull(welcomeBackTokens.consumedAt)))
      .returning({ id: welcomeBackTokens.id });
    if (consumeRes.length === 0) return res.redirect(`${origin}/login?welcomeback=used`);

    const customer = await storage.getCustomer(row.customerId);
    if (!customer || customer.mergedIntoId) return res.redirect(failUrl);

    // The link itself acts as a proof-of-email-control event. Stamp
    // emailVerifiedAt if (for some reason) the importer didn't already.
    if (!customer.emailVerifiedAt) {
      await storage.updateCustomer(customer.id, { emailVerifiedAt: new Date() });
    }

    const sessionToken = generateAuthToken();
    await storage.createAuthToken(sessionToken, customer.id, "customer");
    (req.session as any).userId = customer.id;
    (req.session as any).kind = "customer";

    // Already onboarded? Skip the 3-screen tour and drop straight into
    // their library. Otherwise land on /welcome-back which runs the
    // onboarding sequence.
    const dest = customer.onboardedAt ? "/account" : "/welcome-back";
    return res.redirect(`${dest}#token=${encodeURIComponent(sessionToken)}`);
  });

  // ─── authed: gate the /welcome-back page on actual eligibility ──

  // Returns true only for a legacy-imported customer that hasn't yet
  // completed the onboarding tour. The client uses this to decide
  // whether to render the 3-screen flow or bounce to /account.
  app.get("/api/me/welcome-back/state", requireAuth, async (req, res) => {
    if ((req.session as any).kind !== "customer") return res.json({ needsOnboarding: false });
    const c = await storage.getCustomer((req.session as any).userId);
    if (!c) return res.status(404).json({ message: "Not found" });
    const isLegacy = !!c.legacyGogoodsId;
    const needsOnboarding = isLegacy && !c.onboardedAt && !c.mergedIntoId;

    // Library stats + the actual records power the third screen's
    // "look what's already in your account" reveal. Inexpensive — two
    // aggregates and one bounded album-join (top 6 most recent).
    let libraryStats: { albums: number; orders: number } | null = null;
    let recentItems: Array<{ id: string; albumId: string; title: string; artist: string; artwork: string; certificateNumber: number | null; acquiredAt: string | null }> = [];
    if (needsOnboarding) {
      const [albumRow] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(userAlbums)
        .where(eq(userAlbums.userId, c.id));
      const [orderRow] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(orders)
        .where(eq(orders.customerId, c.id));
      libraryStats = {
        albums: albumRow?.n ?? 0,
        orders: orderRow?.n ?? 0,
      };

      // Top 6 most-recently-acquired owned albums for the carousel.
      // Empty list is a valid state and the client falls back to a
      // "what's new on GoodTunes" copy block.
      const { albums } = await import("@shared/schema");
      const rows = await db
        .select({
          id: userAlbums.id,
          albumId: userAlbums.albumId,
          title: albums.title,
          artist: albums.artist,
          artwork: albums.artwork,
          certificateNumber: userAlbums.certificateNumber,
          acquiredAt: userAlbums.acquiredAt,
        })
        .from(userAlbums)
        .innerJoin(albums, eq(userAlbums.albumId, albums.id))
        .where(eq(userAlbums.userId, c.id))
        .orderBy(desc(userAlbums.acquiredAt))
        .limit(6);
      recentItems = rows.map((r) => ({
        id: r.id,
        albumId: r.albumId,
        title: r.title,
        artist: r.artist,
        artwork: r.artwork,
        certificateNumber: r.certificateNumber,
        acquiredAt: r.acquiredAt ? new Date(r.acquiredAt).toISOString() : null,
      }));
    }

    return res.json({
      needsOnboarding,
      isLegacy,
      customer: {
        id: c.id,
        email: c.email,
        username: c.username,
        displayName: c.displayName,
        realName: c.realName,
      },
      libraryStats,
      recentItems,
    });
  });

  // ─── authed: username availability check (live) ────────────────

  app.get("/api/me/welcome-back/username-available", requireAuth, async (req, res) => {
    const u = String(req.query.u ?? "").trim().toLowerCase();
    if (!USERNAME_RE.test(u)) {
      return res.json({ available: false, reason: "format" });
    }
    const existing = await storage.getCustomerByUsername(u);
    const myId = (req.session as any).userId as string;
    const taken = !!existing && existing.id !== myId;
    return res.json({ available: !taken, reason: taken ? "taken" : null });
  });

  // ─── authed: finalize onboarding ───────────────────────────────

  app.post("/api/me/welcome-back/onboarding", requireAuth, async (req, res) => {
    if ((req.session as any).kind !== "customer") return res.status(403).json({ message: "Customer only" });
    const myId = (req.session as any).userId as string;
    const c = await storage.getCustomer(myId);
    if (!c) return res.status(404).json({ message: "Not found" });
    if (c.onboardedAt) return res.json({ ok: true, customer: c }); // idempotent

    const usernameRaw = String(req.body?.username ?? "").trim().toLowerCase().replace(/^@/, "");
    const displayName = String(req.body?.displayName ?? "").trim();
    const realName = req.body?.realName ? String(req.body.realName).trim() : null;
    if (!USERNAME_RE.test(usernameRaw)) return res.status(400).json({ message: "Pick a handle 3–30 chars (a–z, 0–9, dot, underscore, hyphen)" });
    if (!displayName) return res.status(400).json({ message: "Display name is required" });

    const taken = await storage.getCustomerByUsername(usernameRaw);
    if (taken && taken.id !== myId) return res.status(409).json({ message: "That handle is taken" });

    const updated = await storage.updateCustomer(myId, {
      username: usernameRaw,
      displayName,
      realName: realName || null,
      onboardedAt: new Date(),
    });
    return res.json({ ok: true, customer: updated });
  });

  // ─── authed: account merge ─────────────────────────────────────

  // Step 1 — fan enters the *other* email on their profile and asks us
  // to confirm they own it. We mint a single-use token and email the
  // other address; the fan clicks the link from that inbox to prove
  // control. We don't enumerate ("we sent a link if it exists").
  app.post("/api/me/welcome-back/merge/start", requireAuth, async (req, res) => {
    const started = Date.now();
    if ((req.session as any).kind !== "customer") return res.status(403).json({ message: "Customer only" });
    const myId = (req.session as any).userId as string;
    // Accept either `otherEmail` (the semantic name used by the client
    // "These two accounts are me" panel) or `email` (back-compat).
    const otherEmail = String(req.body?.otherEmail ?? req.body?.email ?? "").trim().toLowerCase();
    const valid = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(otherEmail);
    if (valid) {
      const me = await storage.getCustomer(myId);
      const other = await storage.getCustomerByEmail(otherEmail);
      if (me && other && other.id !== me.id && !other.mergedIntoId && !me.mergedIntoId) {
        const raw = generateRawToken();
        const hash = hashToken(raw);
        // We re-use the welcome_back_tokens table — same shape, same
        // single-use semantics — but key the consume action via the
        // merge endpoint below (the token is bound to the *losing*
        // customer's id, but the consumer must be authed as the
        // surviving customer for the merge to actually happen).
        await db.insert(welcomeBackTokens).values({
          customerId: other.id,
          tokenHash: hash,
          expiresAt: new Date(Date.now() + MERGE_TOKEN_TTL_MS),
        });
        const origin = customerOriginFromReq(req);
        const linkUrl = `${origin}/account/merge?token=${encodeURIComponent(raw)}&surviving=${encodeURIComponent(me.id)}`;
        const r = await sendWelcomeBackEmail(otherEmail, other.displayName ?? null, linkUrl);
        await db.insert(welcomeBackEmailSends).values({
          customerId: other.id,
          email: otherEmail,
          status: r.ok ? "sent" : "failed",
          reason: r.ok ? null : r.reason,
        });
        if (process.env.NODE_ENV !== "production") {
          console.log(`[welcome-back-merge] dev-link for ${otherEmail}: ${linkUrl}`);
        }
      }
    }
    await pad(started);
    return res.json({ ok: true });
  });

  // Step 1.5 — preview. Returns the move counts + the losing email
  // *without* applying any changes, so the fan can see "here's what
  // we'd move: 3 albums, 2 orders, 1 playlist" before tapping Confirm.
  // Pure read — does NOT consume the token, so a fan can refresh or
  // back out without burning their link.
  app.get("/api/me/welcome-back/merge/preview", requireAuth, async (req, res) => {
    if ((req.session as any).kind !== "customer") return res.status(403).json({ message: "Customer only" });
    const myId = (req.session as any).userId as string;
    const raw = String(req.query.token ?? "");
    if (!raw) return res.status(400).json({ message: "Missing token" });

    const tokenHash = hashToken(raw);
    const [row] = await db
      .select()
      .from(welcomeBackTokens)
      .where(eq(welcomeBackTokens.tokenHash, tokenHash))
      .limit(1);
    if (!row) return res.status(400).json({ message: "Link expired" });
    if (row.expiresAt.getTime() < Date.now()) return res.status(400).json({ message: "Link expired" });
    if (row.customerId === myId) return res.status(400).json({ message: "Pick a different email" });

    const losing = await storage.getCustomer(row.customerId);
    const surviving = await storage.getCustomer(myId);
    if (!losing || !surviving) return res.status(404).json({ message: "Account not found" });

    // Idempotency: if the token was already consumed AND we have a
    // matching audit row, surface the prior counts as `alreadyMerged`
    // so the UI can show a success state instead of an error.
    if (row.consumedAt || losing.mergedIntoId) {
      if (losing.mergedIntoId === surviving.id) {
        const [prior] = await db
          .select()
          .from(customerMerges)
          .where(and(eq(customerMerges.survivingId, surviving.id), eq(customerMerges.losingId, losing.id)))
          .orderBy(desc(customerMerges.createdAt))
          .limit(1);
        if (prior) {
          return res.json({
            alreadyMerged: true,
            losingEmail: losing.email,
            counts: {
              albums: prior.movedAlbumCount,
              orders: prior.movedOrderCount,
              playlists: prior.movedPlaylistCount,
            },
          });
        }
      }
      return res.status(400).json({ message: "Link already used" });
    }

    // Mirror the merge planner: collisions on user_albums UNIQUE(user, album)
    // are skipped, so the preview must skip them too — otherwise we'd
    // promise to move N albums and only move N-K.
    const survivingAlbums = await db
      .select({ albumId: userAlbums.albumId })
      .from(userAlbums)
      .where(eq(userAlbums.userId, surviving.id));
    const survivingAlbumIds = new Set(survivingAlbums.map((r) => r.albumId));
    const losingAlbumsRows = await db
      .select({ albumId: userAlbums.albumId })
      .from(userAlbums)
      .where(eq(userAlbums.userId, losing.id));
    const albumsToMove = losingAlbumsRows.filter((r) => !survivingAlbumIds.has(r.albumId)).length;

    const [orderRow] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(orders)
      .where(eq(orders.customerId, losing.id));
    const [playlistRow] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(playlists)
      .where(eq(playlists.userId, losing.id));

    return res.json({
      alreadyMerged: false,
      losingEmail: losing.email,
      counts: {
        albums: albumsToMove,
        orders: orderRow?.n ?? 0,
        playlists: playlistRow?.n ?? 0,
      },
    });
  });

  // Cancel — fan tapped "Cancel" on the preview. We mark the token
  // consumed so the link is one-shot and can't be re-used (which would
  // also defang a stolen link the fan didn't want to honor). Always
  // returns 200 so a stale tab can dismiss without erroring.
  app.post("/api/me/welcome-back/merge/cancel", requireAuth, async (req, res) => {
    if ((req.session as any).kind !== "customer") return res.status(403).json({ message: "Customer only" });
    const raw = String(req.body?.token ?? "");
    if (!raw) return res.json({ ok: true });
    const tokenHash = hashToken(raw);
    await db
      .update(welcomeBackTokens)
      .set({ consumedAt: new Date() })
      .where(and(eq(welcomeBackTokens.tokenHash, tokenHash), isNull(welcomeBackTokens.consumedAt)));
    return res.json({ ok: true });
  });

  // Step 2 — fan returns to the SPA signed in as the *surviving*
  // account, clicks the link from the other inbox, the SPA POSTs the
  // token + surviving id to confirm. We:
  //   - reparent user_albums, orders, playlists from losing → surviving
  //   - stamp customer_users.merged_into_id on the losing row
  //   - record a customer_merges audit row
  // Loose FK on user_albums.user_id (per MEMORY) — write the fan id,
  // never join through users.
  app.post("/api/me/welcome-back/merge/confirm", requireAuth, async (req, res) => {
    if ((req.session as any).kind !== "customer") return res.status(403).json({ message: "Customer only" });
    const myId = (req.session as any).userId as string;
    const raw = String(req.body?.token ?? "");
    const survivingId = String(req.body?.surviving ?? "");
    if (!raw || survivingId !== myId) return res.status(400).json({ message: "Bad merge request" });

    const tokenHash = hashToken(raw);
    const [row] = await db
      .select()
      .from(welcomeBackTokens)
      .where(eq(welcomeBackTokens.tokenHash, tokenHash))
      .limit(1);
    if (!row) return res.status(400).json({ message: "Link expired" });
    if (row.expiresAt.getTime() < Date.now()) return res.status(400).json({ message: "Link expired" });
    if (row.customerId === myId) return res.status(400).json({ message: "Pick a different email" });

    const losing = await storage.getCustomer(row.customerId);
    const surviving = await storage.getCustomer(myId);
    if (!losing || !surviving) return res.status(404).json({ message: "Account not found" });

    // Idempotency: if this exact merge already happened (losing.mergedIntoId
    // points at the surviving account), return the prior counts from the
    // audit row instead of erroring. Covers double-tap, browser back/refresh,
    // and a Cancel-then-Confirm tap before the SPA caught up.
    if (losing.mergedIntoId === surviving.id) {
      const [prior] = await db
        .select()
        .from(customerMerges)
        .where(and(eq(customerMerges.survivingId, surviving.id), eq(customerMerges.losingId, losing.id)))
        .orderBy(desc(customerMerges.createdAt))
        .limit(1);
      if (prior) {
        return res.json({
          ok: true,
          moved: {
            albums: prior.movedAlbumCount,
            orders: prior.movedOrderCount,
            playlists: prior.movedPlaylistCount,
          },
        });
      }
    }

    if (row.consumedAt) return res.status(400).json({ message: "Link already used" });
    if (losing.mergedIntoId || surviving.mergedIntoId) return res.status(400).json({ message: "Already merged" });

    // Atomic consume so two parallel clicks can't double-merge.
    const consumed = await db
      .update(welcomeBackTokens)
      .set({ consumedAt: new Date() })
      .where(and(eq(welcomeBackTokens.id, row.id), isNull(welcomeBackTokens.consumedAt)))
      .returning({ id: welcomeBackTokens.id });
    if (consumed.length === 0) return res.status(400).json({ message: "Link already used" });

    // Move owned content. Wrapped in a transaction so a uniqueness
    // collision on user_albums can't leave us half-merged.
    const moved = await db.transaction(async (tx) => {
      // user_albums has a UNIQUE(user_id, album_id) — if the surviving
      // account already owns the same album, we can't reparent the
      // losing row (would violate the index). Skip those collisions:
      // surviving keeps the album, losing row stays put and will be
      // dropped together with the soft-deleted losing customer.
      // (Acquired-at on the surviving row is preserved, which is the
      // semantically right answer — fan's earliest acquisition wins.)
      const survivingAlbums = await tx
        .select({ albumId: userAlbums.albumId })
        .from(userAlbums)
        .where(eq(userAlbums.userId, surviving.id));
      const survivingAlbumIds = new Set(survivingAlbums.map((r) => r.albumId));
      const losingAlbums = await tx
        .select({ id: userAlbums.id, albumId: userAlbums.albumId })
        .from(userAlbums)
        .where(eq(userAlbums.userId, losing.id));
      const reparentAlbumIds = losingAlbums
        .filter((r) => !survivingAlbumIds.has(r.albumId))
        .map((r) => r.id);
      const movedAlbums = reparentAlbumIds.length === 0
        ? []
        : await tx
            .update(userAlbums)
            .set({ userId: surviving.id })
            .where(inArray(userAlbums.id, reparentAlbumIds))
            .returning({ id: userAlbums.id });

      const movedOrders = await tx
        .update(orders)
        .set({ customerId: surviving.id })
        .where(eq(orders.customerId, losing.id))
        .returning({ id: orders.id });
      const movedPlaylists = await tx
        .update(playlists)
        .set({ userId: surviving.id })
        .where(eq(playlists.userId, losing.id))
        .returning({ id: playlists.id });

      // Soft-delete the losing row. The mergedIntoId pointer is what
      // requireAuth/requireCustomer consult to refuse a sign-in even if
      // a stale session cookie or bearer token is still floating around.
      await tx
        .update(customerUsers)
        .set({ mergedIntoId: surviving.id })
        .where(eq(customerUsers.id, losing.id));

      // Revoke every outstanding bearer token on the losing account.
      await tx.delete(authTokens).where(eq(authTokens.customerUserId, losing.id));

      await tx.insert(customerMerges).values({
        survivingId: surviving.id,
        losingId: losing.id,
        losingEmail: losing.email,
        movedOrderCount: movedOrders.length,
        movedAlbumCount: movedAlbums.length,
        movedPlaylistCount: movedPlaylists.length,
        movedOrderIds: movedOrders.map((r) => r.id),
        movedAlbumIds: movedAlbums.map((r) => r.id),
        movedPlaylistIds: movedPlaylists.map((r) => r.id),
        triggeredBy: "customer",
      });

      return {
        albums: movedAlbums.length,
        orders: movedOrders.length,
        playlists: movedPlaylists.length,
      };
    });

    return res.json({ ok: true, moved });
  });

  // ─── admin: audience + send + status ───────────────────────────

  // Returns the campaign's audience snapshot: total imported, eligible
  // (verified + un-onboarded + un-mailed), already mailed, opened-in
  // (onboardedAt set). Powers the "Send wave-1" dashboard.
  app.get("/api/admin/welcome-back/status", requireAdmin, async (_req, res) => {
    const [totals] = await db
      .select({
        imported: sql<number>`count(*) FILTER (WHERE legacy_gogoods_id IS NOT NULL)::int`,
        eligible: sql<number>`count(*) FILTER (WHERE legacy_gogoods_id IS NOT NULL AND email_verified_at IS NOT NULL AND onboarded_at IS NULL AND merged_into_id IS NULL AND welcome_email_sent_at IS NULL)::int`,
        alreadyMailed: sql<number>`count(*) FILTER (WHERE legacy_gogoods_id IS NOT NULL AND welcome_email_sent_at IS NOT NULL)::int`,
        onboarded: sql<number>`count(*) FILTER (WHERE legacy_gogoods_id IS NOT NULL AND onboarded_at IS NOT NULL)::int`,
        merged: sql<number>`count(*) FILTER (WHERE legacy_gogoods_id IS NOT NULL AND merged_into_id IS NOT NULL)::int`,
      })
      .from(customerUsers);
    const [{ sends, failures }] = await db
      .select({
        sends: sql<number>`count(*) FILTER (WHERE status = 'sent')::int`,
        failures: sql<number>`count(*) FILTER (WHERE status <> 'sent')::int`,
      })
      .from(welcomeBackEmailSends);
    const killSwitch = String(process.env.WELCOME_BACK_KILL_SWITCH ?? "").toLowerCase() === "on";
    return res.json({ ...totals, sendsLogged: sends, sendFailures: failures, killSwitch });
  });

  // POST body: { dryRun?: boolean, limit?: number }
  // Always batches in groups of 25 with a 1-second sleep between batches
  // so Resend's per-second cap and our outbound bandwidth never spike.
  // `dryRun: true` returns the audience without sending.
  app.post("/api/admin/welcome-back/send", requireAdmin, async (req, res) => {
    if (String(process.env.WELCOME_BACK_KILL_SWITCH ?? "").toLowerCase() === "on") {
      return res.status(409).json({ message: "Kill switch (WELCOME_BACK_KILL_SWITCH=on) is active. Unset it to send." });
    }
    const dryRun = !!req.body?.dryRun;
    const limit = Math.min(Math.max(Number(req.body?.limit ?? 2000), 1), 2000);

    const audience = await db
      .select({
        id: customerUsers.id,
        email: customerUsers.email,
        displayName: customerUsers.displayName,
      })
      .from(customerUsers)
      .where(and(
        isNotNull(customerUsers.legacyGogoodsId),
        isNotNull(customerUsers.emailVerifiedAt),
        isNull(customerUsers.onboardedAt),
        isNull(customerUsers.mergedIntoId),
        isNull(customerUsers.welcomeEmailSentAt),
      ))
      .limit(limit);

    if (dryRun) {
      return res.json({ dryRun: true, audienceSize: audience.length, sample: audience.slice(0, 5).map((a) => a.email) });
    }

    const origin = customerOriginFromReq(req);
    const BATCH = 25;
    let sent = 0;
    let failed = 0;
    for (let i = 0; i < audience.length; i += BATCH) {
      const slice = audience.slice(i, i + BATCH);
      for (const a of slice) {
        const raw = await mintWelcomeBackToken(a.id);
        const url = `${origin}/api/welcome-back/redeem/${raw}`;
        const r = await sendWelcomeBackEmail(a.email, a.displayName ?? null, url);
        await db.insert(welcomeBackEmailSends).values({
          customerId: a.id,
          email: a.email,
          status: r.ok ? "sent" : "failed",
          reason: r.ok ? null : r.reason,
        });
        if (r.ok) {
          await storage.updateCustomer(a.id, { welcomeEmailSentAt: new Date() });
          sent += 1;
        } else {
          failed += 1;
        }
      }
      if (i + BATCH < audience.length) {
        await new Promise((rs) => setTimeout(rs, 1000));
      }
    }
    return res.json({ audienceSize: audience.length, sent, failed });
  });

  // Admin undo: reparent the moved rows back to the losing customer,
  // clear `mergedIntoId` on the losing row so it can sign in again, and
  // stamp a reversal row in `customer_merges` so the audit isn't lost.
  // Idempotent guard: refuses if the merge has already been reversed.
  // Whole operation is wrapped in a transaction so a partial reparent
  // can never leave one of (albums, orders, playlists) on the wrong
  // side.
  app.post("/api/admin/customers/:survivingId/merges/:mergeId/undo", requireAdmin, async (req, res) => {
    const { survivingId, mergeId } = req.params;
    const [merge] = await db
      .select()
      .from(customerMerges)
      .where(and(eq(customerMerges.id, mergeId), eq(customerMerges.survivingId, survivingId)))
      .limit(1);
    if (!merge) return res.status(404).json({ message: "Merge not found" });
    if (merge.triggeredBy === "admin-undo") {
      return res.status(409).json({ message: "This merge has already been reversed" });
    }
    // Has it already been undone? (a reversal row points the other way)
    const [existingReversal] = await db
      .select({ id: customerMerges.id })
      .from(customerMerges)
      .where(and(
        eq(customerMerges.triggeredBy, "admin-undo"),
        eq(customerMerges.survivingId, merge.losingId),
        eq(customerMerges.losingId, merge.survivingId),
      ))
      .limit(1);
    if (existingReversal) {
      return res.status(409).json({ message: "This merge has already been reversed" });
    }
    const losing = await storage.getCustomer(merge.losingId);
    if (!losing) return res.status(404).json({ message: "Losing customer no longer exists" });
    if (losing.mergedIntoId !== survivingId) {
      return res.status(409).json({ message: "Losing row is not currently merged into this account" });
    }

    const result = await db.transaction(async (tx) => {
      // Reverse precisely the rows the original confirm moved. We
      // stored their ids on the audit row so undo never sweeps in
      // legitimate pre-existing surviving-account data. Guard each
      // update with "still on surviving" so a row that's since been
      // moved a second time isn't yanked back unexpectedly.
      const movedAlbums = merge.movedAlbumIds.length === 0
        ? []
        : await tx
            .update(userAlbums)
            .set({ userId: merge.losingId })
            .where(and(
              inArray(userAlbums.id, merge.movedAlbumIds),
              eq(userAlbums.userId, survivingId),
            ))
            .returning({ id: userAlbums.id });
      const movedOrders = merge.movedOrderIds.length === 0
        ? []
        : await tx
            .update(orders)
            .set({ customerId: merge.losingId })
            .where(and(
              inArray(orders.id, merge.movedOrderIds),
              eq(orders.customerId, survivingId),
            ))
            .returning({ id: orders.id });
      const movedPlaylists = merge.movedPlaylistIds.length === 0
        ? []
        : await tx
            .update(playlists)
            .set({ userId: merge.losingId })
            .where(and(
              inArray(playlists.id, merge.movedPlaylistIds),
              eq(playlists.userId, survivingId),
            ))
            .returning({ id: playlists.id });

      await tx
        .update(customerUsers)
        .set({ mergedIntoId: null })
        .where(eq(customerUsers.id, merge.losingId));

      const [reversal] = await tx
        .insert(customerMerges)
        .values({
          // Reversal row: survivingId/losingId swapped so the audit
          // reads as "the losing account absorbed the surviving one
          // back" — except triggeredBy=admin-undo flags it as a revert
          // rather than a normal merge.
          survivingId: merge.losingId,
          losingId: merge.survivingId,
          losingEmail: losing.email,
          movedAlbumCount: movedAlbums.length,
          movedOrderCount: movedOrders.length,
          movedPlaylistCount: movedPlaylists.length,
          triggeredBy: "admin-undo",
        })
        .returning({ id: customerMerges.id });
      return { movedAlbums: movedAlbums.length, movedOrders: movedOrders.length, movedPlaylists: movedPlaylists.length, reversalId: reversal.id };
    });

    return res.json({ ok: true, ...result });
  });

  // Audit: list every merge the surviving customer was part of, so the
  // admin can see what moved (and from where) on the customer detail
  // page. Read-only.
  app.get("/api/admin/customers/:id/merges", requireAdmin, async (req, res) => {
    const rows = await db
      .select({
        id: customerMerges.id,
        losingId: customerMerges.losingId,
        losingEmail: customerMerges.losingEmail,
        losingLegacyGogoodsId: customerUsers.legacyGogoodsId,
        movedOrders: customerMerges.movedOrderCount,
        movedAlbums: customerMerges.movedAlbumCount,
        movedPlaylists: customerMerges.movedPlaylistCount,
        mergedAt: customerMerges.createdAt,
      })
      .from(customerMerges)
      .leftJoin(customerUsers, eq(customerMerges.losingId, customerUsers.id))
      .where(eq(customerMerges.survivingId, req.params.id))
      .orderBy(desc(customerMerges.createdAt));
    return res.json({ merges: rows });
  });
}

// ─── token-minting helper (also used by admin /send) ────────────

async function mintWelcomeBackToken(customerId: string): Promise<string> {
  const raw = generateRawToken();
  const hash = hashToken(raw);
  await db.insert(welcomeBackTokens).values({
    customerId,
    tokenHash: hash,
    expiresAt: new Date(Date.now() + WELCOME_TOKEN_TTL_MS),
  });
  return raw;
}
