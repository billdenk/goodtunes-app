// Task #538 — Phone verification: start + verify endpoints + the
// `requirePhoneVerified` route helper that gates gifting, partner
// payout settings, and account recovery.
//
// Shape mirrors the admin email-OTP flow in routes.ts: one row per
// (userKind, userId) currently mid-verify, scrypt-hashed 6-digit code,
// 10-minute TTL, 60-second resend cooldown, 5-attempt cap. Rate-limited
// per-phone (5 starts / hour) and per-IP (10 starts / hour) so the
// endpoints can't be used as a free spammer or to enumerate numbers.
//
// Verify-once, reuse-everywhere: on success we stamp `phoneE164` +
// `phoneVerifiedAt` on the corresponding user row and the gating
// helpers never prompt again unless the user changes their number.
import type { Express, Request, Response } from "express";
import { and, eq, sql } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";
import { phoneOtpCodes, users, customerUsers } from "@shared/schema";
import { normalizeE164, maskPhone, sendSms, extractIp } from "./sms";

const TTL_MS = 10 * 60_000;
const RESEND_COOLDOWN_MS = 60_000;
const MAX_ATTEMPTS = 5;
const PHONE_HOURLY_CAP = 5;   // starts per number per hour
const IP_HOURLY_CAP = 10;     // starts per IP per hour
const HOUR_MS = 60 * 60_000;

// Per-process rate-limit windows. Good enough for one box; if we
// ever shard the API we'll replace this with a redis bucket. The
// process-local cap is intentionally tight (5/hour) so a brief restart
// doesn't reset enough headroom to enable abuse in practice.
const phoneWindows = new Map<string, number[]>();
const ipWindows = new Map<string, number[]>();

function bump(map: Map<string, number[]>, key: string, cap: number): { ok: true } | { ok: false; retryAfter: number } {
  const now = Date.now();
  const arr = (map.get(key) ?? []).filter((t) => now - t < HOUR_MS);
  if (arr.length >= cap) {
    const oldest = arr[0];
    return { ok: false, retryAfter: Math.ceil((HOUR_MS - (now - oldest)) / 1000) };
  }
  arr.push(now);
  map.set(key, arr);
  return { ok: true };
}

function gen6(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

async function hashAndVerifyHelpers() {
  // Reuse the same scrypt-based code hasher that powers admin email-OTP
  // so an attacker reading either table sees the same opaque format.
  const { hashCode, verifyCode } = await import("../commerce");
  return { hashCode, verifyCode };
}

// Pull the current auth principal. Phone verify is always called by an
// already-signed-in user (or, for the recovery path, by a server route
// that pre-authorised the user by email lookup and passes through the
// resolved userKind/userId via `req.session.recoveryPendingUserId`).
async function getPrincipal(req: Request): Promise<{ kind: "admin" | "customer"; userId: string } | null> {
  const auth = req.headers.authorization;
  if (auth?.startsWith("Bearer ")) {
    const a = await storage.getAuthBy(auth.slice(7));
    if (a) return { kind: a.kind, userId: a.userId };
  }
  if (req.session?.userId && req.session?.kind) {
    return { kind: req.session.kind, userId: req.session.userId };
  }
  return null;
}

async function getUserRowPhone(kind: "admin" | "customer", userId: string): Promise<{ phoneE164: string | null; phoneVerifiedAt: Date | null } | null> {
  if (kind === "admin") {
    const [u] = await db
      .select({ phoneE164: users.phoneE164, phoneVerifiedAt: users.phoneVerifiedAt })
      .from(users)
      .where(eq(users.id, userId));
    return u ?? null;
  }
  const [c] = await db
    .select({ phoneE164: customerUsers.phoneE164, phoneVerifiedAt: customerUsers.phoneVerifiedAt })
    .from(customerUsers)
    .where(eq(customerUsers.id, userId));
  return c ?? null;
}

async function stampVerified(kind: "admin" | "customer", userId: string, e164: string): Promise<void> {
  const now = new Date();
  if (kind === "admin") {
    await db.update(users).set({ phoneE164: e164, phoneVerifiedAt: now }).where(eq(users.id, userId));
  } else {
    await db.update(customerUsers).set({ phoneE164: e164, phoneVerifiedAt: now }).where(eq(customerUsers.id, userId));
  }
}

// Route helper: throw a 403 + structured body the client can detect to
// pop the verify sheet. Returns true when the user is gated (response
// already sent), false when verified. Callers use:
//
//   if (await requirePhoneVerified(req, res, "gifting")) return;
//
// `reason` lands in the response body so the sheet can render context-
// aware copy ("Verify your phone to send a gift", "…to manage payouts").
export async function requirePhoneVerified(req: Request, res: Response, reason: "gifting" | "payouts" | "recovery"): Promise<boolean> {
  const me = await getPrincipal(req);
  if (!me) {
    res.status(401).json({ message: "Sign in required" });
    return true;
  }
  const row = await getUserRowPhone(me.kind, me.userId);
  if (row?.phoneVerifiedAt && row.phoneE164) return false;
  res.status(403).json({
    message: "Phone verification required",
    requiresPhoneVerification: true,
    reason,
  });
  return true;
}

export function registerPhoneOtpRoutes(app: Express) {
  // ─── Start: send (or re-send) a 6-digit code ────────────────────────
  app.post("/api/auth/phone/start", async (req, res) => {
    const me = await getPrincipal(req);
    if (!me) return res.status(401).json({ message: "Sign in required" });

    const e164 = normalizeE164(String(req.body?.phone ?? ""));
    if (!e164) return res.status(400).json({ message: "That number doesn't look right. Use a 10-digit US number or +country format." });

    // Already verified with the same number? Short-circuit so the UI
    // can close the sheet — no need to burn another SMS.
    const cur = await getUserRowPhone(me.kind, me.userId);
    if (cur?.phoneVerifiedAt && cur.phoneE164 === e164) {
      return res.json({ ok: true, alreadyVerified: true, phoneMasked: maskPhone(e164) });
    }

    // Resend cooldown — protects against accidental double-tap and
    // against using us as a free spammer.
    const [existing] = await db
      .select()
      .from(phoneOtpCodes)
      .where(and(eq(phoneOtpCodes.userKind, me.kind), eq(phoneOtpCodes.userId, me.userId)));
    if (existing && existing.phoneE164 === e164) {
      const ageMs = Date.now() - existing.lastSentAt.getTime();
      if (ageMs < RESEND_COOLDOWN_MS) {
        const retryAfter = Math.ceil((RESEND_COOLDOWN_MS - ageMs) / 1000);
        return res.status(429).json({ message: `Wait ${retryAfter}s before requesting another code.`, retryAfter });
      }
    }

    // Per-IP + per-number caps. Phone is the strictest signal; IP is a
    // secondary guard for someone iterating numbers from one address.
    const ip = extractIp(req);
    const ipGate = bump(ipWindows, ip, IP_HOURLY_CAP);
    if (!ipGate.ok) return res.status(429).json({ message: "Too many verification attempts from this network. Try again later.", retryAfter: ipGate.retryAfter });
    const phoneGate = bump(phoneWindows, e164, PHONE_HOURLY_CAP);
    if (!phoneGate.ok) return res.status(429).json({ message: "Too many codes sent to that number. Try again later.", retryAfter: phoneGate.retryAfter });

    const { hashCode } = await hashAndVerifyHelpers();
    const code = gen6();
    const codeHash = await hashCode(code);
    const expiresAt = new Date(Date.now() + TTL_MS);

    // Upsert keyed by (userKind, userId) — the unique index guarantees
    // a single active row per user, mirroring admin_email_otp.
    await db
      .insert(phoneOtpCodes)
      .values({
        userKind: me.kind,
        userId: me.userId,
        phoneE164: e164,
        codeHash,
        expiresAt,
        attempts: 0,
        lastSentAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [phoneOtpCodes.userKind, phoneOtpCodes.userId],
        set: { phoneE164: e164, codeHash, expiresAt, attempts: 0, lastSentAt: new Date() },
      });

    console.log(`[phone-otp] code for ${me.kind}/${me.userId} -> ${maskPhone(e164)} (expires ${expiresAt.toISOString()})`);
    const send = await sendSms({ to: e164, body: `Your GoodTunes verification code is ${code}. It expires in 10 minutes.` });
    // In dev, also surface the code so an operator can verify without
    // a real handset — mirrors the email-OTP devCode behaviour.
    const devCode = process.env.NODE_ENV !== "production" ? code : undefined;
    return res.json({
      ok: true,
      phoneMasked: maskPhone(e164),
      provider: send.provider,
      ...(devCode ? { devCode } : {}),
    });
  });

  // ─── Verify: consume the code + stamp the user row ──────────────────
  app.post("/api/auth/phone/verify", async (req, res) => {
    const me = await getPrincipal(req);
    if (!me) return res.status(401).json({ message: "Sign in required" });

    const code = String(req.body?.code ?? "").trim();
    if (!/^\d{6}$/.test(code)) return res.status(400).json({ message: "Enter the 6-digit code." });

    const [row] = await db
      .select()
      .from(phoneOtpCodes)
      .where(and(eq(phoneOtpCodes.userKind, me.kind), eq(phoneOtpCodes.userId, me.userId)));
    if (!row) return res.status(400).json({ message: "No code on file. Request a new one." });

    if (row.expiresAt.getTime() < Date.now()) {
      await db.delete(phoneOtpCodes).where(eq(phoneOtpCodes.id, row.id));
      return res.status(400).json({ message: "That code has expired. Request a new one." });
    }
    if (row.attempts >= MAX_ATTEMPTS) {
      await db.delete(phoneOtpCodes).where(eq(phoneOtpCodes.id, row.id));
      return res.status(429).json({ message: "Too many wrong attempts. Request a new code." });
    }

    const { verifyCode } = await hashAndVerifyHelpers();
    const ok = await verifyCode(code, row.codeHash);
    if (!ok) {
      await db
        .update(phoneOtpCodes)
        .set({ attempts: sql`${phoneOtpCodes.attempts} + 1` })
        .where(eq(phoneOtpCodes.id, row.id));
      const remaining = MAX_ATTEMPTS - row.attempts - 1;
      return res.status(400).json({ message: remaining > 0 ? `Code didn't match. ${remaining} attempts left.` : "Code didn't match." });
    }

    // Atomic consume — race-safe across two concurrent verify requests.
    const consumed = await db
      .delete(phoneOtpCodes)
      .where(and(eq(phoneOtpCodes.id, row.id), eq(phoneOtpCodes.codeHash, row.codeHash)))
      .returning({ id: phoneOtpCodes.id });
    if (consumed.length === 0) return res.status(400).json({ message: "Code already used. Request a new one." });

    await stampVerified(me.kind, me.userId, row.phoneE164);
    return res.json({ ok: true, phoneE164: row.phoneE164, phoneMasked: maskPhone(row.phoneE164) });
  });

  // ─── Status probe ───────────────────────────────────────────────────
  // Lets the client open the verify sheet pre-warmed with the current
  // number (when set) and decide whether to render the "verified" state
  // up-front without a round-trip per gated action.
  app.get("/api/auth/phone/status", async (req, res) => {
    const me = await getPrincipal(req);
    if (!me) return res.status(401).json({ message: "Sign in required" });
    const row = await getUserRowPhone(me.kind, me.userId);
    if (!row) return res.status(404).json({ message: "User not found" });
    return res.json({
      verified: !!row.phoneVerifiedAt,
      phoneE164: row.phoneE164,
      phoneMasked: row.phoneE164 ? maskPhone(row.phoneE164) : null,
    });
  });
}
