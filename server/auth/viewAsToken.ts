// Production-safe "View as partner" token.
//
// A super-admin can mint a short-lived HMAC-SHA256 signed token that lets
// them open a new browser tab showing a partner's genuine restricted portal
// without modifying the session, affecting any other tab, or touching the
// database. The original god-view tab is completely unaffected.
//
// Token lifecycle:
//  1. POST /api/admin/view-as/mint → returns token + label
//  2. Client opens new tab at /<portal>#viewas=<token>&viewaslabel=<enc>
//  3. main.tsx picks up fragment, stores in sessionStorage, clears URL
//  4. queryClient.ts sends X-View-As-Token on every API request from that tab
//  5. activeMembershipContext verifies token + live super_admin check, sets
//     synthetic hat via ALS so all downstream role gates see partner scope
//  6. ViewAsPill shows a persistent "Viewing as …" header pill; exit (click or Esc) clears storage

import { createHmac, timingSafeEqual } from "crypto";
import { pool } from "../db";

const TOKEN_TTL_SECS = 8 * 60 * 60; // 8 hours

function getSecret(): string {
  return `viewas:${process.env.SESSION_SECRET ?? "goodtunes-dev-only-secret"}`;
}

export interface ViewAsPayload {
  sub: string;
  role: string;
  scopeKind: string | null;
  scopeId: string | null;
  label: string;
  iat: number;
  exp: number;
}

export function mintViewAsToken(
  payload: Omit<ViewAsPayload, "iat" | "exp">,
): string {
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + TOKEN_TTL_SECS;
  const full: ViewAsPayload = { ...payload, iat, exp };
  const data = Buffer.from(JSON.stringify(full)).toString("base64url");
  const sig = createHmac("sha256", getSecret()).update(data).digest("base64url");
  return `${data}.${sig}`;
}

// Verifies signature, expiry, and that the initiating user is still a
// super_admin in the DB. Returns null on any validation failure.
export async function verifyViewAsToken(
  token: string,
  callerUserId: string,
): Promise<ViewAsPayload | null> {
  try {
    const dot = token.lastIndexOf(".");
    if (dot < 0) return null;
    const data = token.slice(0, dot);
    const sig = token.slice(dot + 1);
    const expected = createHmac("sha256", getSecret())
      .update(data)
      .digest("base64url");
    // Constant-time comparison — pads if lengths differ
    const sigBuf = Buffer.from(sig);
    const expBuf = Buffer.from(expected);
    if (
      sigBuf.length !== expBuf.length ||
      !timingSafeEqual(sigBuf, expBuf)
    ) {
      return null;
    }
    const payload = JSON.parse(
      Buffer.from(data, "base64url").toString(),
    ) as ViewAsPayload;
    if (payload.exp * 1000 < Date.now()) return null;
    if (payload.sub !== callerUserId) return null;
    // Live super_admin check — ensures revoked admins can't keep using tokens
    const r = await pool.query<{ role: string }>(
      `SELECT role FROM users WHERE id = $1 LIMIT 1`,
      [callerUserId],
    );
    const row = r.rows[0];
    if (!row || row.role !== "super_admin") return null;
    return payload;
  } catch {
    return null;
  }
}

// Persist an audit row (best-effort; table is created on first use).
let auditTableReady = false;
export async function logViewAsAudit(
  initiatorId: string,
  role: string,
  scopeKind: string | null,
  scopeId: string | null,
  label: string,
): Promise<void> {
  try {
    if (!auditTableReady) {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS view_as_audit_log (
          id            BIGSERIAL PRIMARY KEY,
          initiated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          initiator_id  TEXT        NOT NULL,
          target_role   TEXT        NOT NULL,
          target_scope_kind TEXT,
          target_scope_id   TEXT,
          target_label  TEXT        NOT NULL
        )
      `);
      auditTableReady = true;
    }
    await pool.query(
      `INSERT INTO view_as_audit_log
         (initiator_id, target_role, target_scope_kind, target_scope_id, target_label)
       VALUES ($1, $2, $3, $4, $5)`,
      [initiatorId, role, scopeKind ?? null, scopeId ?? null, label],
    );
  } catch {
    // best-effort — never fail a mint because the log table is unavailable
  }
}
