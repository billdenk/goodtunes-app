import { useMemo } from "react";

export type AuthKind = "admin" | "customer";

const ADMIN_HOST = "admin.goodtunes.music";
const CUSTOMER_HOST = "my.goodtunes.music";
// Task #936 — store.goodtunes.music fronts the launch storefront and behaves
// like the customer host for auth purposes.
const STORE_HOST = "store.goodtunes.music";
// Task #965 — get.goodtunes.music fronts the clean per-release share links
// (get.goodtunes.music/<slug>) and behaves like the customer host for auth.
const GET_HOST = "get.goodtunes.music";

// Derives the current auth kind from the browser host. In production the
// canonical subdomain decides; in dev / *.replit.app we fall back to the
// pathname (anything under /admin* counts as admin).
export function detectAuthKind(host: string, pathname: string): AuthKind {
  const h = host.toLowerCase().split(":")[0];
  if (h === ADMIN_HOST) return "admin";
  if (h === CUSTOMER_HOST) return "customer";
  if (h === STORE_HOST) return "customer";
  if (h === GET_HOST) return "customer";
  return pathname.startsWith("/admin") ? "admin" : "customer";
}

// True when the page is served from the fan-facing store launch host. Used to
// land bare-host visitors on the storefront instead of the login/admin bounce.
export function isStoreHost(host?: string): boolean {
  const h = (host ?? (typeof window === "undefined" ? "" : window.location.host))
    .toLowerCase()
    .split(":")[0];
  return h === STORE_HOST;
}

// Canonical customer player host (`my.goodtunes.music`). After a sale on the
// preview/purchase funnel (get./store.) the fan is handed off to this host to
// play what they own. Re-exported so the post-checkout handoff can build the
// cross-host player URL in one place.
export const PLAYER_HOST = CUSTOMER_HOST;

// True when the page is served from the preview + purchase funnel
// (get./store.goodtunes.music) rather than the player host. Task #1631 — the
// session cookie and the localStorage bearer token are both host-scoped, so a
// fan who buys on the funnel host must be re-authed on the player host via a
// fresh token carried in the URL fragment. In dev / *.replit.app this is false
// (single host), so the handoff stays an in-app navigation.
export function isPurchaseFunnelHost(host?: string): boolean {
  const h = (host ?? (typeof window === "undefined" ? "" : window.location.host))
    .toLowerCase()
    .split(":")[0];
  return h === GET_HOST || h === STORE_HOST;
}

export function useAuthKind(): AuthKind {
  return useMemo(() => {
    if (typeof window === "undefined") return "customer";
    return detectAuthKind(window.location.host, window.location.pathname);
  }, [typeof window === "undefined" ? "" : window.location.host]);
}
