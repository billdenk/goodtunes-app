import { useMemo } from "react";

export type AuthKind = "admin" | "customer";

const ADMIN_HOST = "admin.goodtunes.music";
const CUSTOMER_HOST = "my.goodtunes.music";

// Derives the current auth kind from the browser host. In production the
// canonical subdomain decides; in dev / *.replit.app we fall back to the
// pathname (anything under /admin* counts as admin).
export function detectAuthKind(host: string, pathname: string): AuthKind {
  const h = host.toLowerCase().split(":")[0];
  if (h === ADMIN_HOST) return "admin";
  if (h === CUSTOMER_HOST) return "customer";
  return pathname.startsWith("/admin") ? "admin" : "customer";
}

export function useAuthKind(): AuthKind {
  return useMemo(() => {
    if (typeof window === "undefined") return "customer";
    return detectAuthKind(window.location.host, window.location.pathname);
  }, [typeof window === "undefined" ? "" : window.location.host]);
}
