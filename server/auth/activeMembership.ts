// Task #1038 — Unified identity P3: active-membership (hat) context.
//
// A multi-membership account can "switch hats" from the admin shell. The
// chosen hat is stored on the session (req.session.activeMembershipKey)
// and carried into AsyncLocalStorage for the lifetime of each request so
// the role resolver (server/auth/roles.ts getUserMemberships) can narrow
// the account's membership SET down to that ONE hat. Everything that
// flows through getUserRole / findMembershipForScope / getPartnerScope —
// the sidebar, album list, reports, and every edit gate — then scopes to
// the active hat automatically.
//
// Single-membership accounts are never affected: there is only one hat to
// resolve, so the filter is a no-op and behavior is byte-for-byte legacy.
//
// Dev-only impersonation: a super-admin can assume a synthetic hat for an
// arbitrary role+scope (stored as devImpersonationHat on the session) so
// the dev-login persona dropdown shows the genuine restricted partner shell
// without creating real membership rows. This path is completely inert in
// production — the endpoints that write devImpersonationHat 404 there.
//
// Production view-as: a super-admin can mint a short-lived HMAC token that
// lets a NEW browser tab show any partner's genuine restricted portal.
// The X-View-As-Token header is sent by the new tab on every request;
// this middleware validates the token and injects a synthetic hat so all
// downstream role gates see the partner scope. The original god-view tab
// is completely unaffected (it never sends the header).
//
// This module deliberately imports nothing from roles.ts so roles.ts can
// import from here without a cycle. `membershipKey` takes a structural
// shape rather than the ResolvedMembership type for the same reason.

import { AsyncLocalStorage } from "node:async_hooks";
import type { Request, Response, NextFunction } from "express";
import { verifyViewAsToken } from "./viewAsToken";

export interface DevImpersonationHat {
  role: string;
  scopeKind: string | null;
  scopeId: string | null;
  label: string;
}

interface ActiveMembershipStore {
  key: string | undefined;
  devHat: DevImpersonationHat | null;
  viewAsHat: DevImpersonationHat | null;
}

const als = new AsyncLocalStorage<ActiveMembershipStore>();

// Run `fn` (and any async continuation it spawns) with `key` as the
// request's active-membership key and optional dev/view-as hats.
export function runWithActiveMembership<T>(
  key: string | undefined,
  devHat: DevImpersonationHat | null,
  fn: () => T,
  viewAsHat?: DevImpersonationHat | null,
): T {
  return als.run({ key, devHat, viewAsHat: viewAsHat ?? null }, fn);
}

// The active-membership key for the current request, or undefined when
// there's no ALS context (background jobs, scripts) or no hat chosen.
export function getActiveMembershipKey(): string | undefined {
  return als.getStore()?.key;
}

// The dev-only impersonation hat for the current request, or null when
// not impersonating (always null in production — the endpoint 404s there).
export function getDevImpersonationHat(): DevImpersonationHat | null {
  return als.getStore()?.devHat ?? null;
}

// The production-safe view-as hat injected by a validated X-View-As-Token
// header. Present only in the new-tab view-as session; null everywhere else.
export function getViewAsHat(): DevImpersonationHat | null {
  return als.getStore()?.viewAsHat ?? null;
}

// Stable identity for one hat: role|scopeKind|scopeId. The client names
// the active hat with this and the server matches it back. God hats
// (super_admin/admin) have empty scope segments.
export function membershipKey(m: {
  role: string;
  scopeKind: string | null;
  scopeId: string | null;
}): string {
  return `${m.role}|${m.scopeKind ?? ""}|${m.scopeId ?? ""}`;
}

// Express middleware: lift the session's chosen hat into ALS for the
// request. Also lifts any dev impersonation hat (null in production
// because the write endpoint 404s there). For requests carrying a valid
// X-View-As-Token header the production-safe view-as hat is injected
// instead, completely scoping the request to the target partner role.
// Mounted right after express-session so every downstream handler + role
// lookup sees it.
export async function activeMembershipContext(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const key = (req.session as any)?.activeMembershipKey as string | undefined;
  const devHat = ((req.session as any)?.devImpersonationHat ?? null) as DevImpersonationHat | null;

  // Production-safe view-as: validate X-View-As-Token when present.
  let viewAsHat: DevImpersonationHat | null = null;
  const viewAsTokenStr = req.headers["x-view-as-token"] as string | undefined;
  if (viewAsTokenStr) {
    // Resolve the minting super-admin through the canonical request-auth
    // resolver (session first, Bearer fallback, host/kind boundary
    // enforced). Admin logins frequently run bearer-only (the #token-hash
    // login path stores the token in localStorage; over plain-http dev
    // there is no session cookie at all), so a session-only check silently
    // dropped the hat and the view-as tab rendered the operator's own god
    // view. Only an admin-kind identity may activate a view-as hat —
    // getAuthFromRequest already rejects admin tokens on customer hosts.
    const { getAuthFromRequest } = await import("./host");
    const caller = await getAuthFromRequest(req);
    const callerId = caller?.kind === "admin" ? caller.userId : undefined;
    if (callerId) {
      const payload = await verifyViewAsToken(viewAsTokenStr, callerId);
      if (payload) {
        viewAsHat = {
          role: payload.role,
          scopeKind: payload.scopeKind,
          scopeId: payload.scopeId,
          label: payload.label,
        };
      }
    }
  }

  runWithActiveMembership(key, devHat, () => next(), viewAsHat);
}
