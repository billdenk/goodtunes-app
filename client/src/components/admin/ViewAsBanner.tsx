// Persistent banner shown in every partner-portal tab that was opened via
// "View as this partner". Reads label from sessionStorage (tab-scoped).
// Exit clears the session token, invalidates all queries (so the next
// request goes without the impersonation header), and redirects back to
// the god-view admin dashboard.
//
// Task #2918 — the banner is dismissible (X) for the current view session.
// Dismissal hides the banner ONLY: the impersonation token, attribution,
// and Exit view all keep working. It's tab-scoped sessionStorage, cleared
// alongside the view-as token, so it never survives to the next
// impersonation. While dismissed, a small persistent eye icon in the
// portal header (ViewAsRestoreButton) restores the banner — which is also
// how "Exit view" stays reachable.

import { useSyncExternalStore } from "react";
import { X, Eye } from "lucide-react";
import { useLocation } from "wouter";
import { getViewAsLabel, clearViewAsSession } from "@/lib/queryClient";
import { queryClient } from "@/lib/queryClient";

const DISMISS_KEY = "gt:viewAsBannerDismissed";
const listeners = new Set<() => void>();

function readDismissed(): boolean {
  try {
    return window.sessionStorage?.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

function writeDismissed(dismissed: boolean) {
  try {
    if (dismissed) window.sessionStorage?.setItem(DISMISS_KEY, "1");
    else window.sessionStorage?.removeItem(DISMISS_KEY);
  } catch {
    // sessionStorage unavailable — banner simply stays visible.
  }
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function useBannerDismissed(): boolean {
  return useSyncExternalStore(subscribe, readDismissed, () => false);
}

export function ViewAsBanner() {
  const label = getViewAsLabel();
  const dismissed = useBannerDismissed();
  const [, navigate] = useLocation();

  if (!label || dismissed) return null;

  function handleExit() {
    clearViewAsSession();
    // Force-refetch all queries without the impersonation header.
    queryClient.clear();
    navigate("/admin/dashboard");
  }

  return (
    <div
      className="w-full bg-[var(--brand-blue)] text-white flex items-center gap-3 px-4 py-2.5 text-sm font-medium z-50 flex-shrink-0"
      data-testid="banner-view-as"
      role="banner"
    >
      <Eye className="w-4 h-4 flex-shrink-0" />
      <span className="flex-1">
        Viewing as{" "}
        <span className="font-semibold" data-testid="banner-view-as-label">
          {label}
        </span>
        {" "}— changes you make are attributed to your super-admin account.
      </span>
      <button
        type="button"
        onClick={handleExit}
        className="flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-semibold bg-white/20 hover:bg-white/30 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--brand-blue)]"
        data-testid="button-exit-view-as"
      >
        <X className="w-3.5 h-3.5" />
        Exit view
      </button>
      <button
        type="button"
        onClick={() => writeDismissed(true)}
        aria-label="Hide this banner"
        title="Hide this banner for this view session"
        className="rounded-md p-1 hover:bg-white/20 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--brand-blue)]"
        data-testid="button-dismiss-view-as-banner"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

/**
 * Small persistent eye icon shown in the portal header while the view-as
 * banner is dismissed. Clicking it restores the banner (and with it the
 * Exit view escape hatch). Renders nothing when not impersonating or when
 * the banner is visible.
 */
export function ViewAsRestoreButton() {
  const label = getViewAsLabel();
  const dismissed = useBannerDismissed();
  if (!label || !dismissed) return null;
  return (
    <button
      type="button"
      onClick={() => writeDismissed(false)}
      aria-label={`Show the "Viewing as ${label}" banner`}
      title={`Viewing as ${label} — click to show the banner`}
      className="rounded-md p-1.5 text-[var(--brand-blue)] bg-blue-50 hover:bg-blue-100 transition-colors shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-blue)]"
      data-testid="button-restore-view-as-banner"
    >
      <Eye className="w-4 h-4" />
    </button>
  );
}
