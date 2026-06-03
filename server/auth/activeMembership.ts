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
// This module deliberately imports nothing from roles.ts so roles.ts can
// import from here without a cycle. `membershipKey` takes a structural
// shape rather than the ResolvedMembership type for the same reason.

import { AsyncLocalStorage } from "node:async_hooks";
import type { Request, Response, NextFunction } from "express";

interface ActiveMembershipStore {
  key: string | undefined;
}

const als = new AsyncLocalStorage<ActiveMembershipStore>();

// Run `fn` (and any async continuation it spawns) with `key` as the
// request's active-membership key.
export function runWithActiveMembership<T>(key: string | undefined, fn: () => T): T {
  return als.run({ key }, fn);
}

// The active-membership key for the current request, or undefined when
// there's no ALS context (background jobs, scripts) or no hat chosen.
export function getActiveMembershipKey(): string | undefined {
  return als.getStore()?.key;
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
// request. Mounted right after express-session so every downstream
// handler + role lookup sees it. Calling next() inside als.run keeps the
// context alive across the whole (async) middleware/handler chain.
export function activeMembershipContext(req: Request, _res: Response, next: NextFunction) {
  const key = (req.session as any)?.activeMembershipKey as string | undefined;
  runWithActiveMembership(key, () => next());
}
