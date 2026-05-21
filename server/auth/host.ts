import type { Request, Response, NextFunction } from "express";

export type AuthKind = "admin" | "customer";

const ADMIN_HOST = "admin.goodtunes.music";
const CUSTOMER_HOST = "my.goodtunes.music";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      authKind: AuthKind;
      hostKnown: boolean; // false in dev / preview hosts
    }
  }
}

// Picks the auth kind from the request host. In dev or on the *.replit.app
// preview URL the host is ambiguous, so we use the path prefix instead:
// /api/admin/* and /admin* count as admin; everything else is customer.
// The dev fallback also marks `hostKnown=false` so middleware that gates
// on a canonical host (e.g. CSRF, redirects) can opt out.
export function kindFromRequest(req: Request): { kind: AuthKind; hostKnown: boolean } {
  const host = (req.headers.host || "").toLowerCase().split(":")[0];
  if (host === ADMIN_HOST) return { kind: "admin", hostKnown: true };
  if (host === CUSTOMER_HOST) return { kind: "customer", hostKnown: true };
  // Dev / preview fallback — path-based.
  const path = req.path || "";
  const looksAdmin = path.startsWith("/api/admin") || path.startsWith("/admin") || path.startsWith("/api/auth/totp");
  // Allow explicit override via ?kind= on OAuth start endpoints (so the
  // login page in dev can specify which side it wants).
  const override = (req.query?.kind as string | undefined);
  if (override === "admin" || override === "customer") {
    return { kind: override, hostKnown: false };
  }
  return { kind: looksAdmin ? "admin" : "customer", hostKnown: false };
}

export function authKindMiddleware(req: Request, _res: Response, next: NextFunction) {
  const { kind, hostKnown } = kindFromRequest(req);
  req.authKind = kind;
  req.hostKnown = hostKnown;
  next();
}

// In production, redirect *.replit.app → the matching canonical subdomain.
// Path-based: /admin* + /api/admin* → admin host, everything else → customer.
// Both subdomains serve the Apple domain-association file directly so we
// skip the redirect for /.well-known/* paths.
export function canonicalHostRedirect(req: Request, res: Response, next: NextFunction) {
  if (process.env.NODE_ENV !== "production") return next();
  const host = (req.headers.host || "").toLowerCase().split(":")[0];
  if (host === ADMIN_HOST || host === CUSTOMER_HOST) return next();
  if (req.path.startsWith("/.well-known/")) return next();
  const target =
    req.path.startsWith("/admin") || req.path.startsWith("/api/admin")
      ? ADMIN_HOST
      : CUSTOMER_HOST;
  return res.redirect(301, `https://${target}${req.originalUrl}`);
}

export function originForKind(kind: AuthKind, req: Request): string {
  if (kind === "admin") return `https://${ADMIN_HOST}`;
  if (kind === "customer") return `https://${CUSTOMER_HOST}`;
  // dev fallback
  const proto = (req.headers["x-forwarded-proto"] as string) || req.protocol || "https";
  return `${proto}://${req.headers.host}`;
}

// Returns the origin the OAuth provider should redirect back to. In
// production this is always the canonical host for the requested kind;
// in dev it's the current host (the *.replit.app preview).
export function callbackOrigin(req: Request, kind: AuthKind): string {
  if (process.env.NODE_ENV === "production") return originForKind(kind, req);
  const proto = (req.headers["x-forwarded-proto"] as string) || "https";
  return `${proto}://${req.headers.host}`;
}

export const CANONICAL_HOSTS = { admin: ADMIN_HOST, customer: CUSTOMER_HOST };
