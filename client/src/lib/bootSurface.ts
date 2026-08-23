// Task #3322 — one classifier for which "surface family" the current URL
// belongs to, shared by every full-screen interstitial so the loading state
// between the pre-React boot splash and the first painted screen can never
// flash the wrong theme (navy fan gradient / white GoodTunes logo over an
// admin or white-label destination).
//
// The classification MUST stay in lock-step with the inline first-paint
// detector in client/index.html (which runs before any module loads and
// therefore has to duplicate the host/path rules) and is the single source
// for main.tsx's pre-mount body-class setup.

import { onWhitelabelHost } from "@/hooks/useAuthKind";

export type BootSurface = "fan" | "admin" | "whitelabel";

/** True when host/path resolve to an admin or invited-partner surface —
 * the same rule main.tsx uses to add `gt-admin` before React mounts.
 * Partner portals match their EXACT landing paths (not prefixes —
 * `/artist/:slug` is the dark fan artist page, only bare `/artist` is the
 * portal) plus the embedded album detail sub-routes and the invite-accept
 * page. `/e/:token` is the PUBLIC dark client-estimate page and is exempt
 * even on the admin host. */
export function isAdminSurfacePath(
  host: string = typeof window === "undefined" ? "" : window.location.host,
  pathname: string = typeof window === "undefined" ? "" : window.location.pathname,
): boolean {
  const h = host.toLowerCase().split(":")[0];
  const p = pathname || "";
  const lightPortal =
    p === "/artist" || p.indexOf("/artist/albums/") === 0 ||
    p === "/label" || p === "/manager" ||
    p === "/vendor" || p.indexOf("/vendor/albums/") === 0 ||
    p === "/non-profit" || p === "/publisher" ||
    p === "/invite" || p.indexOf("/invite/") === 0;
  const isPublicEstimate = p.indexOf("/e/") === 0;
  return (
    !isPublicEstimate &&
    (h === "admin.goodtunes.music" || p.indexOf("/admin") === 0 || lightPortal)
  );
}

/** Classify the current (or given) URL into the three loading-surface
 * families. White-label wins over admin so a press-branded host never
 * renders GoodTunes branding at any point in the sequence. */
export function classifyBootSurface(
  host: string = typeof window === "undefined" ? "" : window.location.host,
  pathname: string = typeof window === "undefined" ? "" : window.location.pathname,
): BootSurface {
  if (onWhitelabelHost(host)) return "whitelabel";
  if (isAdminSurfacePath(host, pathname)) return "admin";
  return "fan";
}

/** Unmount-side replacement for `document.body.classList.remove("gt-admin")`.
 *
 * Task #3322 — every admin page / OperatorShell used to drop the class
 * unconditionally on unmount. During an admin→admin or portal→portal route
 * transition the old shell's cleanup runs while the new one hasn't mounted
 * yet, so for a frame the navy fan `body::before` gradient peeked through.
 * The current location is already the DESTINATION path when cleanup runs
 * (wouter updates location before unmount effects), so: keep the class when
 * the destination is still an admin/partner surface, drop it only when the
 * user is genuinely navigating back to a fan surface. */
export function releaseAdminBodyClass(): void {
  if (typeof document === "undefined") return;
  if (isAdminSurfacePath()) return;
  document.body.classList.remove("gt-admin");
}
