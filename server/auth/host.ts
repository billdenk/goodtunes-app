import type { Request, Response, NextFunction } from "express";

export type AuthKind = "admin" | "customer";

const ADMIN_HOST = "admin.goodtunes.music";
const CUSTOMER_HOST = "my.goodtunes.music";
// Task #936 — store.goodtunes.music is a first-class fan-facing host that
// fronts the launch storefront. It behaves exactly like the customer host
// (customer auth kind, never canonicalized away) but keeps its own origin so
// the OAuth round-trip + ?buy=1 bounce-back land back on the store host.
const STORE_HOST = "store.goodtunes.music";
// Task #965 — get.goodtunes.music fronts the clean per-release share links
// (get.goodtunes.music/<slug>). Same treatment as STORE_HOST: customer auth
// kind, never canonicalized away, keeps its own origin so the OAuth
// round-trip + ?buy=1 bounce-back land back on the get host.
const GET_HOST = "get.goodtunes.music";
// Hosts that resolve to the "customer" auth kind. OAuth callbacks must come
// back to the *same* one of these the fan started on because the session
// cookie is host-only (sameSite=none, no domain), so a cross-subdomain
// callback would drop the `oauthState` and fail with a state mismatch.
const CUSTOMER_HOSTS = new Set([CUSTOMER_HOST, STORE_HOST, GET_HOST]);

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
  if (host === STORE_HOST) return { kind: "customer", hostKnown: true };
  if (host === GET_HOST) return { kind: "customer", hostKnown: true };
  // Dev / preview fallback — path-based.
  const path = req.path || "";
  const looksAdmin =
    path.startsWith("/api/admin") ||
    path.startsWith("/admin") ||
    path.startsWith("/api/auth/totp") ||
    // Task #57 — email-OTP routes are admin-only too. Without this the
    // *.replit.dev preview hosts (no canonical host match) would treat
    // them as customer and 403 the password-leg admin sign-in flow.
    path.startsWith("/api/auth/email-otp") ||
    path.startsWith("/api/auth/factor-preference");
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
  if (host === ADMIN_HOST || host === CUSTOMER_HOST || host === STORE_HOST || host === GET_HOST) return next();
  if (req.path.startsWith("/.well-known/")) return next();
  // Only redirect hosts we explicitly want to canonicalize: the bare
  // goodtunes.music apex, www.goodtunes.music, and any other non-canonical
  // goodtunes.music subdomain. EVERYTHING ELSE passes through — that
  // includes Replit's deploy health probe (which uses an internal host
  // header, not *.replit.app), the *.replit.app deploy URL, and the
  // *.replit.dev preview URL. Defaulting unknown hosts to "redirect" is
  // what made the Promote stage's probe see a 301 instead of a 200 and
  // killed every deploy after Task #31 merged.
  const shouldCanonicalize =
    host === "goodtunes.music" ||
    host === "www.goodtunes.music" ||
    (host.endsWith(".goodtunes.music") &&
      host !== ADMIN_HOST &&
      host !== CUSTOMER_HOST &&
      host !== STORE_HOST &&
      host !== GET_HOST);
  if (!shouldCanonicalize) return next();
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
  if (process.env.NODE_ENV === "production") {
    // Customer-family OAuth must round-trip back to the exact host the fan
    // started on (store vs. my), or the host-only session cookie carrying
    // `oauthState` won't be sent to the callback and the flow 403s on a state
    // mismatch. Admin always uses its canonical host.
    if (kind === "customer") {
      const host = (req.headers.host || "").toLowerCase().split(":")[0];
      if (CUSTOMER_HOSTS.has(host)) return `https://${host}`;
    }
    return originForKind(kind, req);
  }
  const proto = (req.headers["x-forwarded-proto"] as string) || "https";
  return `${proto}://${req.headers.host}`;
}

export const CANONICAL_HOSTS = { admin: ADMIN_HOST, customer: CUSTOMER_HOST, store: STORE_HOST, get: GET_HOST };
